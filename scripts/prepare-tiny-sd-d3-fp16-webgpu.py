#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gc
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto
from onnxconverter_common import float16

from tiny_sd_d2_common import (
    deterministic_text_inputs,
    deterministic_unet_inputs,
    deterministic_vae_input,
    sha256_file,
)

EXPECTED_ONNX = "1.22.0"
EXPECTED_ORT = "1.27.0"
EXPECTED_CONVERTER = "1.16.0"
COMPONENT_FILES = {
    "text_encoder": "text_encoder.onnx",
    "unet": "unet.onnx",
    "vae_decoder": "vae_decoder.onnx",
}


def environment() -> dict[str, str]:
    import onnxconverter_common

    values = {
        "onnx": onnx.__version__,
        "onnxruntime": ort.__version__,
        "onnxconverterCommon": onnxconverter_common.__version__,
        "numpy": np.__version__,
    }
    if values["onnx"] != EXPECTED_ONNX:
        raise RuntimeError(f"unexpected ONNX version: {values['onnx']}")
    if values["onnxruntime"] != EXPECTED_ORT:
        raise RuntimeError(f"unexpected ORT version: {values['onnxruntime']}")
    if values["onnxconverterCommon"] != EXPECTED_CONVERTER:
        raise RuntimeError(f"unexpected onnxconverter-common version: {values['onnxconverterCommon']}")
    return values


def shape_of(value: onnx.ValueInfoProto) -> list[int | str | None]:
    shape: list[int | str | None] = []
    for dimension in value.type.tensor_type.shape.dim:
        if dimension.HasField("dim_value"):
            shape.append(int(dimension.dim_value))
        elif dimension.HasField("dim_param"):
            shape.append(str(dimension.dim_param))
        else:
            shape.append(None)
    return shape


def dtype_name(data_type: int) -> str:
    try:
        return TensorProto.DataType.Name(data_type)
    except ValueError:
        return f"UNKNOWN_{data_type}"


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


def graph_inventory(model: onnx.ModelProto) -> dict[str, Any]:
    onnx.checker.check_model(model, full_check=True)
    domains = sorted({node.domain or "ai.onnx" for node in model.graph.node})
    custom_nodes = sorted({
        f"{node.domain or 'ai.onnx'}::{node.op_type}"
        for node in model.graph.node
        if (node.domain or "ai.onnx") not in ("", "ai.onnx")
    })
    aten_like = sorted({
        f"{node.domain or 'ai.onnx'}::{node.op_type}"
        for node in model.graph.node
        if "aten" in (node.domain or "").lower() or "aten" in node.op_type.lower()
    })
    function_domains = sorted({function.domain or "ai.onnx" for function in model.functions})
    custom_function_domains = [value for value in function_domains if value not in ("", "ai.onnx")]
    if custom_nodes:
        raise RuntimeError(f"D3 custom-domain nodes rejected: {custom_nodes[:20]}")
    if aten_like:
        raise RuntimeError(f"D3 ATen-like nodes rejected: {aten_like[:20]}")
    if custom_function_domains:
        raise RuntimeError(f"D3 custom function domains rejected: {custom_function_domains[:20]}")

    initializer_counts: dict[str, int] = {}
    initializer_elements: dict[str, int] = {}
    for initializer in model.graph.initializer:
        name = dtype_name(initializer.data_type)
        initializer_counts[name] = initializer_counts.get(name, 0) + 1
        elements = math.prod(int(value) for value in initializer.dims) if initializer.dims else 1
        initializer_elements[name] = initializer_elements.get(name, 0) + elements

    op_counts: dict[str, int] = {}
    for node in model.graph.node:
        name = f"{node.domain or 'ai.onnx'}::{node.op_type}"
        op_counts[name] = op_counts.get(name, 0) + 1

    return {
        "nodeCount": len(model.graph.node),
        "domains": domains,
        "opsets": sorted([[item.domain or "ai.onnx", int(item.version)] for item in model.opset_import]),
        "functionCount": len(model.functions),
        "functionDomains": function_domains,
        "castNodeCount": sum(1 for node in model.graph.node if (node.domain in ("", "ai.onnx")) and node.op_type == "Cast"),
        "initializerCountsByType": dict(sorted(initializer_counts.items())),
        "initializerElementsByType": dict(sorted(initializer_elements.items())),
        "opCounts": dict(sorted(op_counts.items())),
    }


