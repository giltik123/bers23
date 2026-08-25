#!/usr/bin/env python3
"""Build a reproducible BERS MODNet portrait-matting ONNX candidate.

The builder is intentionally fail-closed until portrait-matting.manifest.json contains a
PINNED authoritative checkpoint size/SHA. Checkpoint identity is verified before torch.load.
It exports the pinned upstream architecture on CPU, checks ONNX structure and compares
PyTorch/ORT outputs on multiple spatial shapes. It does not sign, publish or promote.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch

UPSTREAM_REVISION = "28165a451e4610c9d77cfdf925a94610bb2810fb"
MODEL_ID = "modnet-photographic-portrait-matting"
MODEL_VERSION = "1.0.0-candidate.1"
OPSET = 17
PARITY_SHAPES = ((128, 160), (256, 320), (512, 512))
PARITY_ATOL = 1e-4


def git(source: Path, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), *args], text=True, stderr=subprocess.STDOUT
        ).strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(f"Git verification failed: {' '.join(args)}") from error


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("modelId") != MODEL_ID or manifest.get("version") != MODEL_VERSION:
        raise RuntimeError("MODNet manifest identity mismatch")
    checkpoint = manifest.get("upstream", {}).get("checkpoint", {})
    if checkpoint.get("identityState") != "PINNED":
        raise RuntimeError("MODNet checkpoint identity is not PINNED")
    size = checkpoint.get("size")
    digest = checkpoint.get("sha256")
    if not isinstance(size, int) or size <= 0:
        raise RuntimeError("MODNet checkpoint size is not pinned")
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise RuntimeError("MODNet checkpoint SHA-256 is not pinned")
    return manifest


def load_model(source: Path, checkpoint: Path, manifest: dict[str, Any]) -> torch.nn.Module:
    expected = manifest["upstream"]["checkpoint"]
    if checkpoint.name != expected["name"]:
        raise RuntimeError("MODNet checkpoint filename mismatch")
    if checkpoint.stat().st_size != expected["size"]:
        raise RuntimeError("MODNet checkpoint size mismatch before deserialization")
    if sha256(checkpoint) != expected["sha256"]:
        raise RuntimeError("MODNet checkpoint SHA-256 mismatch before deserialization")

    sys.path.insert(0, str(source))
    spec = importlib.util.spec_from_file_location(
        "bers_modnet_onnx_source", source / "onnx" / "modnet_onnx.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot import pinned MODNet ONNX architecture")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    wrapped = torch.nn.DataParallel(module.MODNet(backbone_pretrained=False))
    state = torch.load(checkpoint, map_location=torch.device("cpu"))
    if not isinstance(state, dict) or not state:
        raise RuntimeError("MODNet checkpoint state_dict is invalid")
    wrapped.load_state_dict(state, strict=True)
    wrapped.eval()
    return wrapped.module


def export_once(model: torch.nn.Module, path: Path) -> None:
    torch.manual_seed(6425)
    dummy = torch.linspace(-1.0, 1.0, steps=1 * 3 * 128 * 160, dtype=torch.float32).reshape(1, 3, 128, 160)
    with torch.inference_mode():
        torch.onnx.export(
            model,
            dummy,
            path,
            export_params=True,
            opset_version=OPSET,
            do_constant_folding=True,
            input_names=["input"],
            output_names=["output"],
            dynamic_axes={
                "input": {0: "batch_size", 2: "height", 3: "width"},
                "output": {0: "batch_size", 2: "height", 3: "width"},
            },
        )


def validate_graph(path: Path) -> dict[str, Any]:
    model = onnx.load(path, load_external_data=False)
    onnx.checker.check_model(model, full_check=True)
    default_opsets = [item.version for item in model.opset_import if item.domain in ("", "ai.onnx")]
    if default_opsets != [OPSET]:
        raise RuntimeError(f"Unexpected ONNX opset: {default_opsets!r}")
    inputs = list(model.graph.input)
    outputs = list(model.graph.output)
    if [value.name for value in inputs] != ["input"] or [value.name for value in outputs] != ["output"]:
        raise RuntimeError("Unexpected MODNet ONNX graph I/O names")
    if inputs[0].type.tensor_type.elem_type != onnx.TensorProto.FLOAT:
        raise RuntimeError("MODNet ONNX input must be float32")
    if outputs[0].type.tensor_type.elem_type != onnx.TensorProto.FLOAT:
        raise RuntimeError("MODNet ONNX output must be float32")
    return {
        "irVersion": int(model.ir_version),
        "opset": OPSET,
        "nodeCount": len(model.graph.node),
        "initializerCount": len(model.graph.initializer),
        "input": inputs[0].name,
        "output": outputs[0].name,
    }


def parity(model: torch.nn.Module, onnx_path: Path) -> list[dict[str, Any]]:
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    evidence: list[dict[str, Any]] = []
    rng = np.random.default_rng(6425)
    for height, width in PARITY_SHAPES:
        values = rng.uniform(-1.0, 1.0, size=(1, 3, height, width)).astype(np.float32)
        with torch.inference_mode():
            expected = model(torch.from_numpy(values)).cpu().numpy()
        actual = session.run(["output"], {"input": values})[0]
        if expected.shape != (1, 1, height, width) or actual.shape != expected.shape:
            raise RuntimeError(f"MODNet output shape mismatch for {height}x{width}")
        max_abs = float(np.max(np.abs(expected - actual)))
        if max_abs > PARITY_ATOL:
            raise RuntimeError(f"MODNet PyTorch/ORT parity failed: {max_abs} > {PARITY_ATOL}")
        if float(actual.min()) < -1e-6 or float(actual.max()) > 1.0 + 1e-6:
            raise RuntimeError("MODNet sigmoid output escaped [0,1]")
        evidence.append({
            "height": height,
            "width": width,
            "maxAbsError": max_abs,
            "minOutput": float(actual.min()),
            "maxOutput": float(actual.max()),
        })
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if git(args.source, "rev-parse", "HEAD") != UPSTREAM_REVISION:
        raise RuntimeError("MODNet source revision mismatch")
    manifest = load_manifest(args.manifest)
    model = load_model(args.source, args.checkpoint, manifest)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    first = args.output.with_suffix(".first.onnx")
    second = args.output.with_suffix(".second.onnx")
    export_once(model, first)
    export_once(model, second)
    first_hash = sha256(first)
    second_hash = sha256(second)
    if first_hash != second_hash or first.stat().st_size != second.stat().st_size:
        raise RuntimeError("MODNet ONNX export is not byte-reproducible within the pinned environment")
    first.replace(args.output)
    second.unlink()

    graph = validate_graph(args.output)
    parity_evidence = parity(model, args.output)
    report = {
        "schemaVersion": 1,
        "modelId": MODEL_ID,
        "version": MODEL_VERSION,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "sourceRevision": UPSTREAM_REVISION,
        "checkpoint": {
            "size": args.checkpoint.stat().st_size,
            "sha256": manifest["upstream"]["checkpoint"]["sha256"],
            "verifiedBeforeDeserialization": True,
        },
        "artifact": {
            "size": args.output.stat().st_size,
            "sha256": sha256(args.output),
            "format": "ONNX",
            "quantization": "NONE",
            "simplification": "NONE",
        },
        "graph": graph,
        "parity": parity_evidence,
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "torch": torch.__version__,
            "onnx": onnx.__version__,
            "onnxruntime": ort.__version__,
            "numpy": np.__version__,
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"MODNET ONNX EXPORT: PASS size={report['artifact']['size']} sha256={report['artifact']['sha256']}")


if __name__ == "__main__":
    main()
