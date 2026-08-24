#!/usr/bin/env python3
"""Export and validate the pinned Real-ESRGAN general-x4v3 ONNX candidate pack.

This script intentionally does not download or sign artifacts. The caller must provide:
- a checkout of xinntao/Real-ESRGAN at the pinned implementation revision; and
- the official v0.2.5.0 `realesr-general-x4v3.pth` release asset.

The checkpoint is size/hash verified before any torch deserialization. The emitted ONNX
is a CANDIDATE artifact only; hosted export/ORT parity is not production-device approval.
The exported graph returns the raw network float output. BERS image materialization must
apply the pinned upstream-compatible `CLAMP_0_1` postprocess before 8-bit RGB encoding.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch


IMPLEMENTATION_REVISION = "fa4c8a03ae3dbc9ea6ed471a6ab5da94ac15c2ea"
CHECKPOINT_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth"
CHECKPOINT_SIZE = 4_885_111
CHECKPOINT_SHA256 = "8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292"
OPSET = 17
MODEL_ID = "realesr-general-x4v3"
MODEL_VERSION = "1.0.0-candidate.1"
PARITY_TOLERANCE = 1e-4
PARITY_SHAPES = ((8, 8), (13, 17), (24, 31))
POSTPROCESS = "CLAMP_0_1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_head(source: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"], text=True, stderr=subprocess.STDOUT
        ).strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError("Real-ESRGAN source must be a Git checkout at the pinned revision") from error


def dimensions(value: onnx.ValueInfoProto) -> list[int | str | None]:
    result: list[int | str | None] = []
    for dimension in value.type.tensor_type.shape.dim:
        result.append(dimension.dim_value or dimension.dim_param or None)
    return result


def verify_checkpoint(path: Path) -> None:
    if path.stat().st_size != CHECKPOINT_SIZE:
        raise RuntimeError(f"Real-ESRGAN checkpoint size mismatch: {path.stat().st_size} != {CHECKPOINT_SIZE}")
    actual = sha256(path)
    if actual != CHECKPOINT_SHA256:
        raise RuntimeError(f"Real-ESRGAN checkpoint SHA-256 mismatch: {actual}")


def load_model(source: Path, checkpoint: Path) -> torch.nn.Module:
    # Import only after source revision and checkpoint bytes were verified.
    import sys
    sys.path.insert(0, str(source))
    from basicsr.archs.srvgg_arch import SRVGGNetCompact

    model = SRVGGNetCompact(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_conv=32,
        upscale=4,
        act_type="prelu",
    )
    loadnet: dict[str, Any] = torch.load(checkpoint, map_location=torch.device("cpu"))
    key = "params_ema" if "params_ema" in loadnet else "params"
    if key not in loadnet:
        raise RuntimeError("Real-ESRGAN checkpoint has neither params_ema nor params")
    model.load_state_dict(loadnet[key], strict=True)
    return model.eval().cpu().float()


def validate_onnx_contract(path: Path) -> None:
    model = onnx.load(path)
    onnx.checker.check_model(model, full_check=True)
    inputs = {item.name: dimensions(item) for item in model.graph.input}
    outputs = {item.name: dimensions(item) for item in model.graph.output}
    expected_inputs = {"input_rgb": [1, 3, "height", "width"]}
    expected_outputs = {"output_rgb": [1, 3, "height_x4", "width_x4"]}
    if inputs != expected_inputs:
        raise RuntimeError(f"Unexpected ONNX inputs: {inputs!r}")
    if outputs != expected_outputs:
        raise RuntimeError(f"Unexpected ONNX outputs: {outputs!r}")


def parity(model: torch.nn.Module, onnx_path: Path) -> list[dict[str, Any]]:
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    results: list[dict[str, Any]] = []
    rng = np.random.default_rng(6423)
    for height, width in PARITY_SHAPES:
        sample = rng.random((1, 3, height, width), dtype=np.float32)
        with torch.no_grad():
            expected = model(torch.from_numpy(sample)).cpu().numpy()
        actual = session.run(["output_rgb"], {"input_rgb": sample})[0]
        expected_shape = (1, 3, height * 4, width * 4)
        if actual.shape != expected_shape or expected.shape != expected_shape:
            raise RuntimeError(f"Unexpected x4 output shape for {height}x{width}: {actual.shape}")
        max_abs_diff = float(np.max(np.abs(expected - actual)))
        if not np.isfinite(max_abs_diff) or max_abs_diff > PARITY_TOLERANCE:
            raise RuntimeError(
                f"PyTorch/ONNX parity failed for {height}x{width}: {max_abs_diff} > {PARITY_TOLERANCE}"
            )
        results.append({"inputHeight": height, "inputWidth": width, "maxAbsDiff": max_abs_diff})
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="Pinned xinntao/Real-ESRGAN checkout")
    parser.add_argument("--checkpoint", type=Path, required=True, help="Official realesr-general-x4v3.pth asset")
    parser.add_argument("--output", type=Path, required=True, help="Output .onnx path")
    parser.add_argument("--metadata", type=Path, required=True, help="Output JSON build report")
    args = parser.parse_args()

    source_head = git_head(args.source)
    if source_head != IMPLEMENTATION_REVISION:
        raise RuntimeError(f"Real-ESRGAN source revision mismatch: {source_head} != {IMPLEMENTATION_REVISION}")
    verify_checkpoint(args.checkpoint)
    model = load_model(args.source, args.checkpoint)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(6423)
    sample = torch.zeros(1, 3, 16, 16, dtype=torch.float32)
    torch.onnx.export(
        model,
        sample,
        args.output,
        export_params=True,
        opset_version=OPSET,
        do_constant_folding=True,
        input_names=["input_rgb"],
        output_names=["output_rgb"],
        dynamic_axes={
            "input_rgb": {2: "height", 3: "width"},
            "output_rgb": {2: "height_x4", 3: "width_x4"},
        },
    )

    validate_onnx_contract(args.output)
    parity_results = parity(model, args.output)
    report = {
        "schemaVersion": 1,
        "modelId": MODEL_ID,
        "version": MODEL_VERSION,
        "status": "CANDIDATE",
        "upstream": {
            "repository": "https://github.com/xinntao/Real-ESRGAN",
            "implementationRevision": IMPLEMENTATION_REVISION,
            "checkpointUrl": CHECKPOINT_URL,
            "checkpointSize": CHECKPOINT_SIZE,
            "checkpointSha256": CHECKPOINT_SHA256,
        },
        "export": {
            "opset": OPSET,
            "precision": "FP32",
            "input": {"name": "input_rgb", "dtype": "float32", "layout": "NCHW", "range": [0, 1]},
            "output": {
                "name": "output_rgb",
                "dtype": "float32",
                "layout": "NCHW",
                "scale": 4,
                "networkRange": "UNCLAMPED_FLOAT32",
                "postprocess": POSTPROCESS,
            },
            "dynamicSpatialAxes": True,
            "graphSimplified": False,
            "quantized": False,
            "postExportOptimized": False,
            "parityTolerance": PARITY_TOLERANCE,
            "parity": parity_results,
            "sanityProvider": "CPUExecutionProvider",
            "productionDeviceApproval": False,
        },
        "artifact": {"size": args.output.stat().st_size, "sha256": sha256(args.output)},
        "environment": {
            "python": __import__("sys").version.split()[0],
            "torch": torch.__version__,
            "numpy": np.__version__,
            "onnx": onnx.__version__,
            "onnxruntime": ort.__version__,
        },
    }
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("REAL-ESRGAN ONNX CANDIDATE EXPORT: PASS (CPU parity only; not browser/device approval)")


if __name__ == "__main__":
    main()
