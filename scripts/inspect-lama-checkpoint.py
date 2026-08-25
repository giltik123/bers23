#!/usr/bin/env python3
"""Inspect the byte-pinned Big-LaMa checkpoint using restricted weights-only loading.

The checkpoint bytes must match the repository-pinned identity before any deserialization. PyTorch
2.6+ statically enumerates globals in the checkpoint; only `pytorch_lightning.*` metadata globals
may be present beyond PyTorch's built-in safe set. Those globals are mapped to an inert local
placeholder instead of importing/executing Lightning classes. The script then isolates tensor-only
`state_dict`, strict-loads only `generator.*` into the pinned FFCResNetGenerator, and discards all
metadata. It never uses weights_only=False, exports, installs, signs, publishes or grants authority.
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
SAFE_METADATA_PREFIX = "pytorch_lightning."
MAX_QUARANTINED_METADATA_GLOBALS = 64


class _InertLightningMetadata:
    """Harmless sink used in place of serialized Lightning callback/config classes."""

    def __new__(cls, *args: Any, **kwargs: Any):
        return super().__new__(cls)

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._args = args
        self._kwargs = kwargs
        self._state: Any = None

    def __setstate__(self, state: Any) -> None:
        self._state = state


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


def restricted_load(checkpoint: Path) -> tuple[dict[str, Any], list[str]]:
    scan = getattr(torch.serialization, "get_unsafe_globals_in_checkpoint", None)
    safe_globals = getattr(torch.serialization, "safe_globals", None)
    if scan is None or safe_globals is None:
        raise RuntimeError("PyTorch inspection environment lacks safe-global checkpoint APIs")

    unsafe = sorted(str(value) for value in scan(checkpoint))
    if len(unsafe) > MAX_QUARANTINED_METADATA_GLOBALS:
        raise RuntimeError(f"Too many non-default checkpoint globals: {len(unsafe)}")
    foreign = [name for name in unsafe if not name.startswith(SAFE_METADATA_PREFIX)]
    if foreign:
        raise RuntimeError(f"Unexpected non-Lightning checkpoint globals: {foreign!r}")

    # Do not import any serialized Lightning class. Map each exact serialized name to a local,
    # inert type whose construction/state assignment has no external side effects.
    aliases = [(_InertLightningMetadata, name) for name in unsafe]
    with safe_globals(aliases):
        value: Any = torch.load(
            checkpoint,
            map_location=torch.device("cpu"),
            weights_only=True,
        )
    if not isinstance(value, dict) or not value:
        raise RuntimeError("LaMa checkpoint is not a non-empty mapping")
    return value, unsafe


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

    state, quarantined_globals = restricted_load(args.checkpoint)
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
            "unsafeGlobalScanPerformed": True,
            "quarantinedMetadataGlobals": quarantined_globals,
            "quarantineStrategy": "INERT_LOCAL_PLACEHOLDER_NO_LIGHTNING_IMPORT",
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
    print("quarantined metadata globals=", quarantined_globals)
    print(
        "LAMA CHECKPOINT INSPECTION: PASS "
        f"state_keys={len(model_state)} generator_keys={len(generator_state)} "
        f"generator_elements={report['checkpoint']['generatorTensorElements']}"
    )


if __name__ == "__main__":
    main()
