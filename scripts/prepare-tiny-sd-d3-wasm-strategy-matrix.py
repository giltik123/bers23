#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gc
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from onnxruntime.quantization import CalibrationMethod, QuantFormat, QuantType, quantize_dynamic, quantize_static

BASELINE_MODULE_PATH = Path(__file__).with_name("prepare-tiny-sd-d3-wasm-quantized.py")
spec = importlib.util.spec_from_file_location("tiny_sd_d3_wasm_baseline", BASELINE_MODULE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load D3 WASM baseline module")
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)

EXPECTED_ONNX = "1.22.0"
EXPECTED_ORT = "1.27.0"
COMPONENTS = tuple(baseline.COMPONENT_FILES)
MAX_WORKER_RECORD_BYTES = 2 * 1024 * 1024
ALLOWED_CANDIDATE_RESULTS = {"PASS", "SIZE_BLOCKED", "NUMERIC_RISK", "TRANSFORM_BLOCKED"}

# D3 research still computes the real minimum-size winner from every passing candidate.
# This checked-in policy is the explicit acceptance boundary consumed by downstream D4/D5.
# A changed winner must fail closed here and receive an evidence-backed policy update instead
# of allowing downstream jobs to silently reproduce a stale representation.
ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT = {
    "text_encoder": "exact_fp16_storage",
    "unet": "exact_fp16_storage",
    "vae_decoder": "exact_fp16_storage",
}
ACCEPTED_SELECTED_SCHEME_BY_COMPONENT = {
    "text_encoder": "EXACT_FP16_STORAGE_FP32_COMPUTE",
    "unet": "EXACT_FP16_STORAGE_FP32_COMPUTE",
    "vae_decoder": "EXACT_FP16_STORAGE_FP32_COMPUTE",
}


def _attribute_int(node: onnx.NodeProto, name: str, default: int = 0) -> int:
    for attribute in node.attribute:
        if attribute.name == name:
            return int(attribute.i)
    return default


def _weight_axis(node: onnx.NodeProto, array: np.ndarray) -> int | None:
    if array.ndim < 2:
        return None
    if node.op_type == "Conv":
        return 0
    if node.op_type == "MatMul":
        return 1
    if node.op_type == "Gemm":
        return 0 if _attribute_int(node, "transB", 0) else 1
    return None


