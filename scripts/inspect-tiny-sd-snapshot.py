#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

EXPECTED_FILES = (
    "model_index.json",
    "scheduler/scheduler_config.json",
    "text_encoder/config.json",
    "text_encoder/pytorch_model.bin",
    "tokenizer/merges.txt",
    "tokenizer/special_tokens_map.json",
    "tokenizer/tokenizer_config.json",
    "tokenizer/vocab.json",
    "unet/config.json",
    "unet/diffusion_pytorch_model.bin",
    "vae/config.json",
    "vae/diffusion_pytorch_model.bin",
)
WEIGHT_FILES = {
    "text_encoder/pytorch_model.bin",
    "unet/diffusion_pytorch_model.bin",
    "vae/diffusion_pytorch_model.bin",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--expected-manifest", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    snapshot = Path(args.snapshot).resolve(strict=True)
    manifest = json.loads(Path(args.expected_manifest).read_text(encoding="utf-8"))
    if manifest.get("modelId") != "segmind-tiny-sd" or manifest.get("status") != "CANDIDATE":
        raise RuntimeError("unexpected Tiny-SD manifest identity/status")
    upstream = manifest.get("upstream", {})
    if upstream.get("revision") != args.revision:
        raise RuntimeError("Tiny-SD upstream revision differs from pinned manifest")
    expected_snapshot = upstream.get("snapshot", {})
    if expected_snapshot.get("identityState") != "PINNED":
        raise RuntimeError("Tiny-SD snapshot identity must be PINNED before acquisition")
    if tuple(expected_snapshot.get("expectedRuntimeFiles", ())) != EXPECTED_FILES:
        raise RuntimeError("Tiny-SD expected runtime file contract changed")
    pinned_records = expected_snapshot.get("files")
    if not isinstance(pinned_records, list) or len(pinned_records) != len(EXPECTED_FILES):
        raise RuntimeError("Tiny-SD pinned snapshot must contain all runtime identities")
    pinned_by_path = {record.get("path"): record for record in pinned_records}
    if set(pinned_by_path) != set(EXPECTED_FILES):
        raise RuntimeError("Tiny-SD pinned snapshot paths are incomplete or ambiguous")

    records = []
    for relative in EXPECTED_FILES:
        path = snapshot / relative
        if path.is_symlink():
            raise RuntimeError(f"symlinked runtime file rejected: {relative}")
        if not path.is_file():
            raise RuntimeError(f"missing runtime file: {relative}")
        if path.suffix == ".json":
            with path.open("r", encoding="utf-8") as stream:
                json.load(stream)
        record = {
            "path": relative,
            "size": path.stat().st_size,
            "sha256": sha256_file(path),
            "kind": "PICKLE_WEIGHT" if relative in WEIGHT_FILES else "RUNTIME_METADATA",
        }
        pinned = pinned_by_path[relative]
        if record != {key: pinned.get(key) for key in ("path", "size", "sha256", "kind")}:
            raise RuntimeError(f"Tiny-SD pinned runtime identity mismatch: {relative}")
        records.append(record)

    total_runtime_bytes = sum(record["size"] for record in records)
    if total_runtime_bytes != expected_snapshot.get("totalRuntimeBytes"):
        raise RuntimeError("Tiny-SD pinned total runtime byte count changed")

    model_index = json.loads((snapshot / "model_index.json").read_text(encoding="utf-8"))
    if model_index.get("_class_name") != "StableDiffusionPipeline":
        raise RuntimeError(f"unexpected pipeline class: {model_index.get('_class_name')!r}")
    if model_index.get("requires_safety_checker") is not False:
        raise RuntimeError("Tiny-SD snapshot contract changed: requires_safety_checker is not false")

    report = {
        "status": "CANDIDATE",
        "modelId": "segmind-tiny-sd",
        "upstreamRevision": args.revision,
        "pipelineClass": "StableDiffusionPipeline",
        "license": manifest.get("upstream", {}).get("license"),
        "licenseReview": manifest.get("licenseReview"),
        "inventory": records,
        "totalRuntimeBytes": total_runtime_bytes,
        "pickleWeightCount": sum(record["kind"] == "PICKLE_WEIGHT" for record in records),
        "hashBeforeDeserializationRequired": True,
        "matchesPinnedManifest": True,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
    }
    target = Path(args.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"TINY-SD PINNED SNAPSHOT INVENTORY: PASS files={len(records)} bytes={total_runtime_bytes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
