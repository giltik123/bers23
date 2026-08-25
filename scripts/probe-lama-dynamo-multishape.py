#!/usr/bin/env python3
"""Prove dynamic Big-LaMa Dynamo→ONNX DFT fidelity across modulo-8 image shapes.

The legacy Lightning checkpoint is never visible to this process. Generator tensors arrive only
through the SHA-bound C7 safetensors bridge. This probe reuses the C7 bridge verification and exact
pinned FFCResNetGenerator builder, exports one dynamic ONNX graph with PyTorch 2.13, then compares
PyTorch and ONNX Runtime CPU results across square and non-square modulo-8 shapes.

Passing this probe is CANDIDATE feasibility evidence only. It is not browser evidence, quality
review, release publication, or production authority.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch

TEST_SHAPES = ((64, 64), (256, 256), (256, 384), (512, 512))
EXPORT_HEIGHT = 64
EXPORT_WIDTH = 64
MAX_ABS_TOL = 2e-4
RMSE_TOL = 5e-5
BROWSER_REFERENCE_SHAPE = (256, 256)


def load_base(script_dir: Path):
    path = script_dir / "probe-lama-dynamo-onnx.py"
    spec = importlib.util.spec_from_file_location("bers_lama_c7_base", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load C7 safetensors/export base module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def semantic_input(height: int, width: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    if height % 8 or width % 8:
        raise RuntimeError(f"LaMa C7 shape must already be modulo-8 padded: {height}x{width}")
    y = torch.linspace(0.0, 1.0, height, dtype=torch.float32).view(1, 1, height, 1)
    x = torch.linspace(0.0, 1.0, width, dtype=torch.float32).view(1, 1, 1, width)
    red = x.expand(1, 1, height, width)
    green = y.expand(1, 1, height, width)
    blue = ((red + green) * 0.5).clamp(0.0, 1.0)
    image = torch.cat([red, green, blue], dim=1)
    mask = torch.zeros((1, 1, height, width), dtype=torch.float32)
    mask[:, :, height // 4 : (3 * height) // 4, (5 * width) // 16 : (11 * width) // 16] = 1.0
    generator_input = torch.cat([image * (1.0 - mask), mask], dim=1)
    return image, mask, generator_input


def onnx_shape(value_info: onnx.ValueInfoProto) -> list[int | str | None]:
    result: list[int | str | None] = []
    for dimension in value_info.type.tensor_type.shape.dim:
        if dimension.dim_param:
            result.append(dimension.dim_param)
        elif dimension.HasField("dim_value"):
            result.append(int(dimension.dim_value))
        else:
            result.append(None)
    return result


def semantic_contract(image: np.ndarray, mask: np.ndarray, generator_input: np.ndarray) -> dict[str, Any]:
    mask_values = sorted(float(value) for value in np.unique(mask))
    mask_channel_exact = np.array_equal(generator_input[:, 3:4], mask)
    rgb = generator_input[:, :3]
    expanded_mask = np.broadcast_to(mask == 1.0, rgb.shape)
    masked_rgb_zero = bool(np.all(rgb[expanded_mask] == 0.0))
    known = np.broadcast_to(mask == 0.0, image.shape)
    known_rgb_exact = bool(np.array_equal(rgb[known], image[known]))
    return {
        "imageRange": [float(image.min()), float(image.max())],
        "maskValues": mask_values,
        "maskOneMeansInpaint": True,
        "maskChannelExact": mask_channel_exact,
        "maskedRgbZero": masked_rgb_zero,
        "knownRgbPreservedInGeneratorInput": known_rgb_exact,
        "generatorInputFormula": "concat(image * (1 - mask), mask)",
    }


def composite_checks(image: np.ndarray, mask: np.ndarray, proposal: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    composite = mask * proposal + (1.0 - mask) * image
    known = np.broadcast_to(mask == 0.0, image.shape)
    unknown = np.broadcast_to(mask == 1.0, image.shape)
    known_exact = bool(np.array_equal(composite[known], image[known]))
    unknown_from_proposal = bool(np.array_equal(composite[unknown], proposal[unknown]))
    return composite, {
        "formula": "mask * predicted + (1 - mask) * original",
        "knownRegionBitExact": known_exact,
        "maskedRegionEqualsProposal": unknown_from_proposal,
    }


def classify_export_error(error: BaseException) -> tuple[str, str]:
    message = f"{type(error).__name__}: {error}"
    lowered = message.lower()
    if "constraint" in lowered or "dynamic shape" in lowered or "guard" in lowered:
        return "DYNAMO_DYNAMIC_EXPORT_BLOCKED_SHAPE_CONSTRAINT", message[:6000]
    if "fft" in lowered or "dft" in lowered or "complex" in lowered:
        return "DYNAMO_DYNAMIC_EXPORT_BLOCKED_FFT_OR_COMPLEX", message[:6000]
    if "onnx" in lowered and ("translation" in lowered or "conversion" in lowered or "dispatch" in lowered):
        return "DYNAMO_DYNAMIC_EXPORT_BLOCKED_ONNX_TRANSLATION", message[:6000]
    raise RuntimeError(f"Unexpected dynamic Dynamo exporter failure: {message[:6000]}") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--bridge-report", type=Path, required=True)
    parser.add_argument("--model-out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--browser-input-out", type=Path, required=True)
    parser.add_argument("--browser-reference-out", type=Path, required=True)
    args = parser.parse_args()

    base = load_base(Path(__file__).resolve().parent)
    env = base.environment()
    generator, bridge_proof = base.load_strict_generator(
        args.source.resolve(),
        args.state.resolve(),
        args.bridge_report.resolve(),
        Path(__file__).resolve().parent,
    )
    image, mask, example_input = semantic_input(EXPORT_HEIGHT, EXPORT_WIDTH)

    report: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "runtimeAuthorityGranted": False,
        "sourceRevision": base.UPSTREAM_REVISION,
        "checkpointSha256": base.CHECKPOINT_SHA256,
        "environment": env,
        "bridgeProof": bridge_proof,
        "export": {
            "api": "torch.onnx.export",
            "dynamo": True,
            "legacyFallbackApi": "REMOVED_IN_PYTORCH_2_11",
            "legacyFallbackAllowed": False,
            "opset": 18,
            "dynamicShapesApi": "torch.export.Dim derived modulo-8 dimensions",
            "exampleInputShape": list(example_input.shape),
            "result": None,
        },
        "graph": None,
        "cpuOrt": {
            "version": ort.__version__,
            "provider": "CPUExecutionProvider",
            "result": "NOT_RUN",
            "shapeResults": [],
        },
        "browserReference": None,
    }

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.browser_input_out.parent.mkdir(parents=True, exist_ok=True)
    args.browser_reference_out.parent.mkdir(parents=True, exist_ok=True)

    height_units = torch.export.Dim("height_units", min=8, max=64)
    width_units = torch.export.Dim("width_units", min=8, max=64)
    dynamic_shapes = ({2: 8 * height_units, 3: 8 * width_units},)

    try:
        torch.onnx.export(
            generator,
            (example_input,),
            str(args.model_out),
            dynamo=True,
            dynamic_shapes=dynamic_shapes,
            opset_version=18,
            input_names=["generator_input"],
            output_names=["generated_rgb"],
            external_data=False,
            verify=False,
            report=False,
        )
    except Exception as error:
        result, message = classify_export_error(error)
        report["export"].update({"result": result, "error": message, "artifactProduced": False})
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"LAMA C7 DYNAMIC PROBE: {result}")
        return

    if not args.model_out.is_file() or args.model_out.stat().st_size <= 0:
        raise RuntimeError("dynamic Dynamo exporter returned without a non-empty ONNX model")
    model = onnx.load(args.model_out, load_external_data=True)
    onnx.checker.check_model(model, full_check=True)
    inventory = base.graph_inventory(model)
    input_shape = onnx_shape(model.graph.input[0])
    output_shape = onnx_shape(model.graph.output[0])
    inventory["inputShape"] = input_shape
    inventory["outputShape"] = output_shape
    inventory["dynamicHeight"] = isinstance(input_shape[2], str)
    inventory["dynamicWidth"] = isinstance(input_shape[3], str)
    report["graph"] = inventory
    report["export"].update({
        "result": "EXPORTED",
        "artifactProduced": True,
        "size": args.model_out.stat().st_size,
        "sha256": base.sha256(args.model_out),
    })

    if inventory["atenLikeNodes"]:
        report["export"]["result"] = "EXPORTED_REJECTED_ATEN_NODES"
    elif inventory["customNodes"]:
        report["export"]["result"] = "EXPORTED_REJECTED_CUSTOM_DOMAIN_NODES"
    elif inventory["standardDftNodeCount"] <= 0:
        report["export"]["result"] = "EXPORTED_REJECTED_NO_STANDARD_DFT"
    elif not inventory["dynamicHeight"] or not inventory["dynamicWidth"]:
        report["export"]["result"] = "EXPORTED_REJECTED_STATIC_SPATIAL_SHAPE"
    else:
        try:
            session = ort.InferenceSession(str(args.model_out), providers=["CPUExecutionProvider"])
        except Exception as error:
            report["cpuOrt"]["result"] = "SESSION_BLOCKED"
            report["cpuOrt"]["error"] = f"{type(error).__name__}: {error}"[:6000]
            report["export"]["result"] = "EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_BLOCKED"
        else:
            all_pass = True
            browser_materialized = False
            for height, width in TEST_SHAPES:
                image_t, mask_t, input_t = semantic_input(height, width)
                with torch.inference_mode():
                    reference = generator(input_t).detach().cpu().numpy()
                image_np = image_t.numpy()
                mask_np = mask_t.numpy()
                input_np = input_t.numpy()
                semantic = semantic_contract(image_np, mask_np, input_np)
                try:
                    actual = session.run(["generated_rgb"], {"generator_input": input_np})[0]
                except Exception as error:
                    report["cpuOrt"]["shapeResults"].append({
                        "shape": [height, width],
                        "result": "RUNTIME_BLOCKED",
                        "error": f"{type(error).__name__}: {error}"[:6000],
                        "semanticContract": semantic,
                    })
                    all_pass = False
                    continue

                parity = base.metrics(reference, actual)
                raw_shape_ok = list(reference.shape) == list(actual.shape) == [1, 3, height, width]
                raw_range_ok = (
                    float(actual.min()) >= -1e-6
                    and float(actual.max()) <= 1.0 + 1e-6
                    and float(reference.min()) >= -1e-6
                    and float(reference.max()) <= 1.0 + 1e-6
                )
                parity_ok = parity["maxAbs"] <= MAX_ABS_TOL and parity["rmse"] <= RMSE_TOL
                reference_composite, reference_composite_checks = composite_checks(image_np, mask_np, reference)
                actual_composite, actual_composite_checks = composite_checks(image_np, mask_np, actual)
                composite_parity = base.metrics(reference_composite, actual_composite)
                semantic_ok = all([
                    semantic["maskValues"] == [0.0, 1.0],
                    semantic["maskChannelExact"],
                    semantic["maskedRgbZero"],
                    semantic["knownRgbPreservedInGeneratorInput"],
                    reference_composite_checks["knownRegionBitExact"],
                    reference_composite_checks["maskedRegionEqualsProposal"],
                    actual_composite_checks["knownRegionBitExact"],
                    actual_composite_checks["maskedRegionEqualsProposal"],
                ])
                shape_pass = raw_shape_ok and raw_range_ok and parity_ok and semantic_ok
                all_pass = all_pass and shape_pass
                shape_result = {
                    "shape": [height, width],
                    "result": "PASS" if shape_pass else "PARITY_OR_SEMANTIC_FAILED",
                    "rawOutputShape": list(actual.shape),
                    "rawOutputRange": [float(actual.min()), float(actual.max())],
                    "referenceOutputRange": [float(reference.min()), float(reference.max())],
                    "rawParity": parity,
                    "compositeParity": composite_parity,
                    "thresholds": {"maxAbs": MAX_ABS_TOL, "rmse": RMSE_TOL},
                    "semanticContract": semantic,
                    "referenceComposite": reference_composite_checks,
                    "ortComposite": actual_composite_checks,
                }
                report["cpuOrt"]["shapeResults"].append(shape_result)

                if (height, width) == BROWSER_REFERENCE_SHAPE and shape_pass:
                    input_np.astype(np.float32, copy=False).tofile(args.browser_input_out)
                    reference.astype(np.float32, copy=False).tofile(args.browser_reference_out)
                    report["browserReference"] = {
                        "shape": [height, width],
                        "inputTensorShape": list(input_np.shape),
                        "referenceTensorShape": list(reference.shape),
                        "inputFileBytes": args.browser_input_out.stat().st_size,
                        "referenceFileBytes": args.browser_reference_out.stat().st_size,
                        "referenceKind": "PINNED_PYTORCH_GENERATOR_FLOAT32",
                        "cpuOrtForSameShape": "PASS",
                    }
                    browser_materialized = True

                del reference, actual, reference_composite, actual_composite

            if len(report["cpuOrt"]["shapeResults"]) != len(TEST_SHAPES):
                raise RuntimeError("C7 did not record every required multi-shape case")
            if all_pass and browser_materialized:
                report["cpuOrt"]["result"] = "PASS"
                report["export"]["result"] = "EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS"
            elif any(item["result"] == "RUNTIME_BLOCKED" for item in report["cpuOrt"]["shapeResults"]):
                report["cpuOrt"]["result"] = "BLOCKED"
                report["export"]["result"] = "EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_BLOCKED"
            else:
                report["cpuOrt"]["result"] = "PARITY_FAILED"
                report["export"]["result"] = "EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PARITY_FAILED"

    report["modelRetainedOnlyAsCiEvidence"] = True
    report["browserBinaryEvidenceRunnerLocal"] = True
    report["productionPromotionAllowed"] = False
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"LAMA C7 DYNAMIC PROBE: {report['export']['result']}")


if __name__ == "__main__":
    main()
