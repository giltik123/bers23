#!/usr/bin/env python3
"""Build and verify HSME teacher artifact manifests without deserializing model weights."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any

PLAN_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_PLAN_V1"
MANIFEST_SCHEMA = "BERS_HSME_TEACHER_ARTIFACT_MANIFEST_V1"
EVIDENCE_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_EVIDENCE_V1"
MANIFEST_DOMAIN = b"bers:hsme:teacher-artifact-manifest:v1\0"
PLAN_DOMAIN = b"bers:hsme:teacher-acquisition-plan:v1\0"
HEX_REVISION = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9._:@/-]*$")
SOURCE_ROOT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
PROVIDERS = {"HUGGING_FACE", "GITHUB"}
ROLES = {
    "DENOISER_WEIGHT",
    "TEXT_ENCODER_WEIGHT",
    "VAE_WEIGHT",
    "MODEL_CONFIG",
    "TOKENIZER_ASSET",
    "SCHEDULER_ASSET",
    "RUNTIME_ASSET",
    "RUNTIME_CODE",
}
WEIGHT_ROLES = {"DENOISER_WEIGHT", "TEXT_ENCODER_WEIGHT", "VAE_WEIGHT"}


class AcquisitionError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise AcquisitionError(message)


def exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    keys = set(value.keys())
    if keys != expected:
        fail(f"{label} keys mismatch: expected={sorted(expected)} actual={sorted(keys)}")
    return value


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


def revision(value: Any, label: str) -> str:
    result = text(value, label, 64)
    if not HEX_REVISION.fullmatch(result):
        fail(f"{label} must be an immutable 40/64-hex revision")
    return result


def source_root(value: Any, label: str) -> str:
    result = text(value, label, 240)
    if not SOURCE_ROOT.fullmatch(result):
        fail(f"{label} must be owner/repository")
    return result


def normalized_relative_path(value: Any, label: str) -> str:
    result = text(value, label, 500)
    if result.startswith("/") or "\\" in result:
        fail(f"{label} must be a normalized relative path")
    parts = result.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        fail(f"{label} contains unsafe path segments")
    return result


def normalized_subdir(value: Any, label: str) -> str:
    return normalized_relative_path(value, label)


def normalize_source(raw: Any, label: str) -> dict[str, str]:
    record = exact_keys(raw, {"provider", "sourceRoot", "immutableRevision"}, label)
    provider = text(record["provider"], f"{label}.provider", 32)
    if provider not in PROVIDERS:
        fail(f"{label}.provider is unsupported")
    return {
        "provider": provider,
        "sourceRoot": source_root(record["sourceRoot"], f"{label}.sourceRoot"),
        "immutableRevision": revision(record["immutableRevision"], f"{label}.immutableRevision"),
    }


def source_key(source: dict[str, str]) -> str:
    return f"{source['provider']}\0{source['sourceRoot']}\0{source['immutableRevision']}"


def normalize_plan(raw: Any) -> dict[str, Any]:
    record = exact_keys(
        raw,
        {"schemaVersion", "teacherCandidateId", "primarySource", "sources", "artifacts"},
        "plan",
    )
    if record["schemaVersion"] != PLAN_SCHEMA:
        fail("unsupported acquisition plan schema")
    teacher_candidate_id = identifier(record["teacherCandidateId"], "teacherCandidateId", 120)
    primary_source = normalize_source(record["primarySource"], "primarySource")

    if not isinstance(record["sources"], list) or not 1 <= len(record["sources"]) <= 32:
        fail("sources must contain 1..32 entries")
    sources: list[dict[str, Any]] = []
    source_dirs: set[str] = set()
    source_keys: set[str] = set()
    for index, raw_source in enumerate(record["sources"]):
        item = exact_keys(raw_source, {"source", "materializedSubdir"}, f"sources[{index}]")
        source = normalize_source(item["source"], f"sources[{index}].source")
        materialized_subdir = normalized_subdir(item["materializedSubdir"], f"sources[{index}].materializedSubdir")
        key = source_key(source)
        if key in source_keys:
            fail("source identity is duplicated")
        if materialized_subdir in source_dirs:
            fail("materialized source directory is duplicated")
        source_keys.add(key)
        source_dirs.add(materialized_subdir)
        sources.append({"source": source, "materializedSubdir": materialized_subdir})
    if source_key(primary_source) not in source_keys:
        fail("primarySource must be present in sources")

    if not isinstance(record["artifacts"], list) or not 1 <= len(record["artifacts"]) <= 4096:
        fail("artifacts must contain 1..4096 entries")
    artifacts: list[dict[str, Any]] = []
    logical_ids: set[str] = set()
    source_paths: set[str] = set()
    for index, raw_artifact in enumerate(record["artifacts"]):
        item = exact_keys(
            raw_artifact,
            {"logicalId", "source", "relativePath", "role", "runtimeRequired"},
            f"artifacts[{index}]",
        )
        logical_id = identifier(item["logicalId"], f"artifacts[{index}].logicalId")
        source = normalize_source(item["source"], f"artifacts[{index}].source")
        if source_key(source) not in source_keys:
            fail(f"artifact {logical_id} references a source absent from sources")
        relative_path = normalized_relative_path(item["relativePath"], f"artifacts[{index}].relativePath")
        role = text(item["role"], f"artifacts[{index}].role", 64)
        if role not in ROLES:
            fail(f"artifact {logical_id} has unsupported role")
        if role == "RUNTIME_CODE":
            fail(f"artifact {logical_id} requests model-repository runtime code; acquisition v1 fails closed")
        runtime_required = item["runtimeRequired"]
        if not isinstance(runtime_required, bool):
            fail(f"artifacts[{index}].runtimeRequired must be boolean")
        if role in WEIGHT_ROLES and not runtime_required:
            fail(f"artifact {logical_id} canonical weight must be runtimeRequired")
        source_path_key = f"{source_key(source)}\0{relative_path}"
        if logical_id in logical_ids:
            fail(f"duplicate artifact logicalId {logical_id}")
        if source_path_key in source_paths:
            fail(f"duplicate artifact source path {relative_path}")
        logical_ids.add(logical_id)
        source_paths.add(source_path_key)
        artifacts.append({
            "logicalId": logical_id,
            "source": source,
            "relativePath": relative_path,
            "role": role,
            "runtimeRequired": runtime_required,
        })

    if not any(source_key(item["source"]) == source_key(primary_source) for item in artifacts):
        fail("at least one artifact must come from primarySource")

    return {
        "schemaVersion": PLAN_SCHEMA,
        "teacherCandidateId": teacher_candidate_id,
        "primarySource": primary_source,
        "sources": sorted(sources, key=lambda item: source_key(item["source"])),
        "artifacts": sorted(artifacts, key=lambda item: item["logicalId"]),
    }


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def domain_digest(domain: bytes, value: Any) -> str:
    digest = hashlib.sha256()
    digest.update(domain)
    digest.update(canonical_json(value))
    return digest.hexdigest()


def assert_no_symlink_chain(root: Path, relative_path: str) -> Path:
    current = root
    root_stat = os.lstat(root)
    if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):
        fail(f"materialized source root is not a real directory: {root}")
    for part in relative_path.split("/"):
        current = current / part
        entry_stat = os.lstat(current)
        if stat.S_ISLNK(entry_stat.st_mode):
            fail(f"symlinked teacher artifact path rejected: {current}")
    return current


def hash_regular_file(path: Path) -> tuple[str, int]:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            fail(f"teacher artifact is not a regular file: {path}")
        digest = hashlib.sha256()
        with os.fdopen(fd, "rb", closefd=False) as handle:
            while True:
                block = handle.read(1024 * 1024)
                if not block:
                    break
                digest.update(block)
        return digest.hexdigest(), info.st_size
    finally:
        os.close(fd)


def build_manifest(plan: dict[str, Any], materialized_root: Path) -> dict[str, Any]:
    if materialized_root.is_symlink():
        fail("materialized root itself may not be a symlink")
    root = materialized_root.resolve(strict=True)
    source_dirs = {source_key(item["source"]): item["materializedSubdir"] for item in plan["sources"]}
    output_artifacts: list[dict[str, Any]] = []
    for artifact in plan["artifacts"]:
        subdir = source_dirs[source_key(artifact["source"])]
        source_dir = assert_no_symlink_chain(root, subdir)
        source_dir_resolved = source_dir.resolve(strict=True)
        if os.path.commonpath([str(root), str(source_dir_resolved)]) != str(root):
            fail("materialized source directory escapes acquisition root")
        path = assert_no_symlink_chain(source_dir_resolved, artifact["relativePath"])
        path_resolved = path.resolve(strict=True)
        if os.path.commonpath([str(source_dir_resolved), str(path_resolved)]) != str(source_dir_resolved):
            fail(f"artifact escapes source root: {artifact['logicalId']}")
        content_sha256, byte_count = hash_regular_file(path_resolved)
        if byte_count < 1:
            fail(f"zero-byte runtime artifact rejected: {artifact['logicalId']}")
        output_artifacts.append({
            "logicalId": artifact["logicalId"],
            "source": artifact["source"],
            "relativePath": artifact["relativePath"],
            "role": artifact["role"],
            "contentSha256": content_sha256,
            "bytes": byte_count,
            "runtimeRequired": artifact["runtimeRequired"],
        })
    return {
        "schemaVersion": MANIFEST_SCHEMA,
        "teacherCandidateId": plan["teacherCandidateId"],
        "primarySource": plan["primarySource"],
        "artifacts": sorted(output_artifacts, key=lambda item: item["logicalId"]),
    }


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, sort_keys=True, indent=2, ensure_ascii=False)
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--materialized-root", required=True, type=Path)
    parser.add_argument("--manifest-output", required=True, type=Path)
    parser.add_argument("--evidence-output", required=True, type=Path)
    parser.add_argument("--expected-manifest", type=Path)
    args = parser.parse_args()

    try:
        plan = normalize_plan(read_json(args.plan))
        manifest = build_manifest(plan, args.materialized_root)
        manifest_digest = domain_digest(MANIFEST_DOMAIN, manifest)
        plan_digest = domain_digest(PLAN_DOMAIN, plan)

        matches_expected = None
        if args.expected_manifest is not None:
            expected = read_json(args.expected_manifest)
            matches_expected = canonical_json(expected) == canonical_json(manifest)
            if not matches_expected:
                fail("teacher snapshot identity mismatch against expected manifest")

        evidence = {
            "schemaVersion": EVIDENCE_SCHEMA,
            "teacherCandidateId": manifest["teacherCandidateId"],
            "planDigest": plan_digest,
            "manifestDigest": manifest_digest,
            "artifactCount": len(manifest["artifacts"]),
            "sourceCount": len(plan["sources"]),
            "matchesExpectedManifest": matches_expected,
            "hashBeforeDeserialization": True,
            "deserializationPerformed": False,
            "modelRepositoryRuntimeCodeExecuted": False,
            "binaryPayloadPublished": False,
            "runtimeAuthorityGranted": False,
        }
        write_json(args.manifest_output, manifest)
        write_json(args.evidence_output, evidence)
        print(json.dumps(evidence, sort_keys=True))
        return 0
    except (AcquisitionError, FileNotFoundError, NotADirectoryError, OSError, json.JSONDecodeError) as error:
        print(f"HSME teacher acquisition failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
