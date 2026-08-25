#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gc
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto
from onnxruntime.quantization import (
    CalibrationDataReader,
    CalibrationMethod,
    QuantFormat,
    QuantType,
    quantize_dynamic,
    quantize_static,
)

from tiny_sd_d2_common import (
    deterministic_text_inputs,
    deterministic_unet_inputs,
    deterministic_vae_input,
    numeric_metrics,
    sha256_file,
)

EXPECTED_ONNX = "1.22.0"
EXPECTED_ORT = "1.27.0"
COMPONENT_FILES = {
    "text_encoder": "text_encoder.onnx",
    "unet": "unet.onnx",
    "vae_decoder": "vae_decoder.onnx",
}
NUMERIC_THRESHOLDS = {
    "maxAbsOverReferenceMaxAbs": 0.02,
    "rmseOverReferenceRms": 0.01,
}


class FixedCalibrationReader(CalibrationDataReader):
    def __init__(self, samples: list[dict[str, np.ndarray]]):
        self.samples = samples
        self.index = 0

    def get_next(self) -> dict[str, np.ndarray] | None:
        if self.index >= len(self.samples):
            return None
        sample = self.samples[self.index]
        self.index += 1
        return sample

    def rewind(self) -> None:
        self.index = 0


def dtype_name(data_type: int) -> str:
    try:
        return TensorProto.DataType.Name(data_type)
    except ValueError:
        return f"UNKNOWN_{data_type}"


def shape_of(value: onnx.ValueInfoProto) -> list[int | str | None]:
    result: list[int | str | None] = []
    for dimension in value.type.tensor_type.shape.dim:
        if dimension.HasField("dim_value"):
            result.append(int(dimension.dim_value))
        elif dimension.HasField("dim_param"):
            result.append(str(dimension.dim_param))
        else:
            result.append(None)
    return result


def io_contract(model: onnx.ModelProto) -> dict[str, Any]:
    def one(value: onnx.ValueInfoProto) -> dict[str, Any]:
        return {
            "name": value.name,
            "shape": shape_of(value),
            "dtype": dtype_name(value.type.tensor_type.elem_type),
        }

    return {
        "inputs": [one(value) for value in model.graph.input],
        "outputs": [one(value) for value in model.graph.output],
    }


def graph_inventory(path: Path) -> dict[str, Any]:
    model = onnx.load_model(path, load_external_data=True)
    onnx.checker.check_model(model, full_check=True)
    domains = sorted({node.domain or "ai.onnx" for node in model.graph.node})
    function_domains = sorted({function.domain or "ai.onnx" for function in model.functions})
    op_counts: dict[str, int] = {}
    for node in model.graph.node:
        key = f"{node.domain or 'ai.onnx'}::{node.op_type}"
        op_counts[key] = op_counts.get(key, 0) + 1
    initializer_counts: dict[str, int] = {}
    initializer_bytes: dict[str, int] = {}
    largest_initializer = {"name": "", "dtype": "", "elements": 0, "logicalBytes": 0}
    type_bytes = {
        TensorProto.FLOAT: 4,
        TensorProto.FLOAT16: 2,
        TensorProto.DOUBLE: 8,
        TensorProto.INT64: 8,
        TensorProto.INT32: 4,
        TensorProto.INT16: 2,
        TensorProto.INT8: 1,
        TensorProto.UINT64: 8,
        TensorProto.UINT32: 4,
        TensorProto.UINT16: 2,
        TensorProto.UINT8: 1,
        TensorProto.BOOL: 1,
    }
    for initializer in model.graph.initializer:
        dtype = dtype_name(initializer.data_type)
        elements = math.prod(int(value) for value in initializer.dims) if initializer.dims else 1
        logical_bytes = elements * type_bytes.get(initializer.data_type, 0)
        initializer_counts[dtype] = initializer_counts.get(dtype, 0) + 1
        initializer_bytes[dtype] = initializer_bytes.get(dtype, 0) + logical_bytes
        if logical_bytes > largest_initializer["logicalBytes"]:
            largest_initializer = {
                "name": initializer.name,
                "dtype": dtype,
                "elements": elements,
                "logicalBytes": logical_bytes,
            }
    result = {
        "nodeCount": len(model.graph.node),
        "domains": domains,
        "opsets": sorted([[item.domain or "ai.onnx", int(item.version)] for item in model.opset_import]),
        "functionCount": len(model.functions),
        "functionDomains": function_domains,
        "opCounts": dict(sorted(op_counts.items())),
        "initializerCountsByType": dict(sorted(initializer_counts.items())),
        "initializerLogicalBytesByType": dict(sorted(initializer_bytes.items())),
        "largestInitializer": largest_initializer,
        "ioContract": io_contract(model),
    }
    del model
    gc.collect()
    return result


