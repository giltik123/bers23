#!/usr/bin/env python3
"""Validate immutable HSME teacher acquisition requests without admitting any teacher."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_PIN_REQUEST_SET_V1"
DIGEST_DOMAIN = b"bers:hsme:teacher-acquisition-pin-request-set:v1\0"
HEX40_64 = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9._:@/-]*$")
SOURCE_ROOT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
CAPABILITIES = {"TEXT_TO_IMAGE", "IMAGE_EDITING", "MULTI_REFERENCE_EDITING"}
KINDS = {"FILE", "DIRECTORY"}
ROLES = {
    "MODEL_CONFIG",
    "SCHEDULER_ASSET",
    "TEXT_ENCODER",
    "TOKENIZER_ASSET",
    "PROCESSOR_ASSET",
    "DENOISER",
    "VAE",
}


class ValidationError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise ValidationError(message)


def exact_object(raw: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        fail(f"{label} must be an object")
    actual = set(raw)
    if actual != keys:
        fail(f"{label} keys mismatch: expected={sorted(keys)} actual={sorted(actual)}")
    return raw


def text(value: Any, label: str, maximum: int) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum or value.strip() != value:
        fail(f"{label} is invalid")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        fail(f"{label} contains control characters")
    return value


def identifier(value: Any, label: str, maximum: int = 160) -> str:
    result = text(value, label, maximum)
    if not IDENTIFIER.fullmatch(result):
        fail(f"{label} is not a canonical identifier")
    return result


def immutable_revision(value: Any, label: str) -> str:
    result = text(value, label, 64)
    if not HEX40_64.fullmatch(result):
        fail(f"{label} must be an immutable 40/64-hex revision")
    return result


def source_root(value: Any, label: str) -> str:
    result = text(value, label, 240)
    if not SOURCE_ROOT.fullmatch(result):
        fail(f"{label} must be owner/repository")
    return result


def relative_path(value: Any, label: str) -> str:
    result = text(value, label, 500)
    if result.startswith("/") or "\\" in result:
        fail(f"{label} must be a normalized relative path")
    parts = result.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        fail(f"{label} contains unsafe path segments")
    return result


def false_literal(value: Any, label: str) -> bool:
    if value is not False:
        fail(f"{label} must remain false")
    return False


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value: Any) -> str:
    hasher = hashlib.sha256()
    hasher.update(DIGEST_DOMAIN)
    hasher.update(canonical_json(value))
    return hasher.hexdigest()


def normalize_request(raw: Any, index: int) -> dict[str, Any]:
    label = f"requests[{index}]"
    record = exact_object(
        raw,
        {
            "teacherCandidateId",
            "source",
            "requestedCapabilities",
            "componentRoots",
            "publicMetadataLicenseId",
            "rightsConclusion",
            "distillationOutputUse",
            "qualityGateStatus",
            "teacherAdmissionAllowed",
            "trainingStartAllowed",
        },
        label,
    )
    source = exact_object(
        record["source"],
        {"provider", "sourceRoot", "immutableRevision"},
        f"{label}.source",
    )
    if source["provider"] != "HUGGING_FACE":
        fail(f"{label}.source.provider must be HUGGING_FACE")
    normalized_source = {
        "provider": "HUGGING_FACE",
        "sourceRoot": source_root(source["sourceRoot"], f"{label}.source.sourceRoot"),
        "immutableRevision": immutable_revision(
            source["immutableRevision"], f"{label}.source.immutableRevision"
        ),
    }

    capabilities = record["requestedCapabilities"]
    if not isinstance(capabilities, list) or not 1 <= len(capabilities) <= len(CAPABILITIES):
        fail(f"{label}.requestedCapabilities must contain 1..{len(CAPABILITIES)} entries")
    normalized_capabilities: list[str] = []
    for value in capabilities:
        if value not in CAPABILITIES:
            fail(f"{label}.requestedCapabilities contains unsupported capability")
        normalized_capabilities.append(value)
    if len(set(normalized_capabilities)) != len(normalized_capabilities):
        fail(f"{label}.requestedCapabilities contains duplicates")
    normalized_capabilities.sort()

    roots = record["componentRoots"]
    if not isinstance(roots, list) or not 1 <= len(roots) <= 32:
        fail(f"{label}.componentRoots must contain 1..32 entries")
    normalized_roots: list[dict[str, str]] = []
    component_ids: set[str] = set()
    component_paths: set[str] = set()
    for root_index, raw_root in enumerate(roots):
        root_label = f"{label}.componentRoots[{root_index}]"
        item = exact_object(
            raw_root,
            {"componentId", "relativePath", "kind", "role"},
            root_label,
        )
        component_id = identifier(item["componentId"], f"{root_label}.componentId", 120)
        component_path = relative_path(item["relativePath"], f"{root_label}.relativePath")
        kind = text(item["kind"], f"{root_label}.kind", 16)
        role = text(item["role"], f"{root_label}.role", 48)
        if kind not in KINDS:
            fail(f"{root_label}.kind unsupported")
        if role not in ROLES:
            fail(f"{root_label}.role unsupported")
        if component_id in component_ids:
            fail(f"{label}.componentId duplicated")
        if component_path in component_paths:
            fail(f"{label}.relativePath duplicated")
        component_ids.add(component_id)
        component_paths.add(component_path)
        normalized_roots.append(
            {
                "componentId": component_id,
                "relativePath": component_path,
                "kind": kind,
                "role": role,
            }
        )
    normalized_roots.sort(key=lambda value: value["componentId"])

    license_id = text(record["publicMetadataLicenseId"], f"{label}.publicMetadataLicenseId", 120)
    if record["rightsConclusion"] != "REVIEW_REQUIRED":
        fail(f"{label}.rightsConclusion must remain REVIEW_REQUIRED at request stage")
    if record["distillationOutputUse"] != "REVIEW_REQUIRED":
        fail(f"{label}.distillationOutputUse must remain REVIEW_REQUIRED at request stage")
    if record["qualityGateStatus"] != "UNMEASURED":
        fail(f"{label}.qualityGateStatus must remain UNMEASURED at request stage")
    false_literal(record["teacherAdmissionAllowed"], f"{label}.teacherAdmissionAllowed")
    false_literal(record["trainingStartAllowed"], f"{label}.trainingStartAllowed")

    return {
        "teacherCandidateId": identifier(record["teacherCandidateId"], f"{label}.teacherCandidateId", 120),
        "source": normalized_source,
        "requestedCapabilities": normalized_capabilities,
        "componentRoots": normalized_roots,
        "publicMetadataLicenseId": license_id,
        "rightsConclusion": "REVIEW_REQUIRED",
        "distillationOutputUse": "REVIEW_REQUIRED",
        "qualityGateStatus": "UNMEASURED",
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
    }


def normalize(raw: Any) -> dict[str, Any]:
    record = exact_object(
        raw,
        {
            "schemaVersion",
            "requestSetId",
            "requests",
            "qualityPolicy",
            "teacherAdmissionAllowed",
            "trainingStartAllowed",
            "productionAuthorityGranted",
        },
        "requestSet",
    )
    if record["schemaVersion"] != SCHEMA:
        fail("unsupported request-set schema")
    if record["qualityPolicy"] != "QUALITY_FLOOR_BEFORE_EFFICIENCY":
        fail("quality policy drift")
    false_literal(record["teacherAdmissionAllowed"], "requestSet.teacherAdmissionAllowed")
    false_literal(record["trainingStartAllowed"], "requestSet.trainingStartAllowed")
    false_literal(record["productionAuthorityGranted"], "requestSet.productionAuthorityGranted")

    requests = record["requests"]
    if not isinstance(requests, list) or not 3 <= len(requests) <= 12:
        fail("request set must compare at least three teacher strategies")
    normalized_requests = [normalize_request(value, index) for index, value in enumerate(requests)]
    candidate_ids = [value["teacherCandidateId"] for value in normalized_requests]
    if len(set(candidate_ids)) != len(candidate_ids):
        fail("teacherCandidateId must be unique")
    source_keys = [
        (
            value["source"]["provider"],
            value["source"]["sourceRoot"],
            value["source"]["immutableRevision"],
        )
        for value in normalized_requests
    ]
    if len(set(source_keys)) != len(source_keys):
        fail("source identity must be unique per teacher request")
    normalized_requests.sort(key=lambda value: value["teacherCandidateId"])

    return {
        "schemaVersion": SCHEMA,
        "requestSetId": identifier(record["requestSetId"], "requestSetId", 160),
        "requests": normalized_requests,
        "qualityPolicy": "QUALITY_FLOOR_BEFORE_EFFICIENCY",
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "productionAuthorityGranted": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--evidence-output", type=Path)
    args = parser.parse_args()
    try:
        with args.input.open("r", encoding="utf-8") as handle:
            normalized = normalize(json.load(handle))
        evidence = {
            "schemaVersion": "BERS_HSME_TEACHER_ACQUISITION_PIN_REQUEST_EVIDENCE_V1",
            "requestSetId": normalized["requestSetId"],
            "requestSetSha256": digest(normalized),
            "requestCount": len(normalized["requests"]),
            "immutableRevisionCount": len(normalized["requests"]),
            "rightsResolved": False,
            "qualityMeasured": False,
            "teacherAdmissionAllowed": False,
            "trainingStartAllowed": False,
            "productionAuthorityGranted": False,
        }
        if args.evidence_output is not None:
            args.evidence_output.parent.mkdir(parents=True, exist_ok=True)
            with args.evidence_output.open("w", encoding="utf-8", newline="\n") as handle:
                json.dump(evidence, handle, sort_keys=True, indent=2)
                handle.write("\n")
        print(json.dumps(evidence, sort_keys=True))
        return 0
    except (ValidationError, OSError, json.JSONDecodeError) as error:
        print(f"HSME teacher pin request validation failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
