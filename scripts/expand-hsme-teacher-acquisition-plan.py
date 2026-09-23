#!/usr/bin/env python3
"""Expand one immutable teacher pin request into an exact local artifact plan.

This script never downloads or deserializes model data. It only inspects an
already-materialized immutable snapshot under explicitly declared component roots.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any

PLAN_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_PLAN_V1"
EVIDENCE_SCHEMA = "BERS_HSME_TEACHER_ACQUISITION_PLAN_EXPANSION_EVIDENCE_V1"
PLAN_DOMAIN = b"bers:hsme:teacher-acquisition-plan:v1\0"
FORBIDDEN_CODE_SUFFIXES = {
    ".py", ".pyc", ".so", ".dll", ".dylib", ".exe", ".sh", ".bash",
    ".zsh", ".fish", ".ps1", ".bat", ".cmd", ".js", ".mjs", ".cjs",
}
SAFE_WEIGHT_SUFFIXES = {".safetensors"}
SAFE_METADATA_SUFFIXES = {
    ".json", ".txt", ".model", ".tiktoken", ".jinja", ".vocab", ".merges",
}
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9._:@/-]*$")


class ExpansionError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise ExpansionError(message)


def load_pin_validator() -> Any:
    path = Path(__file__).with_name("validate-hsme-teacher-acquisition-pin-requests.py")
    spec = importlib.util.spec_from_file_location("hsme_teacher_pin_validator", path)
    if spec is None or spec.loader is None:
        fail("unable to load pin-request validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def domain_digest(domain: bytes, value: Any) -> str:
    hasher = hashlib.sha256()
    hasher.update(domain)
    hasher.update(canonical_json(value))
    return hasher.hexdigest()


def normalized_relative_path(value: str, label: str) -> str:
    if not value or value.startswith("/") or "\\" in value:
        fail(f"{label} must be a normalized relative path")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        fail(f"{label} contains unsafe path segments")
    return value


def safe_subdir(value: str) -> str:
    if not isinstance(value, str):
        fail("materializedSubdir must be a string")
    result = normalized_relative_path(value, "materializedSubdir")
    if len(result) > 240:
        fail("materializedSubdir too long")
    return result


def lstat_real_directory(path: Path, label: str) -> None:
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        fail(f"{label} must be a real directory")


def lstat_regular_file(path: Path, label: str) -> None:
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        fail(f"{label} must be a real regular file")
    if info.st_size < 1:
        fail(f"{label} may not be zero bytes")


def assert_within(root: Path, target: Path, label: str) -> None:
    root_resolved = root.resolve(strict=True)
    target_resolved = target.resolve(strict=True)
    if os.path.commonpath([str(root_resolved), str(target_resolved)]) != str(root_resolved):
        fail(f"{label} escapes materialized snapshot root")


def classify_artifact(component_role: str, path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in FORBIDDEN_CODE_SUFFIXES:
        fail(f"runtime-code payload rejected from declared component root: {path.name}")

    if component_role == "MODEL_CONFIG":
        if suffix not in SAFE_METADATA_SUFFIXES:
            fail(f"model config has unsupported payload type: {path.name}")
        return "MODEL_CONFIG"

    if component_role in {"DENOISER", "TEXT_ENCODER", "VAE"}:
        if suffix in SAFE_WEIGHT_SUFFIXES:
            return {
                "DENOISER": "DENOISER_WEIGHT",
                "TEXT_ENCODER": "TEXT_ENCODER_WEIGHT",
                "VAE": "VAE_WEIGHT",
            }[component_role]
        if suffix in SAFE_METADATA_SUFFIXES:
            return "MODEL_CONFIG"
        fail(f"{component_role} contains unsupported payload type: {path.name}")

    if component_role == "TOKENIZER_ASSET":
        if suffix not in SAFE_METADATA_SUFFIXES:
            fail(f"tokenizer contains unsupported payload type: {path.name}")
        return "TOKENIZER_ASSET"

    if component_role == "SCHEDULER_ASSET":
        if suffix not in SAFE_METADATA_SUFFIXES:
            fail(f"scheduler contains unsupported payload type: {path.name}")
        return "SCHEDULER_ASSET"

    if component_role == "PROCESSOR_ASSET":
        if suffix not in SAFE_METADATA_SUFFIXES:
            fail(f"processor contains unsupported payload type: {path.name}")
        return "RUNTIME_ASSET"

    fail(f"unsupported component role {component_role}")


def artifact_id(component_id: str, relative_path: str) -> str:
    token = hashlib.sha256(relative_path.encode("utf-8")).hexdigest()[:20]
    value = f"{component_id}-{token}"
    if not IDENTIFIER.fullmatch(value):
        fail("derived artifact logical id is invalid")
    return value


def enumerate_directory(snapshot_root: Path, relative_root: str) -> list[Path]:
    root = snapshot_root / relative_root
    lstat_real_directory(root, f"component root {relative_root}")
    assert_within(snapshot_root, root, f"component root {relative_root}")

    files: list[Path] = []
    for current_root, dir_names, file_names in os.walk(root, topdown=True, followlinks=False):
        current = Path(current_root)
        for name in list(dir_names):
            child = current / name
            info = os.lstat(child)
            if stat.S_ISLNK(info.st_mode):
                fail(f"symlinked directory rejected: {child}")
            if not stat.S_ISDIR(info.st_mode):
                fail(f"non-directory entry in directory walk: {child}")
        for name in file_names:
            child = current / name
            lstat_regular_file(child, f"artifact {child}")
            assert_within(snapshot_root, child, f"artifact {child}")
            files.append(child)
    if not files:
        fail(f"declared component directory is empty: {relative_root}")
    return sorted(files, key=lambda value: value.as_posix())


def build_plan(
    request_set: dict[str, Any],
    candidate_id: str,
    materialized_root: Path,
    materialized_subdir: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    matches = [value for value in request_set["requests"] if value["teacherCandidateId"] == candidate_id]
    if len(matches) != 1:
        fail("candidateId must resolve to exactly one pin request")
    request = matches[0]
    subdir = safe_subdir(materialized_subdir)

    lstat_real_directory(materialized_root, "materialized root")
    snapshot_root = materialized_root / subdir
    lstat_real_directory(snapshot_root, "materialized snapshot root")
    assert_within(materialized_root, snapshot_root, "materialized snapshot root")

    artifacts: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    for component in request["componentRoots"]:
        relative_root = normalized_relative_path(component["relativePath"], "componentRoot.relativePath")
        kind = component["kind"]
        if kind == "FILE":
            paths = [snapshot_root / relative_root]
            lstat_regular_file(paths[0], f"component file {relative_root}")
            assert_within(snapshot_root, paths[0], f"component file {relative_root}")
        elif kind == "DIRECTORY":
            paths = enumerate_directory(snapshot_root, relative_root)
        else:
            fail("componentRoot.kind unsupported")

        for path in paths:
            rel = path.relative_to(snapshot_root).as_posix()
            normalized_relative_path(rel, "artifact.relativePath")
            if rel in seen_paths:
                fail(f"artifact appears in multiple component roots: {rel}")
            seen_paths.add(rel)
            role = classify_artifact(component["role"], path)
            artifacts.append({
                "logicalId": artifact_id(component["componentId"], rel),
                "source": request["source"],
                "relativePath": rel,
                "role": role,
                "runtimeRequired": True,
            })

    artifacts.sort(key=lambda value: value["logicalId"])
    source_entry = {"source": request["source"], "materializedSubdir": subdir}
    plan = {
        "schemaVersion": PLAN_SCHEMA,
        "teacherCandidateId": request["teacherCandidateId"],
        "primarySource": request["source"],
        "sources": [source_entry],
        "artifacts": artifacts,
    }
    plan_sha256 = domain_digest(PLAN_DOMAIN, plan)
    evidence = {
        "schemaVersion": EVIDENCE_SCHEMA,
        "teacherCandidateId": request["teacherCandidateId"],
        "source": request["source"],
        "pinRequestSetSha256": request_set["_requestSetSha256"],
        "planSha256": plan_sha256,
        "artifactCount": len(artifacts),
        "componentRootCount": len(request["componentRoots"]),
        "networkAccessPerformed": False,
        "deserializationPerformed": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "productionAuthorityGranted": False,
    }
    return plan, evidence


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, sort_keys=True, indent=2, ensure_ascii=False)
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pin-requests", required=True, type=Path)
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--materialized-root", required=True, type=Path)
    parser.add_argument("--materialized-subdir", required=True)
    parser.add_argument("--plan-output", required=True, type=Path)
    parser.add_argument("--evidence-output", required=True, type=Path)
    args = parser.parse_args()

    try:
        validator = load_pin_validator()
        with args.pin_requests.open("r", encoding="utf-8") as handle:
            request_set = validator.normalize(json.load(handle))
        request_set["_requestSetSha256"] = validator.digest(request_set)
        plan, evidence = build_plan(
            request_set,
            args.candidate_id,
            args.materialized_root,
            args.materialized_subdir,
        )
        write_json(args.plan_output, plan)
        write_json(args.evidence_output, evidence)
        print(json.dumps(evidence, sort_keys=True))
        return 0
    except (
        ExpansionError,
        OSError,
        json.JSONDecodeError,
        getattr(load_pin_validator(), "ValidationError", RuntimeError),
    ) as error:
        print(f"HSME teacher acquisition plan expansion failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
