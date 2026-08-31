#!/usr/bin/env python3
"""Validate an unpinned MODNet diagnostic ONNX candidate without granting release authority.

This helper deliberately reuses the release builder's source/checkpoint verification, ONNX structural
validation and PyTorch/ORT parity functions. It never mutates the manifest, never signs or publishes,
and never treats the candidate as production-approved.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from types import ModuleType


def load_builder() -> ModuleType:
    path = Path(__file__).with_name("build-modnet-portrait-matting-release.py")
    spec = importlib.util.spec_from_file_location("bers_modnet_release_builder", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot import MODNet release builder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--onnx", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    builder = load_builder()

    if builder.git(args.source, "rev-parse", "HEAD") != builder.UPSTREAM_REVISION:
        raise RuntimeError("MODNet source revision mismatch")
    manifest = builder.load_manifest(args.manifest)
    builder.verify_checkpoint_bytes(args.checkpoint, manifest)

    graph = builder.validate_graph(args.onnx)
    model = builder.load_model(args.source, args.checkpoint, manifest)
    parity = builder.parity(model, args.onnx)
    max_abs = max(float(item["maxAbsError"]) for item in parity)

    report = {
        "schemaVersion": 1,
        "authority": "DIAGNOSTIC_ONLY_NO_RELEASE_AUTHORITY",
        "modelId": builder.MODEL_ID,
        "version": builder.MODEL_VERSION,
        "sourceRevision": builder.UPSTREAM_REVISION,
        "artifact": {
            "size": args.onnx.stat().st_size,
            "sha256": builder.sha256(args.onnx),
            "matchesPinnedIdentity": False,
        },
        "graph": graph,
        "parity": parity,
        "maxAbsError": max_abs,
        "parityAtol": builder.PARITY_ATOL,
        "productionDeviceApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "MODNET_DIAGNOSTIC_PARITY|"
        f"sha256={report['artifact']['sha256']}|"
        f"size={report['artifact']['size']}|"
        f"maxAbsError={max_abs:.12g}|"
        f"atol={builder.PARITY_ATOL}|"
        "authority=DIAGNOSTIC_ONLY_NO_RELEASE_AUTHORITY"
    )


if __name__ == "__main__":
    main()