def require_d2_report(report: dict[str, Any], fp32_dir: Path) -> None:
    if report.get("status") != "CANDIDATE" or report.get("stage") != "D2_COMPONENT_ONNX_CPU_FEASIBILITY":
        raise RuntimeError("D3 did not receive accepted D2 component evidence")
    if report.get("passCount") != 3 or report.get("allComponentsPass") is not True or report.get("blockedComponents") != {}:
        raise RuntimeError("D3 requires D2 3/3 component acceptance")
    if report.get("runtimeAuthorityGranted") is not False or report.get("productionApproval") is not False:
        raise RuntimeError("D2 evidence unexpectedly grants authority")
    if report.get("releaseIdentityPinned") is not False or report.get("onnxArtifactsRunnerLocalOnly") is not True:
        raise RuntimeError("D2 artifact lifecycle changed")
    components = report.get("components") or {}
    if set(components) != set(COMPONENT_FILES):
        raise RuntimeError(f"unexpected D2 component set: {sorted(components)}")
    for component, filename in COMPONENT_FILES.items():
        record = components[component]
        if record.get("result") != "PASS" or record.get("referenceParityPassed") is not True or record.get("ortParityPassed") is not True:
            raise RuntimeError(f"D2 component is no longer accepted: {component}")
        path = fp32_dir / filename
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f"missing D2 FP32 ONNX: {component}")
        artifact = record.get("artifact") or {}
        if path.stat().st_size != artifact.get("size") or sha256_file(path) != artifact.get("sha256"):
            raise RuntimeError(f"D2 FP32 ONNX identity mismatch: {component}")


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


def cast_target(node: onnx.NodeProto) -> int | None:
    if node.domain not in ("", "ai.onnx") or node.op_type != "Cast":
        return None
    attributes = [attribute for attribute in node.attribute if attribute.name == "to"]
    if len(attributes) != 1:
        raise RuntimeError(f"D3 Cast node has unexpected 'to' attribute count: {node.name!r}")
    return int(attributes[0].i)


def declared_tensor_types(model: onnx.ModelProto) -> dict[str, int]:
    declared: dict[str, int] = {}
    for value in (*model.graph.input, *model.graph.output, *model.graph.value_info):
        elem_type = int(value.type.tensor_type.elem_type)
        previous = declared.get(value.name)
        if previous is not None and previous != elem_type:
            raise RuntimeError(
                f"D3 conflicting tensor type declarations for {value.name}: "
                f"{dtype_name(previous)} vs {dtype_name(elem_type)}"
            )
        declared[value.name] = elem_type
    return declared


def repair_converter_internal_float_casts(
    source_model: onnx.ModelProto,
    converted_model: onnx.ModelProto,
) -> list[dict[str, str]]:
    """Repair the narrow onnxconverter-common Cast(FLOAT) -> declared FP16 mismatch.

    The converter changes internal FLOAT value_info to FLOAT16 but, for pre-existing
    Cast nodes, can leave the node's `to` attribute at FLOAT. We repair only a Cast
    that existed in the accepted D2 source graph, still has the same output, was a
    source Cast-to-FLOAT, is not a public graph output, and is now explicitly
    declared FLOAT16 by the converter. Any broader inconsistency remains fail-closed
    and is caught by the full ONNX checker immediately afterwards.
    """
    source_casts: dict[str, tuple[tuple[str, ...], int]] = {}
    for node in source_model.graph.node:
        target = cast_target(node)
        if target is None:
            continue
        if not node.name or node.name in source_casts:
            raise RuntimeError(f"D3 source Cast names must be unique and non-empty: {node.name!r}")
        source_casts[node.name] = (tuple(node.output), target)

    converted_types = declared_tensor_types(converted_model)
    public_outputs = {value.name for value in converted_model.graph.output}
    repairs: list[dict[str, str]] = []
    for node in converted_model.graph.node:
        target = cast_target(node)
        if target != TensorProto.FLOAT or len(node.output) != 1:
            continue
        output_name = node.output[0]
        if converted_types.get(output_name) != TensorProto.FLOAT16:
            continue
        if output_name in public_outputs:
            raise RuntimeError(f"D3 refuses to rewrite public output Cast: {node.name!r}")
        source = source_casts.get(node.name)
        if source != ((output_name,), TensorProto.FLOAT):
            raise RuntimeError(
                "D3 refuses broad Cast repair; mismatch is not the same pre-existing "
                f"D2 Cast-to-FLOAT node: {node.name!r} output={output_name!r}"
            )
        attribute = next(attribute for attribute in node.attribute if attribute.name == "to")
        attribute.i = TensorProto.FLOAT16
        repairs.append({
            "node": node.name,
            "output": output_name,
            "from": "FLOAT",
            "to": "FLOAT16",
            "authority": "NARROW_CONVERTER_COMPATIBILITY_REPAIR_ONLY",
        })
    return repairs


