#!/usr/bin/env python3
"""Inspect the byte-pinned Big-LaMa checkpoint using restricted weights-only loading.

The checkpoint bytes must match the repository-pinned identity before any deserialization. PyTorch
2.6+ statically enumerates globals in the checkpoint. BERS accepts only an exact, audited set of
standard-library metadata types and serialized Lightning/OmegaConf metadata names observed in this
byte-pinned checkpoint. Standard containers map to their real side-effect-free builtins; framework
metadata maps to an inert local placeholder, so Lightning/OmegaConf code is never imported or run.
The script then isolates tensor-only `state_dict`, strict-loads only `generator.*` into the pinned
FFCResNetGenerator, and discards all metadata. The pinned FFC source imports `saicinpainting.utils`
only for `get_shape`; BERS supplies that one pinned-compatible helper through an in-memory module
shim rather than importing the upstream training utility module and its Lightning-only seed helper.
It never uses weights_only=False, exports, installs, signs, publishes or grants authority.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import numbers
import subprocess
import sys
import types
from collections import defaultdict
from pathlib import Path
from typing import Any

import torch

UPSTREAM_REVISION = "786f5936b27fb3dacd2b1ad799e4de968ea697e7"
CHECKPOINT_NAME = "best.ckpt"
CHECKPOINT_SIZE = 410_046_389
CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"
MAX_ALLOWED_METADATA_GLOBALS = 16

# Exact names observed by torch.serialization.get_unsafe_globals_in_checkpoint on the byte-pinned
# authoritative checkpoint. Never broaden these to module-prefix matching.
STANDARD_METADATA_GLOBALS: dict[str, Any] = {
    "builtins.dict": dict,
    "builtins.int": int,
    "builtins.list": list,
    "collections.defaultdict": defaultdict,
}
INERT_METADATA_GLOBALS = frozenset({
    "pytorch_lightning.callbacks.model_checkpoint.ModelCheckpoint",
    "omegaconf.base.ContainerMetadata",
    "omegaconf.base.Metadata",
    "omegaconf.dictconfig.DictConfig",
    "omegaconf.listconfig.ListConfig",
    "omegaconf.nodes.AnyNode",
    "typing.Any",
})
ALLOWED_METADATA_GLOBALS = frozenset(STANDARD_METADATA_GLOBALS) | INERT_METADATA_GLOBALS


class _InertSerializedMetadata:
    """Side-effect-free sink for exact framework metadata globals listed above."""

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


def _pinned_get_shape(value: Any) -> Any:
    """Pinned-compatible copy of the only helper imported by upstream FFC from utils.py."""
    if torch.is_tensor(value):
        return tuple(value.shape)
    if isinstance(value, dict):
        return {name: _pinned_get_shape(item) for name, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_pinned_get_shape(item) for item in value]
    if isinstance(value, numbers.Number):
        return type(value)
    raise ValueError(f"unexpected type {type(value)}")


def _install_minimal_pinned_utils(source: Path) -> None:
    module_name = "saicinpainting.utils"
    if module_name in sys.modules:
        raise RuntimeError("saicinpainting.utils was imported before the minimal pinned shim")

    upstream_utils = source / "saicinpainting" / "utils.py"
    utils_text = upstream_utils.read_text(encoding="utf-8")
    for fragment in (
        "from pytorch_lightning import seed_everything",
        "def get_shape(t):",
        "if torch.is_tensor(t):",
        "elif isinstance(t, numbers.Number):",
    ):
        if fragment not in utils_text:
            raise RuntimeError(f"Pinned LaMa utils source contract changed: missing {fragment!r}")

    shim = types.ModuleType(module_name)
    shim.__file__ = str(upstream_utils)
    shim.get_shape = _pinned_get_shape
    sys.modules[module_name] = shim


def load_generator_class(source: Path):
    source = source.resolve()
    expected_ffc = (source / "saicinpainting" / "training" / "modules" / "ffc.py").resolve()
    sys.path.insert(0, str(source))
    _install_minimal_pinned_utils(source)
    module = importlib.import_module("saicinpainting.training.modules.ffc")
    actual_ffc = Path(module.__file__).resolve() if module.__file__ else None
    if actual_ffc != expected_ffc:
        raise RuntimeError(
            f"LaMa FFC import did not resolve to pinned checkout: actual={actual_ffc} expected={expected_ffc}"
        )
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
    if len(unsafe) > MAX_ALLOWED_METADATA_GLOBALS:
        raise RuntimeError(f"Too many non-default checkpoint globals: {unsafe!r}")
    unexpected = sorted(set(unsafe) - ALLOWED_METADATA_GLOBALS)
    if unexpected:
        raise RuntimeError(
            f"Unexpected checkpoint globals: {unexpected!r}; complete scan={unsafe!r}"
        )

    aliases: list[tuple[Any, str]] = [
        (STANDARD_METADATA_GLOBALS[name], name)
        for name in unsafe
        if name in STANDARD_METADATA_GLOBALS
    ]
    aliases.extend(
        (_InertSerializedMetadata, name)
        for name in unsafe
        if name in INERT_METADATA_GLOBALS
    )

    # The exact serialized names above are mapped explicitly. No Lightning/OmegaConf module import
    # occurs, and any global missed by the static scan remains blocked by the weights-only unpickler.
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
            "metadataGlobalPolicy": "EXACT_ALLOWLIST_STANDARD_OR_INERT_NO_FRAMEWORK_IMPORT",
            "topLevelKeys": sorted(str(key) for key in state.keys()),
            "stateDictKeyCount": len(model_state),
            "generatorStateKeyCount": len(generator_state),
            "generatorTensorElements": sum(int(value.numel()) for value in generator_state.values()),
            "strictGeneratorLoad": True,
            "generatorClass": "saicinpainting.training.modules.ffc.FFCResNetGenerator",
            "generatorImportPolicy": "PINNED_SOURCE_MINIMAL_GET_SHAPE_SHIM_NO_LIGHTNING_IMPORT",
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("allowed checkpoint metadata globals=", quarantined_globals)
    print(
        "LAMA CHECKPOINT INSPECTION: PASS "
        f"state_keys={len(model_state)} generator_keys={len(generator_state)} "
        f"generator_elements={report['checkpoint']['generatorTensorElements']}"
    )


if __name__ == "__main__":
    main()
