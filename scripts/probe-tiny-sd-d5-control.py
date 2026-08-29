#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import torch
from diffusers import DPMSolverMultistepScheduler
from transformers import CLIPTokenizer

EXPECTED_PIPELINE = {
    "_class_name": "StableDiffusionPipeline",
    "scheduler": ["diffusers", "DPMSolverMultistepScheduler"],
    "text_encoder": ["transformers", "CLIPTextModel"],
    "tokenizer": ["transformers", "CLIPTokenizer"],
    "unet": ["diffusers", "UNet2DConditionModel"],
    "vae": ["diffusers", "AutoencoderKL"],
    "requires_safety_checker": False,
}
EXPECTED_SCHEDULER = {
    "_class_name": "DPMSolverMultistepScheduler",
    "algorithm_type": "dpmsolver++",
    "beta_end": 0.012,
    "beta_schedule": "scaled_linear",
    "beta_start": 0.00085,
    "lower_order_final": True,
    "num_train_timesteps": 1000,
    "prediction_type": "epsilon",
    "solver_order": 2,
    "solver_type": "midpoint",
    "steps_offset": 1,
    "thresholding": False,
    "timestep_spacing": "linspace",
    "trained_betas": None,
    "use_karras_sigmas": False,
    "variance_type": None,
}
PROMPTS = {
    "empty": "",
    "ascii": "Portrait of a pretty girl",
    "punctuation_whitespace": "  red, blue...  light\t& shadow!  ",
    "unicode": "Café — 東京, naïve façade 🚀",
    "over_length": " ".join(["tiny diffusion composition parity"] * 40),
}
CONTROL_STEP_COUNTS = [2, 4, 10]
CHAIN_STEPS = 4
CLIP_MODEL_MAX_LENGTH = 77
CLIP_SPECIAL_TOKEN_SLOTS = 2
CLIP_CONTENT_LIMIT = CLIP_MODEL_MAX_LENGTH - CLIP_SPECIAL_TOKEN_SLOTS


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalized_scheduler_config(raw: dict[str, Any]) -> dict[str, Any]:
    keys = sorted(set(EXPECTED_SCHEDULER) | {"dynamic_thresholding_ratio", "sample_max_value", "lambda_min_clipped", "set_alpha_to_one"})
    normalized = {key: raw.get(key) for key in keys}
    if normalized.get("lambda_min_clipped") == float("-inf"):
        normalized["lambda_min_clipped"] = "-Infinity"
    return normalized