def _quantize_per_channel_s8(array: np.ndarray, axis: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    values = np.asarray(array, dtype=np.float32)
    if axis < 0:
        axis += values.ndim
    if axis < 0 or axis >= values.ndim:
        raise RuntimeError(f"invalid per-channel axis {axis} for shape {values.shape}")
    reduce_axes = tuple(index for index in range(values.ndim) if index != axis)
    max_abs = np.max(np.abs(values), axis=reduce_axes)
    scales = np.asarray(max_abs / 127.0, dtype=np.float32)
    scales = np.where(scales > 0.0, scales, np.float32(1.0)).astype(np.float32, copy=False)
    broadcast_shape = [1] * values.ndim
    broadcast_shape[axis] = values.shape[axis]
    quantized = np.rint(values / scales.reshape(broadcast_shape))
    quantized = np.clip(quantized, -127, 127).astype(np.int8)
    zero_points = np.zeros(scales.shape, dtype=np.int8)
    return quantized, scales, zero_points


def weight_only_qdq(source: Path, target: Path, component: str) -> dict[str, Any]:
    model = onnx.load_model(source, load_external_data=True)
    initializers = {value.name: value for value in model.graph.initializer}
    reserved_tensor_names = set(initializers)
    for value in [*model.graph.input, *model.graph.output, *model.graph.value_info]:
        if value.name:
            reserved_tensor_names.add(value.name)
    for node in model.graph.node:
        reserved_tensor_names.update(name for name in node.output if name)

    consumers: dict[str, list[tuple[str, int]]] = {}
    all_uses: dict[str, list[tuple[str, int]]] = {}
    for node in model.graph.node:
        for input_index, input_name in enumerate(node.input):
            if input_name in initializers:
                all_uses.setdefault(input_name, []).append((node.name or (node.output[0] if node.output else node.op_type), input_index))
        if node.op_type not in {"Conv", "MatMul", "Gemm"} or len(node.input) < 2:
            continue
        weight_name = node.input[1]
        initializer = initializers.get(weight_name)
        if initializer is None or initializer.data_type != TensorProto.FLOAT:
            continue
        array = numpy_helper.to_array(initializer)
        axis = _weight_axis(node, array)
        del array
        if axis is not None:
            consumers.setdefault(weight_name, []).append((node.name or node.output[0], axis))

    compatible_axes = {
        name: entries[0][1]
        for name, entries in consumers.items()
        if entries
        and len({axis for _, axis in entries}) == 1
        and len(all_uses.get(name, [])) == len(entries)
        and all(input_index == 1 for _, input_index in all_uses.get(name, []))
    }
    quantized_weights: dict[str, tuple[str, str, str, int]] = {}
    new_initializers: list[onnx.TensorProto] = []
    replaced_names: set[str] = set()
    quantized_elements = 0
    quantized_logical_fp32_bytes = 0

    for weight_name, axis in compatible_axes.items():
        initializer = initializers[weight_name]
        array = numpy_helper.to_array(initializer)
        quantized, scales, zero_points = _quantize_per_channel_s8(array, axis)
        quantized_name = f"{weight_name}__d3_weight_quantized"
        scale_name = f"{weight_name}__d3_weight_scale"
        zero_name = f"{weight_name}__d3_weight_zero"
        generated_names = {quantized_name, scale_name, zero_name}
        if len(generated_names) != 3 or generated_names & reserved_tensor_names:
            raise RuntimeError(f"weight-only generated tensor-name collision: {weight_name}")
        reserved_tensor_names.update(generated_names)
        new_initializers.extend([
            numpy_helper.from_array(quantized, name=quantized_name),
            numpy_helper.from_array(scales, name=scale_name),
            numpy_helper.from_array(zero_points, name=zero_name),
        ])
        replaced_names.add(weight_name)
        quantized_weights[weight_name] = (quantized_name, scale_name, zero_name, axis)
        quantized_elements += int(array.size)
        quantized_logical_fp32_bytes += int(array.size) * 4
        del array, quantized, scales, zero_points

    retained_initializers = [value for value in model.graph.initializer if value.name not in replaced_names]
    del model.graph.initializer[:]
    model.graph.initializer.extend(retained_initializers)
    model.graph.initializer.extend(new_initializers)

    emitted_dq: set[str] = set()
    new_nodes: list[onnx.NodeProto] = []
    for node in model.graph.node:
        if len(node.input) >= 2 and node.input[1] in quantized_weights:
            weight_name = node.input[1]
            quantized_name, scale_name, zero_name, axis = quantized_weights[weight_name]
            if weight_name not in emitted_dq:
                new_nodes.append(helper.make_node(
                    "DequantizeLinear",
                    [quantized_name, scale_name, zero_name],
                    [weight_name],
                    name=f"{weight_name}__d3_weight_dequantize",
                    axis=axis,
                ))
                emitted_dq.add(weight_name)
        new_nodes.append(node)
    del model.graph.node[:]
    model.graph.node.extend(new_nodes)

    target.parent.mkdir(parents=True, exist_ok=True)
    onnx.checker.check_model(model, full_check=True)
    onnx.save_model(model, target)
    del model
    gc.collect()
    return {
        "scheme": "WEIGHT_ONLY_QDQ_S8_FP32_ACTIVATIONS",
        "activationType": "FLOAT",
        "weightType": "QInt8",
        "perChannel": True,
        "targetOpTypes": ["Conv", "MatMul", "Gemm"],
        "quantizedWeightInitializerCount": len(quantized_weights),
        "quantizedWeightElements": quantized_elements,
        "sourceFp32WeightBytesCovered": quantized_logical_fp32_bytes,
        "quantizedInitializerNamesAreDisjointFromSourceFp32Names": True,
        "sourceWeightNamePreservedAsFloatDequantizedValue": True,
        "runtimeComputeClaimedInteger": False,
        "purpose": "PARITY_PRESERVING_MODEL_SIZE_FEASIBILITY",
    }


def exact_fp16_storage_fp32_compute(source: Path, target: Path) -> dict[str, Any]:
    model = onnx.load_model(source, load_external_data=True)
    public_input_names = {value.name for value in model.graph.input if value.name}
    reserved_tensor_names = {value.name for value in model.graph.initializer if value.name}
    for value in [*model.graph.input, *model.graph.output, *model.graph.value_info]:
        if value.name:
            reserved_tensor_names.add(value.name)
    for node in model.graph.node:
        reserved_tensor_names.update(name for name in node.output if name)

    retained_initializers: list[onnx.TensorProto] = []
    storage_initializers: list[onnx.TensorProto] = []
    cast_nodes: list[onnx.NodeProto] = []
    converted_count = 0
    converted_elements = 0
    converted_fp32_bytes = 0
    total_fp32_bytes = 0
    non_roundtrip_count = 0
    non_roundtrip_fp32_bytes = 0
    graph_input_initializer_count = 0

    for initializer in model.graph.initializer:
        if initializer.data_type != TensorProto.FLOAT:
            retained_initializers.append(initializer)
            continue
        elements = int(np.prod(initializer.dims, dtype=np.int64)) if initializer.dims else 1
        total_fp32_bytes += elements * 4
        if initializer.name in public_input_names:
            retained_initializers.append(initializer)
            graph_input_initializer_count += 1
            continue
        values = np.asarray(numpy_helper.to_array(initializer), dtype=np.float32)
        half = values.astype(np.float16)
        roundtrip = half.astype(np.float32)
        exact = bool(np.isfinite(values).all() and np.array_equal(values, roundtrip))
        if not exact:
            retained_initializers.append(initializer)
            non_roundtrip_count += 1
            non_roundtrip_fp32_bytes += int(values.size) * 4
            del values, half, roundtrip
            continue
        storage_name = f"{initializer.name}__d3_exact_fp16_storage"
        if storage_name in reserved_tensor_names:
            raise RuntimeError(f"exact FP16 storage tensor-name collision: {initializer.name}")
        reserved_tensor_names.add(storage_name)
        storage_initializers.append(numpy_helper.from_array(half, name=storage_name))
        cast_nodes.append(helper.make_node(
            "Cast",
            [storage_name],
            [initializer.name],
            name=f"{initializer.name}__d3_exact_fp16_to_fp32",
            to=TensorProto.FLOAT,
        ))
        converted_count += 1
        converted_elements += int(values.size)
        converted_fp32_bytes += int(values.size) * 4
        del values, half, roundtrip

    if converted_count == 0 or converted_fp32_bytes == 0:
        raise RuntimeError("exact FP16 storage found no exactly round-trippable FLOAT initializers")

    del model.graph.initializer[:]
    model.graph.initializer.extend(retained_initializers)
    model.graph.initializer.extend(storage_initializers)
    original_nodes = list(model.graph.node)
    del model.graph.node[:]
    model.graph.node.extend(cast_nodes)
    model.graph.node.extend(original_nodes)

    target.parent.mkdir(parents=True, exist_ok=True)
    onnx.checker.check_model(model, full_check=True)
    onnx.save_model(model, target)
    del model
    gc.collect()
    return {
        "scheme": "EXACT_FP16_STORAGE_FP32_COMPUTE",
        "storageType": "FLOAT16",
        "restoredTypeBeforeConsumer": "FLOAT",
        "exactRoundtripRequired": True,
        "convertedInitializerCount": converted_count,
        "convertedElements": converted_elements,
        "sourceFp32BytesConverted": converted_fp32_bytes,
        "totalSourceFp32InitializerBytes": total_fp32_bytes,
        "convertedFp32ByteCoverage": converted_fp32_bytes / max(total_fp32_bytes, 1),
        "nonRoundtripInitializerCountRetainedFp32": non_roundtrip_count,
        "nonRoundtripFp32BytesRetained": non_roundtrip_fp32_bytes,
        "graphInputInitializerCountRetained": graph_input_initializer_count,
        "storagePrecisionIsNotComputePrecision": True,
        "runtimeResidentMemoryReductionClaimed": False,
        "fileFootprintOnlyUntilBrowserMeasured": True,
        "valueRoundtripExactByConstruction": True,
        "purpose": "LOSSLESS_STORAGE_FOOTPRINT_FEASIBILITY",
    }


def dynamic_signed(source: Path, target: Path, reduce_range: bool) -> dict[str, Any]:
    quantize_dynamic(
        model_input=source,
        model_output=target,
        op_types_to_quantize=["MatMul"],
        per_channel=True,
        reduce_range=reduce_range,
        weight_type=QuantType.QInt8,
        use_external_data_format=False,
        extra_options={"MatMulConstBOnly": True},
    )
    return {
        "scheme": "DYNAMIC_U8S8_WEIGHT_MATMUL" + ("_REDUCE_RANGE" if reduce_range else ""),
        "activationType": "DYNAMIC_QUInt8",
        "weightType": "QInt8",
        "perChannel": True,
        "reduceRange": reduce_range,
        "targetOpTypes": ["MatMul"],
    }


def static_qdq(source: Path, target: Path, component: str, activation: QuantType, weight: QuantType, label: str) -> dict[str, Any]:
    samples = baseline.calibration_samples(component)
    reader = baseline.FixedCalibrationReader(samples)
    quantize_static(
        model_input=source,
        model_output=target,
        calibration_data_reader=reader,
        quant_format=QuantFormat.QDQ,
        op_types_to_quantize=["Conv", "MatMul", "Gemm"],
        per_channel=True,
        reduce_range=False,
        activation_type=activation,
        weight_type=weight,
        calibrate_method=CalibrationMethod.MinMax,
        use_external_data_format=False,
        extra_options={
            "ActivationSymmetric": activation == QuantType.QInt8,
            "WeightSymmetric": weight == QuantType.QInt8,
            "CalibTensorRangeSymmetric": activation == QuantType.QInt8,
            "MatMulConstBOnly": True,
        },
    )
    return {
        "scheme": label,
        "activationType": activation.name,
        "weightType": weight.name,
        "perChannel": True,
        "reduceRange": False,
        "targetOpTypes": ["Conv", "MatMul", "Gemm"],
        "calibration": {
            "kind": "SYNTHETIC_DETERMINISTIC_RANGE_PROBE_NOT_DATASET_AUTHORITY",
            "sampleCount": len(samples),
            "method": "MinMax",
            "productionQualityAuthority": False,
        },
    }


def _candidate_record(component: str, source: Path, target: Path, d2_record: dict[str, Any], transform: Callable[[Path, Path], dict[str, Any]]) -> dict[str, Any]:
    try:
        transform_evidence = transform(source, target)
        inventory = baseline.graph_inventory(target)
        expected_io = baseline.expected_io_from_d2(d2_record)
        if inventory["domains"] != ["ai.onnx"] or inventory["functionCount"] != 0 or inventory["functionDomains"]:
            raise RuntimeError("strategy candidate contains non-standard graph domains/functions")
        if inventory["ioContract"] != expected_io:
            raise RuntimeError("strategy candidate public I/O contract drift")
        size = target.stat().st_size
        ratio = size / source.stat().st_size
        parity = baseline.run_parity(component, source, target, d2_record)
        result = "PASS" if ratio < 0.80 and parity["passed"] else ("SIZE_BLOCKED" if ratio >= 0.80 else "NUMERIC_RISK")
        return {
            "result": result,
            "transform": transform_evidence,
            "artifact": {
                "size": size,
                "sizeRatio": ratio,
                "bytesSaved": source.stat().st_size - size,
                "sha256": baseline.sha256_file(target),
                "graph": inventory,
            },
            "nativeOrtParity": parity,
            "error": None,
        }
    except Exception as error:
        return {
            "result": "TRANSFORM_BLOCKED",
            "transform": None,
            "artifact": None,
            "nativeOrtParity": None,
            "error": f"{type(error).__name__}: {error}",
        }


def _baseline_control(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "result": "PASS" if record.get("result") == "WASM_COMPACT_NATIVE_PASS" else (
            "NUMERIC_RISK" if record.get("result") == "WASM_COMPACT_NUMERIC_RISK" else "BASELINE_BLOCKED"
        ),
        "transform": record.get("transform"),
        "artifact": record.get("candidate"),
        "nativeOrtParity": record.get("nativeOrtParity"),
        "error": None,
        "controlOnly": True,
    }


def _strategy_definitions(component: str):
    storage = ("exact_fp16_storage", exact_fp16_storage_fp32_compute)
    if component == "text_encoder":
        return [
            ("dynamic_signed", lambda source, target: dynamic_signed(source, target, False)),
            ("dynamic_signed_reduce_range", lambda source, target: dynamic_signed(source, target, True)),
            ("weight_only_s8", lambda source, target: weight_only_qdq(source, target, component)),
            storage,
        ]
    return [
        ("static_s8s8_qdq", lambda source, target: static_qdq(source, target, component, QuantType.QInt8, QuantType.QInt8, "STATIC_QDQ_S8S8_CONV_MATMUL_GEMM")),
        ("static_u8u8_qdq", lambda source, target: static_qdq(source, target, component, QuantType.QUInt8, QuantType.QUInt8, "STATIC_QDQ_U8U8_CONV_MATMUL_GEMM")),
        ("weight_only_s8", lambda source, target: weight_only_qdq(source, target, component)),
        storage,
    ]


def _resolve_strategy(component: str, strategy_name: str) -> Callable[[Path, Path], dict[str, Any]]:
    matches = [transform for name, transform in _strategy_definitions(component) if name == strategy_name]
    if len(matches) != 1:
        raise RuntimeError(f"candidate worker strategy is not uniquely registered: {component}/{strategy_name}")
    return matches[0]


def _read_candidate_worker_record(record_path: Path) -> dict[str, Any]:
    if not record_path.is_file() or record_path.is_symlink() or record_path.stat().st_size <= 0:
        raise RuntimeError("candidate worker record is missing, symlinked or empty")
    if record_path.stat().st_size > MAX_WORKER_RECORD_BYTES:
        raise RuntimeError("candidate worker record exceeds bounded JSON size")
    try:
        value = json.loads(record_path.read_text(encoding="utf-8"))
    except Exception as error:
        raise RuntimeError(f"candidate worker record is malformed: {type(error).__name__}: {error}") from error
    if not isinstance(value, dict) or value.get("result") not in ALLOWED_CANDIDATE_RESULTS:
        raise RuntimeError("candidate worker record is malformed: unexpected result contract")
    return value


def _validate_candidate_worker_record(record: dict[str, Any], target: Path) -> None:
    result = record["result"]
    if result == "TRANSFORM_BLOCKED":
        if record.get("artifact") is not None or record.get("nativeOrtParity") is not None:
            raise RuntimeError("candidate worker blocked record unexpectedly contains accepted artifact evidence")
        return
    artifact = record.get("artifact")
    parity = record.get("nativeOrtParity")
    transform = record.get("transform")
    if not isinstance(artifact, dict) or not isinstance(parity, dict) or not isinstance(transform, dict):
        raise RuntimeError("candidate worker record is malformed: incomplete candidate evidence")
    if not target.is_file() or target.is_symlink():
        raise RuntimeError("candidate worker artifact is missing or symlinked")
    expected_size = artifact.get("size")
    expected_sha = artifact.get("sha256")
    if (
        not isinstance(expected_size, int)
        or expected_size <= 0
        or not isinstance(expected_sha, str)
        or len(expected_sha) != 64
        or target.stat().st_size != expected_size
        or baseline.sha256_file(target) != expected_sha
    ):
        raise RuntimeError("candidate worker artifact identity mismatch")


def _run_candidate_isolated(
    component: str,
    strategy_name: str,
    source: Path,
    target: Path,
    d2_report_path: Path,
    record_path: Path,
) -> dict[str, Any]:
    for path in (target, record_path):
        if path.exists() or path.is_symlink():
            path.unlink()
    completed = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve()),
            "--candidate-worker",
            "--component",
            component,
            "--strategy",
            strategy_name,
            "--source",
            str(source),
            "--d2-report",
            str(d2_report_path),
            "--target",
            str(target),
            "--record",
            str(record_path),
        ],
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"candidate worker exited non-zero: {component}/{strategy_name} rc={completed.returncode}")
    try:
        record = _read_candidate_worker_record(record_path)
        _validate_candidate_worker_record(record, target)
        return record
    finally:
        if record_path.exists() or record_path.is_symlink():
            record_path.unlink()


