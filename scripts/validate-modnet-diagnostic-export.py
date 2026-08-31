#!/usr/bin/env python3
"""Validate MODNet ONNX bytes against the pinned source/checkpoint and reference contracts.

This helper reuses the release builder's source/checkpoint verification, ONNX structural validation
and PyTorch/ORT parity functions, then applies the same pinned upstream-reference parity contract as
C5 acceptance. It never mutates the manifest, never signs or publishes, and never grants production
approval. The report states whether the validated bytes match the manifest's current pinned identity.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from types import ModuleType

import numpy as np
import onnx
import onnxruntime as ort


VALIDATION_AUTHORITY = "VALIDATION_ONLY_NO_RELEASE_AUTHORITY"


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
    parser.add_argument("--reference-onnx", type=Path, required=True)
    parser.add_argument("--onnx", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def upstream_reference_parity(
    builder: ModuleType,
    manifest: dict,
    reference_path: Path,
    candidate_path: Path,
) -> list[dict[str, float | int]]:
    identity = manifest.get("upstream", {}).get("onnx", {}).get("authoritativeReference", {})
    expected_size = identity.get("size")
    expected_sha = identity.get("sha256")
    expected_opset = identity.get("opset")
    if reference_path.stat().st_size != expected_size:
        raise RuntimeError("Official MODNet ONNX reference size drift")
    if builder.sha256(reference_path) != expected_sha:
        raise RuntimeError("Official MODNet ONNX reference SHA-256 drift")

    reference_model = onnx.load(reference_path, load_external_data=False)
    onnx.checker.check_model(reference_model, full_check=True)
    inputs = [value.name for value in reference_model.graph.input]
    outputs = [value.name for value in reference_model.graph.output]
    if inputs != ["input"] or outputs != ["output"]:
        raise RuntimeError(f"Unexpected official MODNet ONNX I/O: {inputs!r} -> {outputs!r}")
    default_opsets = [int(item.version) for item in reference_model.opset_import if item.domain in ("", "ai.onnx")]
    if default_opsets != [expected_opset]:
        raise RuntimeError(f"Unexpected official MODNet reference opset: {default_opsets!r}")

    reference_session = ort.InferenceSession(str(reference_path), providers=["CPUExecutionProvider"])
    candidate_session = ort.InferenceSession(str(candidate_path), providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(6425)
    evidence: list[dict[str, float | int]] = []
    for height, width in builder.PARITY_SHAPES:
        values = rng.uniform(-1.0, 1.0, size=(1, 3, height, width)).astype(np.float32)
        expected = reference_session.run(["output"], {"input": values})[0]
        actual = candidate_session.run(["output"], {"input": values})[0]
        if expected.shape != actual.shape:
            raise RuntimeError(f"Upstream/BERS output shape mismatch: {expected.shape} != {actual.shape}")
        max_abs = float(np.max(np.abs(expected - actual)))
        if max_abs > builder.PARITY_ATOL:
            raise RuntimeError(f"Upstream/BERS output parity failed: {max_abs} > {builder.PARITY_ATOL}")
        evidence.append({"height": height, "width": width, "maxAbsError": max_abs})
    return evidence


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
    reference_parity = upstream_reference_parity(builder, manifest, args.reference_onnx, args.onnx)
    reference_max_abs = max(float(item["maxAbsError"]) for item in reference_parity)

    artifact_size = args.onnx.stat().st_size
    artifact_sha = builder.sha256(args.onnx)
    export_identity = manifest["bersExport"]
    matches_pinned_identity = (
        artifact_size == export_identity.get("onnxSize")
        and artifact_sha == export_identity.get("onnxSha256")
    )

    report = {
        "schemaVersion": 1,
        "authority": VALIDATION_AUTHORITY,
        "modelId": builder.MODEL_ID,
        "version": builder.MODEL_VERSION,
        "sourceRevision": builder.UPSTREAM_REVISION,
        "artifact": {
            "size": artifact_size,
            "sha256": artifact_sha,
            "matchesPinnedIdentity": matches_pinned_identity,
        },
        "upstreamReference": {
            "size": args.reference_onnx.stat().st_size,
            "sha256": builder.sha256(args.reference_onnx),
            "role": "UPSTREAM_REFERENCE_NOT_BERS_RELEASE_AUTHORITY",
        },
        "graph": graph,
        "parity": parity,
        "maxAbsError": max_abs,
        "upstreamReferenceParity": reference_parity,
        "upstreamReferenceMaxAbsError": reference_max_abs,
        "parityAtol": builder.PARITY_ATOL,
        "productionDeviceApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "MODNET_VALIDATION_PARITY|"
        f"sha256={artifact_sha}|"
        f"size={artifact_size}|"
        f"matchesPinnedIdentity={'true' if matches_pinned_identity else 'false'}|"
        f"maxAbsError={max_abs:.12g}|"
        f"upstreamMaxAbsError={reference_max_abs:.12g}|"
        f"atol={builder.PARITY_ATOL}|"
        f"authority={VALIDATION_AUTHORITY}"
    )


if __name__ == "__main__":
    main()