def assert_identity(snapshot: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    model_index = load_json(snapshot / "model_index.json")
    for key, expected in EXPECTED_PIPELINE.items():
        if model_index.get(key) != expected:
            raise RuntimeError(f"Tiny-SD D5 pipeline identity drift: {key}={model_index.get(key)!r} expected {expected!r}")
    scheduler_config = load_json(snapshot / "scheduler" / "scheduler_config.json")
    for key, expected in EXPECTED_SCHEDULER.items():
        actual = scheduler_config.get(key)
        if actual != expected:
            raise RuntimeError(f"Tiny-SD D5 scheduler identity drift: {key}={actual!r} expected {expected!r}")
    tokenizer_config = load_json(snapshot / "tokenizer" / "tokenizer_config.json")
    if tokenizer_config.get("tokenizer_class") != "CLIPTokenizer" or tokenizer_config.get("model_max_length") != CLIP_MODEL_MAX_LENGTH:
        raise RuntimeError("Tiny-SD D5 tokenizer identity drift")
    if tokenizer_config.get("pad_token") != "<|endoftext|>":
        raise RuntimeError("Tiny-SD D5 tokenizer pad token drift")
    return model_index, scheduler_config


def tokenizer_reference(snapshot: Path) -> dict[str, Any]:
    tokenizer = CLIPTokenizer.from_pretrained(snapshot / "tokenizer", local_files_only=True)
    if tokenizer.model_max_length != CLIP_MODEL_MAX_LENGTH:
        raise RuntimeError(f"unexpected CLIP model_max_length={tokenizer.model_max_length}")
    bos = int(tokenizer.bos_token_id)
    eos = int(tokenizer.eos_token_id)
    pad = int(tokenizer.pad_token_id)
    if (bos, eos, pad) != (49406, 49407, 49407):
        raise RuntimeError("historical CLIP special-token identity drift")

    cases: dict[str, Any] = {}
    for name, prompt in PROMPTS.items():
        raw_encoded = tokenizer(
            prompt,
            padding=False,
            truncation=False,
            add_special_tokens=False,
            return_attention_mask=False,
        )
        raw_content_ids = [int(value) for value in raw_encoded["input_ids"]]

        encoded = tokenizer(
            prompt,
            padding="max_length",
            truncation=True,
            max_length=CLIP_MODEL_MAX_LENGTH,
            return_attention_mask=True,
            add_special_tokens=True,
        )
        ids = [int(value) for value in encoded["input_ids"]]
        attention = [int(value) for value in encoded["attention_mask"]]
        if len(ids) != CLIP_MODEL_MAX_LENGTH or len(attention) != CLIP_MODEL_MAX_LENGTH:
            raise RuntimeError(f"tokenizer case {name} did not produce {CLIP_MODEL_MAX_LENGTH} tokens")

        # Prove the exact historical control law we will reproduce in the browser. Python's
        # CLIPTokenizer reserves BOS/EOS before truncating content, unlike Transformers.js 3.8.1,
        # whose generic call path truncates the already post-processed token array.
        retained_content = raw_content_ids[:CLIP_CONTENT_LIMIT]
        core = [bos, *retained_content, eos]
        constructed_ids = [*core, *([pad] * (CLIP_MODEL_MAX_LENGTH - len(core)))]
        constructed_attention = [*([1] * len(core)), *([0] * (CLIP_MODEL_MAX_LENGTH - len(core)))]
        if ids != constructed_ids or attention != constructed_attention:
            raise RuntimeError(f"historical CLIP post-processing law drift for case {name}")

        cases[name] = {
            "prompt": prompt,
            "rawContentIds": raw_content_ids,
            "rawContentTokenCount": len(raw_content_ids),
            "retainedContentTokenCount": len(retained_content),
            "inputIds": ids,
            "attentionMask": attention,
            "nonPadTokenCount": int(sum(attention)),
            "bosTokenId": bos,
            "eosTokenId": eos,
            "padTokenId": pad,
        }
    return {
        "tokenizerClass": tokenizer.__class__.__name__,
        "modelMaxLength": int(tokenizer.model_max_length),
        "historicalPostProcessing": {
            "policy": "BOS_PLUS_FIRST_75_CONTENT_PLUS_EOS_THEN_RIGHT_PAD",
            "specialTokenSlots": CLIP_SPECIAL_TOKEN_SLOTS,
            "contentLimit": CLIP_CONTENT_LIMIT,
            "paddingSide": "right",
            "truncationSide": "right",
            "provedAgainstHistoricalTokenizer": True,
        },
        "cases": cases,
    }


def scheduler_from(snapshot: Path) -> DPMSolverMultistepScheduler:
    return DPMSolverMultistepScheduler.from_pretrained(snapshot, subfolder="scheduler", local_files_only=True)


def scheduler_reference(snapshot: Path) -> dict[str, Any]:
    schedules: dict[str, Any] = {}
    for count in CONTROL_STEP_COUNTS:
        scheduler = scheduler_from(snapshot)
        scheduler.set_timesteps(count)
        schedules[str(count)] = {
            "timesteps": [int(value) for value in scheduler.timesteps.tolist()],
            "alphaAtTimesteps": [float(scheduler.alpha_t[int(value)].item()) for value in scheduler.timesteps],
            "sigmaAtTimesteps": [float(scheduler.sigma_t[int(value)].item()) for value in scheduler.timesteps],
            "lambdaAtTimesteps": [float(scheduler.lambda_t[int(value)].item()) for value in scheduler.timesteps],
        }

    scheduler = scheduler_from(snapshot)
    scheduler.set_timesteps(CHAIN_STEPS)
    initial = torch.linspace(-0.75, 0.75, 16, dtype=torch.float32).reshape(1, 4, 2, 2)
    sample = initial.clone()
    model_outputs: list[list[float]] = []
    steps: list[dict[str, Any]] = []
    element_index = torch.arange(sample.numel(), dtype=torch.float32).reshape(sample.shape)
    for index, timestep_tensor in enumerate(scheduler.timesteps):
        timestep = int(timestep_tensor.item())
        model_output = torch.sin(element_index * 0.17 + index * 0.11).to(torch.float32) * 0.25
        model_outputs.append([float(value) for value in model_output.flatten().tolist()])
        scaled = scheduler.scale_model_input(sample, timestep)
        if not torch.equal(scaled, sample):
            raise RuntimeError("Tiny-SD pinned DPM solver unexpectedly scales model input")
        result = scheduler.step(model_output, timestep_tensor, sample)
        sample = result.prev_sample
        if not torch.isfinite(sample).all():
            raise RuntimeError(f"non-finite historical scheduler output at step {index}")
        order_used = 1 if index == 0 or index == CHAIN_STEPS - 1 else 2
        steps.append({
            "index": index,
            "timestep": timestep,
            "expectedOrderUsed": order_used,
            "prevSample": [float(value) for value in sample.flatten().tolist()],
        })

    reset = scheduler_from(snapshot)
    reset.set_timesteps(CHAIN_STEPS)
    reset_sample = initial.clone()
    for index, timestep_tensor in enumerate(reset.timesteps):
        model_output = torch.tensor(model_outputs[index], dtype=torch.float32).reshape(reset_sample.shape)
        reset_sample = reset.step(model_output, timestep_tensor, reset_sample).prev_sample
    deterministic_reset = torch.equal(sample, reset_sample)
    if not deterministic_reset:
        raise RuntimeError("DPM solver state reset is not deterministic")

    return {
        "referenceLibrary": "diffusers==0.19.0",
        "stepCounts": CONTROL_STEP_COUNTS,
        "schedules": schedules,
        "chain": {
            "stepCount": CHAIN_STEPS,
            "initialSample": [float(value) for value in initial.flatten().tolist()],
            "modelOutputs": model_outputs,
            "steps": steps,
            "deterministicResetExact": deterministic_reset,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    snapshot = args.snapshot.resolve()
    assert_identity(snapshot)
    identity_files = [
        "model_index.json",
        "scheduler/scheduler_config.json",
        "tokenizer/tokenizer_config.json",
        "tokenizer/special_tokens_map.json",
        "tokenizer/vocab.json",
        "tokenizer/merges.txt",
    ]
    raw_scheduler = load_json(snapshot / "scheduler" / "scheduler_config.json")
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D5_CONTROL_SEMANTICS_REFERENCE",
        "authority": "COMPOSITION_ONLY_NOT_QUALITY_ADMISSION",
        "upstream": {
            "repo": "segmind/tiny-sd",
            "revision": "cad0bd7495fa6c4bcca01b19a723dc91627fe84f",
            "files": {relative: {"sha256": sha256(snapshot / relative), "bytes": (snapshot / relative).stat().st_size} for relative in identity_files},
        },
        "pipelineIdentity": EXPECTED_PIPELINE,
        "schedulerConfig": normalized_scheduler_config(raw_scheduler),
        "tokenizer": tokenizer_reference(snapshot),
        "scheduler": scheduler_reference(snapshot),
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "editorAuthorityGranted": False,
        "cloudFallbackAllowed": False,
        "realDeviceApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "TINY-SD D5 CONTROL REFERENCE: PASS "
        f"tokenizer_cases={len(report['tokenizer']['cases'])} scheduler_schedules={len(report['scheduler']['schedules'])}"
    )


if __name__ == "__main__":
    main()
