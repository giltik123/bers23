#!/usr/bin/env python3
"""Build a reviewed SANA conditioning request from accepted trust + protected prompt secrets.

This operation performs no model/network acquisition. The raw prompt and HMAC key
are read only from the environment and are never written to the request.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
from typing import Any

SANA_REPO = "Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers"
SANA_REVISION = "aa76e7f4f4928f378716b6716a2130fba3caf5b1"
SANA_CANDIDATE = "sana-sprint-0.6b-split-v1"
REQUEST_CANDIDATE = "sana-sprint-0.6b-split-conditioning"
QUALITY_POLICY = "QUALITY_FLOOR_BEFORE_EFFICIENCY"
REQUEST_SCHEMA = "BERS_HSME_SANA_CONDITIONING_PIN_REQUEST_V1"
TRUST_SCHEMA = "BERS_HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1"
RIGHTS_SCHEMA = "BERS_HSME_SANA_EVIDENCE_USE_RIGHTS_V1"
RUNTIME_LOCK_SCHEMA = "BERS_HSME_SANA_PARITY_RUNTIME_LOCK_V1"
DIFFUSERS_REPO = "huggingface/diffusers"
DIFFUSERS_REVISION = "d035dcd7cc7c88e0a154609b62887d50bba9fdc2"
PREPROCESSING_POLICY_SHA256 = "9622d0e38c7ec67ec9ce9895cf60d59b2a50da712ca855162b09d7a0e1e0d4e8"


class BootstrapError(RuntimeError):
    pass


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_bytes(value))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def identity(source_root: str, revision: str, content_sha256: str) -> dict[str, str]:
    return {
        "sourceRoot": source_root,
        "immutableRevision": revision,
        "contentSha256": content_sha256,
    }


def component_projection(artifacts: list[dict[str, Any]], prefix: str) -> list[dict[str, Any]]:
    selected = [
        {
            "relativePath": item["relativePath"],
            "bytes": item["bytes"],
            "contentSha256": item["contentSha256"],
        }
        for item in artifacts
        if item.get("runtimeRequired") is True and item.get("relativePath", "").startswith(prefix)
    ]
    selected.sort(key=lambda item: item["relativePath"])
    if not selected:
        raise BootstrapError(f"accepted trust component is empty: {prefix}")
    return selected


def build_request(
    trust_path: Path,
    rights_path: Path,
    runtime_lock_path: Path,
    prompt: str,
    key: str,
    key_id: str,
) -> dict[str, Any]:
    if not prompt or len(prompt) > 16384 or prompt.strip() != prompt:
        raise BootstrapError("protected prompt secret is missing or invalid")
    if not key:
        raise BootstrapError("protected prompt HMAC key is missing")
    if not key_id or len(key_id) > 160 or key_id.strip() != key_id:
        raise BootstrapError("protected prompt HMAC key id is missing or invalid")

    trust = read_json(trust_path)
    rights = read_json(rights_path)
    lock = read_json(runtime_lock_path)

    if trust.get("schemaVersion") != TRUST_SCHEMA or trust.get("state") != "PINNED":
        raise BootstrapError("accepted candidate trust must be PINNED")
    if trust.get("candidateOutputsObserved") is not False:
        raise BootstrapError("candidate trust unexpectedly observed outputs")
    if rights.get("schemaVersion") != RIGHTS_SCHEMA:
        raise BootstrapError("evidence-use rights schema mismatch")
    if rights.get("candidateId") != SANA_CANDIDATE:
        raise BootstrapError("evidence-use rights candidate mismatch")
    if rights.get("weightRepository") != SANA_REPO or rights.get("weightRevision") != SANA_REVISION:
        raise BootstrapError("evidence-use rights source mismatch")
    if rights.get("gemmaTermsReviewed") is not True or rights.get("evidenceUseAllowed") is not True:
        raise BootstrapError("evidence-use rights are not admitted")
    for field in (
        "trainingOrDistillationAllowed",
        "productionUseAllowed",
        "providerAuthorityGranted",
        "billingAuthorityGranted",
        "projectArtifactMutationAllowed",
        "aeeExecutionAuthorityGranted",
        "durableModelFleetPromotionAllowed",
        "rawPromptRetentionAllowed",
        "binaryEvidencePublishable",
    ):
        if rights.get(field) is not False:
            raise BootstrapError(f"rights field must remain false: {field}")
    if lock.get("schemaVersion") != RUNTIME_LOCK_SCHEMA:
        raise BootstrapError("runtime lock schema mismatch")
    if lock.get("policy", {}).get("qualityPolicy") != QUALITY_POLICY:
        raise BootstrapError("runtime lock quality policy mismatch")

    candidate = next(
        (item for item in trust.get("candidates", []) if item.get("candidateId") == SANA_CANDIDATE),
        None,
    )
    if candidate is None:
        raise BootstrapError("accepted SANA candidate missing from trust bundle")
    manifest = candidate.get("artifactManifest") or {}
    source = manifest.get("primarySource") or {}
    if manifest.get("state") != "PINNED":
        raise BootstrapError("accepted SANA artifact manifest is not PINNED")
    if source != {"sourceRoot": SANA_REPO, "immutableRevision": SANA_REVISION}:
        raise BootstrapError("accepted SANA artifact source mismatch")
    profile = candidate.get("executionProfile") or {}
    model_content = profile.get("artifactManifestDigest")
    if model_content != rights.get("modelContentSha256"):
        raise BootstrapError("accepted model content differs from evidence-use rights")
    if candidate.get("rightsReview", {}).get("reviewState") != "REVIEWED":
        raise BootstrapError("accepted SANA rights review is not REVIEWED")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise BootstrapError("accepted SANA artifacts missing")
    text_encoder_sha = sha256_json(component_projection(artifacts, "text_encoder/"))
    tokenizer_sha = sha256_json(component_projection(artifacts, "tokenizer/"))
    runtime_sha = lock["coreArtifacts"]["diffusers"]["sha256"]
    runtime_lock_sha = sha256_json(lock)
    rights_sha = sha256_bytes(rights_path.read_bytes())
    prompt_hmac = hmac.new(key.encode("utf-8"), prompt.encode("utf-8"), hashlib.sha256).hexdigest()

    return {
        "schemaVersion": REQUEST_SCHEMA,
        "candidateId": REQUEST_CANDIDATE,
        "qualityPolicy": QUALITY_POLICY,
        "sanaCore": identity(SANA_REPO, SANA_REVISION, model_content),
        "textEncoder": identity(SANA_REPO, SANA_REVISION, text_encoder_sha),
        "tokenizer": identity(SANA_REPO, SANA_REVISION, tokenizer_sha),
        "runtime": identity(DIFFUSERS_REPO, DIFFUSERS_REVISION, runtime_sha),
        "runtimeLockSha256": runtime_lock_sha,
        "promptCommitmentKeyId": key_id,
        "promptCommitmentHmacSha256": prompt_hmac,
        "preprocessingPolicySha256": PREPROCESSING_POLICY_SHA256,
        "rights": {"status": "EVIDENCE_RUN_ALLOWED", "evidenceSha256": rights_sha},
        "rawPromptPersisted": False,
        "modelRepositoryCodeExecutionAllowed": False,
        "runtimeAuthorityGranted": False,
        "binaryPayloadPublishable": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trust", required=True, type=Path)
    parser.add_argument("--rights", required=True, type=Path)
    parser.add_argument("--runtime-lock", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    request = build_request(
        args.trust,
        args.rights,
        args.runtime_lock,
        os.environ.get("HSME_SANA_PROMPT", ""),
        os.environ.get("HSME_SANA_PROMPT_HMAC_KEY", ""),
        os.environ.get("HSME_SANA_PROMPT_HMAC_KEY_ID", ""),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(request, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schemaVersion": request["schemaVersion"],
        "candidateId": request["candidateId"],
        "promptCommitmentKeyId": request["promptCommitmentKeyId"],
        "rawPromptPersisted": request["rawPromptPersisted"],
        "modelRepositoryCodeExecutionAllowed": request["modelRepositoryCodeExecutionAllowed"],
        "runtimeAuthorityGranted": request["runtimeAuthorityGranted"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
