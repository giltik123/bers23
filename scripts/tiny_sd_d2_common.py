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
CLIP_POSITION_IDS_KEY = "text_model.embeddings.position_ids"


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


def _exact_state_load(
    model: torch.nn.Module,
    state: dict[str, torch.Tensor],
    *,
    component: str,
    clip_max_position_embeddings: int | None = None,
) -> dict[str, Any]:
    """Load the D1 tensor state without treating framework-derived buffers as model authority.

    Every learned parameter must be present in the D1 bridge. Every unexpected bridge key is
    rejected. The only permitted historical-library mismatch is CLIP's non-learned position_ids
    buffer, which Transformers 4.30 persists in state_dict even though the authoritative Tiny-SD
    source weights do not serialize it. Its exact value is re-derived from the pinned config.
    """
    model_state_keys = set(model.state_dict())
    bridge_keys = set(state)
    parameter_names = {name for name, _ in model.named_parameters()}
    missing = model_state_keys - bridge_keys
    unexpected = bridge_keys - model_state_keys

    if unexpected:
        raise RuntimeError(f"Tiny-SD {component} unexpected D1 bridge keys: {sorted(unexpected)}")
    missing_parameters = parameter_names - bridge_keys
    if missing_parameters:
        raise RuntimeError(f"Tiny-SD {component} missing learned parameters: {sorted(missing_parameters)}")

    allowed_missing: set[str] = set()
    derived_buffers: list[dict[str, Any]] = []
    if component == "text_encoder" and CLIP_POSITION_IDS_KEY in missing:
        if clip_max_position_embeddings is None or clip_max_position_embeddings <= 0:
            raise RuntimeError("Tiny-SD CLIP max_position_embeddings is unavailable")
        if CLIP_POSITION_IDS_KEY in parameter_names:
            raise RuntimeError("Tiny-SD CLIP position_ids unexpectedly became a learned parameter")
        buffers = dict(model.named_buffers())
        buffer = buffers.get(CLIP_POSITION_IDS_KEY)
        if buffer is None:
            raise RuntimeError("Tiny-SD CLIP position_ids missing from named buffers")
        expected_shape = (1, int(clip_max_position_embeddings))
        if tuple(buffer.shape) != expected_shape:
            raise RuntimeError(
                f"Tiny-SD CLIP position_ids shape drift: {tuple(buffer.shape)} != {expected_shape}"
            )
        expected = torch.arange(
            int(clip_max_position_embeddings),
            dtype=buffer.dtype,
            device=buffer.device,
        ).reshape(expected_shape)
        if not torch.equal(buffer, expected):
            raise RuntimeError("Tiny-SD CLIP position_ids is not the exact pinned-config derivation")
        allowed_missing.add(CLIP_POSITION_IDS_KEY)
        derived_buffers.append({
            "key": CLIP_POSITION_IDS_KEY,
            "authority": "DERIVED_FROM_PINNED_CONFIG_NOT_D1_WEIGHT",
            "learnedParameter": False,
            "shape": list(expected_shape),
            "dtype": str(buffer.dtype),
            "formula": "arange(max_position_embeddings).reshape(1, max_position_embeddings)",
        })

    if missing != allowed_missing:
        raise RuntimeError(
            f"Tiny-SD {component} unapproved missing state keys: {sorted(missing - allowed_missing)}"
        )

    # strict=False is used only after the exact key-set checks above and only when the one
    # closed, deterministic non-learned CLIP buffer is absent from the authoritative bridge.
    incompatible = model.load_state_dict(state, strict=not allowed_missing)
    if set(incompatible.missing_keys) != allowed_missing or incompatible.unexpected_keys:
        raise RuntimeError(
            f"Tiny-SD {component} state-load result drift: "
            f"missing={incompatible.missing_keys} unexpected={incompatible.unexpected_keys}"
        )
    return {
        "bridgeKeyCount": len(bridge_keys),
        "modelStateKeyCount": len(model_state_keys),
        "learnedParameterCount": len(parameter_names),
        "allLearnedParametersExactFromD1Bridge": True,
        "unexpectedBridgeKeys": [],
        "derivedNonLearnedBuffers": derived_buffers,
        "derivedBufferPolicy": "EXACT_CLOSED_ALLOWLIST",
    }


def _force_diffusers_eager_attention(model: torch.nn.Module) -> None:
    # Historical and modern Diffusers may otherwise select different attention processors
    # solely because of the installed PyTorch version. D2 compares model semantics, not
    # backend-specific fused-attention numerics, so force the common mathematical path.
    from diffusers.models.attention_processor import AttnProcessor

    setter = getattr(model, "set_attn_processor", None)
    if callable(setter):
        setter(AttnProcessor())


def load_text_encoder(snapshot: Path, bridge_dir: Path, manifest: dict[str, Any]):
    from transformers import CLIPTextConfig, CLIPTextModel

    config_path = snapshot / "text_encoder" / "config.json"
    config = CLIPTextConfig.from_json_file(str(config_path))
    # Modern Transformers can select SDPA while the 2023 reference path was eager attention.
    # Force eager attention in both environments so library-version parity tests semantics,
    # not a backend optimization choice.
    setattr(config, "_attn_implementation", "eager")
    model = CLIPTextModel(config).float()
    state = _state_for_component(manifest, bridge_dir, "text_encoder")
    load_evidence = _exact_state_load(
        model,
        state,
        component="text_encoder",
        clip_max_position_embeddings=int(config.max_position_embeddings),
    )
    model.eval()
    return model, config, load_evidence


def load_unet(snapshot: Path, bridge_dir: Path, manifest: dict[str, Any]):
    from diffusers import UNet2DConditionModel

    config = json.loads((snapshot / "unet" / "config.json").read_text(encoding="utf-8"))
    model = UNet2DConditionModel.from_config(config).float()
    state = _state_for_component(manifest, bridge_dir, "unet")
    load_evidence = _exact_state_load(model, state, component="unet")
    _force_diffusers_eager_attention(model)
    model.eval()
    return model, config, load_evidence


def load_vae(snapshot: Path, bridge_dir: Path, manifest: dict[str, Any]):
    from diffusers import AutoencoderKL

    config = json.loads((snapshot / "vae" / "config.json").read_text(encoding="utf-8"))
    model = AutoencoderKL.from_config(config).float()
    state = _state_for_component(manifest, bridge_dir, "vae")
    load_evidence = _exact_state_load(model, state, component="vae")
    _force_diffusers_eager_attention(model)
    model.eval()
    return model, config, load_evidence


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
