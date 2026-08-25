#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch
from safetensors.torch import load_file

MODEL_ID = "segmind-tiny-sd"
MODEL_VERSION = "1.0.0-candidate.1"
UPSTREAM_REVISION = "cad0bd7495fa6c4bcca01b19a723dc91627fe84f"
ARTIFACT_STATE = "TRUST_ROOT_PINNED_RUNTIME_FEASIBILITY_REQUIRED"
SEQUENCE_LENGTH = 77
LATENT_HEIGHT = 64
LATENT_WIDTH = 64


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("modelId") != MODEL_ID:
        raise RuntimeError("unexpected Tiny-SD model id")
    if manifest.get("version") != MODEL_VERSION:
        raise RuntimeError("unexpected Tiny-SD model version")
    if manifest.get("status") != "CANDIDATE":
        raise RuntimeError("Tiny-SD must remain CANDIDATE during D2")
    if manifest.get("artifactState") != ARTIFACT_STATE:
        raise RuntimeError("Tiny-SD D1 trust-root lifecycle changed")
    if manifest.get("productionApprovalEvidence") is not None:
        raise RuntimeError("Tiny-SD unexpectedly has production approval evidence")
    runtime = manifest.get("runtimeFeasibility") or {}
    if runtime.get("runtimeAuthorityGranted") is not False:
        raise RuntimeError("Tiny-SD unexpectedly grants runtime authority")
    upstream = manifest.get("upstream") or {}
    if upstream.get("revision") != UPSTREAM_REVISION:
        raise RuntimeError("Tiny-SD upstream revision changed")
    snapshot = upstream.get("snapshot") or {}
    if snapshot.get("identityState") != "PINNED":
        raise RuntimeError("Tiny-SD snapshot is not PINNED")
    bridge = manifest.get("tensorBridge") or {}
    if bridge.get("state") != "PINNED" or bridge.get("pickleFree") is not True:
        raise RuntimeError("Tiny-SD D1 tensor bridge is not PINNED/pickle-free")
    if bridge.get("ephemeral") is not True or bridge.get("published") is not False:
        raise RuntimeError("Tiny-SD D1 bridge lifecycle changed")
    return manifest


def verify_bridge_component(manifest: dict[str, Any], bridge_dir: Path, component: str) -> Path:
    records = manifest["tensorBridge"]["components"]
    matches = [record for record in records if record.get("component") == component]
    if len(matches) != 1:
        raise RuntimeError(f"missing or ambiguous D1 bridge identity: {component}")
    record = matches[0]
    path = bridge_dir / f"{component}.safetensors"
    if path.is_symlink() or not path.is_file():
        raise RuntimeError(f"invalid D1 bridge file: {component}")
    if path.stat().st_size != record.get("bridgeSize"):
        raise RuntimeError(f"D1 bridge size mismatch: {component}")
    if sha256_file(path) != record.get("bridgeSha256"):
        raise RuntimeError(f"D1 bridge SHA mismatch: {component}")
    return path


def _state_for_component(manifest: dict[str, Any], bridge_dir: Path, component: str) -> dict[str, torch.Tensor]:
    path = verify_bridge_component(manifest, bridge_dir, component)
    state = load_file(str(path), device="cpu")
    if not state or not all(isinstance(key, str) and torch.is_tensor(value) for key, value in state.items()):
        raise RuntimeError(f"non tensor-only D1 bridge state: {component}")
    pinned = next(record for record in manifest["tensorBridge"]["components"] if record["component"] == component)
    if len(state) != pinned["keyCount"]:
        raise RuntimeError(f"D1 bridge key count mismatch: {component}")
    if sum(int(value.numel()) for value in state.values()) != pinned["tensorElements"]:
        raise RuntimeError(f"D1 bridge tensor element mismatch: {component}")
    # Destination modules are FP32 on CPU. FP16 -> FP32 is an exact value-preserving widening.
    return {key: value.detach().cpu().float().contiguous() for key, value in state.items()}


