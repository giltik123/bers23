#!/usr/bin/env python3
"""Inspect the authoritative MODNet research checkpoint before BERS export.

Two-phase trust model:
1. initial isolated acquisition may discover size/SHA from the upstream-authoritative Drive folder;
2. after that digest is pinned in the repository, every later invocation MUST pass
   --expected-sha256 and the digest is checked before torch.load/deserialization.

State-dict deserialization uses torch weights-only mode to avoid unnecessary pickle object loading.
The script never signs, publishes, installs or grants production execution authority.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

UPSTREAM_REVISION = "28165a451e4610c9d77cfdf925a94610bb2810fb"
CHECKPOINT_NAME = "modnet_photographic_portrait_matting.ckpt"


def git(source: Path, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), *args], text=True, stderr=subprocess.STDOUT
        ).strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(f"Git verification failed: {' '.join(args)}") from error


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def inspect_state_dict(source: Path, checkpoint: Path) -> dict[str, Any]:
    import torch

    # Digest/source checks have already completed before this deserialization point.
    sys.path.insert(0, str(source))
    spec = importlib.util.spec_from_file_location(
        "bers_modnet_onnx_source", source / "onnx" / "modnet_onnx.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load pinned MODNet ONNX model source")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    state = torch.load(
        checkpoint,
        map_location=torch.device("cpu"),
        weights_only=True,
    )
    if not isinstance(state, dict) or not state:
        raise RuntimeError("MODNet checkpoint is not a non-empty state_dict mapping")
    if not all(isinstance(key, str) for key in state):
        raise RuntimeError("MODNet checkpoint contains a non-string state_dict key")
    if not all(torch.is_tensor(value) for value in state.values()):
        raise RuntimeError("MODNet checkpoint contains non-tensor state_dict values")

    model = torch.nn.DataParallel(module.MODNet(backbone_pretrained=False))
    incompatible = model.load_state_dict(state, strict=True)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        raise RuntimeError(
            f"Strict state_dict mismatch: missing={incompatible.missing_keys!r} "
            f"unexpected={incompatible.unexpected_keys!r}"
        )
    model.eval()

    tensor_shapes = {key: list(value.shape) for key, value in state.items()}
    parameter_count = sum(int(value.numel()) for value in state.values())
    return {
        "torchVersion": torch.__version__,
        "stateDictKeyCount": len(state),
        "parameterElementCount": parameter_count,
        "firstKey": next(iter(state)),
        "lastKey": next(reversed(state)),
        "tensorShapes": tensor_shapes,
        "strictArchitectureLoad": True,
        "weightsOnlyDeserialization": True,
        "architecture": "onnx.modnet_onnx.MODNet(backbone_pretrained=False) wrapped in DataParallel",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--expected-sha256", default=None)
    parser.add_argument("--inspect-state-dict", action="store_true")
    args = parser.parse_args()

    if git(args.source, "rev-parse", "HEAD") != UPSTREAM_REVISION:
        raise RuntimeError("MODNet source revision mismatch")
    if args.checkpoint.name != CHECKPOINT_NAME or not args.checkpoint.is_file():
        raise RuntimeError("MODNet checkpoint filename/path mismatch")

    size = args.checkpoint.stat().st_size
    sha256 = digest(args.checkpoint)
    if size <= 0:
        raise RuntimeError("MODNet checkpoint is empty")
    if args.expected_sha256 is not None:
        if not __import__("re").fullmatch(r"[a-f0-9]{64}", args.expected_sha256):
            raise RuntimeError("Invalid expected checkpoint SHA-256")
        if sha256 != args.expected_sha256:
            raise RuntimeError("MODNet checkpoint SHA-256 mismatch before deserialization")

    report: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "upstream": {
            "repository": "https://github.com/ZHKKKe/MODNet",
            "revision": UPSTREAM_REVISION,
            "license": "Apache-2.0",
        },
        "checkpoint": {
            "name": CHECKPOINT_NAME,
            "size": size,
            "sha256": sha256,
            "digestPinnedBeforeDeserialization": args.expected_sha256 is not None,
        },
    }
    if args.inspect_state_dict:
        report["checkpoint"]["stateDict"] = inspect_state_dict(args.source, args.checkpoint)

    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"MODNET CHECKPOINT ACQUISITION: PASS size={size} sha256={sha256}")


if __name__ == "__main__":
    main()
