#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import diffusers
import huggingface_hub
import numpy as np
import safetensors
import torch
import transformers

from tiny_sd_d2_common import (
    array_summary,
    deterministic_text_inputs,
    deterministic_unet_inputs,
    deterministic_vae_input,
    load_manifest,
    load_text_encoder,
    load_unet,
    load_vae,
    sha256_file,
)

EXPECTED = {
    "pythonMajorMinor": "3.10",
    "numpy": "1.24.4",
    "torch": "2.0.1+cpu",
    "diffusers": "0.19.0",
    "transformers": "4.30.2",
    "huggingfaceHub": "0.16.4",
    "safetensors": "0.3.1",
}


def environment() -> dict[str, str]:
    import sys

    values = {
        "pythonMajorMinor": f"{sys.version_info.major}.{sys.version_info.minor}",
        "numpy": np.__version__,
        "torch": torch.__version__,
        "diffusers": diffusers.__version__,
        "transformers": transformers.__version__,
        "huggingfaceHub": huggingface_hub.__version__,
        "safetensors": safetensors.__version__,
    }
    for key, expected in EXPECTED.items():
        if values[key] != expected:
            raise RuntimeError(f"Tiny-SD D2 reference environment drift: {key}={values[key]!r}, expected={expected!r}")
    return values


def save_reference(path: Path, outputs: dict[str, np.ndarray]) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(path, **{key: np.ascontiguousarray(value.astype(np.float32, copy=False)) for key, value in outputs.items()})
    return sha256_file(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--bridge-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--reference-out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    env = environment()
    snapshot = args.snapshot.resolve(strict=True)
    bridge_dir = args.bridge_dir.resolve(strict=True)
    manifest = load_manifest(args.manifest.resolve(strict=True))

    outputs: dict[str, np.ndarray] = {}
    semantics: dict[str, Any] = {}

    text_encoder, text_config, text_load = load_text_encoder(snapshot, bridge_dir, manifest)
    input_ids, attention_mask = deterministic_text_inputs(int(text_config.vocab_size))
    with torch.inference_mode():
        text_output = text_encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
    outputs["text_encoder"] = text_output.detach().cpu().float().numpy()
    semantics["textEncoder"] = {
        "class": "CLIPTextModel",
        "vocabSize": int(text_config.vocab_size),
        "hiddenSize": int(text_config.hidden_size),
        "sequenceLength": int(input_ids.shape[1]),
        "attentionMaskIncludesPaddingProbe": True,
        "stateLoad": text_load,
        "output": array_summary(outputs["text_encoder"]),
    }
    del text_encoder, text_output

    unet, unet_config, unet_load = load_unet(snapshot, bridge_dir, manifest)
    cross_attention_dim = int(unet_config["cross_attention_dim"])
    sample, timestep, encoder_hidden_states = deterministic_unet_inputs(cross_attention_dim)
    with torch.inference_mode():
        unet_output = unet(sample, timestep, encoder_hidden_states=encoder_hidden_states).sample
    outputs["unet"] = unet_output.detach().cpu().float().numpy()
    semantics["unet"] = {
        "class": "UNet2DConditionModel",
        "sampleSize": int(unet_config["sample_size"]),
        "inChannels": int(unet_config["in_channels"]),
        "outChannels": int(unet_config["out_channels"]),
        "crossAttentionDim": cross_attention_dim,
        "timestep": int(timestep.item()),
        "stateLoad": unet_load,
        "output": array_summary(outputs["unet"]),
    }
    del unet, unet_output

    vae, vae_config, vae_load = load_vae(snapshot, bridge_dir, manifest)
    scaling_factor = float(vae_config.get("scaling_factor", 0.18215))
    if abs(scaling_factor - 0.18215) > 1e-12:
        raise RuntimeError(f"unexpected Tiny-SD VAE scaling factor: {scaling_factor}")
    scaled_latent = deterministic_vae_input()
    decoder_input = scaled_latent / scaling_factor
    with torch.inference_mode():
        vae_output = vae.decode(decoder_input).sample
    outputs["vae_decoder"] = vae_output.detach().cpu().float().numpy()
    semantics["vaeDecoder"] = {
        "class": "AutoencoderKL",
        "latentChannels": int(vae_config["latent_channels"]),
        "sampleSize": int(vae_config["sample_size"]),
        "scalingFactor": scaling_factor,
        "pipelineInputContract": "vae.decode(stable_diffusion_latent / scaling_factor).sample",
        "stateLoad": vae_load,
        "output": array_summary(outputs["vae_decoder"]),
    }
    del vae, vae_output

    reference_sha = save_reference(args.reference_out, outputs)
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D2_REFERENCE_SEMANTICS",
        "referenceAuthority": "HISTORICAL_LIBRARY_SEMANTICS_OVER_D1_PINNED_TENSORS",
        "environment": env,
        "d1TrustRootReused": True,
        "pickleDeserializedInReferenceProcess": False,
        "bridgeFormat": "SAFETENSORS",
        "fp16SourceToFp32CpuReference": "EXACT_VALUE_PRESERVING_WIDENING",
        "deterministicSyntheticInputsOnly": True,
        "stateLoadPolicy": "ALL_LEARNED_PARAMETERS_EXACT_FROM_D1; ONLY_CLOSED_DERIVED_NONLEARNED_BUFFERS_ALLOWED",
        "semantics": semantics,
        "referenceBundle": {
            "format": "NPZ_RUNNER_LOCAL_ONLY",
            "sha256": reference_sha,
            "uploaded": False,
        },
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("TINY-SD D2 REFERENCE SEMANTICS: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
