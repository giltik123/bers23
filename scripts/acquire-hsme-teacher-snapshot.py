#!/usr/bin/env python3
"""Protected HSME teacher snapshot acquisition without model deserialization.

The acquire phase downloads only exact plan-listed files at immutable revisions,
then delegates byte hashing and manifest construction to the accepted snapshot
inspector. The cleanup phase proves model/cache paths are gone before JSON
evidence publication.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

ACQUISITION_EVIDENCE_SCHEMA = "BERS_HSME_TEACHER_PROTECTED_ACQUISITION_EVIDENCE_V1"
CLEANUP_EVIDENCE_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_CLEANUP_EVIDENCE_V1"
ACQUISITION_EVIDENCE_DOMAIN = b"bers:hsme:teacher-protected-acquisition-evidence:v1\0"
CLEANUP_EVIDENCE_DOMAIN = b"bers:hsme:teacher-acquisition-cleanup-evidence:v1\0"
HEX64 = set("0123456789abcdef")
MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991


class ProtectedAcquisitionError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise ProtectedAcquisitionError(message)


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
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(ch not in HEX64 for ch in value)
    ):
        fail(f"{label} must be lowercase 64-hex")
    return value


def require_safe_integer(value: Any, label: str) -> int:
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < 0
        or value > MAX_SAFE_JSON_INTEGER
    ):
        fail(f"{label} must be a non-negative JSON-safe integer")
    return value


def load_inspector() -> Any:
    path = Path(__file__).with_name("inspect-hsme-teacher-snapshot.py")
    spec = importlib.util.spec_from_file_location("hsme_teacher_snapshot_inspector", path)
    if spec is None or spec.loader is None:
        fail("unable to load accepted teacher snapshot inspector")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"unable to read JSON {path}: {error}")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def source_key(source: dict[str, str]) -> str:
    return (
        source["provider"]
        + "\0"
        + source["sourceRoot"]
        + "\0"
        + source["immutableRevision"]
    )


def validate_expected_manifest(
    plan: dict[str, Any],
    expected: Any,
    inspector: Any,
) -> dict[str, Any]:
    if not isinstance(expected, dict):
        fail("expected manifest must be an object")
    if expected.get("schemaVersion") != inspector.MANIFEST_SCHEMA:
        fail("expected manifest schema mismatch")
    if expected.get("teacherCandidateId") != plan["teacherCandidateId"]:
        fail("expected manifest candidate mismatch")
    if expected.get("primarySource") != plan["primarySource"]:
        fail("expected manifest primary source mismatch")
    artifacts = expected.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != len(plan["artifacts"]):
        fail("expected manifest artifact cardinality mismatch")

    expected_by_id: dict[str, dict[str, Any]] = {}
    for index, artifact in enumerate(artifacts):
        if not isinstance(artifact, dict):
            fail(f"expected artifacts[{index}] invalid")
        required = {
            "logicalId",
            "source",
            "relativePath",
            "role",
            "contentSha256",
            "bytes",
            "runtimeRequired",
        }
        if set(artifact) != required:
            fail(f"expected artifacts[{index}] shape mismatch")
        logical_id = artifact["logicalId"]
        if not isinstance(logical_id, str) or logical_id in expected_by_id:
            fail("expected manifest logicalId invalid or duplicated")
        require_hex64(
            artifact["contentSha256"],
            f"expected artifacts[{index}].contentSha256",
        )
        byte_count = require_safe_integer(
            artifact["bytes"],
            f"expected artifacts[{index}].bytes",
        )
        if byte_count < 1:
            fail("zero-byte expected runtime artifact rejected")
        expected_by_id[logical_id] = artifact

    for artifact in plan["artifacts"]:
        expected_artifact = expected_by_id.get(artifact["logicalId"])
        if expected_artifact is None:
            fail(f"expected manifest missing {artifact['logicalId']}")
        for field in ("source", "relativePath", "role", "runtimeRequired"):
            if expected_artifact[field] != artifact[field]:
                fail(
                    f"expected manifest plan binding mismatch for "
                    f"{artifact['logicalId']}:{field}"
                )
    return expected


def default_downloader(
    source: dict[str, str],
    relative_path: str,
    destination_root: Path,
) -> Path:
    from huggingface_hub import hf_hub_download

    if source["provider"] != "HUGGING_FACE":
        fail("protected acquisition v1 supports only HUGGING_FACE sources")
    token = os.environ.get("HF_TOKEN") or None
    cache_dir = os.environ.get("HF_HUB_CACHE")
    downloaded = hf_hub_download(
        repo_id=source["sourceRoot"],
        filename=relative_path,
        revision=source["immutableRevision"],
        local_dir=str(destination_root),
        cache_dir=cache_dir,
        token=token,
    )
    return Path(downloaded)


def acquire(
    raw_plan: Any,
    raw_expected_manifest: Any,
    materialized_root: Path,
    *,
    max_download_bytes: int | None = None,
    downloader: Callable[[dict[str, str], str, Path], Path] = default_downloader,
) -> tuple[dict[str, Any], dict[str, Any]]:
    inspector = load_inspector()
    try:
        plan = inspector.normalize_plan(raw_plan)
    except Exception as error:
        fail(f"acquisition plan invalid: {error}")
    expected = validate_expected_manifest(plan, raw_expected_manifest, inspector)

    if os.path.lexists(materialized_root):
        if not materialized_root.is_dir():
            fail("materialized root exists but is not a directory")
        if any(materialized_root.iterdir()):
            fail("materialized root must be empty before protected acquisition")
    else:
        materialized_root.mkdir(parents=True, exist_ok=False)

    sources_by_key: dict[str, Path] = {}
    for item in plan["sources"]:
        source = item["source"]
        if source["provider"] != "HUGGING_FACE":
            fail("protected acquisition v1 supports only HUGGING_FACE sources")
        subdir = item["materializedSubdir"]
        source_dir = materialized_root / subdir
        source_dir.mkdir(parents=True, exist_ok=False)
        sources_by_key[source_key(source)] = source_dir

    downloaded_count = 0
    expected_download_bytes = 0
    expected_by_id = {
        item["logicalId"]: item for item in expected["artifacts"]
    }
    for item in expected["artifacts"]:
        expected_download_bytes += require_safe_integer(
            item["bytes"],
            "expectedDownloadBytes",
        )
        require_safe_integer(expected_download_bytes, "expectedDownloadBytes")
    if max_download_bytes is not None:
        max_download_bytes = require_safe_integer(max_download_bytes, "maxDownloadBytes")
        if max_download_bytes < 1:
            fail("maxDownloadBytes must be positive")
        if expected_download_bytes > max_download_bytes:
            fail(
                f"expected download bytes {expected_download_bytes} exceed explicit maxDownloadBytes {max_download_bytes}"
            )
    expected_download_bytes_verified = expected_download_bytes
    expected_download_bytes = 0

    for artifact in plan["artifacts"]:
        if artifact["relativePath"].lower().endswith(".py"):
            fail(
                "model-repository Python runtime code cannot enter protected "
                f"acquisition: {artifact['relativePath']}"
            )
        expected_artifact = expected_by_id[artifact["logicalId"]]
        expected_download_bytes += expected_artifact["bytes"]
        require_safe_integer(
            expected_download_bytes,
            "expectedDownloadBytes",
        )
        source_dir = sources_by_key.get(source_key(artifact["source"]))
        if source_dir is None:
            fail(f"source directory missing for {artifact['logicalId']}")
        downloaded_path = downloader(
            artifact["source"],
            artifact["relativePath"],
            source_dir,
        )
        try:
            source_resolved = source_dir.resolve(strict=True)
            downloaded_resolved = downloaded_path.resolve(strict=True)
        except OSError as error:
            fail(f"downloaded artifact path invalid: {error}")
        if (
            os.path.commonpath([str(source_resolved), str(downloaded_resolved)])
            != str(source_resolved)
        ):
            fail(f"downloaded artifact escaped source root: {artifact['logicalId']}")
        expected_path = source_dir / artifact["relativePath"]
        try:
            expected_resolved = expected_path.resolve(strict=True)
        except OSError as error:
            fail(f"expected downloaded path missing: {error}")
        if downloaded_resolved != expected_resolved:
            fail(
                f"downloader returned unexpected path for {artifact['logicalId']}"
            )
        downloaded_count += 1

    try:
        observed_manifest = inspector.build_manifest(plan, materialized_root)
    except Exception as error:
        fail(f"pre-deserialization snapshot inspection failed: {error}")

    if inspector.canonical_json(observed_manifest) != inspector.canonical_json(expected):
        fail("teacher snapshot identity mismatch against remote expected manifest")

    plan_digest = inspector.domain_digest(inspector.PLAN_DOMAIN, plan)
    expected_manifest_digest = inspector.domain_digest(
        inspector.MANIFEST_DOMAIN,
        expected,
    )
    observed_manifest_digest = inspector.domain_digest(
        inspector.MANIFEST_DOMAIN,
        observed_manifest,
    )
    observed_bytes = sum(item["bytes"] for item in observed_manifest["artifacts"])
    require_safe_integer(observed_bytes, "observedBytes")
    if observed_bytes != expected_download_bytes or observed_bytes != expected_download_bytes_verified:
        fail("observed/expected acquisition byte totals differ")

    evidence = {
        "schemaVersion": ACQUISITION_EVIDENCE_SCHEMA,
        "teacherCandidateId": plan["teacherCandidateId"],
        "planDigest": plan_digest,
        "expectedManifestDigest": expected_manifest_digest,
        "observedManifestDigest": observed_manifest_digest,
        "downloadedArtifactCount": downloaded_count,
        "expectedDownloadBytes": expected_download_bytes,
        "observedBytes": observed_bytes,
        "matchesExpectedManifest": True,
        "hashBeforeDeserialization": True,
        "deserializationPerformed": False,
        "modelRepositoryRuntimeCodeExecuted": False,
        "binaryPayloadPublished": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "runtimeAuthorityGranted": False,
        "productionAuthorityGranted": False,
    }
    evidence["evidenceSha256"] = domain_digest(
        ACQUISITION_EVIDENCE_DOMAIN,
        evidence,
    )
    return observed_manifest, evidence


def validate_acquisition_evidence(raw: Any) -> tuple[dict[str, Any], str]:
    if not isinstance(raw, dict):
        fail("acquisition evidence must be an object")
    if raw.get("schemaVersion") != ACQUISITION_EVIDENCE_SCHEMA:
        fail("acquisition evidence schema mismatch")
    provided = require_hex64(raw.get("evidenceSha256"), "evidenceSha256")
    payload = dict(raw)
    payload.pop("evidenceSha256", None)
    if domain_digest(ACQUISITION_EVIDENCE_DOMAIN, payload) != provided:
        fail("acquisition evidence digest mismatch")
    for field in (
        "deserializationPerformed",
        "modelRepositoryRuntimeCodeExecuted",
        "binaryPayloadPublished",
        "teacherAdmissionAllowed",
        "trainingStartAllowed",
        "runtimeAuthorityGranted",
        "productionAuthorityGranted",
    ):
        if raw.get(field) is not False:
            fail(f"acquisition evidence {field} must remain false")
    if raw.get("hashBeforeDeserialization") is not True:
        fail("hashBeforeDeserialization must be true")
    if raw.get("matchesExpectedManifest") is not True:
        fail("matchesExpectedManifest must be true")
    return raw, provided


def prove_cleanup(
    materialized_root: Path,
    hf_home: Path,
    raw_acquisition_evidence: Any,
) -> dict[str, Any]:
    acquisition, acquisition_sha = validate_acquisition_evidence(
        raw_acquisition_evidence
    )
    if os.path.lexists(materialized_root):
        fail("materialized model bytes still exist")
    if os.path.lexists(hf_home):
        fail("Hugging Face cache bytes still exist")

    evidence = {
        "schemaVersion": CLEANUP_EVIDENCE_SCHEMA,
        "teacherCandidateId": acquisition["teacherCandidateId"],
        "acquisitionEvidenceSha256": acquisition_sha,
        "modelBytesPresent": False,
        "hubCacheBytesPresent": False,
        "binaryPayloadPublishable": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "runtimeAuthorityGranted": False,
        "productionAuthorityGranted": False,
    }
    evidence["cleanupEvidenceSha256"] = domain_digest(
        CLEANUP_EVIDENCE_DOMAIN,
        evidence,
    )
    return evidence


def run_acquire(args: argparse.Namespace) -> int:
    plan = read_json(args.plan)
    expected = read_json(args.expected_manifest)
    manifest, evidence = acquire(
        plan,
        expected,
        args.materialized_root,
        max_download_bytes=args.max_download_bytes,
    )
    write_json(args.manifest_output, manifest)
    write_json(args.evidence_output, evidence)
    print(
        json.dumps(
            {
                "schemaVersion": evidence["schemaVersion"],
                "teacherCandidateId": evidence["teacherCandidateId"],
                "downloadedArtifactCount": evidence["downloadedArtifactCount"],
                "expectedDownloadBytes": evidence["expectedDownloadBytes"],
                "evidenceSha256": evidence["evidenceSha256"],
                "teacherAdmissionAllowed": evidence["teacherAdmissionAllowed"],
                "trainingStartAllowed": evidence["trainingStartAllowed"],
            },
            sort_keys=True,
        )
    )
    return 0


def run_cleanup(args: argparse.Namespace) -> int:
    acquisition = read_json(args.acquisition_evidence)
    cleanup = prove_cleanup(
        args.materialized_root,
        args.hf_home,
        acquisition,
    )
    write_json(args.output, cleanup)
    print(json.dumps(cleanup, sort_keys=True))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    acquire_parser = subparsers.add_parser("acquire")
    acquire_parser.add_argument("--plan", required=True, type=Path)
    acquire_parser.add_argument("--expected-manifest", required=True, type=Path)
    acquire_parser.add_argument("--materialized-root", required=True, type=Path)
    acquire_parser.add_argument("--manifest-output", required=True, type=Path)
    acquire_parser.add_argument("--evidence-output", required=True, type=Path)
    acquire_parser.add_argument("--max-download-bytes", required=True, type=int)

    cleanup_parser = subparsers.add_parser("prove-cleanup")
    cleanup_parser.add_argument("--materialized-root", required=True, type=Path)
    cleanup_parser.add_argument("--hf-home", required=True, type=Path)
    cleanup_parser.add_argument("--acquisition-evidence", required=True, type=Path)
    cleanup_parser.add_argument("--output", required=True, type=Path)

    args = parser.parse_args()
    try:
        if args.command == "acquire":
            return run_acquire(args)
        if args.command == "prove-cleanup":
            return run_cleanup(args)
        fail("unsupported command")
    except (ProtectedAcquisitionError, OSError, json.JSONDecodeError) as error:
        print(f"HSME protected teacher acquisition failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