def load_text_encoder(snapshot: Path, bridge_dir: Path, manifest: dict[str, Any]):
    from transformers import CLIPTextConfig, CLIPTextModel

    config_path = snapshot / "text_encoder" / "config.json"
    config = CLIPTextConfig.from_json_file(str(config_path))
    model = CLIPTextModel(config).float()
    state = _state_for_component(manifest, bridge_dir, "text_encoder")
    incompatible = model.load_state_dict(state, strict=True)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        raise RuntimeError("Tiny-SD text encoder strict state load failed")
    model.eval()
    return model, config


def load_unet(snapshot: Path, bridge_dir: Path, manifest: dict[str, Any]):
    from diffusers import UNet2DConditionModel

    config = json.loads((snapshot / "unet" / "config.json").read_text(encoding="utf-8"))
    model = UNet2DConditionModel.from_config(config).float()
    state = _state_for_component(manifest, bridge_dir, "unet")
    incompatible = model.load_state_dict(state, strict=True)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        raise RuntimeError("Tiny-SD UNet strict state load failed")
    model.eval()
    return model, config


def load_vae(snapshot: Path, bridge_dir: Path, manifest: dict[str, Any]):
    from diffusers import AutoencoderKL

    config = json.loads((snapshot / "vae" / "config.json").read_text(encoding="utf-8"))
    model = AutoencoderKL.from_config(config).float()
    state = _state_for_component(manifest, bridge_dir, "vae")
    incompatible = model.load_state_dict(state, strict=True)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        raise RuntimeError("Tiny-SD VAE strict state load failed")
    model.eval()
    return model, config


def deterministic_text_inputs(vocab_size: int) -> tuple[torch.Tensor, torch.Tensor]:
    if vocab_size <= 1024:
        raise RuntimeError("unexpected Tiny-SD CLIP vocabulary size")
    ids = (torch.arange(SEQUENCE_LENGTH, dtype=torch.int64) * 37 + 17) % vocab_size
    ids = ids.unsqueeze(0)
    mask = torch.ones((1, SEQUENCE_LENGTH), dtype=torch.int64)
    mask[:, -5:] = 0
    return ids, mask


def deterministic_unet_inputs(cross_attention_dim: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    sample = torch.linspace(-1.0, 1.0, 4 * LATENT_HEIGHT * LATENT_WIDTH, dtype=torch.float32).reshape(
        1, 4, LATENT_HEIGHT, LATENT_WIDTH
    )
    timestep = torch.tensor([501], dtype=torch.int64)
    hidden = torch.linspace(
        -0.75,
        0.75,
        SEQUENCE_LENGTH * cross_attention_dim,
        dtype=torch.float32,
    ).reshape(1, SEQUENCE_LENGTH, cross_attention_dim)
    return sample, timestep, hidden


def deterministic_vae_input() -> torch.Tensor:
    return torch.linspace(
        -1.25,
        1.25,
        4 * LATENT_HEIGHT * LATENT_WIDTH,
        dtype=torch.float32,
    ).reshape(1, 4, LATENT_HEIGHT, LATENT_WIDTH)


def array_digest(array: np.ndarray) -> str:
    contiguous = np.ascontiguousarray(array)
    digest = hashlib.sha256()
    digest.update(str(contiguous.dtype).encode("ascii"))
    digest.update(json.dumps(list(contiguous.shape)).encode("ascii"))
    digest.update(contiguous.tobytes(order="C"))
    return digest.hexdigest()


def array_summary(array: np.ndarray) -> dict[str, Any]:
    values = np.asarray(array)
    if not np.isfinite(values).all():
        raise RuntimeError("non-finite deterministic component output")
    return {
        "shape": list(values.shape),
        "dtype": str(values.dtype),
        "min": float(values.min()),
        "max": float(values.max()),
        "mean": float(values.mean()),
        "sha256": array_digest(values),
    }


def numeric_metrics(reference: np.ndarray, actual: np.ndarray) -> dict[str, float]:
    if reference.shape != actual.shape:
        raise RuntimeError(f"parity shape mismatch: reference={reference.shape} actual={actual.shape}")
    delta = actual.astype(np.float64) - reference.astype(np.float64)
    absolute = np.abs(delta)
    return {
        "maxAbs": float(absolute.max(initial=0.0)),
        "meanAbs": float(absolute.mean()),
        "rmse": float(np.sqrt(np.mean(delta * delta))),
    }
