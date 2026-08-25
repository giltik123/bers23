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
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    snapshot = Path(args.snapshot).resolve(strict=True)
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
        records.append({
            "path": relative,
            "size": path.stat().st_size,
            "sha256": sha256_file(path),
            "kind": "PICKLE_WEIGHT" if relative in WEIGHT_FILES else "RUNTIME_METADATA",
        })

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
        "license": "creativeml-openrail-m",
        "licenseReview": "REQUIRED",
        "inventory": records,
        "totalRuntimeBytes": sum(record["size"] for record in records),
        "pickleWeightCount": sum(record["kind"] == "PICKLE_WEIGHT" for record in records),
        "hashBeforeDeserializationRequired": True,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
    }
    target = Path(args.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"TINY-SD SNAPSHOT INVENTORY: PASS files={len(records)} bytes={report['totalRuntimeBytes']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
