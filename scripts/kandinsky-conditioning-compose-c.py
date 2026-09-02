#!/usr/bin/env python3
"""Compose the authoritative D2c C bundle from B positive + raw C negative bytes.

This step is intentionally stdlib-only. It parses the safetensors container
itself so the accepted B image_embeds data slice is copied byte-for-byte,
without a torch/numpy conversion, while the C prior run contributes only
negative_image_embeds.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import tempfile
from pathlib import Path
from typing import Any, Mapping

B_ID = "B_REALISM_ZERO_NEGATIVE"
B_CONTRACT_SHA256 = "d0dc3f97e84e7439c063f5fbcb1c3eae9b668c3d84dd8adfa1ed116837e3f175"
C_ID = "C_PRESERVATION_EXPLICIT_NEGATIVE"
C_CONTRACT_SHA256 = "804544da31ad9765793d830225fcad7119058965b665349170f2123474541f30"
TENSORS = ("image_embeds", "negative_image_embeds")
SHA256 = frozenset("0123456789abcdef")


def main() -> int:
    args = parse_args()
    source_manifest_path = real_file(Path(args.positive_source_manifest), "B conditioning manifest")
    source_bundle_path = real_file(Path(args.positive_source_bundle), "B conditioning bundle")
    raw_bundle_path = real_file(Path(args.raw_c_bundle), "raw C prior bundle")
    raw_evidence_path = real_file(Path(args.raw_c_evidence), "raw C builder evidence")

    source_manifest_bytes = source_manifest_path.read_bytes()
    source_manifest = read_canonical_json_bytes(source_manifest_bytes, "B conditioning manifest")
    raw_evidence = read_canonical_json_bytes(raw_evidence_path.read_bytes(), "raw C builder evidence")
    validate_source_manifest(source_manifest, source_bundle_path)
    validate_raw_evidence(raw_evidence, raw_bundle_path)

    source_bundle = parse_safetensors(source_bundle_path, "B conditioning bundle")
    raw_bundle = parse_safetensors(raw_bundle_path, "raw C prior bundle")
    validate_compatible_bundles(source_bundle, raw_bundle)

    b_image = source_bundle["data"]["image_embeds"]
    c_raw_image = raw_bundle["data"]["image_embeds"]
    c_negative = raw_bundle["data"]["negative_image_embeds"]
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    assert_output_dir(output_dir)
    output_bundle = output_dir / f"{C_ID}.conditioning.safetensors"
    output_evidence = output_dir / f"{C_ID}.builder-evidence.json"

    write_safetensors_atomic(
        output_bundle,
        source_bundle["tensors"]["image_embeds"]["shape"],
        b_image,
        raw_bundle["tensors"]["negative_image_embeds"]["shape"],
        c_negative,
    )
    final_bundle = parse_safetensors(output_bundle, "final C conditioning bundle")
    if final_bundle["data"]["image_embeds"] != b_image:
        fail("final C image_embeds are not byte-identical to B image_embeds")
    if final_bundle["data"]["negative_image_embeds"] != c_negative:
        fail("final C negative_image_embeds are not byte-identical to the raw C prior result")

    evidence = dict(raw_evidence)
    evidence["bundle"] = bundle_evidence(output_bundle, final_bundle)
    evidence["composition"] = {
        "policy": "REUSE_POSITIVE_FROM_ACCEPTED_CANDIDATE",
        "positiveSource": {
            "candidateId": B_ID,
            "conditioningContractSha256": B_CONTRACT_SHA256,
            "manifestSha256": sha256_bytes(source_manifest_bytes),
            "bundleSize": source_bundle_path.stat().st_size,
            "bundleSha256": sha256_file(source_bundle_path),
            "imageEmbedsSha256": sha256_bytes(b_image),
        },
        "negativeSource": {
            "candidateId": C_ID,
            "conditioningContractSha256": C_CONTRACT_SHA256,
            "rawBundleSize": raw_bundle_path.stat().st_size,
            "rawBundleSha256": sha256_file(raw_bundle_path),
            "discardedRawImageEmbedsSha256": sha256_bytes(c_raw_image),
            "negativeImageEmbedsSha256": sha256_bytes(c_negative),
        },
    }
    write_canonical_json_atomic(output_evidence, evidence)
    print(json.dumps({
        "status": "COMPOSED_C_REUSE_B_POSITIVE",
        "bundle": str(output_bundle),
        "evidence": str(output_evidence),
        "bundleSha256": evidence["bundle"]["sha256"],
        "positiveImageEmbedsSha256": evidence["composition"]["positiveSource"]["imageEmbedsSha256"],
    }, sort_keys=True))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--positive-source-manifest", required=True)
    parser.add_argument("--positive-source-bundle", required=True)
    parser.add_argument("--raw-c-bundle", required=True)
    parser.add_argument("--raw-c-evidence", required=True)
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args()


def validate_source_manifest(value: Mapping[str, Any], bundle_path: Path) -> None:
    conditioning = require_mapping(value.get("conditioning"), "B manifest conditioning")
    if conditioning.get("candidateId") != B_ID or conditioning.get("conditioningContractSha256") != B_CONTRACT_SHA256:
        fail("B manifest is not the accepted positive-source candidate identity")
    if conditioning.get("negativeMode") != "HISTORICAL_ZERO_IMAGE":
        fail("B manifest negative mode mismatch")
    bundle = require_mapping(value.get("bundle"), "B manifest bundle")
    validate_bundle_identity(bundle, bundle_path, "B manifest bundle")


def validate_raw_evidence(value: Mapping[str, Any], bundle_path: Path) -> None:
    expected_keys = {"schemaVersion", "stage", "status", "candidateId", "conditioningContractSha256", "sourceTrust", "toolchain", "determinism", "bundle"}
    if set(value) != expected_keys:
        fail("raw C builder evidence keys are open or incomplete")
    if value.get("schemaVersion") != 1 or value.get("stage") != "F5B1_D2C_CONDITIONING_BUILD" or value.get("status") != "BUILT_NOT_ADMITTED":
        fail("raw C builder evidence stage/status mismatch")
    if value.get("candidateId") != C_ID or value.get("conditioningContractSha256") != C_CONTRACT_SHA256:
        fail("raw C builder evidence candidate identity mismatch")
    validate_bundle_identity(require_mapping(value.get("bundle"), "raw C evidence bundle"), bundle_path, "raw C evidence bundle")


def validate_bundle_identity(bundle: Mapping[str, Any], path: Path, label: str) -> None:
    if bundle.get("format") != "safetensors" or bundle.get("metadataPolicy") != "NONE" or bundle.get("tensorOrder") != list(TENSORS):
        fail(f"{label} format/tensor order mismatch")
    if bundle.get("size") != path.stat().st_size or bundle.get("sha256") != sha256_file(path):
        fail(f"{label} size/SHA mismatch")


def parse_safetensors(path: Path, label: str) -> Mapping[str, Any]:
    raw = path.read_bytes()
    if len(raw) < 10:
        fail(f"{label} is truncated")
    header_size = struct.unpack("<Q", raw[:8])[0]
    if header_size < 2 or header_size > 1_048_576 or 8 + header_size > len(raw):
        fail(f"{label} header length is invalid")
    header_raw = raw[8:8 + header_size]
    try:
        header = json.loads(header_raw.rstrip(b" ").decode("utf-8"))
    except Exception as exc:
        fail(f"{label} header JSON is invalid: {exc}")
    if not isinstance(header, dict) or set(header) != set(TENSORS):
        fail(f"{label} must contain exactly the two decoder conditioning tensors and no metadata")
    data_region = raw[8 + header_size:]
    tensors: dict[str, Mapping[str, Any]] = {}
    slices: dict[str, bytes] = {}
    ranges: list[tuple[int, int]] = []
    for name in TENSORS:
        spec = require_mapping(header.get(name), f"{label}.{name}")
        if set(spec) != {"dtype", "shape", "data_offsets"} or spec.get("dtype") != "F32":
            fail(f"{label}.{name} descriptor is outside the closed F32 schema")
        shape = spec.get("shape")
        offsets = spec.get("data_offsets")
        if not isinstance(shape, list) or not shape or any(not isinstance(v, int) or isinstance(v, bool) or v < 1 for v in shape):
            fail(f"{label}.{name} shape is invalid")
        if not isinstance(offsets, list) or len(offsets) != 2 or any(not isinstance(v, int) or isinstance(v, bool) for v in offsets):
            fail(f"{label}.{name} offsets are invalid")
        start, end = offsets
        expected_bytes = 4
        for dim in shape:
            expected_bytes *= dim
        if start < 0 or end <= start or end > len(data_region) or end - start != expected_bytes:
            fail(f"{label}.{name} byte range is invalid")
        ranges.append((start, end))
        tensors[name] = {"dtype": "F32", "shape": list(shape)}
        slices[name] = bytes(data_region[start:end])
    ranges.sort()
    cursor = 0
    for start, end in ranges:
        if start != cursor:
            fail(f"{label} tensor data is not contiguous or overlaps")
        cursor = end
    if cursor != len(data_region):
        fail(f"{label} contains trailing or unreferenced tensor bytes")
    return {"tensors": tensors, "data": slices}


def validate_compatible_bundles(source: Mapping[str, Any], raw_c: Mapping[str, Any]) -> None:
    shapes = [
        source["tensors"]["image_embeds"]["shape"],
        source["tensors"]["negative_image_embeds"]["shape"],
        raw_c["tensors"]["image_embeds"]["shape"],
        raw_c["tensors"]["negative_image_embeds"]["shape"],
    ]
    if any(shape != shapes[0] for shape in shapes[1:]):
        fail("B and raw C conditioning tensor shapes are incompatible")


def write_safetensors_atomic(path: Path, image_shape: list[int], image: bytes, negative_shape: list[int], negative: bytes) -> None:
    header = {
        "image_embeds": {"dtype": "F32", "shape": image_shape, "data_offsets": [0, len(image)]},
        "negative_image_embeds": {"dtype": "F32", "shape": negative_shape, "data_offsets": [len(image), len(image) + len(negative)]},
    }
    encoded = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((8 - len(encoded) % 8) % 8)
    payload = struct.pack("<Q", len(encoded)) + encoded + image + negative
    write_atomic(path, payload)


def bundle_evidence(path: Path, parsed: Mapping[str, Any]) -> Mapping[str, Any]:
    return {
        "format": "safetensors",
        "metadataPolicy": "NONE",
        "tensorOrder": list(TENSORS),
        "tensors": {
            "image_embeds": dict(parsed["tensors"]["image_embeds"]),
            "negative_image_embeds": dict(parsed["tensors"]["negative_image_embeds"]),
        },
        "size": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def assert_output_dir(path: Path) -> None:
    allowed = {f"{C_ID}.conditioning.safetensors", f"{C_ID}.builder-evidence.json"}
    unexpected = [entry.name for entry in path.iterdir() if entry.name not in allowed]
    if unexpected:
        fail(f"C output directory contains unrelated files: {sorted(unexpected)}")


def read_canonical_json_bytes(raw: bytes, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        fail(f"{label} is invalid JSON: {exc}")
    value = require_mapping(value, label)
    expected = canonical_json_bytes(value)
    if raw != expected:
        fail(f"{label} bytes are not canonical JSON")
    return value


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def write_canonical_json_atomic(path: Path, value: Mapping[str, Any]) -> None:
    write_atomic(path, canonical_json_bytes(value))


def write_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        Path(temp_name).unlink(missing_ok=True)


def real_file(path: Path, label: str) -> Path:
    if path.is_symlink() or not path.exists() or not path.is_file():
        fail(f"{label} must be a real non-symlink file")
    return path.resolve(strict=True)


def require_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def fail(message: str) -> None:
    raise RuntimeError(message)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"KANDINSKY_D2C_COMPOSE_FAILED: {exc}", file=os.sys.stderr)
        raise