def convert_one(component: str, source: Path, target: Path, d2_record: dict[str, Any]) -> dict[str, Any]:
    source_model = onnx.load_model(source, load_external_data=True)
    source_contract = io_contract(source_model)
    expected_contract = expected_io_from_d2(d2_record)
    if source_contract != expected_contract:
        raise RuntimeError(f"D2 FP32 ONNX I/O contract drift for {component}: {source_contract!r}")
    source_inventory = graph_inventory(source_model)

    converted = float16.convert_float_to_float16(
        source_model,
        keep_io_types=True,
        disable_shape_infer=False,
    )
    converted_contract = io_contract(converted)
    if converted_contract != source_contract:
        raise RuntimeError(
            f"D3 FP16 conversion changed public I/O contract for {component}: "
            f"before={source_contract!r} after={converted_contract!r}"
        )
    cast_repairs = repair_converter_internal_float_casts(source_model, converted)
    converted_inventory = graph_inventory(converted)
    fp16_elements = int(converted_inventory["initializerElementsByType"].get("FLOAT16", 0))
    fp32_elements = int(converted_inventory["initializerElementsByType"].get("FLOAT", 0))
    if fp16_elements <= 0:
        raise RuntimeError(f"D3 FP16 conversion produced no FLOAT16 initializer elements: {component}")

    target.parent.mkdir(parents=True, exist_ok=True)
    onnx.save_model(converted, target, save_as_external_data=False)
    if not target.is_file() or target.stat().st_size <= 0:
        raise RuntimeError(f"D3 FP16 ONNX was not written: {component}")
    ratio = target.stat().st_size / source.stat().st_size
    if not 0.45 <= ratio <= 0.75:
        raise RuntimeError(f"D3 FP16 size ratio outside expected feasibility band for {component}: {ratio:.6f}")

    result = {
        "result": "FP16_GRAPH_PASS",
        "transform": {
            "tool": "onnxconverter_common.float16.convert_float_to_float16",
            "keepIoTypes": True,
            "disableShapeInfer": False,
            "universalFp16CpuTierClaimed": False,
            "compatibilityRepairPolicy": "SOURCE_CAST_FLOAT_TO_CONVERTER_DECLARED_FP16_ONLY",
            "compatibilityRepairs": cast_repairs,
        },
        "fp32": {
            "size": source.stat().st_size,
            "sha256": sha256_file(source),
            "graph": source_inventory,
        },
        "fp16": {
            "size": target.stat().st_size,
            "sha256": sha256_file(target),
            "sizeRatio": ratio,
            "bytesSaved": source.stat().st_size - target.stat().st_size,
            "graph": converted_inventory,
        },
        "ioContract": converted_contract,
        "releaseIdentityPinned": False,
    }
    del converted, source_model
    gc.collect()
    return result


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


