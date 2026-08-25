#!/usr/bin/env python3
"""Bridge the pinned Big-LaMa generator state into an ephemeral pickle-free safetensors file.

This script is deliberately run in the C6-proven PyTorch 2.6 inspection environment. It verifies
the exact authoritative checkpoint identity, reuses the exact C6 restricted weights-only loader,
extracts only `generator.*` tensors, copies them into independent CPU-contiguous tensors, and writes
only those tensors with the high-level safetensors API. No Lightning/OmegaConf metadata is carried
across the bridge and no pickle-based intermediate is created.

The resulting safetensors file is runner-local feasibility input for C7. It is never committed,
published, signed or granted runtime/production authority.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import safetensors
import torch
from safetensors.torch import save_file

UPSTREAM_REVISION = "786f5936b27fb3dacd2b1ad799e4de968ea697e7"
CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"
EXPECTED_TORCH_PREFIX = "2.6.0"
EXPECTED_SAFETENSORS = "0.8.0"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_c6_module(script_dir: Path):
    path = script_dir / "inspect-lama-checkpoint.py"
    spec = importlib.util.spec_from_file_location("bers_lama_c6_bridge", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load the C6 LaMa checkpoint inspector")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    if module.UPSTREAM_REVISION != UPSTREAM_REVISION:
        raise RuntimeError("C6/C7 upstream revision mismatch")
    if module.CHECKPOINT_SHA256 != CHECKPOINT_SHA256:
        raise RuntimeError("C6/C7 checkpoint SHA mismatch")
    return module


def environment() -> dict[str, str]:
    values = {
        "torch": torch.__version__,
        "safetensors": safetensors.__version__,
    }
    if not values["torch"].startswith(EXPECTED_TORCH_PREFIX):
        raise RuntimeError(f"unexpected bridge torch version: {values['torch']}")
    if values["safetensors"] != EXPECTED_SAFETENSORS:
        raise RuntimeError(f"unexpected safetensors version: {values['safetensors']}")
    return values


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--state-out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    env = environment()
    c6 = load_c6_module(Path(__file__).resolve().parent)
    source = args.source.resolve()
    checkpoint = args.checkpoint.resolve()

    if c6.git(source, "rev-parse", "HEAD") != UPSTREAM_REVISION:
        raise RuntimeError("LaMa source revision mismatch")
    if checkpoint.stat().st_size != c6.CHECKPOINT_SIZE:
        raise RuntimeError("LaMa checkpoint size mismatch before bridge deserialization")
    if sha256(checkpoint) != CHECKPOINT_SHA256:
        raise RuntimeError("LaMa checkpoint SHA mismatch before bridge deserialization")

    # This is the exact C6 weights-only loader already proven on PyTorch 2.6. The bridge never uses
    # a general pickle load and never serializes the original Lightning checkpoint mapping again.
    state, metadata_globals = c6.restricted_load(checkpoint)
    model_state = state.get("state_dict")
    if not isinstance(model_state, dict) or not model_state:
        raise RuntimeError("LaMa checkpoint has no state_dict")
    if not all(isinstance(key, str) and torch.is_tensor(value) for key, value in model_state.items()):
        raise RuntimeError("LaMa state_dict is not string-to-tensor only")

    prefix = "generator."
    generator_items = [
        (key[len(prefix):], value)
        for key, value in model_state.items()
        if key.startswith(prefix)
    ]
    if not generator_items:
        raise RuntimeError("LaMa checkpoint contains no generator tensors")
    generator_items.sort(key=lambda item: item[0])
    if len({key for key, _ in generator_items}) != len(generator_items):
        raise RuntimeError("duplicate generator tensor key after prefix removal")

    tensors: dict[str, torch.Tensor] = {}
    total_elements = 0
    total_tensor_bytes = 0
    dtypes: set[str] = set()
    for key, tensor in generator_items:
        # Clone breaks any shared storage from the legacy checkpoint. The bridge contains only
        # independent dense tensors and no Python object graph from the source checkpoint.
        bridged = tensor.detach().cpu().contiguous().clone()
        if bridged.layout != torch.strided:
            raise RuntimeError(f"non-strided generator tensor is not bridgeable: {key}")
        tensors[key] = bridged
        total_elements += int(bridged.numel())
        total_tensor_bytes += int(bridged.numel() * bridged.element_size())
        dtypes.add(str(bridged.dtype))

    args.state_out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    save_file(
        tensors,
        str(args.state_out),
        metadata={
            "bersPurpose": "C7_LAMA_EPHEMERAL_GENERATOR_STATE_BRIDGE",
            "sourceRevision": UPSTREAM_REVISION,
            "sourceCheckpointSha256": CHECKPOINT_SHA256,
            "productionAuthority": "false",
        },
    )
    if not args.state_out.is_file() or args.state_out.stat().st_size <= 0:
        raise RuntimeError("safetensors bridge was not created")

    state_sha = sha256(args.state_out)
    report: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "runtimeAuthorityGranted": False,
        "sourceRevision": UPSTREAM_REVISION,
        "sourceCheckpoint": {
            "size": checkpoint.stat().st_size,
            "sha256": CHECKPOINT_SHA256,
            "verifiedBeforeDeserialization": True,
            "weightsOnly": True,
            "metadataGlobalPolicy": "C6_EXACT_ALLOWLIST_STANDARD_OR_INERT_NO_FRAMEWORK_IMPORT",
            "observedMetadataGlobals": metadata_globals,
        },
        "environment": env,
        "bridge": {
            "format": "SAFETENSORS",
            "pickleFree": True,
            "generatorPrefixRemoved": True,
            "keyCount": len(tensors),
            "tensorElements": total_elements,
            "logicalTensorBytes": total_tensor_bytes,
            "dtypes": sorted(dtypes),
            "fileSize": args.state_out.stat().st_size,
            "sha256": state_sha,
            "ephemeral": True,
            "published": False,
        },
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "LAMA C7 SAFETENSORS BRIDGE: PASS "
        f"keys={len(tensors)} elements={total_elements} size={args.state_out.stat().st_size} sha256={state_sha}"
    )


if __name__ == "__main__":
    main()
