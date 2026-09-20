#!/usr/bin/env python3
"""Fail-closed metadata pinning and exact SANA split-conditioning evidence runner."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import sys
from typing import Any

SANA_REPO = "Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers"
SANA_REVISION = "a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97"
PIN_SCHEMA = "BERS_HSME_SANA_PARITY_METADATA_PIN_V1"
EVIDENCE_SCHEMA = "BERS_HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1"
PLAN_SCHEMA = "BERS_HSME_SANA_CONDITIONING_PARITY_PLAN_V1"
RUNTIME_LOCK_SCHEMA = "BERS_HSME_SANA_PARITY_RUNTIME_LOCK_V1"
QUALITY_POLICY = "QUALITY_FLOOR_BEFORE_EFFICIENCY"
HEX40 = set("0123456789abcdef")
HEX64 = HEX40
COMPONENT_PREFIXES = {
    "transformer": "transformer/",
    "vae": "vae/",
    "scheduler": "scheduler/",
    "textEncoder": "text_encoder/",
    "tokenizer": "tokenizer/",
}
ALLOWED_PLAN_OUTCOME_POLICY = {
    "embeddingBytes": "EXACT_SHA256",
    "attentionMaskBytes": "EXACT_SHA256",
    "generationConfig": "EXACT_CANONICAL_DIGEST",
    "imageOutput": "EXACT_SHA256_SAME_BACKEND",
    "postObservationThresholdChangesAllowed": False,
}
AUTHORITY_FALSE_FIELDS = (
    "productionAuthorityGranted",
    "providerAuthorityGranted",
    "billingAuthorityGranted",
    "projectArtifactMutationAllowed",
    "binaryArtifactsPublishable",
)
PLAN_KEYS = (
    "schemaVersion", "candidateId", "qualityPolicy", "phase0EnvelopeDigest",
    "sanaSnapshot", "transformer", "vae", "scheduler", "textEncoder", "tokenizer",
    "diffusersRuntime", "transformersRuntime", "torchRuntime", "runtimeLockSha256",
    "promptCommitmentKeyId", "promptCommitmentHmacSha256", "generation", "parityPolicy",
    "rights", "rawPromptPersisted", "modelRepositoryCodeExecutionAllowed",
    "productionAuthorityGranted", "providerAuthorityGranted", "billingAuthorityGranted",
    "projectArtifactMutationAllowed", "binaryArtifactsPublishable",
)
IDENTITY_KEYS = ("sourceRoot", "immutableRevision", "contentSha256")
GENERATION_KEYS = (
    "width", "height", "inferenceSteps", "seed", "latentSha256",
    "schedulerTimestepsSha256", "guidanceScaleMilli", "transformerDtype",
    "textEncoderDtype", "vaeDtype", "executionProvider",
)
PARITY_KEYS = (
    "embeddingBytes", "attentionMaskBytes", "generationConfig", "imageOutput",
    "postObservationThresholdChangesAllowed",
)
RIGHTS_KEYS = ("status", "evidenceSha256")


class RunnerError(RuntimeError):
    pass


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_bytes(value))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def require_hex(value: Any, length: int, name: str) -> str:
    if not isinstance(value, str) or len(value) != length or any(ch not in HEX64 for ch in value):
        raise RunnerError(f"{name} must be lowercase {length}-hex")
    return value


def require_false(record: dict[str, Any], field: str) -> None:
    if record.get(field) is not False:
        raise RunnerError(f"{field} must be false")


def require_exact_keys(record: Any, expected: tuple[str, ...], name: str) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise RunnerError(f"{name} must be an object")
    actual = set(record)
    required = set(expected)
    if actual != required:
        missing = sorted(required - actual)
        unknown = sorted(actual - required)
        raise RunnerError(f"{name} fields mismatch: missing={missing} unknown={unknown}")
    return record


def require_revision(value: Any, name: str) -> str:
    if not isinstance(value, str) or len(value) not in (40, 64) or any(ch not in HEX64 for ch in value):
        raise RunnerError(f"{name} must be immutable 40/64-hex")
    return value


def runtime_lock_digest(path: Path) -> tuple[dict[str, Any], str]:
    lock = read_json(path)
    if lock.get("schemaVersion") != RUNTIME_LOCK_SCHEMA:
        raise RunnerError("runtime lock schema mismatch")
    if lock.get("policy", {}).get("qualityPolicy") != QUALITY_POLICY:
        raise RunnerError("runtime lock quality policy mismatch")
    for field in (
        "modelRepositoryRuntimeCodeAllowed",
        "binaryArtifactsPublishable",
        "productionAuthorityGranted",
        "providerAuthorityGranted",
        "billingAuthorityGranted",
        "projectArtifactMutationAllowed",
    ):
        if lock.get("policy", {}).get(field) is not False:
            raise RunnerError(f"runtime lock {field} must be false")
    return lock, sha256_json(lock)


def installed_runtime_versions(lock: dict[str, Any]) -> dict[str, str]:
    expected = lock.get("packages")
    if not isinstance(expected, dict) or not expected:
        raise RunnerError("runtime lock packages missing")
    actual: dict[str, str] = {}
    for package, version in expected.items():
        if not isinstance(package, str) or not isinstance(version, str):
            raise RunnerError("runtime lock package entry invalid")
        installed = importlib.metadata.version(package)
        if installed != version:
            raise RunnerError(f"runtime version mismatch for {package}: expected {version}, got {installed}")
        actual[package] = installed
    expected_python = str(lock.get("python"))
    actual_python = f"{sys.version_info.major}.{sys.version_info.minor}"
    if actual_python != expected_python:
        raise RunnerError(f"python version mismatch: expected {expected_python}, got {actual_python}")
    return actual


def attr_or_key(value: Any, key: str) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def sibling_identity(sibling: Any) -> dict[str, Any]:
    path = attr_or_key(sibling, "rfilename")
    size = attr_or_key(sibling, "size")
    if not isinstance(path, str) or not path or not isinstance(size, int) or size < 0:
        raise RunnerError("hub sibling is missing path/size metadata")

    lfs = attr_or_key(sibling, "lfs")
    lfs_sha = attr_or_key(lfs, "sha256")
    if isinstance(lfs_sha, str) and len(lfs_sha) == 64:
        require_hex(lfs_sha, 64, f"{path}.lfs.sha256")
        return {"path": path, "size": size, "identityKind": "sha256", "identity": lfs_sha}

    xet = attr_or_key(sibling, "xet_file_data")
    xet_hash = attr_or_key(xet, "file_hash") or attr_or_key(xet, "hash") or attr_or_key(xet, "xet_hash")
    if isinstance(xet_hash, str) and len(xet_hash) == 64:
        require_hex(xet_hash, 64, f"{path}.xet.hash")
        return {"path": path, "size": size, "identityKind": "sha256", "identity": xet_hash}

    blob_id = attr_or_key(sibling, "blob_id")
    if isinstance(blob_id, str) and len(blob_id) == 40:
        require_hex(blob_id, 40, f"{path}.blob_id")
        return {"path": path, "size": size, "identityKind": "git_blob_sha1", "identity": blob_id}

    raise RunnerError(f"hub sibling {path} has no immutable content identity")


def component_digest(inventory: list[dict[str, Any]], prefix: str) -> str:
    selected = [item for item in inventory if item["path"].startswith(prefix)]
    if not selected:
        raise RunnerError(f"component inventory is empty: {prefix}")
    return sha256_json(selected)


def collect_hub_inventory() -> tuple[list[dict[str, Any]], dict[str, str]]:
    from huggingface_hub import HfApi

    info = HfApi().model_info(SANA_REPO, revision=SANA_REVISION, files_metadata=True)
    if info.sha != SANA_REVISION:
        raise RunnerError(f"hub revision mismatch: expected {SANA_REVISION}, got {info.sha}")
    siblings = list(info.siblings or [])
    inventory = sorted((sibling_identity(item) for item in siblings), key=lambda item: item["path"])
    if not inventory:
        raise RunnerError("empty hub inventory")
    if any(item["path"].endswith(".py") for item in inventory):
        raise RunnerError("model repository contains Python source; remote repository code is not admitted")
    component_digests = {name: component_digest(inventory, prefix) for name, prefix in COMPONENT_PREFIXES.items()}
    return inventory, component_digests


def verify_git_blob_sha1(path: Path, expected: str) -> None:
    data = path.read_bytes()
    actual = hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()
    if actual != expected:
        raise RunnerError(f"git blob identity mismatch: {path.name}")


def verify_local_snapshot(snapshot: Path, inventory: list[dict[str, Any]]) -> None:
    for item in inventory:
        path = snapshot / item["path"]
        if not path.is_file():
            raise RunnerError(f"snapshot file missing: {item['path']}")
        if path.stat().st_size != item["size"]:
            raise RunnerError(f"snapshot size mismatch: {item['path']}")
        if item["identityKind"] == "sha256":
            if sha256_bytes(path.read_bytes()) != item["identity"]:
                raise RunnerError(f"snapshot sha256 mismatch: {item['path']}")
        elif item["identityKind"] == "git_blob_sha1":
            verify_git_blob_sha1(path, item["identity"])
        else:
            raise RunnerError(f"unsupported identity kind: {item['identityKind']}")


def validate_plan(plan: dict[str, Any], runtime_digest: str, require_rights: bool) -> None:
    require_exact_keys(plan, PLAN_KEYS, "plan")
    if plan.get("schemaVersion") != PLAN_SCHEMA:
        raise RunnerError("plan schema mismatch")
    if plan.get("candidateId") != "sana-sprint-0.6b-exact-conditioning-parity":
        raise RunnerError("plan candidate mismatch")
    if plan.get("qualityPolicy") != QUALITY_POLICY:
        raise RunnerError("plan quality policy mismatch")
    require_hex(plan.get("phase0EnvelopeDigest"), 64, "plan.phase0EnvelopeDigest")
    require_hex(plan.get("runtimeLockSha256"), 64, "plan.runtimeLockSha256")
    if plan.get("runtimeLockSha256") != runtime_digest:
        raise RunnerError("plan runtime lock digest mismatch")
    if not isinstance(plan.get("promptCommitmentKeyId"), str) or not plan["promptCommitmentKeyId"]:
        raise RunnerError("plan prompt commitment key id missing")
    require_hex(plan.get("promptCommitmentHmacSha256"), 64, "plan.promptCommitmentHmacSha256")

    parity = require_exact_keys(plan.get("parityPolicy"), PARITY_KEYS, "plan.parityPolicy")
    if parity != ALLOWED_PLAN_OUTCOME_POLICY:
        raise RunnerError("plan parity policy must be exact and predeclared")
    if plan.get("rawPromptPersisted") is not False or plan.get("modelRepositoryCodeExecutionAllowed") is not False:
        raise RunnerError("plan raw prompt / repository code policy is not fail closed")
    for field in AUTHORITY_FALSE_FIELDS:
        require_false(plan, field)

    rights = require_exact_keys(plan.get("rights"), RIGHTS_KEYS, "plan.rights")
    if rights.get("status") not in ("UNRESOLVED", "EVIDENCE_RUN_ALLOWED", "BLOCKED"):
        raise RunnerError("plan rights status invalid")
    if require_rights and rights.get("status") != "EVIDENCE_RUN_ALLOWED":
        raise RunnerError("real parity run is blocked until rights.status=EVIDENCE_RUN_ALLOWED")
    if rights.get("status") == "EVIDENCE_RUN_ALLOWED":
        require_hex(rights.get("evidenceSha256"), 64, "plan.rights.evidenceSha256")
    elif rights.get("evidenceSha256") != "UNKNOWN" and rights.get("status") == "UNRESOLVED":
        raise RunnerError("unresolved rights evidence must be UNKNOWN")

    weight_components = ("sanaSnapshot", "transformer", "vae", "scheduler", "textEncoder", "tokenizer")
    for name in weight_components:
        identity = require_exact_keys(plan.get(name), IDENTITY_KEYS, f"plan.{name}")
        if identity.get("sourceRoot") != SANA_REPO:
            raise RunnerError(f"plan {name}.sourceRoot must bind the actual weight repository")
        if identity.get("immutableRevision") != SANA_REVISION:
            raise RunnerError(f"plan {name}.immutableRevision mismatch")
        require_hex(identity.get("contentSha256"), 64, f"plan.{name}.contentSha256")

    runtime_roots = {
        "diffusersRuntime": "huggingface/diffusers",
        "transformersRuntime": "huggingface/transformers",
        "torchRuntime": "pytorch/pytorch",
    }
    for name, source_root in runtime_roots.items():
        identity = require_exact_keys(plan.get(name), IDENTITY_KEYS, f"plan.{name}")
        if identity.get("sourceRoot") != source_root:
            raise RunnerError(f"plan {name}.sourceRoot mismatch")
        require_revision(identity.get("immutableRevision"), f"plan.{name}.immutableRevision")
        require_hex(identity.get("contentSha256"), 64, f"plan.{name}.contentSha256")

    generation = require_exact_keys(plan.get("generation"), GENERATION_KEYS, "plan.generation")
    if generation.get("width") != 1024 or generation.get("height") != 1024:
        raise RunnerError("V1 generation dimensions must be 1024x1024")
    if not isinstance(generation.get("inferenceSteps"), int) or not 1 <= generation["inferenceSteps"] <= 4:
        raise RunnerError("V1 inferenceSteps must be an integer in [1,4]")
    if not isinstance(generation.get("seed"), int) or not 0 <= generation["seed"] <= 0xFFFFFFFF:
        raise RunnerError("V1 seed must be uint32")
    require_hex(generation.get("latentSha256"), 64, "plan.generation.latentSha256")
    require_hex(generation.get("schedulerTimestepsSha256"), 64, "plan.generation.schedulerTimestepsSha256")
    if not isinstance(generation.get("guidanceScaleMilli"), int) or not 0 <= generation["guidanceScaleMilli"] <= 100000:
        raise RunnerError("V1 guidanceScaleMilli invalid")
    if generation.get("transformerDtype") != "BF16" or generation.get("textEncoderDtype") != "BF16":
        raise RunnerError("V1 transformer/text encoder dtypes must be BF16")
    if generation.get("vaeDtype") not in ("BF16", "FP32"):
        raise RunnerError("V1 VAE dtype invalid")
    if generation.get("executionProvider") != "CUDA_SAME_DEVICE":
        raise RunnerError("V1 evidence runner requires CUDA_SAME_DEVICE")


def verify_plan_against_inventory(plan: dict[str, Any], inventory: list[dict[str, Any]], components: dict[str, str]) -> None:
    if plan["sanaSnapshot"]["contentSha256"] != sha256_json(inventory):
        raise RunnerError("plan SANA snapshot inventory digest mismatch")
    for name in ("transformer", "vae", "scheduler", "textEncoder", "tokenizer"):
        if plan[name]["contentSha256"] != components[name]:
            raise RunnerError(f"plan component digest mismatch: {name}")


def prompt_from_environment(plan: dict[str, Any]) -> str:
    prompt = os.environ.get("HSME_SANA_PROMPT", "")
    key = os.environ.get("HSME_SANA_PROMPT_HMAC_KEY", "")
    key_id = os.environ.get("HSME_SANA_PROMPT_HMAC_KEY_ID", "")
    if not prompt or len(prompt) > 16384 or prompt.strip() != prompt:
        raise RunnerError("protected prompt secret is missing or invalid")
    if not key:
        raise RunnerError("protected prompt HMAC key is missing")
    if key_id != plan.get("promptCommitmentKeyId"):
        raise RunnerError("prompt commitment key id mismatch")
    actual = hmac.new(key.encode("utf-8"), prompt.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(actual, str(plan.get("promptCommitmentHmacSha256", ""))):
        raise RunnerError("prompt HMAC commitment mismatch")
    return prompt


def tensor_bytes(tensor: Any, expected_dtype: Any | None = None) -> bytes:
    import torch

    value = tensor.detach().contiguous().cpu()
    if expected_dtype is not None and value.dtype != expected_dtype:
        raise RunnerError(f"tensor dtype mismatch: expected {expected_dtype}, got {value.dtype}")
    return value.view(torch.uint8).numpy().tobytes(order="C")


def image_array_bytes(images: Any) -> bytes:
    import numpy as np

    array = np.asarray(images)
    if array.dtype != np.float32:
        array = array.astype(np.float32)
    return array.astype("<f4", copy=False).tobytes(order="C")


def hash_int64_mask(mask: Any) -> tuple[str, bytes]:
    import numpy as np
    import torch

    value = mask.detach().to(dtype=torch.int64).contiguous().cpu()
    array = value.numpy().astype("<i8", copy=False)
    raw = array.tobytes(order="C")
    flattened = array.reshape(-1)
    padding = False
    token_count = 0
    for item in flattened:
        integer = int(item)
        if integer not in (0, 1):
            raise RunnerError("attention mask is not binary")
        if integer == 0:
            padding = True
        elif padding:
            raise RunnerError("attention mask is not canonical right-padded")
        else:
            token_count += 1
    if token_count < 1:
        raise RunnerError("attention mask has no enabled tokens")
    return sha256_bytes(raw), raw


def ordered_identity(identity: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceRoot": identity["sourceRoot"],
        "immutableRevision": identity["immutableRevision"],
        "contentSha256": identity["contentSha256"],
    }


def ordered_generation(generation: dict[str, Any]) -> dict[str, Any]:
    return {
        "width": generation["width"],
        "height": generation["height"],
        "inferenceSteps": generation["inferenceSteps"],
        "seed": generation["seed"],
        "latentSha256": generation["latentSha256"],
        "schedulerTimestepsSha256": generation["schedulerTimestepsSha256"],
        "guidanceScaleMilli": generation["guidanceScaleMilli"],
        "transformerDtype": generation["transformerDtype"],
        "textEncoderDtype": generation["textEncoderDtype"],
        "vaeDtype": generation["vaeDtype"],
        "executionProvider": generation["executionProvider"],
    }


def ordered_phase1_plan(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": plan["schemaVersion"],
        "candidateId": plan["candidateId"],
        "qualityPolicy": plan["qualityPolicy"],
        "phase0EnvelopeDigest": plan["phase0EnvelopeDigest"],
        "sanaSnapshot": ordered_identity(plan["sanaSnapshot"]),
        "transformer": ordered_identity(plan["transformer"]),
        "vae": ordered_identity(plan["vae"]),
        "scheduler": ordered_identity(plan["scheduler"]),
        "textEncoder": ordered_identity(plan["textEncoder"]),
        "tokenizer": ordered_identity(plan["tokenizer"]),
        "diffusersRuntime": ordered_identity(plan["diffusersRuntime"]),
        "transformersRuntime": ordered_identity(plan["transformersRuntime"]),
        "torchRuntime": ordered_identity(plan["torchRuntime"]),
        "runtimeLockSha256": plan["runtimeLockSha256"],
        "promptCommitmentKeyId": plan["promptCommitmentKeyId"],
        "promptCommitmentHmacSha256": plan["promptCommitmentHmacSha256"],
        "generation": ordered_generation(plan["generation"]),
        "parityPolicy": {
            "embeddingBytes": plan["parityPolicy"]["embeddingBytes"],
            "attentionMaskBytes": plan["parityPolicy"]["attentionMaskBytes"],
            "generationConfig": plan["parityPolicy"]["generationConfig"],
            "imageOutput": plan["parityPolicy"]["imageOutput"],
            "postObservationThresholdChangesAllowed": plan["parityPolicy"]["postObservationThresholdChangesAllowed"],
        },
        "rights": {
            "status": plan["rights"]["status"],
            "evidenceSha256": plan["rights"]["evidenceSha256"],
        },
        "rawPromptPersisted": plan["rawPromptPersisted"],
        "modelRepositoryCodeExecutionAllowed": plan["modelRepositoryCodeExecutionAllowed"],
        "productionAuthorityGranted": plan["productionAuthorityGranted"],
        "providerAuthorityGranted": plan["providerAuthorityGranted"],
        "billingAuthorityGranted": plan["billingAuthorityGranted"],
        "projectArtifactMutationAllowed": plan["projectArtifactMutationAllowed"],
        "binaryArtifactsPublishable": plan["binaryArtifactsPublishable"],
    }


def phase1_plan_digest(plan: dict[str, Any]) -> str:
    normalized = ordered_phase1_plan(plan)
    return sha256_bytes(
        b"bers:hsme:sana-conditioning-parity-plan:v1\0"
        + json.dumps(normalized, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    )


def runtime_generation_digest(generation: dict[str, Any]) -> str:
    normalized = ordered_generation(generation)
    return sha256_bytes(
        b"bers:hsme:sana-conditioning-generation:v1\0"
        + json.dumps(normalized, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    )


def evidence_template(plan_digest: str, phase0_digest: str) -> dict[str, Any]:
    return {
        "schemaVersion": EVIDENCE_SCHEMA,
        "planDigest": plan_digest,
        "phase0EnvelopeDigest": phase0_digest,
        "generationConfigSha256": "UNKNOWN",
        "referenceEmbeddingSha256": "UNKNOWN",
        "transportedEmbeddingSha256": "UNKNOWN",
        "referenceMaskSha256": "UNKNOWN",
        "transportedMaskSha256": "UNKNOWN",
        "referenceImageSha256": "UNKNOWN",
        "splitImageSha256": "UNKNOWN",
        "referenceTextEncoderInvocations": 0,
        "splitTextEncoderInvocations": 0,
        "outcome": "RUNTIME_BLOCKED",
        "binaryArtifactsPublished": False,
    }


def pin_metadata(runtime_lock_path: Path, output: Path) -> None:
    lock, lock_digest = runtime_lock_digest(runtime_lock_path)
    versions = installed_runtime_versions(lock)
    inventory, components = collect_hub_inventory()
    result = {
        "schemaVersion": PIN_SCHEMA,
        "status": "EVIDENCE_PENDING",
        "qualityPolicy": QUALITY_POLICY,
        "sanaSnapshot": {
            "sourceRoot": SANA_REPO,
            "immutableRevision": SANA_REVISION,
            "contentSha256": sha256_json(inventory),
            "fileCount": len(inventory),
            "totalBytes": sum(item["size"] for item in inventory),
        },
        "components": {
            name: {
                "sourceRoot": SANA_REPO,
                "immutableRevision": SANA_REVISION,
                "contentSha256": digest,
            }
            for name, digest in components.items()
        },
        "inventory": inventory,
        "runtimeLockSha256": lock_digest,
        "runtimeVersions": versions,
        "rights": {"status": "UNRESOLVED", "evidenceSha256": "UNKNOWN"},
        "rawPromptPersisted": False,
        "modelRepositoryCodeExecutionAllowed": False,
        "productionAuthorityGranted": False,
        "providerAuthorityGranted": False,
        "billingAuthorityGranted": False,
        "projectArtifactMutationAllowed": False,
        "binaryArtifactsPublished": False,
    }
    write_json(output, result)


def run_exact_parity(plan_path: Path, runtime_lock_path: Path, output: Path, work_root: Path) -> None:
    plan = read_json(plan_path)
    lock, lock_digest = runtime_lock_digest(runtime_lock_path)
    validate_plan(plan, lock_digest, require_rights=True)
    installed_runtime_versions(lock)
    prompt = prompt_from_environment(plan)
    plan_digest = phase1_plan_digest(plan)
    evidence = evidence_template(plan_digest, plan["phase0EnvelopeDigest"])
    write_json(output, evidence)

    try:
        import torch
        from diffusers import SanaSprintPipeline
        from huggingface_hub import snapshot_download

        if sys.byteorder != "little":
            raise RunnerError("exact tensor serialization requires a little-endian runner")
        if not torch.cuda.is_available():
            raise RunnerError("CUDA GPU runner is required; cloud/API fallback is forbidden")

        inventory, components = collect_hub_inventory()
        verify_plan_against_inventory(plan, inventory, components)

        snapshot = work_root / "snapshot"
        transport = work_root / "transport"
        transport.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id=SANA_REPO,
            revision=SANA_REVISION,
            local_dir=str(snapshot),
        )
        verify_local_snapshot(snapshot, inventory)

        device = torch.device("cuda")
        pipe = SanaSprintPipeline.from_pretrained(
            str(snapshot),
            dtype=torch.bfloat16,
            local_files_only=True,
        )
        pipe.to(device)

        if pipe.text_encoder is None or pipe.tokenizer is None:
            raise RunnerError("reference conditioner is missing")

        generation = plan["generation"]
        if generation.get("executionProvider") != "CUDA_SAME_DEVICE":
            raise RunnerError("V1 real evidence requires CUDA_SAME_DEVICE")
        if generation.get("transformerDtype") != "BF16" or generation.get("textEncoderDtype") != "BF16":
            raise RunnerError("V1 requires BF16 transformer and text encoder")
        if generation.get("vaeDtype") == "FP32":
            pipe.vae.to(dtype=torch.float32)
        elif generation.get("vaeDtype") != "BF16":
            raise RunnerError("V1 VAE dtype must be BF16 or FP32")

        generator = torch.Generator(device="cpu").manual_seed(int(generation["seed"]))
        latents_cpu = pipe.prepare_latents(
            batch_size=1,
            num_channels_latents=pipe.transformer.config.in_channels,
            height=int(generation["height"]),
            width=int(generation["width"]),
            dtype=torch.float32,
            device=torch.device("cpu"),
            generator=generator,
            latents=None,
        )
        latent_sha = sha256_bytes(tensor_bytes(latents_cpu, torch.float32))
        if latent_sha != generation["latentSha256"]:
            raise RunnerError("predeclared latent digest mismatch")
        latents = latents_cpu.to(device)

        steps = int(generation["inferenceSteps"])
        intermediate = 1.3 if steps == 2 else None
        pipe.scheduler.set_timesteps(
            steps,
            device=torch.device("cpu"),
            max_timesteps=1.5708,
            intermediate_timesteps=intermediate,
        )
        scheduler_sha = sha256_bytes(tensor_bytes(pipe.scheduler.timesteps, torch.float32))
        if scheduler_sha != generation["schedulerTimestepsSha256"]:
            raise RunnerError("predeclared scheduler timestep digest mismatch")

        guidance = int(generation["guidanceScaleMilli"]) / 1000.0
        common = {
            "num_inference_steps": steps,
            "height": int(generation["height"]),
            "width": int(generation["width"]),
            "guidance_scale": guidance,
            "output_type": "np",
            "return_dict": True,
            "max_sequence_length": 300,
            "clean_caption": False,
            "max_timesteps": 1.5708,
            "intermediate_timesteps": intermediate,
        }

        calls = {"reference": 0}
        captured: dict[str, Any] = {}
        forward_handle = pipe.text_encoder.register_forward_hook(
            lambda _module, _inputs, _output: calls.__setitem__("reference", calls["reference"] + 1)
        )
        original_encode_prompt = pipe.encode_prompt

        def capture_encode_prompt(*args: Any, **kwargs: Any) -> Any:
            prompt_embeds, prompt_attention_mask = original_encode_prompt(*args, **kwargs)
            captured["prompt_embeds"] = prompt_embeds.detach().clone()
            captured["prompt_attention_mask"] = prompt_attention_mask.detach().clone()
            return prompt_embeds, prompt_attention_mask

        pipe.encode_prompt = capture_encode_prompt
        try:
            reference = pipe(
                prompt=prompt,
                latents=latents.clone(),
                generator=torch.Generator(device="cpu").manual_seed(int(generation["seed"])),
                **common,
            ).images
        finally:
            pipe.encode_prompt = original_encode_prompt
            forward_handle.remove()

        prompt_embeds = captured.get("prompt_embeds")
        prompt_attention_mask = captured.get("prompt_attention_mask")
        if prompt_embeds is None or prompt_attention_mask is None:
            raise RunnerError("reference prompt path did not expose conditioning tensors")
        if tuple(prompt_embeds.shape) != (1, 300, 2304):
            raise RunnerError(f"unexpected prompt embedding shape: {tuple(prompt_embeds.shape)}")
        if tuple(prompt_attention_mask.shape) != (1, 300):
            raise RunnerError(f"unexpected attention mask shape: {tuple(prompt_attention_mask.shape)}")
        if prompt_embeds.dtype != torch.bfloat16:
            raise RunnerError(f"prompt embeddings must be BF16, got {prompt_embeds.dtype}")
        if calls["reference"] < 1:
            raise RunnerError("reference prompt path did not execute the text encoder")

        embedding_raw = tensor_bytes(prompt_embeds, torch.bfloat16)
        reference_embedding_sha = sha256_bytes(embedding_raw)
        reference_mask_sha, mask_raw = hash_int64_mask(prompt_attention_mask)

        (transport / "prompt-embeddings.bf16le").write_bytes(embedding_raw)
        (transport / "prompt-attention-mask.i64le").write_bytes(mask_raw)

        transported_embedding_raw = (transport / "prompt-embeddings.bf16le").read_bytes()
        transported_mask_raw = (transport / "prompt-attention-mask.i64le").read_bytes()
        if sha256_bytes(transported_embedding_raw) != reference_embedding_sha:
            raise RunnerError("transported embedding bytes changed")
        if sha256_bytes(transported_mask_raw) != reference_mask_sha:
            raise RunnerError("transported mask bytes changed")

        transported_embeds = (
            torch.frombuffer(bytearray(transported_embedding_raw), dtype=torch.uint8)
            .clone()
            .view(torch.bfloat16)
            .reshape(1, 300, 2304)
            .to(device)
        )
        transported_mask = (
            torch.frombuffer(bytearray(transported_mask_raw), dtype=torch.int64)
            .clone()
            .reshape(1, 300)
            .to(device)
        )

        reference_image_sha = sha256_bytes(image_array_bytes(reference))

        pipe.text_encoder = None
        pipe.tokenizer = None
        calls_before_split = calls["reference"]

        split = pipe(
            prompt_embeds=transported_embeds,
            prompt_attention_mask=transported_mask,
            latents=latents.clone(),
            generator=torch.Generator(device="cpu").manual_seed(int(generation["seed"])),
            **common,
        ).images
        split_image_sha = sha256_bytes(image_array_bytes(split))
        if calls["reference"] != calls_before_split:
            raise RunnerError("split generation invoked the text encoder")

        evidence.update(
            {
                "generationConfigSha256": runtime_generation_digest(generation),
                "referenceEmbeddingSha256": reference_embedding_sha,
                "transportedEmbeddingSha256": sha256_bytes(transported_embedding_raw),
                "referenceMaskSha256": reference_mask_sha,
                "transportedMaskSha256": sha256_bytes(transported_mask_raw),
                "referenceImageSha256": reference_image_sha,
                "splitImageSha256": split_image_sha,
                "referenceTextEncoderInvocations": calls["reference"],
                "splitTextEncoderInvocations": 0,
                "outcome": (
                    "EXACT_PARITY_PASS"
                    if reference_image_sha == split_image_sha
                    else "GENERATION_PARITY_FAIL"
                ),
                "binaryArtifactsPublished": False,
            }
        )
        write_json(output, evidence)
    except Exception:
        write_json(output, evidence)
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("PIN_METADATA", "RUN_EXACT_PARITY"))
    parser.add_argument("--runtime-lock", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--work-root", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.operation == "PIN_METADATA":
        pin_metadata(args.runtime_lock, args.out)
        return 0
    if args.plan is None or args.work_root is None:
        raise RunnerError("RUN_EXACT_PARITY requires --plan and --work-root")
    args.work_root.mkdir(parents=True, exist_ok=True)
    try:
        run_exact_parity(args.plan, args.runtime_lock, args.out, args.work_root)
        return 0
    finally:
        shutil.rmtree(args.work_root, ignore_errors=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RunnerError as exc:
        print(f"HSME_SANA_PARITY_RUNNER_BLOCKED: {exc}", file=sys.stderr)
        raise SystemExit(2)