def candidate_worker_main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-worker", action="store_true", required=True)
    parser.add_argument("--component", required=True)
    parser.add_argument("--strategy", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--d2-report", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--record", type=Path, required=True)
    args = parser.parse_args()

    if onnx.__version__ != EXPECTED_ONNX or ort.__version__ != EXPECTED_ORT:
        raise RuntimeError(f"unexpected ONNX/ORT versions: {onnx.__version__}/{ort.__version__}")
    if args.component not in COMPONENTS:
        raise RuntimeError(f"candidate worker component is not registered: {args.component}")

    source = args.source.resolve(strict=True)
    if not source.is_file() or source.is_symlink() or source.name != baseline.COMPONENT_FILES[args.component]:
        raise RuntimeError("candidate worker source is outside the component contract")
    d2_report_path = args.d2_report.resolve(strict=True)
    d2_report = json.loads(d2_report_path.read_text(encoding="utf-8"))
    if (
        d2_report.get("status") != "CANDIDATE"
        or d2_report.get("stage") != "D2_COMPONENT_ONNX_CPU_FEASIBILITY"
        or d2_report.get("passCount") != 3
        or d2_report.get("allComponentsPass") is not True
        or d2_report.get("blockedComponents") != {}
        or d2_report.get("runtimeAuthorityGranted") is not False
        or d2_report.get("productionApproval") is not False
    ):
        raise RuntimeError("candidate worker did not receive accepted D2 evidence")
    d2_record = (d2_report.get("components") or {}).get(args.component)
    if not isinstance(d2_record, dict) or d2_record.get("result") != "PASS" or d2_record.get("ortParityPassed") is not True:
        raise RuntimeError("candidate worker D2 component is not accepted")
    source_artifact = d2_record.get("artifact") or {}
    if source.stat().st_size != source_artifact.get("size") or baseline.sha256_file(source) != source_artifact.get("sha256"):
        raise RuntimeError("candidate worker source identity mismatch")

    target = args.target.resolve()
    record_path = args.record.resolve()
    if record_path.exists() or record_path.is_symlink():
        raise RuntimeError("candidate worker record path must not preexist")
    target.parent.mkdir(parents=True, exist_ok=True)
    record_path.parent.mkdir(parents=True, exist_ok=True)
    transform = _resolve_strategy(args.component, args.strategy)
    record = _candidate_record(args.component, source, target, d2_record, transform)
    encoded = json.dumps(record, indent=2, sort_keys=True) + "\n"
    if len(encoded.encode("utf-8")) > MAX_WORKER_RECORD_BYTES:
        raise RuntimeError("candidate worker record exceeds bounded JSON size")
    record_path.write_text(encoded, encoding="utf-8")
    return 0