def expected_io_from_d2(record: dict[str, Any]) -> dict[str, Any]:
    contract = record.get("tensorContract") or {}
    inputs = []
    for value in contract.get("inputs") or []:
        name = value["name"]
        dtype = "INT64" if name in {"input_ids", "attention_mask", "timestep"} else "FLOAT"
        inputs.append({"name": name, "shape": value["shape"], "dtype": dtype})
    output = contract.get("output") or {}
    return {
        "inputs": inputs,
        "outputs": [{"name": output["name"], "shape": output["shape"], "dtype": "FLOAT"}],
    }


def require_d2_report(report: dict[str, Any], fp32_dir: Path) -> None:
    if report.get("status") != "CANDIDATE" or report.get("stage") != "D2_COMPONENT_ONNX_CPU_FEASIBILITY":
        raise RuntimeError("D3 WASM did not receive accepted D2 evidence")
    if report.get("passCount") != 3 or report.get("allComponentsPass") is not True or report.get("blockedComponents") != {}:
        raise RuntimeError("D3 WASM requires D2 3/3 component acceptance")
    if report.get("runtimeAuthorityGranted") is not False or report.get("productionApproval") is not False:
        raise RuntimeError("D2 evidence unexpectedly grants authority")
    components = report.get("components") or {}
    if set(components) != set(COMPONENT_FILES):
        raise RuntimeError(f"unexpected D2 component set: {sorted(components)}")
    for component, filename in COMPONENT_FILES.items():
        record = components[component]
        if record.get("result") != "PASS" or record.get("ortParityPassed") is not True:
            raise RuntimeError(f"D2 component is no longer accepted: {component}")
        path = fp32_dir / filename
        artifact = record.get("artifact") or {}
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f"missing D2 FP32 ONNX: {component}")
        if path.stat().st_size != artifact.get("size") or sha256_file(path) != artifact.get("sha256"):
            raise RuntimeError(f"D2 FP32 ONNX identity mismatch: {component}")
        model = onnx.load_model(path, load_external_data=True)
        if io_contract(model) != expected_io_from_d2(record):
            raise RuntimeError(f"D2 FP32 I/O contract drift: {component}")
        del model


def exact_inputs(component: str) -> dict[str, np.ndarray]:
    if component == "text_encoder":
        input_ids, attention_mask = deterministic_text_inputs(49408)
        return {
            "input_ids": input_ids.numpy().astype(np.int64, copy=False),
            "attention_mask": attention_mask.numpy().astype(np.int64, copy=False),
        }
    if component == "unet":
        sample, timestep, hidden = deterministic_unet_inputs(768)
        return {
            "sample": sample.numpy().astype(np.float32, copy=False),
            "timestep": timestep.numpy().astype(np.int64, copy=False),
            "encoder_hidden_states": hidden.numpy().astype(np.float32, copy=False),
        }
    if component == "vae_decoder":
        latent = deterministic_vae_input()
        return {"stable_diffusion_latent": latent.numpy().astype(np.float32, copy=False)}
    raise RuntimeError(component)


