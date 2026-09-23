#!/usr/bin/env python3
"""Convert trusted remote teacher metadata into exact acquisition plans.

This step is offline. It does not contact the Hub, download model bytes,
deserialize weights, or grant teacher/training/runtime authority.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

REMOTE_EVIDENCE_SCHEMA = "BERS_HSME_TEACHER_REMOTE_MANIFEST_EVIDENCE_V1"
REMOTE_MANIFEST_SCHEMA = "BERS_HSME_TEACHER_REMOTE_ARTIFACT_MANIFEST_V1"
PLAN_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_PLAN_V1"
EXPECTED_MANIFEST_SCHEMA = "BERS_HSME_TEACHER_ARTIFACT_MANIFEST_V1"
BUNDLE_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_PLAN_BUNDLE_V1"

REMOTE_EVIDENCE_DOMAIN = b"bers:hsme:teacher-remote-manifest-evidence:v1\0"
REMOTE_MANIFEST_DOMAIN = b"bers:hsme:teacher-remote-artifact-manifest:v1\0"
PLAN_DOMAIN = b"bers:hsme:teacher-acquisition-plan:v1\0"
EXPECTED_MANIFEST_DOMAIN = b"bers:hsme:teacher-artifact-manifest:v1\0"
BUNDLE_DOMAIN = b"bers:hsme:teacher-acquisition-plan-bundle:v1\0"

HEX64 = re.compile(r"^[0-9a-f]{64}$")
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9._:@/-]*$")
WEIGHT_SUFFIXES = (".safetensors", ".bin", ".pt", ".pth", ".ckpt")
COMPONENT_ROLES = {
    "MODEL_CONFIG",
    "SCHEDULER_ASSET",
    "TEXT_ENCODER",
    "TOKENIZER_ASSET",
    "PROCESSOR_ASSET",
    "DENOISER",
    "VAE",
}
MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991


class MaterializationError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise MaterializationError(message)


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def domain_digest(domain: bytes, value: Any) -> str:
    return sha256_bytes(domain + canonical_bytes(value))


def require_hex64(value: Any, label: str) -> str:
    if not isinstance(value, str) or HEX64.fullmatch(value) is None:
        fail(f"{label} must be lowercase 64-hex")
    return value


def require_false(value: Any, label: str) -> None:
    if value is not False:
        fail(f"{label} must remain false")


def require_safe_integer(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > MAX_SAFE_JSON_INTEGER:
        fail(f"{label} must be a non-negative JSON-safe integer")
    return value


def identifier(value: Any, label: str, maximum: int = 160) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > maximum
        or value.strip() != value
        or IDENTIFIER.fullmatch(value) is None
    ):
        fail(f"{label} must be a canonical identifier")
    return value


def exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    actual = set(value)
    if actual != expected:
        fail(f"{label} keys mismatch: expected={sorted(expected)} actual={sorted(actual)}")
    return value


def inspector_role(component_role: str, relative_path: str) -> str:
    if component_role not in COMPONENT_ROLES:
        fail(f"unsupported remote component role: {component_role}")
    lower = relative_path.lower()
    is_weight = lower.endswith(WEIGHT_SUFFIXES)

    if component_role == "DENOISER" and is_weight:
        return "DENOISER_WEIGHT"
    if component_role == "TEXT_ENCODER" and is_weight:
        return "TEXT_ENCODER_WEIGHT"
    if component_role == "VAE" and is_weight:
        return "VAE_WEIGHT"
    if component_role == "MODEL_CONFIG":
        return "MODEL_CONFIG"
    if component_role == "TOKENIZER_ASSET":
        return "TOKENIZER_ASSET"
    if component_role == "SCHEDULER_ASSET":
        return "SCHEDULER_ASSET"
    # Processor files and non-weight files inside denoiser/text-encoder/VAE
    # roots remain explicit runtime assets. No model-family inference occurs.
    return "RUNTIME_ASSET"


def logical_id(relative_path: str) -> str:
    return "file/" + sha256_bytes(relative_path.encode("utf-8"))[:24]


def validate_remote_evidence(raw: Any) -> tuple[dict[str, Any], str]:
    if not isinstance(raw, dict):
        fail("remote evidence must be an object")
    if raw.get("schemaVersion") != REMOTE_EVIDENCE_SCHEMA:
        fail("remote evidence schema mismatch")
    provided = require_hex64(raw.get("evidenceSha256"), "remote.evidenceSha256")
    payload = dict(raw)
    payload.pop("evidenceSha256", None)
    recomputed = domain_digest(REMOTE_EVIDENCE_DOMAIN, payload)
    if recomputed != provided:
        fail("remote evidence digest mismatch")

    require_false(raw.get("largeModelPayloadsDownloaded"), "remote.largeModelPayloadsDownloaded")
    require_false(raw.get("modelRepositoryCodeExecutionAllowed"), "remote.modelRepositoryCodeExecutionAllowed")
    require_false(raw.get("deserializationOccurred"), "remote.deserializationOccurred")
    require_false(raw.get("rightsResolved"), "remote.rightsResolved")
    require_false(raw.get("qualityMeasured"), "remote.qualityMeasured")
    require_false(raw.get("teacherAdmissionAllowed"), "remote.teacherAdmissionAllowed")
    require_false(raw.get("trainingStartAllowed"), "remote.trainingStartAllowed")
    require_false(raw.get("productionAuthorityGranted"), "remote.productionAuthorityGranted")

    teachers = raw.get("teachers")
    if not isinstance(teachers, list) or not teachers:
        fail("remote teachers missing")
    if raw.get("teacherCount") != len(teachers):
        fail("remote teacherCount mismatch")
    return raw, provided


def validate_remote_teacher(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, dict):
        fail(f"teachers[{index}] must be an object")
    manifest = raw.get("artifactManifest")
    if not isinstance(manifest, dict):
        fail(f"teachers[{index}].artifactManifest missing")
    if manifest.get("schemaVersion") != REMOTE_MANIFEST_SCHEMA:
        fail(f"teachers[{index}] remote manifest schema mismatch")
    if manifest.get("state") != "REMOTE_METADATA_RESOLVED":
        fail(f"teachers[{index}] remote manifest state invalid")
    provided_manifest_sha = require_hex64(
        raw.get("artifactManifestSha256"),
        f"teachers[{index}].artifactManifestSha256",
    )
    if domain_digest(REMOTE_MANIFEST_DOMAIN, manifest) != provided_manifest_sha:
        fail(f"teachers[{index}] remote manifest digest mismatch")

    candidate_id = identifier(raw.get("teacherCandidateId"), f"teachers[{index}].teacherCandidateId", 120)
    if manifest.get("teacherCandidateId") != candidate_id:
        fail(f"teachers[{index}] candidate identity drift")
    if raw.get("source") != manifest.get("source"):
        fail(f"teachers[{index}] source identity drift")
    if raw.get("artifactCount") != len(manifest.get("artifacts") or []):
        fail(f"teachers[{index}] artifactCount mismatch")

    require_false(raw.get("largeModelPayloadsDownloaded"), f"teachers[{index}].largeModelPayloadsDownloaded")
    require_false(raw.get("xetStorageIdsUsedAsContentSha256"), f"teachers[{index}].xetStorageIdsUsedAsContentSha256")
    require_false(manifest.get("modelRepositoryCodeExecutionAllowed"), f"teachers[{index}].modelRepositoryCodeExecutionAllowed")
    require_false(manifest.get("deserializationOccurred"), f"teachers[{index}].deserializationOccurred")
    require_false(manifest.get("teacherAdmissionAllowed"), f"teachers[{index}].teacherAdmissionAllowed")
    require_false(manifest.get("trainingStartAllowed"), f"teachers[{index}].trainingStartAllowed")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        fail(f"teachers[{index}] artifacts missing")
    return raw


def build_teacher_plan(remote_teacher: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    candidate_id = remote_teacher["teacherCandidateId"]
    remote_manifest = remote_teacher["artifactManifest"]
    source = remote_manifest["source"]
    artifacts = remote_manifest["artifacts"]

    plan_artifacts: list[dict[str, Any]] = []
    expected_artifacts: list[dict[str, Any]] = []
    logical_ids: set[str] = set()
    paths: set[str] = set()

    for index, artifact in enumerate(artifacts):
        if not isinstance(artifact, dict):
            fail(f"{candidate_id}.artifacts[{index}] invalid")
        relative_path = artifact.get("relativePath")
        if not isinstance(relative_path, str) or not relative_path or relative_path.startswith("/") or "\\" in relative_path:
            fail(f"{candidate_id}.artifacts[{index}].relativePath invalid")
        if any(part in ("", ".", "..") for part in relative_path.split("/")):
            fail(f"{candidate_id}.artifacts[{index}].relativePath unsafe")
        if relative_path.lower().endswith(".py"):
            fail(f"{candidate_id} model-repository runtime code rejected: {relative_path}")
        if relative_path in paths:
            fail(f"{candidate_id} duplicate remote artifact path")
        paths.add(relative_path)

        component_id = identifier(
            artifact.get("componentId"),
            f"{candidate_id}.artifacts[{index}].componentId",
            120,
        )
        component_role = artifact.get("role")
        role = inspector_role(component_role, relative_path)
        content_sha256 = require_hex64(
            artifact.get("contentSha256"),
            f"{candidate_id}.artifacts[{index}].contentSha256",
        )
        byte_count = require_safe_integer(
            artifact.get("bytes"),
            f"{candidate_id}.artifacts[{index}].bytes",
        )
        if byte_count < 1:
            fail(f"{candidate_id} zero-byte acquisition artifact rejected")

        lid = logical_id(relative_path)
        if lid in logical_ids:
            fail(f"{candidate_id} logicalId collision")
        logical_ids.add(lid)
        plan_entry = {
            "logicalId": lid,
            "source": source,
            "relativePath": relative_path,
            "role": role,
            "runtimeRequired": True,
        }
        plan_artifacts.append(plan_entry)
        expected_artifacts.append(
            {
                **plan_entry,
                "contentSha256": content_sha256,
                "bytes": byte_count,
            }
        )

    plan_artifacts.sort(key=lambda item: item["logicalId"])
    expected_artifacts.sort(key=lambda item: item["logicalId"])
    materialized_subdir = identifier(candidate_id, f"{candidate_id}.materializedSubdir", 120)

    plan = {
        "schemaVersion": PLAN_SCHEMA,
        "teacherCandidateId": candidate_id,
        "primarySource": source,
        "sources": [
            {
                "source": source,
                "materializedSubdir": materialized_subdir,
            }
        ],
        "artifacts": plan_artifacts,
    }
    expected = {
        "schemaVersion": EXPECTED_MANIFEST_SCHEMA,
        "teacherCandidateId": candidate_id,
        "primarySource": source,
        "artifacts": expected_artifacts,
    }
    return plan, expected


def materialize_bundle(raw: Any) -> dict[str, Any]:
    remote, remote_evidence_sha = validate_remote_evidence(raw)
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()

    for index, raw_teacher in enumerate(remote["teachers"]):
        teacher = validate_remote_teacher(raw_teacher, index)
        candidate_id = teacher["teacherCandidateId"]
        if candidate_id in seen:
            fail("duplicate teacherCandidateId in remote evidence")
        seen.add(candidate_id)
        plan, expected = build_teacher_plan(teacher)
        entries.append(
            {
                "teacherCandidateId": candidate_id,
                "plan": plan,
                "planSha256": domain_digest(PLAN_DOMAIN, plan),
                "expectedManifest": expected,
                "expectedManifestSha256": domain_digest(EXPECTED_MANIFEST_DOMAIN, expected),
                "remoteArtifactManifestSha256": teacher["artifactManifestSha256"],
            }
        )

    entries.sort(key=lambda item: item["teacherCandidateId"])
    bundle = {
        "schemaVersion": BUNDLE_SCHEMA,
        "requestSetId": remote["requestSetId"],
        "requestSetSha256": require_hex64(remote["requestSetSha256"], "requestSetSha256"),
        "remoteEvidenceSha256": remote_evidence_sha,
        "qualityPolicy": remote["qualityPolicy"],
        "teacherCount": len(entries),
        "entries": entries,
        "networkAccessPerformed": False,
        "modelPayloadsDownloaded": False,
        "deserializationOccurred": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "runtimeAuthorityGranted": False,
        "productionAuthorityGranted": False,
    }
    bundle["bundleSha256"] = domain_digest(BUNDLE_DOMAIN, bundle)
    return bundle


def write_outputs(bundle: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    plans_dir = output_dir / "plans"
    expected_dir = output_dir / "expected-manifests"
    plans_dir.mkdir(parents=True, exist_ok=True)
    expected_dir.mkdir(parents=True, exist_ok=True)

    index_entries: list[dict[str, Any]] = []
    for entry in bundle["entries"]:
        candidate_id = entry["teacherCandidateId"]
        plan_name = f"{candidate_id}.plan.json"
        expected_name = f"{candidate_id}.expected-manifest.json"
        (plans_dir / plan_name).write_text(
            json.dumps(entry["plan"], sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        (expected_dir / expected_name).write_text(
            json.dumps(entry["expectedManifest"], sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        index_entries.append(
            {
                "teacherCandidateId": candidate_id,
                "planPath": f"plans/{plan_name}",
                "planSha256": entry["planSha256"],
                "expectedManifestPath": f"expected-manifests/{expected_name}",
                "expectedManifestSha256": entry["expectedManifestSha256"],
                "remoteArtifactManifestSha256": entry["remoteArtifactManifestSha256"],
            }
        )

    index = {
        "schemaVersion": BUNDLE_SCHEMA,
        "requestSetId": bundle["requestSetId"],
        "requestSetSha256": bundle["requestSetSha256"],
        "remoteEvidenceSha256": bundle["remoteEvidenceSha256"],
        "qualityPolicy": bundle["qualityPolicy"],
        "teacherCount": bundle["teacherCount"],
        "entries": index_entries,
        "networkAccessPerformed": False,
        "modelPayloadsDownloaded": False,
        "deserializationOccurred": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "runtimeAuthorityGranted": False,
        "productionAuthorityGranted": False,
        "bundleSha256": bundle["bundleSha256"],
    }
    (output_dir / "acquisition-plan-bundle.json").write_text(
        json.dumps(index, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote-evidence", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    try:
        raw = json.loads(args.remote_evidence.read_text(encoding="utf-8"))
        bundle = materialize_bundle(raw)
        write_outputs(bundle, args.output_dir)
        print(
            json.dumps(
                {
                    "schemaVersion": bundle["schemaVersion"],
                    "teacherCount": bundle["teacherCount"],
                    "remoteEvidenceSha256": bundle["remoteEvidenceSha256"],
                    "bundleSha256": bundle["bundleSha256"],
                    "teacherAdmissionAllowed": bundle["teacherAdmissionAllowed"],
                    "trainingStartAllowed": bundle["trainingStartAllowed"],
                },
                sort_keys=True,
            )
        )
        return 0
    except (MaterializationError, OSError, json.JSONDecodeError) as error:
        print(f"HSME teacher acquisition plan materialization failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
