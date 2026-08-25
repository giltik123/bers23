#!/usr/bin/env python3
"""Probe faithful Big-LaMa export through the modern torch.export-based ONNX path.

C7 deliberately reuses the C6 byte-pinned checkpoint loader and exact pinned upstream generator.
It never accepts an unpinned checkpoint, never uses weights_only=False, never substitutes a
community Fourier implementation, and never grants runtime/production authority.

The first C7 gate is intentionally narrow:
  * PyTorch 2.13.0 CPU;
  * torch.onnx.export(..., dynamo=True, fallback=False), opset 18;
  * one deterministic 64x64 semantic image/mask smoke input;
  * ONNX checker and graph-domain inspection;
  * require standard ai.onnx DFT nodes and reject ATen/custom runtime nodes;
  * CPU ONNX Runtime 1.27.0 smoke parity if the graph is admissible.

Successful smoke parity is feasibility evidence only. Dynamic/multi-shape/browser gates remain
separate and are not inferred from this script.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch

UPSTREAM_REVISION = "786f5936b27fb3dacd2b1ad799e4de968ea697e7"
CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"
EXPECTED_TORCH_PREFIX = "2.13.0"
EXPECTED_ONNX = "1.22.0"
EXPECTED_ONNXSCRIPT = "0.7.1"
EXPECTED_ORT = "1.27.0"
OPSET = 18
SMOKE_HEIGHT = 64
SMOKE_WIDTH = 64
MAX_ABS_TOL = 2e-4
RMSE_TOL = 5e-5


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_c6_module(script_dir: Path):
    path = script_dir / "inspect-lama-checkpoint.py"
    spec = importlib.util.spec_from_file_location("bers_lama_c6_checkpoint", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load the C6 LaMa checkpoint inspector")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    if module.UPSTREAM_REVISION != UPSTREAM_REVISION:
        raise RuntimeError("C6/C7 upstream revision mismatch")
    if module.CHECKPOINT_SHA256 != CHECKPOINT_SHA256:
        raise RuntimeError("C6/C7 checkpoint SHA mismatch")
    return module


def semantic_smoke_input() -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Create deterministic RGB+mask semantics, then the exact upstream 4-channel generator input."""
    y = torch.linspace(0.0, 1.0, SMOKE_HEIGHT, dtype=torch.float32).view(1, 1, SMOKE_HEIGHT, 1)
    x = torch.linspace(0.0, 1.0, SMOKE_WIDTH, dtype=torch.float32).view(1, 1, 1, SMOKE_WIDTH)
    red = x.expand(1, 1, SMOKE_HEIGHT, SMOKE_WIDTH)
    green = y.expand(1, 1, SMOKE_HEIGHT, SMOKE_WIDTH)
    blue = ((red + green) * 0.5).clamp(0.0, 1.0)
    image = torch.cat([red, green, blue], dim=1)
    mask = torch.zeros((1, 1, SMOKE_HEIGHT, SMOKE_WIDTH), dtype=torch.float32)
    mask[:, :, 16:48, 20:44] = 1.0
    generator_input = torch.cat([image * (1.0 - mask), mask], dim=1)
    return image, mask, generator_input


def load_strict_generator(source: Path, checkpoint: Path, script_dir: Path) -> tuple[torch.nn.Module, dict[str, Any]]:
    c6 = load_c6_module(script_dir)
    if c6.git(source, "rev-parse", "HEAD") != UPSTREAM_REVISION:
        raise RuntimeError("LaMa source revision mismatch")
    if checkpoint.stat().st_size != c6.CHECKPOINT_SIZE:
        raise RuntimeError("LaMa checkpoint size mismatch before C7 deserialization")
    if sha256(checkpoint) != CHECKPOINT_SHA256:
        raise RuntimeError("LaMa checkpoint SHA mismatch before C7 deserialization")

    state, metadata_globals = c6.restricted_load(checkpoint)
    model_state = state.get("state_dict")
    if not isinstance(model_state, dict) or not model_state:
        raise RuntimeError("LaMa checkpoint has no state_dict")
    if not all(isinstance(key, str) and torch.is_tensor(value) for key, value in model_state.items()):
        raise RuntimeError("LaMa state_dict is not string-to-tensor only")
    generator_state = {
        key[len("generator."):]: value
        for key, value in model_state.items()
        if key.startswith("generator.")
    }
    generator = c6.build_generator(source)
    incompatible = generator.load_state_dict(generator_state, strict=True)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        raise RuntimeError("C7 strict generator state load failed")
    generator.eval()
    return generator, {
        "weightsOnly": True,
        "checkpointVerifiedBeforeLoad": True,
        "metadataGlobals": metadata_globals,
        "generatorStateKeyCount": len(generator_state),
    }