def write_array(path: Path, array: np.ndarray) -> dict[str, Any]:
    values = np.ascontiguousarray(array)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(values.tobytes(order="C"))
    return {
        "path": path.name,
        "dtype": str(values.dtype),
        "shape": list(values.shape),
        "elements": int(values.size),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def browser_fixture(component: str, fp32: Path, fixture_dir: Path, d2_record: dict[str, Any]) -> dict[str, Any]:
    feeds = exact_inputs(component)
    expected_names = [value["name"] for value in d2_record["tensorContract"]["inputs"]]
    if list(feeds) != expected_names:
        raise RuntimeError(f"D3 WASM fixture input contract drift: {component}")
    output_name = d2_record["tensorContract"]["output"]["name"]
    session = ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"])
    output = session.run([output_name], feeds)[0].astype(np.float32, copy=False)
    if list(output.shape) != d2_record["tensorContract"]["output"]["shape"] or not np.isfinite(output).all():
        raise RuntimeError(f"D3 WASM fixture output drift: {component}")
    component_dir = fixture_dir / component
    inputs: list[dict[str, Any]] = []
    for name in expected_names:
        item = write_array(component_dir / f"{name}.bin", feeds[name])
        item["name"] = name
        inputs.append(item)
    reference = write_array(component_dir / "reference.f32", output)
    reference["name"] = output_name
    reference["authority"] = "D2_ACCEPTED_FP32_CPU_ORT_OUTPUT"
    del session
    gc.collect()
    return {"inputs": inputs, "reference": reference}


def calibration_samples(component: str) -> list[dict[str, np.ndarray]]:
    if component == "unet":
        base_sample, _, base_hidden = deterministic_unet_inputs(768)
        sample = base_sample.numpy().astype(np.float32, copy=False)
        hidden = base_hidden.numpy().astype(np.float32, copy=False)
        specifications = [
            (0.50, -0.10, 1, 0.60, -0.05),
            (0.75, 0.05, 50, 0.80, 0.02),
            (1.00, 0.00, 250, 1.00, 0.00),
            (1.00, 0.00, 501, 1.00, 0.00),
            (1.15, -0.03, 650, 1.10, -0.02),
            (1.30, 0.07, 750, 1.20, 0.03),
            (1.50, -0.08, 900, 1.35, -0.04),
            (1.75, 0.10, 999, 1.50, 0.05),
        ]
        return [
            {
                "sample": np.clip(sample * sample_scale + sample_offset, -3.0, 3.0).astype(np.float32),
                "timestep": np.asarray([timestep], dtype=np.int64),
                "encoder_hidden_states": np.clip(hidden * hidden_scale + hidden_offset, -2.0, 2.0).astype(np.float32),
            }
            for sample_scale, sample_offset, timestep, hidden_scale, hidden_offset in specifications
        ]
    if component == "vae_decoder":
        base = deterministic_vae_input().numpy().astype(np.float32, copy=False)
        specifications = [
            (0.40, -0.20),
            (0.60, 0.10),
            (0.80, -0.05),
            (1.00, 0.00),
            (1.15, 0.05),
            (1.30, -0.10),
            (1.50, 0.15),
            (1.75, -0.20),
        ]
        return [
            {"stable_diffusion_latent": np.clip(base * scale + offset, -3.5, 3.5).astype(np.float32)}
            for scale, offset in specifications
        ]
    raise RuntimeError(f"static calibration is not selected for {component}")


def run_parity(component: str, fp32: Path, quantized: Path, d2_record: dict[str, Any]) -> dict[str, Any]:
    feeds = exact_inputs(component)
    output_name = d2_record["tensorContract"]["output"]["name"]
    source_session = ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"])
    candidate_session = ort.InferenceSession(str(quantized), providers=["CPUExecutionProvider"])
    source = source_session.run([output_name], feeds)[0].astype(np.float32, copy=False)
    candidate = candidate_session.run([output_name], feeds)[0].astype(np.float32, copy=False)
    if source.shape != candidate.shape or list(candidate.shape) != d2_record["tensorContract"]["output"]["shape"]:
        raise RuntimeError(f"quantized output shape drift: {component}")
    if not np.isfinite(source).all() or not np.isfinite(candidate).all():
        raise RuntimeError(f"non-finite quantized parity output: {component}")
    metrics = numeric_metrics(source, candidate)
    reference_rms = float(np.sqrt(np.mean(source.astype(np.float64) ** 2)))
    reference_max_abs = float(np.max(np.abs(source.astype(np.float64)), initial=0.0))
    normalized = {
        "maxAbsOverReferenceMaxAbs": metrics["maxAbs"] / max(reference_max_abs, 1e-12),
        "rmseOverReferenceRms": metrics["rmse"] / max(reference_rms, 1e-12),
    }
    passed = all(normalized[key] <= threshold for key, threshold in NUMERIC_THRESHOLDS.items())
    del source_session, candidate_session
    gc.collect()
    return {
        "referenceKind": "D2_ACCEPTED_FP32_CPU_ORT_OUTPUT_REPRODUCED",
        "metrics": metrics,
        "referenceScale": {"rms": reference_rms, "maxAbs": reference_max_abs},
        "normalizedMetrics": normalized,
        "thresholds": dict(NUMERIC_THRESHOLDS),
        "passed": passed,
    }


def quantize_component(component: str, source: Path, target: Path) -> dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    if component == "text_encoder":
        quantize_dynamic(
            model_input=source,
            model_output=target,
            op_types_to_quantize=["MatMul"],
            per_channel=True,
            reduce_range=False,
            weight_type=QuantType.QUInt8,
            use_external_data_format=False,
            extra_options={"MatMulConstBOnly": True},
        )
        return {
            "scheme": "DYNAMIC_U8_WEIGHT_MATMUL",
            "calibration": None,
            "activationType": "DYNAMIC_QUInt8",
            "weightType": "QUInt8",
            "perChannel": True,
            "opTypes": ["MatMul"],
        }
    samples = calibration_samples(component)
    reader = FixedCalibrationReader(samples)
    quantize_static(
        model_input=source,
        model_output=target,
        calibration_data_reader=reader,
        quant_format=QuantFormat.QDQ,
        op_types_to_quantize=["Conv", "MatMul", "Gemm"],
        per_channel=True,
        reduce_range=False,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
        calibrate_method=CalibrationMethod.MinMax,
        use_external_data_format=False,
        extra_options={
            "ActivationSymmetric": False,
            "WeightSymmetric": True,
            "CalibTensorRangeSymmetric": False,
            "MatMulConstBOnly": True,
        },
    )
    return {
        "scheme": "STATIC_QDQ_U8S8_CONV_MATMUL_GEMM",
        "calibration": {
            "kind": "SYNTHETIC_DETERMINISTIC_RANGE_PROBE_NOT_DATASET_AUTHORITY",
            "sampleCount": len(samples),
            "method": "MinMax",
            "productionQualityAuthority": False,
        },
        "activationType": "QUInt8",
        "weightType": "QInt8",
        "perChannel": True,
        "opTypes": ["Conv", "MatMul", "Gemm"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fp32-dir", type=Path, required=True)
    parser.add_argument("--d2-report", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if onnx.__version__ != EXPECTED_ONNX:
        raise RuntimeError(f"unexpected ONNX version: {onnx.__version__}")
    if ort.__version__ != EXPECTED_ORT:
        raise RuntimeError(f"unexpected ORT version: {ort.__version__}")

    fp32_dir = args.fp32_dir.resolve(strict=True)
    d2_report = json.loads(args.d2_report.resolve(strict=True).read_text(encoding="utf-8"))
    require_d2_report(d2_report, fp32_dir)
    output_dir = args.output_dir.resolve()
    fixture_dir = args.fixture_dir.resolve()

    components: dict[str, Any] = {}
    for component, filename in COMPONENT_FILES.items():
        source = fp32_dir / filename
        target = output_dir / filename
        record: dict[str, Any] = {
            "status": "CANDIDATE",
            "source": {"size": source.stat().st_size, "sha256": sha256_file(source)},
            "browserFixture": browser_fixture(component, source, fixture_dir, d2_report["components"][component]),
            "releaseIdentityPinned": False,
            "runtimeAuthorityGranted": False,
            "productionApproval": False,
        }
        try:
            transform = quantize_component(component, source, target)
            if not target.is_file() or target.is_symlink() or target.stat().st_size <= 0:
                raise RuntimeError("quantizer did not produce a regular model file")
            source_model = onnx.load_model(source, load_external_data=True)
            source_io = io_contract(source_model)
            del source_model
            inventory = graph_inventory(target)
            if inventory["ioContract"] != source_io:
                raise RuntimeError(f"quantization changed public I/O contract: {inventory['ioContract']!r}")
            if inventory["domains"] != ["ai.onnx"]:
                raise RuntimeError(f"non-standard quantized graph domains: {inventory['domains']}")
            if inventory["functionCount"] != 0:
                raise RuntimeError(f"quantized graph contains local functions: {inventory['functionDomains']}")
            ratio = target.stat().st_size / source.stat().st_size
            parity = run_parity(component, source, target, d2_report["components"][component])
            compact = ratio < 0.80
            record.update({
                "result": "WASM_COMPACT_NATIVE_PASS" if compact and parity["passed"] else (
                    "WASM_COMPACT_SIZE_BLOCKED" if not compact else "WASM_COMPACT_NUMERIC_RISK"
                ),
                "transform": transform,
                "candidate": {
                    "size": target.stat().st_size,
                    "sha256": sha256_file(target),
                    "sizeRatio": ratio,
                    "bytesSaved": source.stat().st_size - target.stat().st_size,
                    "graph": inventory,
                },
                "nativeOrtParity": parity,
                "compactSizePassed": compact,
            })
        except Exception as error:
            record.update({
                "result": "WASM_COMPACT_TRANSFORM_BLOCKED",
                "error": f"{type(error).__name__}: {error}",
                "candidate": None,
                "nativeOrtParity": None,
                "compactSizePassed": False,
            })
            if target.exists():
                target.unlink()
        components[component] = record
        gc.collect()

    native_pass_count = sum(value["result"] == "WASM_COMPACT_NATIVE_PASS" for value in components.values())
    candidate_bytes = sum(
        int(value["candidate"]["size"])
        for value in components.values()
        if value.get("candidate") is not None
    )
    source_bytes = sum(int(value["source"]["size"]) for value in components.values())
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D3_WASM_COMPACT_PREPARATION",
        "environment": {"onnx": onnx.__version__, "onnxruntime": ort.__version__, "numpy": np.__version__},
        "strategy": "COMPONENT_SPECIFIC_QUANTIZATION_FIRST_BASELINE",
        "textEncoderStrategy": "DYNAMIC_U8_WEIGHT_MATMUL",
        "cnnStrategy": "STATIC_QDQ_U8S8_CONV_MATMUL_GEMM",
        "fullInt8UniversalPackClaimed": False,
        "components": components,
        "nativePassCount": native_pass_count,
        "blockedComponents": {
            key: value["result"] for key, value in components.items() if value["result"] != "WASM_COMPACT_NATIVE_PASS"
        },
        "totals": {
            "sourceFp32Bytes": source_bytes,
            "candidateBytesProduced": candidate_bytes,
            "producedSizeRatio": candidate_bytes / source_bytes,
        },
        "browserWasmStillRequired": True,
        "calibrationIsProductionQualityAuthority": False,
        "binaryArtifactsRunnerLocalOnly": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "realDeviceApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "TINY-SD D3 WASM COMPACT PREPARATION: "
        f"native_pass={native_pass_count}/3 blocked={report['blockedComponents']} "
        f"candidate_bytes={candidate_bytes}"
    )

    baseline_report_path = args.report.resolve()
    matrix_report_path = baseline_report_path.with_name(f"{baseline_report_path.stem}-matrix.json")
    matrix_script = Path(__file__).with_name("prepare-tiny-sd-d3-wasm-strategy-matrix.py")
    if not matrix_script.is_file() or matrix_script.is_symlink():
        raise RuntimeError("D3 WASM strategy matrix script is unavailable or not a regular tracked file")
    for filename in COMPONENT_FILES.values():
        candidate = output_dir / filename
        if candidate.exists():
            candidate.unlink()
    subprocess.run(
        [
            sys.executable,
            str(matrix_script),
            "--fp32-dir",
            str(fp32_dir),
            "--d2-report",
            str(args.d2_report.resolve(strict=True)),
            "--baseline-report",
            str(baseline_report_path),
            "--output-dir",
            str(output_dir),
            "--report",
            str(matrix_report_path),
        ],
        check=True,
    )
    matrix = json.loads(matrix_report_path.resolve(strict=True).read_text(encoding="utf-8"))
    if matrix.get("selectionRule") != "MIN_SIZE_AMONG_ORIGINAL_D3_NATIVE_PARITY_PASSING_CANDIDATES":
        raise RuntimeError("D3 WASM strategy selection rule drift")
    for component, value in matrix["components"].items():
        if value["result"] == "WASM_STRATEGY_MATRIX_NO_NATIVE_PASS":
            strategy_results = [item.get("result") for item in value.get("strategies", {}).values()]
            if "NUMERIC_RISK" in strategy_results:
                value["result"] = "WASM_COMPACT_NUMERIC_RISK"
            elif "SIZE_BLOCKED" in strategy_results:
                value["result"] = "WASM_COMPACT_SIZE_BLOCKED"
            else:
                value["result"] = "WASM_COMPACT_TRANSFORM_BLOCKED"
        value["compactSizePassed"] = bool(
            value["result"] == "WASM_COMPACT_NATIVE_PASS"
            and value.get("candidate") is not None
            and value["candidate"].get("sizeRatio", 1.0) < 0.80
        )
        if value["result"] == "WASM_COMPACT_NATIVE_PASS":
            if value.get("candidate") is None or value.get("nativeOrtParity", {}).get("passed") is not True:
                raise RuntimeError(f"D3 WASM selected candidate is not parity-qualified: {component}")
            if value["compactSizePassed"] is not True:
                raise RuntimeError(f"D3 WASM selected candidate is not compact: {component}")
            selected_path = output_dir / COMPONENT_FILES[component]
            if not selected_path.is_file() or selected_path.is_symlink():
                raise RuntimeError(f"D3 WASM selected candidate binary missing: {component}")
            if selected_path.stat().st_size != value["candidate"]["size"] or sha256_file(selected_path) != value["candidate"]["sha256"]:
                raise RuntimeError(f"D3 WASM selected candidate identity drift: {component}")
    matrix["environment"] = report["environment"]
    matrix["strategy"] = "COMPONENT_SPECIFIC_QUANTIZATION_FIRST_BASELINE"
    matrix["selectionStrategy"] = "MULTI_STRATEGY_NATIVE_PARITY_SELECTION"
    matrix["textEncoderStrategy"] = "DYNAMIC_U8_WEIGHT_MATMUL"
    matrix["cnnStrategy"] = "STATIC_QDQ_U8S8_CONV_MATMUL_GEMM"
    matrix["nativePassCount"] = sum(value["result"] == "WASM_COMPACT_NATIVE_PASS" for value in matrix["components"].values())
    matrix["blockedComponents"] = {
        key: value["result"]
        for key, value in matrix["components"].items()
        if value["result"] != "WASM_COMPACT_NATIVE_PASS"
    }
    selected_bytes = sum(
        int(value["candidate"]["size"])
        for value in matrix["components"].values()
        if value.get("candidate") is not None
    )
    matrix["totals"]["baselineCandidateBytesProduced"] = candidate_bytes
    matrix["totals"]["candidateBytesProduced"] = selected_bytes
    matrix["totals"]["producedSizeRatio"] = selected_bytes / source_bytes
    baseline_report_path.write_text(json.dumps(matrix, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    matrix_report_path.unlink()
    print(
        "TINY-SD D3 WASM STRATEGY SELECTION: "
        f"native_pass={matrix['nativePassCount']}/3 blocked={matrix['blockedComponents']} "
        f"selected_bytes={selected_bytes}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
