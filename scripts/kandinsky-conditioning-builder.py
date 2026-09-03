#!/usr/bin/env python3
"""Strict public entrypoint for the F5b.1 D2c offline conditioning builder."""
from __future__ import annotations

import hashlib
import json
import os
import re
import runpy
import sys
import tempfile
from pathlib import Path

IMPL = Path(__file__).with_name("_kandinsky-conditioning-builder-impl.py")
MAX_SAFE_INTEGER = 9_007_199_254_740_991
CANONICAL_DECIMAL = re.compile(r"^(?:0|[1-9][0-9]*)$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def main() -> None:
    prior_root = value_after("--prior-root")
    d1_manifest = value_after("--d1-manifest")
    prompt_contract = value_after("--prompt-contract")
    output_dir = value_after("--output-dir")
    safe_seed_after("--seed")
    verify_only = flag_once("--verify-only")

    root = Path(prior_root)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError("D2c prior root must be a real non-symlink directory")
    root = root.resolve(strict=True)

    d1_path = Path(d1_manifest)
    if d1_path.is_symlink() or not d1_path.is_file():
        raise RuntimeError("D2c D1 manifest must be a real file")
    d1_path = d1_path.resolve(strict=True)
    d1_bytes = d1_path.read_bytes()
    try:
        d1 = json.loads(d1_bytes.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"D2c D1 manifest is invalid UTF-8/JSON: {exc}") from exc
    d1_sha256 = hashlib.sha256(d1_bytes).hexdigest()

    prompt_path = Path(prompt_contract)
    if prompt_path.is_symlink() or not prompt_path.is_file():
        raise RuntimeError("D2c prompt contract must be a real file")
    prompt_path = prompt_path.resolve(strict=True)
    try:
        prompt = json.loads(prompt_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"D2c prompt contract is invalid UTF-8/JSON: {exc}") from exc
    candidate_id = prompt.get("candidateId") if isinstance(prompt, dict) else None
    if not isinstance(candidate_id, str) or not candidate_id:
        raise RuntimeError("D2c prompt contract candidateId is invalid")

    prior = d1.get("offlinePrior") or {}
    configs = (prior.get("requiredConfigIdentity") or {}).get("files") or []
    weights = prior.get("safeWeights") or []
    expected = {entry["path"] for entry in [*weights, *configs]}
    if len(expected) != len(weights) + len(configs) or not expected:
        raise RuntimeError("D1 prior allowlist is empty or duplicated")

    actual: set[str] = set()
    for entry in root.rglob("*"):
        if entry.is_symlink():
            raise RuntimeError(f"sealed prior mirror contains a symlink: {entry.relative_to(root)}")
        if entry.is_file():
            actual.add(entry.relative_to(root).as_posix())
        elif not entry.is_dir():
            raise RuntimeError(f"sealed prior mirror contains a non-regular entry: {entry.relative_to(root)}")
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise RuntimeError(f"sealed prior mirror file set mismatch; missing={missing}, extra={extra}")

    sys.argv[0] = str(IMPL)
    try:
        runpy.run_path(str(IMPL), run_name="__main__")
    except SystemExit as exc:
        if exc.code not in (None, 0):
            raise

    if not verify_only:
        seal_builder_evidence(Path(output_dir), candidate_id, d1_sha256)


def seal_builder_evidence(output_dir: Path, candidate_id: str, d1_manifest_sha256: str) -> None:
    if not SHA256.fullmatch(d1_manifest_sha256):
        raise RuntimeError("D2c D1 manifest SHA-256 is invalid")
    if output_dir.is_symlink() or not output_dir.is_dir():
        raise RuntimeError("D2c output directory must be a real non-symlink directory")
    output_dir = output_dir.resolve(strict=True)
    evidence_path = output_dir / f"{candidate_id}.builder-evidence.json"
    if evidence_path.is_symlink() or not evidence_path.is_file():
        raise RuntimeError("D2c internal builder did not produce the expected evidence file")
    evidence_path = evidence_path.resolve(strict=True)
    if output_dir not in evidence_path.parents:
        raise RuntimeError("D2c builder evidence escapes the output directory")
    try:
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"D2c builder evidence is invalid UTF-8/JSON: {exc}") from exc
    if not isinstance(evidence, dict) or evidence.get("candidateId") != candidate_id:
        raise RuntimeError("D2c builder evidence candidate mismatch")
    source_trust = evidence.get("sourceTrust")
    expected_source_keys = {
        "d1ModelId", "d1Version", "priorRepository", "priorRevision", "priorPipelineGitBlobSha1",
    }
    if not isinstance(source_trust, dict) or set(source_trust) != expected_source_keys:
        raise RuntimeError("D2c internal builder sourceTrust schema drift")
    sealed = dict(evidence)
    sealed["sourceTrust"] = {**source_trust, "d1ManifestSha256": d1_manifest_sha256}
    write_canonical_json_atomic(evidence_path, sealed)


def write_canonical_json_atomic(path: Path, value: dict) -> None:
    payload = (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        Path(temp_name).unlink(missing_ok=True)


def value_after(flag: str) -> str:
    matches = [index for index, value in enumerate(sys.argv[1:], start=1) if value == flag]
    if len(matches) != 1 or matches[0] + 1 >= len(sys.argv):
        raise RuntimeError(f"exactly one {flag} argument is required")
    value = sys.argv[matches[0] + 1]
    if value.startswith("--"):
        raise RuntimeError(f"{flag} value is missing")
    return value


def safe_seed_after(flag: str) -> int:
    raw = value_after(flag)
    if not CANONICAL_DECIMAL.fullmatch(raw):
        raise RuntimeError(f"{flag} must be a canonical non-negative decimal integer")
    value = int(raw, 10)
    if value > MAX_SAFE_INTEGER:
        raise RuntimeError(f"{flag} exceeds JavaScript safe-integer limit")
    return value


def flag_once(flag: str) -> bool:
    count = sum(1 for value in sys.argv[1:] if value == flag)
    if count > 1:
        raise RuntimeError(f"{flag} may be supplied at most once")
    return count == 1


if __name__ == "__main__":
    main()