def environment() -> dict[str, str]:
    import onnxscript

    values = {
        "torch": torch.__version__,
        "onnx": onnx.__version__,
        "onnxscript": onnxscript.__version__,
        "onnxruntime": ort.__version__,
    }
    if not values["torch"].startswith(EXPECTED_TORCH_PREFIX):
        raise RuntimeError(f"unexpected torch version: {values['torch']}")
    if values["onnx"] != EXPECTED_ONNX:
        raise RuntimeError(f"unexpected ONNX version: {values['onnx']}")
    if values["onnxscript"] != EXPECTED_ONNXSCRIPT:
        raise RuntimeError(f"unexpected ONNXScript version: {values['onnxscript']}")
    if values["onnxruntime"] != EXPECTED_ORT:
        raise RuntimeError(f"unexpected ONNX Runtime version: {values['onnxruntime']}")
    return values


def graph_inventory(model: onnx.ModelProto) -> dict[str, Any]:
    nodes = list(model.graph.node)
    domains = sorted({node.domain or "ai.onnx" for node in nodes})
    op_types: dict[str, int] = {}
    custom_nodes: list[str] = []
    for node in nodes:
        domain = node.domain or "ai.onnx"
        key = f"{domain}::{node.op_type}"
        op_types[key] = op_types.get(key, 0) + 1
        if domain not in ("", "ai.onnx"):
            custom_nodes.append(key)
    dft_count = sum(1 for node in nodes if (node.domain in ("", "ai.onnx")) and node.op_type == "DFT")
    aten_like = sorted({
        f"{node.domain or 'ai.onnx'}::{node.op_type}"
        for node in nodes
        if "aten" in (node.domain or "").lower() or "aten" in node.op_type.lower()
    })
    return {
        "nodeCount": len(nodes),
        "domains": domains,
        "opTypes": dict(sorted(op_types.items())),
        "standardDftNodeCount": dft_count,
        "customNodes": sorted(set(custom_nodes)),
        "atenLikeNodes": aten_like,
        "functionCount": len(model.functions),
        "functionDomains": sorted({function.domain or "ai.onnx" for function in model.functions}),
    }


def metrics(reference: np.ndarray, actual: np.ndarray) -> dict[str, float]:
    delta = actual.astype(np.float64) - reference.astype(np.float64)
    abs_delta = np.abs(delta)
    return {
        "maxAbs": float(abs_delta.max(initial=0.0)),
        "meanAbs": float(abs_delta.mean()),
        "rmse": float(math.sqrt(float(np.mean(delta * delta)))),
    }