def accepted_strategy_definition(component: str) -> tuple[str, Callable[[Path, Path], dict[str, Any]]]:
    expected_name = ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT.get(component)
    expected_scheme = ACCEPTED_SELECTED_SCHEME_BY_COMPONENT.get(component)
    if expected_name is None or expected_scheme is None:
        raise RuntimeError(f"accepted D3 selection policy missing component: {component}")
    matches = [(name, transform) for name, transform in _strategy_definitions(component) if name == expected_name]
    if len(matches) != 1:
        raise RuntimeError(f"accepted D3 strategy is not uniquely registered for {component}: {expected_name}")
    return matches[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fp32-dir", type=Path, required=True)
    parser.add_argument("--d2-report", type=Path, required=True)
    parser.add_argument("--baseline-report", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if onnx.__version__ != EXPECTED_ONNX or ort.__version__ != EXPECTED_ORT:
        raise RuntimeError(f"unexpected ONNX/ORT versions: {onnx.__version__}/{ort.__version__}")

    fp32_dir = args.fp32_dir.resolve(strict=True)
    d2_report = json.loads(args.d2_report.resolve(strict=True).read_text(encoding="utf-8"))
    baseline.require_d2_report(d2_report, fp32_dir)
    baseline_report_bytes = args.baseline_report.resolve(strict=True).read_bytes()
    baseline_report = json.loads(baseline_report_bytes)
    if baseline_report.get("status") != "CANDIDATE" or baseline_report.get("stage") != "D3_WASM_COMPACT_PREPARATION":
        raise RuntimeError("unexpected D3 WASM baseline evidence")
    if baseline_report.get("runtimeAuthorityGranted") is not False or baseline_report.get("productionApproval") is not False:
        raise RuntimeError("baseline evidence unexpectedly grants authority")
    if set(baseline_report.get("components") or {}) != set(COMPONENTS):
        raise RuntimeError("baseline component set drift")
    if set(ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT) != set(COMPONENTS):
        raise RuntimeError("accepted D3 strategy policy component set drift")
    if set(ACCEPTED_SELECTED_SCHEME_BY_COMPONENT) != set(COMPONENTS):
        raise RuntimeError("accepted D3 scheme policy component set drift")

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    scratch = output_dir / ".matrix-scratch"
    scratch.mkdir(parents=True, exist_ok=True)

    components: dict[str, Any] = {}
    policy_mismatches: dict[str, Any] = {}
    for component in COMPONENTS:
        filename = baseline.COMPONENT_FILES[component]
        source = fp32_dir / filename
        d2_record = d2_report["components"][component]
        baseline_component = baseline_report["components"][component]
        if baseline_component.get("source", {}).get("sha256") != baseline.sha256_file(source):
            raise RuntimeError(f"baseline source identity drift: {component}")

        strategies: dict[str, Any] = {"baseline_u8": _baseline_control(baseline_component)}
        passing: list[tuple[int, str, Path, dict[str, Any]]] = []
        observed: list[tuple[float, str]] = []
        for strategy_name, transform in _strategy_definitions(component):
            candidate_path = scratch / f"{component}--{strategy_name}.onnx"
            record_path = scratch / f"{component}--{strategy_name}.record.json"
            record = _run_candidate_isolated(
                component,
                strategy_name,
                source,
                candidate_path,
                args.d2_report.resolve(strict=True),
                record_path,
            )
            strategies[strategy_name] = record
            parity = record.get("nativeOrtParity") or {}
            normalized = parity.get("normalizedMetrics") or {}
            if "rmseOverReferenceRms" in normalized:
                observed.append((float(normalized["rmseOverReferenceRms"]), strategy_name))
            if record["result"] == "PASS":
                passing.append((record["artifact"]["size"], strategy_name, candidate_path, record))
            elif candidate_path.exists():
                candidate_path.unlink()
            gc.collect()

        selected_name = None
        selected_record = None
        selected_path = output_dir / filename
        expected_selected_name = ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT[component]
        expected_selected_scheme = ACCEPTED_SELECTED_SCHEME_BY_COMPONENT[component]
        if passing:
            _, selected_name, candidate_path, selected_record = min(passing, key=lambda item: (item[0], item[1]))
            selected_scheme = (selected_record.get("transform") or {}).get("scheme")
            if selected_name != expected_selected_name or selected_scheme != expected_selected_scheme:
                policy_mismatches[component] = {
                    "expectedStrategy": expected_selected_name,
                    "observedStrategy": selected_name,
                    "expectedScheme": expected_selected_scheme,
                    "observedScheme": selected_scheme,
                }
            shutil.copyfile(candidate_path, selected_path)
            for _, _, path, _ in passing:
                if path.exists():
                    path.unlink()
            if selected_path.stat().st_size != selected_record["artifact"]["size"] or baseline.sha256_file(selected_path) != selected_record["artifact"]["sha256"]:
                raise RuntimeError(f"selected strategy identity mismatch: {component}")
        best_observed = None
        if observed:
            best_rmse, best_name = min(observed)
            best_observed = {"strategy": best_name, "rmseOverReferenceRms": best_rmse}

        components[component] = {
            "status": "CANDIDATE",
            "result": "WASM_COMPACT_NATIVE_PASS" if selected_record else "WASM_STRATEGY_MATRIX_NO_NATIVE_PASS",
            "source": baseline_component["source"],
            "candidate": selected_record["artifact"] if selected_record else None,
            "nativeOrtParity": selected_record["nativeOrtParity"] if selected_record else None,
            "transform": selected_record["transform"] if selected_record else None,
            "selectedStrategy": selected_name,
            "acceptedSelectedStrategy": expected_selected_name,
            "acceptedSelectedScheme": expected_selected_scheme,
            "acceptedSelectionPolicyMatched": selected_record is not None and component not in policy_mismatches,
            "bestObservedByNormalizedRmse": best_observed,
            "strategies": strategies,
            "browserFixture": baseline_component["browserFixture"],
            "runtimeAuthorityGranted": False,
            "productionApproval": False,
            "releaseIdentityPinned": False,
        }

    shutil.rmtree(scratch, ignore_errors=True)
    native_pass_count = sum(value["result"] == "WASM_COMPACT_NATIVE_PASS" for value in components.values())
    selected_bytes = sum((value.get("candidate") or {}).get("size", 0) for value in components.values())
    accepted_selection_policy_matched = native_pass_count == len(COMPONENTS) and not policy_mismatches
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D3_WASM_COMPACT_PREPARATION",
        "strategy": "MULTI_STRATEGY_NATIVE_PARITY_SELECTION",
        "baselineEvidenceSha256": __import__("hashlib").sha256(baseline_report_bytes).hexdigest(),
        "strategyOrderIsNotAuthority": True,
        "selectionRule": "MIN_SIZE_AMONG_ORIGINAL_D3_NATIVE_PARITY_PASSING_CANDIDATES",
        "acceptedSelectionPolicy": dict(ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT),
        "acceptedSchemePolicy": dict(ACCEPTED_SELECTED_SCHEME_BY_COMPONENT),
        "acceptedSelectionPolicyMatched": accepted_selection_policy_matched,
        "selectionPolicyMismatches": policy_mismatches,
        "selectionPolicyUpdateRequiredOnWinnerChange": True,
        "fullInt8UniversalPackClaimed": False,
        "browserWasmStillRequired": True,
        "calibrationIsProductionQualityAuthority": False,
        "components": components,
        "nativePassCount": native_pass_count,
        "blockedComponents": {
            key: value["result"] for key, value in components.items() if value["result"] != "WASM_COMPACT_NATIVE_PASS"
        },
        "totals": {
            "sourceFp32Bytes": sum(value["source"]["size"] for value in components.values()),
            "selectedCandidateBytes": selected_bytes,
        },
        "binaryArtifactsRunnerLocalOnly": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "realDeviceApproval": False,
        "productionApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"TINY-SD D3 WASM STRATEGY MATRIX: pass={native_pass_count}/3 blocked={report['blockedComponents']}")
    for component, value in components.items():
        print(component, "selected=", value["selectedStrategy"], "best=", value["bestObservedByNormalizedRmse"])
    if not accepted_selection_policy_matched:
        raise RuntimeError(
            "D3 minimum-size winner diverged from accepted per-component selection policy; "
            f"explicit accepted-selection policy update required: {policy_mismatches or report['blockedComponents']}"
        )
    return 0


if __name__ == "__main__":
    if "--candidate-worker" in sys.argv:
        raise SystemExit(candidate_worker_main())
    raise SystemExit(main())
