#!/usr/bin/env python3
"""Inspect the byte-pinned Big-LaMa checkpoint using weights-only PyTorch loading.

The archive/member bytes must already match repository-pinned identities before this script runs.
It loads only the Lightning checkpoint mapping with weights_only=True, isolates generator.* tensors,
constructs the pinned upstream FFCResNetGenerator directly (without Lightning), and requires a strict
state_dict load. It does not export, install, sign, publish, or grant runtime authority.
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

import torch

UPSTREAM_REVISION = "786f5936b27fb3dacd2b1ad799e4de968ea697e7"
CHECKPOINT_NAME = "best.ckpt"
CHECKPOINT_SIZE = 410_046_389
CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git(source: Path, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), *args], text=True, stderr=subprocess.STDOUT
        ).strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(f"Git verification failed: {' '.join(args)}") from error


def load_generator_class(source: Path):
    sys.path.insert(0, str(source))
    spec = importlib.util.spec_from_file_location(
        "bers_lama_ffc", source / "saicinpainting" / "training" / "modules" / "ffc.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot import pinned LaMa FFC source")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.FFCResNetGenerator


def build_generator(source: Path) -> torch.nn.Module:
    cls = load_generator_class(source)
    return cls(
        input_nc=4,
        output_nc=3,
        ngf=64,
        n_downsampling=3,
        n_blocks=18,
        add_out_act="sigmoid",
        init_conv_kwargs={"ratio_gin": 0, "ratio_gout": 0, "enable_lfu": False},
        downsample_conv_kwargs={"ratio_gin": 0, "ratio_gout": 0, "enable_lfu": False},
        resnet_conv_kwargs={"ratio_gin": 0.75, "ratio_gout": 0.75, "enable_lfu": False},
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if git(args.source, "rev-parse", "HEAD") != UPSTREAM_REVISION:
        raise RuntimeError("LaMa source revision mismatch")
    if args.checkpoint.name != CHECKPOINT_NAME or not args.checkpoint.is_file():
        raise RuntimeError("LaMa checkpoint filename/path mismatch")
    if args.checkpoint.stat().st_size != CHECKPOINT_SIZE:
        raise RuntimeError("LaMa checkpoint size mismatch before deserialization")
    if sha256(args.checkpoint) != CHECKPOINT_SHA256:
        raise RuntimeError("LaMa checkpoint SHA-256 mismatch before deserialization")

    # The pinned checkpoint is a Lightning mapping. Do not allow arbitrary pickle object loading.
    state: Any = torch.load(
        args.checkpoint,
        map_location=torch.device("cpu"),
        weights_only=True,
    )
    if not isinstance(state, dict) or not state:
        raise RuntimeError("LaMa checkpoint is not a non-empty mapping")
    model_state = state.get("state_dict")
    if not isinstance(model_state, dict) or not model_state:
        raise RuntimeError("LaMa checkpoint has no non-empty state_dict mapping")
    if not all(isinstance(key, str) for key in model_state):
        raise RuntimeError("LaMa state_dict contains a non-string key")
    if not all(torch.is_tensor(value) for value in model_state.values()):
        raise RuntimeError("LaMa state_dict contains non-tensor values")

    generator_prefix = "generator."
    generator_state = {
        key[len(generator_prefix):]: value
        for key, value in model_state.items()
        if key.startswith(generator_prefix)
    }
    if not generator_state:
        raise RuntimeError("LaMa checkpoint contains no generator.* tensors")

    generator = build_generator(args.source)
    incompatible = generator.load_state_dict(generator_state, strict=True)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        raise RuntimeError(
            f"Strict generator mismatch: missing={incompatible.missing_keys!r} "
            f"unexpected={incompatible.unexpected_keys!r}"
        )
    generator.eval()

    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "sourceRevision": UPSTREAM_REVISION,
        "checkpoint": {
            "size": args.checkpoint.stat().st_size,
            "sha256": CHECKPOINT_SHA256,
            "verifiedBeforeDeserialization": True,
            "weightsOnly": True,
            "topLevelKeys": sorted(str(key) for key in state.keys()),
            "stateDictKeyCount": len(model_state),
            "generatorStateKeyCount": len(generator_state),
            "generatorTensorElements": sum(int(value.numel()) for value in generator_state.values()),
            "strictGeneratorLoad": True,
            "generatorClass": "saicinpainting.training.modules.ffc.FFCResNetGenerator",
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "LAMA CHECKPOINT INSPECTION: PASS "
        f"state_keys={len(model_state)} generator_keys={len(generator_state)} "
        f"generator_elements={report['checkpoint']['generatorTensorElements']}"
    )


if __name__ == "__main__":
    main()