def classify_export_error(error: BaseException) -> tuple[str, str]:
    message = f"{type(error).__name__}: {error}"
    lowered = message.lower()
    if "fft" in lowered or "dft" in lowered or "complex" in lowered:
        return "DYNAMO_EXPORT_BLOCKED_FFT_OR_COMPLEX", message[:4000]
    if "onnx" in lowered and ("translation" in lowered or "conversion" in lowered or "dispatch" in lowered):
        return "DYNAMO_EXPORT_BLOCKED_ONNX_TRANSLATION", message[:4000]
    raise RuntimeError(f"Unexpected Dynamo exporter failure: {message[:4000]}") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--model-out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    env = environment()
    generator, checkpoint_proof = load_strict_generator(
        args.source.resolve(), args.checkpoint.resolve(), Path(__file__).resolve().parent
    )
    image, mask, generator_input = semantic_smoke_input()
    with torch.inference_mode():
        reference = generator(generator_input).detach().cpu().numpy()

    report: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "runtimeAuthorityGranted": False,
        "sourceRevision": UPSTREAM_REVISION,
        "checkpointSha256": CHECKPOINT_SHA256,
        "environment": env,
        "checkpointProof": checkpoint_proof,
        "export": {
            "api": "torch.onnx.export",
            "dynamo": True,
            "fallback": False,
            "opset": OPSET,
            "inputShape": list(generator_input.shape),
            "result": None,
        },
        "graph": None,
        "cpuOrt": {"version": ort.__version__, "result": "NOT_RUN", "metrics": None},
        "semanticSmoke": {
            "imageRange": [float(image.min()), float(image.max())],
            "maskValues": sorted(float(value) for value in torch.unique(mask)),
            "generatorInputFormula": "concat(image * (1 - mask), mask)",
        },
    }

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    try:
        torch.onnx.export(
            generator,
            (generator_input,),
            str(args.model_out),
            dynamo=True,
            fallback=False,
            opset_version=OPSET,
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
        print(f"LAMA C7 DYNAMO PROBE: {result}")
        return

    if not args.model_out.is_file() or args.model_out.stat().st_size <= 0:
        raise RuntimeError("Dynamo exporter returned without a non-empty ONNX model")
    model = onnx.load(args.model_out, load_external_data=True)
    onnx.checker.check_model(model, full_check=True)
    inventory = graph_inventory(model)
    report["graph"] = inventory
    report["export"].update({
        "result": "EXPORTED",
        "artifactProduced": True,
        "size": args.model_out.stat().st_size,
        "sha256": sha256(args.model_out),
    })

    if inventory["atenLikeNodes"]:
        report["export"]["result"] = "EXPORTED_REJECTED_ATEN_NODES"
    elif inventory["customNodes"]:
        report["export"]["result"] = "EXPORTED_REJECTED_CUSTOM_DOMAIN_NODES"
    elif inventory["standardDftNodeCount"] <= 0:
        report["export"]["result"] = "EXPORTED_REJECTED_NO_STANDARD_DFT"
    else:
        try:
            session = ort.InferenceSession(
                str(args.model_out),
                providers=["CPUExecutionProvider"],
            )
            ort_output = session.run(["generated_rgb"], {"generator_input": generator_input.numpy()})[0]
        except Exception as error:
            report["cpuOrt"] = {
                "version": ort.__version__,
                "result": "BLOCKED",
                "error": f"{type(error).__name__}: {error}"[:4000],
                "metrics": None,
            }
            report["export"]["result"] = "EXPORTED_STANDARD_DFT_CPU_ORT_BLOCKED"
        else:
            parity = metrics(reference, ort_output)
            shape_ok = list(ort_output.shape) == list(reference.shape) == [1, 3, SMOKE_HEIGHT, SMOKE_WIDTH]
            range_ok = float(ort_output.min()) >= -1e-6 and float(ort_output.max()) <= 1.0 + 1e-6
            parity_ok = parity["maxAbs"] <= MAX_ABS_TOL and parity["rmse"] <= RMSE_TOL
            report["cpuOrt"] = {
                "version": ort.__version__,
                "result": "PASS" if shape_ok and range_ok and parity_ok else "PARITY_FAILED",
                "provider": "CPUExecutionProvider",
                "outputShape": list(ort_output.shape),
                "outputRange": [float(ort_output.min()), float(ort_output.max())],
                "shapeOk": shape_ok,
                "rangeOk": range_ok,
                "metrics": parity,
                "thresholds": {"maxAbs": MAX_ABS_TOL, "rmse": RMSE_TOL},
            }
            report["export"]["result"] = (
                "EXPORTED_STANDARD_DFT_CPU_ORT_SMOKE_PASS"
                if report["cpuOrt"]["result"] == "PASS"
                else "EXPORTED_STANDARD_DFT_CPU_ORT_PARITY_FAILED"
            )

    report["modelRetainedOnlyAsCiEvidence"] = True
    report["productionPromotionAllowed"] = False
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"LAMA C7 DYNAMO PROBE: {report['export']['result']}")


if __name__ == "__main__":
    main()