def fp32_reference_and_fixtures(
    component: str,
    fp32_model: Path,
    fixture_dir: Path,
    d2_record: dict[str, Any],
) -> dict[str, Any]:
    if component == "text_encoder":
        input_ids, attention_mask = deterministic_text_inputs(49408)
        values = {
            "input_ids": input_ids.cpu().numpy().astype(np.int64, copy=False),
            "attention_mask": attention_mask.cpu().numpy().astype(np.int64, copy=False),
        }
    elif component == "unet":
        sample, timestep, hidden = deterministic_unet_inputs(768)
        values = {
            "sample": sample.cpu().numpy().astype(np.float32, copy=False),
            "timestep": timestep.cpu().numpy().astype(np.int64, copy=False),
            "encoder_hidden_states": hidden.cpu().numpy().astype(np.float32, copy=False),
        }
    elif component == "vae_decoder":
        latent = deterministic_vae_input()
        values = {"stable_diffusion_latent": latent.cpu().numpy().astype(np.float32, copy=False)}
    else:
        raise RuntimeError(component)

    session = ort.InferenceSession(str(fp32_model), providers=["CPUExecutionProvider"])
    expected_inputs = [item["name"] for item in d2_record["tensorContract"]["inputs"]]
    if [item.name for item in session.get_inputs()] != expected_inputs:
        raise RuntimeError(f"D3 FP32 fixture input contract drift: {component}")
    if set(values) != set(expected_inputs):
        raise RuntimeError(f"D3 fixture generator input set drift: {component}")
    output_name = d2_record["tensorContract"]["output"]["name"]
    output = session.run([output_name], values)[0].astype(np.float32, copy=False)
    if not np.isfinite(output).all():
        raise RuntimeError(f"D3 FP32 reference contains non-finite values: {component}")

    component_dir = fixture_dir / component
    inputs: list[dict[str, Any]] = []
    for name in expected_inputs:
        record = write_array(component_dir / f"{name}.bin", values[name])
        record["name"] = name
        inputs.append(record)
    reference = write_array(component_dir / "reference.f32", output)
    reference["name"] = output_name
    reference["authority"] = "D2_ACCEPTED_FP32_CPU_ORT_OUTPUT"

    expected_output_shape = d2_record["tensorContract"]["output"]["shape"]
    if reference["shape"] != expected_output_shape:
        raise RuntimeError(f"D3 FP32 reference output shape drift: {component}")
    del session
    gc.collect()
    return {"inputs": inputs, "reference": reference}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fp32-dir", type=Path, required=True)
    parser.add_argument("--d2-report", type=Path, required=True)
    parser.add_argument("--fp16-dir", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    env = environment()
    fp32_dir = args.fp32_dir.resolve(strict=True)
    d2_report = json.loads(args.d2_report.resolve(strict=True).read_text(encoding="utf-8"))
    require_d2_report(d2_report, fp32_dir)
    fp16_dir = args.fp16_dir.resolve()
    fixture_dir = args.fixture_dir.resolve()

    components: dict[str, Any] = {}
    for component, filename in COMPONENT_FILES.items():
        source = fp32_dir / filename
        target = fp16_dir / filename
        converted = convert_one(component, source, target, d2_report["components"][component])
        converted["browserFixture"] = fp32_reference_and_fixtures(
            component,
            source,
            fixture_dir,
            d2_report["components"][component],
        )
        components[component] = converted

    total_fp32 = sum(int(value["fp32"]["size"]) for value in components.values())
    total_fp16 = sum(int(value["fp16"]["size"]) for value in components.values())
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D3_WEBGPU_FP16_PREPARATION",
        "environment": env,
        "d1TrustRootRequired": True,
        "d2SemanticBaselineRequired": True,
        "providerSpecificPrecisionTiers": True,
        "selectedWebGpuCandidatePrecision": "FP16_INTERNAL_FP32_INT64_IO",
        "wasmPrecisionDecision": "SEPARATE_UINT8_OR_FP32_FEASIBILITY_REQUIRED",
        "components": components,
        "totals": {
            "fp32Bytes": total_fp32,
            "fp16Bytes": total_fp16,
            "sizeRatio": total_fp16 / total_fp32,
            "bytesSaved": total_fp32 - total_fp16,
        },
        "binaryArtifactsRunnerLocalOnly": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "realDeviceApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "TINY-SD D3 FP16 PREPARATION: PASS "
        f"fp32={total_fp32} fp16={total_fp16} ratio={total_fp16 / total_fp32:.6f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
