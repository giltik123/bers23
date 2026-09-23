#!/usr/bin/env python3
"""Acquire one exact HSME teacher snapshot and prove bytes before deserialization.

The runner downloads only files present in a reviewed acquisition-plan bundle,
verifies every local byte through the existing snapshot inspector, destroys the
materialized model bytes, verifies their deletion, and only then writes JSON
evidence. It never imports or deserializes model code/weights.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Callable

BUNDLE_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_PLAN_BUNDLE_V1"
EVIDENCE_SCHEMA = "BERS_HSME_TEACHER_VERIFIED_SNAPSHOT_ACQUISITION_V1"
EVIDENCE_DOMAIN = b"bers:hsme:teacher-verified-snapshot-acquisition:v1\0"
MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991
HEX = set("0123456789abcdef")


class AcquisitionRunError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise AcquisitionRunError(message)


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


def require_hex(value: Any, length: int, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != length
        or any(ch not in HEX for ch in value)
    ):
        fail(f"{label} must be lowercase {length}-hex")
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


def require_false(value: Any, label: str) -> None:
    if value is not False:
        fail(f"{label} must remain false")


def load_script_module(name: str, filename: str) -> Any:
    script = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, script)
    if spec is None or spec.loader is None:
        fail(f"unable to load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_bundle(bundle_dir: Path, candidate_id: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    materializer = load_script_module(
        "hsme_teacher_plan_materializer",
        "materialize-hsme-teacher-acquisition-plans.py",
    )
    inspector = load_script_module(
        "hsme_teacher_snapshot_inspector",
        "inspect-hsme-teacher-snapshot.py",
    )

    index_path = bundle_dir / "acquisition-plan-bundle.json"
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"unable to read acquisition bundle index: {error}")

    if index.get("schemaVersion") != BUNDLE_SCHEMA:
        fail("acquisition bundle schema mismatch")
    for field in (
        "networkAccessPerformed",
        "modelPayloadsDownloaded",
        "deserializationOccurred",
        "teacherAdmissionAllowed",
        "trainingStartAllowed",
        "runtimeAuthorityGranted",
        "productionAuthorityGranted",
    ):
        require_false(index.get(field), f"bundle.{field}")

    entries = index.get("entries")
    if not isinstance(entries, list) or not entries:
        fail("acquisition bundle entries missing")
    matches = [entry for entry in entries if entry.get("teacherCandidateId") == candidate_id]
    if len(matches) != 1:
        fail("candidate must resolve to exactly one acquisition bundle entry")
    entry = matches[0]

    plan_path = bundle_dir / entry["planPath"]
    expected_path = bundle_dir / entry["expectedManifestPath"]
    try:
        plan_raw = json.loads(plan_path.read_text(encoding="utf-8"))
        expected = json.loads(expected_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, KeyError) as error:
        fail(f"unable to read candidate plan/expected manifest: {error}")

    plan = inspector.normalize_plan(plan_raw)
    plan_sha = inspector.domain_digest(inspector.PLAN_DOMAIN, plan)
    if plan_sha != require_hex(entry.get("planSha256"), 64, "entry.planSha256"):
        fail("acquisition plan digest mismatch")

    expected_sha = inspector.domain_digest(inspector.MANIFEST_DOMAIN, expected)
    if expected_sha != require_hex(
        entry.get("expectedManifestSha256"),
        64,
        "entry.expectedManifestSha256",
    ):
        fail("expected manifest digest mismatch")

    require_hex(index.get("requestSetSha256"), 64, "bundle.requestSetSha256")
    require_hex(index.get("remoteEvidenceSha256"), 64, "bundle.remoteEvidenceSha256")
    require_hex(index.get("bundleSha256"), 64, "bundle.bundleSha256")
    require_hex(
        entry.get("remoteArtifactManifestSha256"),
        64,
        "entry.remoteArtifactManifestSha256",
    )
    if expected.get("teacherCandidateId") != candidate_id:
        fail("expected manifest candidate identity mismatch")
    if expected.get("primarySource") != plan.get("primarySource"):
        fail("expected manifest source identity mismatch")

    return index, entry, {"plan": plan, "expected": expected, "inspector": inspector}


def expected_total_bytes(expected: dict[str, Any]) -> int:
    artifacts = expected.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        fail("expected manifest artifacts missing")
    total = 0
    for index, artifact in enumerate(artifacts):
        size = require_safe_integer(artifact.get("bytes"), f"expected.artifacts[{index}].bytes")
        if size < 1:
            fail("zero-byte expected artifact rejected")
        require_hex(
            artifact.get("contentSha256"),
            64,
            f"expected.artifacts[{index}].contentSha256",
        )
        total += size
        require_safe_integer(total, "expected.totalBytes")
    return total


def source_key(source: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(source.get("provider")),
        str(source.get("sourceRoot")),
        str(source.get("immutableRevision")),
    )


def acquire_and_verify(
    bundle_dir: Path,
    candidate_id: str,
    materialized_root: Path,
    max_download_bytes: int,
    download_file: Callable[[str, str, str, Path], Path],
) -> dict[str, Any]:
    max_download_bytes = require_safe_integer(max_download_bytes, "maxDownloadBytes")
    if max_download_bytes < 1:
        fail("maxDownloadBytes must be positive")
    index, entry, payload = load_bundle(bundle_dir, candidate_id)
    plan = payload["plan"]
    expected = payload["expected"]
    inspector = payload["inspector"]

    total_expected = expected_total_bytes(expected)
    if total_expected > max_download_bytes:
        fail(
            f"expected snapshot bytes {total_expected} exceed explicit maxDownloadBytes {max_download_bytes}"
        )

    root = materialized_root.resolve(strict=False)
    if root == Path(root.anchor) or len(root.parts) < 3:
        fail("materialized root is too broad for safe ephemeral cleanup")
    if root.exists():
        if any(root.iterdir()):
            fail("materialized root must not contain pre-existing files")
    else:
        root.mkdir(parents=True, exist_ok=False)

    sources = {
        source_key(item["source"]): item["materializedSubdir"]
        for item in plan["sources"]
    }
    expected_by_path = {
        (source_key(item["source"]), item["relativePath"]): item
        for item in expected["artifacts"]
    }
    downloaded_paths: list[str] = []
    download_count = 0
    cleanup_verified = False
    observed_manifest_sha = "UNKNOWN"

    try:
        for artifact in plan["artifacts"]:
            key = source_key(artifact["source"])
            expected_artifact = expected_by_path.get((key, artifact["relativePath"]))
            if expected_artifact is None:
                fail(f"plan artifact missing from expected manifest: {artifact['logicalId']}")
            provider, repo_id, revision = key
            if provider != "HUGGING_FACE":
                fail(f"unsupported acquisition provider: {provider}")
            require_hex(revision, len(revision), "source.immutableRevision")
            source_dir = root / sources[key]
            source_dir.mkdir(parents=True, exist_ok=True)

            downloaded = download_file(
                repo_id,
                artifact["relativePath"],
                revision,
                source_dir,
            )
            expected_target = source_dir / artifact["relativePath"]
            if not expected_target.exists():
                fail(f"download target path drift: {artifact['relativePath']}")
            if downloaded.is_symlink() or not downloaded.is_file():
                fail(f"downloaded artifact must be a regular non-symlink file: {artifact['relativePath']}")
            if expected_target.is_symlink() or not expected_target.is_file():
                fail(f"expected downloaded target must be a regular non-symlink file: {artifact['relativePath']}")
            downloaded_resolved = downloaded.resolve(strict=True)
            target = expected_target.resolve(strict=True)
            if downloaded_resolved != target:
                fail(f"download target path drift: {artifact['relativePath']}")

            content_sha, byte_count = inspector.hash_regular_file(downloaded)
            if byte_count != expected_artifact["bytes"]:
                fail(f"downloaded byte count mismatch: {artifact['relativePath']}")
            if content_sha != expected_artifact["contentSha256"]:
                fail(f"downloaded SHA-256 mismatch: {artifact['relativePath']}")
            downloaded_paths.append(artifact["relativePath"])
            download_count += 1

        observed = inspector.build_manifest(plan, root)
        if inspector.canonical_json(observed) != inspector.canonical_json(expected):
            fail("verified local snapshot manifest differs from exact expected manifest")
        observed_manifest_sha = inspector.domain_digest(inspector.MANIFEST_DOMAIN, observed)
        if observed_manifest_sha != entry["expectedManifestSha256"]:
            fail("observed manifest digest mismatch after local byte verification")
    finally:
        if root.exists():
            shutil.rmtree(root)
        cleanup_verified = not root.exists()

    if not cleanup_verified:
        fail("ephemeral model-byte cleanup verification failed")

    evidence = {
        "schemaVersion": EVIDENCE_SCHEMA,
        "teacherCandidateId": candidate_id,
        "requestSetSha256": index["requestSetSha256"],
        "remoteEvidenceSha256": index["remoteEvidenceSha256"],
        "remoteArtifactManifestSha256": entry["remoteArtifactManifestSha256"],
        "acquisitionPlanSha256": entry["planSha256"],
        "expectedManifestSha256": entry["expectedManifestSha256"],
        "observedManifestSha256": observed_manifest_sha,
        "expectedBytes": total_expected,
        "downloadedArtifactCount": download_count,
        "downloadedRelativePaths": sorted(downloaded_paths),
        "hashBeforeDeserialization": True,
        "deserializationPerformed": False,
        "modelRepositoryRuntimeCodeExecuted": False,
        "ephemeralModelBytesDestroyed": True,
        "cleanupVerifiedBeforeEvidenceWrite": True,
        "binaryPayloadPublished": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "runtimeAuthorityGranted": False,
        "productionAuthorityGranted": False,
        "providerAuthorityGranted": False,
        "billingAuthorityGranted": False,
        "projectArtifactMutationAllowed": False,
    }
    evidence["evidenceSha256"] = domain_digest(EVIDENCE_DOMAIN, evidence)
    return evidence


def hub_download(repo_id: str, filename: str, revision: str, local_dir: Path) -> Path:
    from huggingface_hub import hf_hub_download

    # Keep every Hub/Xet cache byte underneath the same ephemeral source root
    # that acquire_and_verify destroys before evidence is written.
    cache_dir = local_dir / ".bers-hf-cache"
    hf_home = local_dir / ".bers-hf-home"
    xet_cache = local_dir / ".bers-xet-cache"
    os.environ["HF_HOME"] = str(hf_home)
    os.environ["HF_XET_CACHE"] = str(xet_cache)
    path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        revision=revision,
        local_dir=str(local_dir),
        cache_dir=str(cache_dir),
    )
    return Path(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle-dir", required=True, type=Path)
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--materialized-root", required=True, type=Path)
    parser.add_argument("--max-download-bytes", required=True, type=int)
    parser.add_argument("--evidence-output", required=True, type=Path)
    args = parser.parse_args()

    try:
        evidence = acquire_and_verify(
            args.bundle_dir,
            args.candidate_id,
            args.materialized_root,
            args.max_download_bytes,
            hub_download,
        )
        # Evidence is written only after acquire_and_verify has destroyed and
        # independently verified deletion of all materialized model bytes.
        args.evidence_output.parent.mkdir(parents=True, exist_ok=True)
        args.evidence_output.write_text(
            json.dumps(evidence, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    "schemaVersion": evidence["schemaVersion"],
                    "teacherCandidateId": evidence["teacherCandidateId"],
                    "expectedBytes": evidence["expectedBytes"],
                    "downloadedArtifactCount": evidence["downloadedArtifactCount"],
                    "ephemeralModelBytesDestroyed": evidence["ephemeralModelBytesDestroyed"],
                    "evidenceSha256": evidence["evidenceSha256"],
                },
                sort_keys=True,
            )
        )
        return 0
    except (AcquisitionRunError, OSError, ValueError, RuntimeError) as error:
        print(f"HSME verified teacher snapshot acquisition failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
