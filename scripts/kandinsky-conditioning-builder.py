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
from typing import Any

IMPL = Path(__file__).with_name("_kandinsky-conditioning-builder-impl.py")
MAX_SAFE_INTEGER = 9_007_199_254_740_991
CANONICAL_DECIMAL = re.compile(r"^(?:0|[1-9][0-9]*)$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
D1_MANIFEST_PATH = "src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json"
CONDITIONING_SCHEMA_VERSION = 2
CONDITIONING_STAGE = "F5B1_D2_CONDITIONING_RESEARCH"
B_CANDIDATE_ID = "B_REALISM_ZERO_NEGATIVE"
B_CONTRACT_SHA256 = "d0dc3f97e84e7439c063f5fbcb1c3eae9b668c3d84dd8adfa1ed116837e3f175"
HISTORICAL_PIPELINE = {
    "diffusersRevision": "746215670a61af1034c470d0b6555be9c60cb7b6",
    "pipelineClass": "KandinskyV22PriorPipeline",
    "numImagesPerPrompt": 1,
    "numInferenceSteps": 25,
    "guidanceScale": 4,
    "outputType": "pt",
}


def main() -> None:
    prior_root = value_after("--prior-root")
    d1_manifest = value_after("--d1-manifest")
    prompt_contract = value_after("--prompt-contract")
    toolchain_lock_path = value_after("--toolchain-lock")
    output_dir = value_after("--output-dir")
    seed = safe_seed_after("--seed")
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

    toolchain_path = Path(toolchain_lock_path)
    if toolchain_path.is_symlink() or not toolchain_path.is_file():
        raise RuntimeError("D2c toolchain lock must be a real file")
    try:
        toolchain_lock = json.loads(toolchain_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"D2c toolchain lock is invalid UTF-8/JSON: {exc}") from exc
    if not isinstance(toolchain_lock, dict):
        raise RuntimeError("D2c toolchain lock must be an object")

    prevalidate_positive_source(
        d1=d1,
        d1_manifest_sha256=d1_sha256,
        prompt=prompt,
        toolchain_lock=toolchain_lock,
        seed=seed,
        manifest_arg=optional_value_after("--positive-source-manifest"),
        bundle_arg=optional_value_after("--positive-source-bundle"),
    )

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

    with tempfile.TemporaryDirectory(prefix="bers-kandinsky-d2c-d1-") as snapshot_dir:
        d1_snapshot = Path(snapshot_dir) / "d1.manifest.json"
        write_exact_file(d1_snapshot, d1_bytes)
        replace_arg_value("--d1-manifest", str(d1_snapshot))
        sys.argv[0] = str(IMPL)
        try:
            runpy.run_path(str(IMPL), run_name="__main__")
        except SystemExit as exc:
            if exc.code not in (None, 0):
                raise
        finally:
            replace_arg_value("--d1-manifest", str(d1_path))

    if not verify_only:
        seal_builder_evidence(Path(output_dir), candidate_id, d1_sha256)


def prevalidate_positive_source(*, d1: dict, d1_manifest_sha256: str, prompt: dict, toolchain_lock: dict, seed: int, manifest_arg: str | None, bundle_arg: str | None) -> None:
    if not SHA256.fullmatch(d1_manifest_sha256):
        raise RuntimeError("current D1 manifest SHA-256 is invalid")
    expected_source = prompt.get("positiveEmbeddingSourceCandidateId")
    if expected_source is None:
        if manifest_arg is not None or bundle_arg is not None:
            raise RuntimeError("independent D2c candidate forbids positive source manifest/bundle")
        return
    if expected_source != B_CANDIDATE_ID:
        raise RuntimeError("D2c positive source candidate is outside the accepted B-to-C contract")
    if not manifest_arg or not bundle_arg:
        raise RuntimeError("C candidate requires both positive source manifest and bundle")

    manifest_path = real_regular_file(Path(manifest_arg), "positive source manifest")
    bundle_path = real_regular_file(Path(bundle_arg), "positive source bundle")
    raw_manifest = manifest_path.read_bytes()
    try:
        manifest = json.loads(raw_manifest.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"positive source manifest is invalid UTF-8/JSON: {exc}") from exc
    if not isinstance(manifest, dict):
        raise RuntimeError("positive source manifest must be an object")
    if raw_manifest != canonical_json_bytes(manifest):
        raise RuntimeError("positive source manifest bytes are not canonical JSON")

    expected_root_keys = {
        "schemaVersion", "stage", "status", "productionExecutable", "runtimeAuthorityGranted",
        "priorRuntimeDependencyAllowed", "sourceTrust", "historicalPipeline", "toolchain", "determinism",
        "conditioning", "bundle",
    }
    if set(manifest) != expected_root_keys:
        raise RuntimeError("positive source manifest root schema is open or incomplete")
    if manifest.get("schemaVersion") != CONDITIONING_SCHEMA_VERSION or manifest.get("stage") != CONDITIONING_STAGE or manifest.get("status") != "RESEARCH_CANDIDATE":
        raise RuntimeError("positive source manifest stage/status mismatch")
    if manifest.get("productionExecutable") is not False or manifest.get("runtimeAuthorityGranted") is not False or manifest.get("priorRuntimeDependencyAllowed") is not False:
        raise RuntimeError("positive source manifest escaped research-only authority")

    prior = d1.get("offlinePrior") or {}
    expected_source_trust = {
        "d1ManifestPath": D1_MANIFEST_PATH,
        "d1ManifestSha256": d1_manifest_sha256,
        "d1ModelId": d1.get("modelId"),
        "d1Version": d1.get("version"),
        "priorRepository": prior.get("repository"),
        "priorRevision": prior.get("revision"),
        "priorSafeWeights": prior.get("safeWeights"),
        "priorConfigFiles": (prior.get("requiredConfigIdentity") or {}).get("files"),
    }
    if manifest.get("sourceTrust") != expected_source_trust:
        raise RuntimeError("positive source manifest is not bound to the exact D1 prior identity")
    if manifest.get("historicalPipeline") != HISTORICAL_PIPELINE:
        raise RuntimeError("positive source manifest historical prior semantics mismatch")

    expected_toolchain_keys = {
        "schemaVersion", "status", "containerImageDigest", "pythonVersion", "diffusersVersion", "torchVersion",
        "transformersVersion", "numpyVersion", "safetensorsVersion", "platformMachine",
    }
    if set(toolchain_lock) != expected_toolchain_keys or toolchain_lock.get("schemaVersion") != 1 or toolchain_lock.get("status") != "TESTED_EXACT":
        raise RuntimeError("D2c toolchain lock is not the accepted tested-exact schema")
    expected_toolchain = {key: toolchain_lock[key] for key in expected_toolchain_keys - {"schemaVersion", "status"}}
    if manifest.get("toolchain") != expected_toolchain:
        raise RuntimeError("positive source manifest toolchain differs from current C build")

    expected_determinism = {
        "device": "cpu",
        "outputDtype": "float32",
        "torchDeterministicAlgorithms": True,
        "numThreads": 1,
        "numInteropThreads": 1,
        "ompNumThreads": 1,
        "mklNumThreads": 1,
        "seed": seed,
        "generatorPolicy": "TORCH_CPU_GENERATOR_SINGLE_SEED",
        "latentPolicy": "NO_EXTERNAL_LATENTS_PIPELINE_RANDN",
    }
    if manifest.get("determinism") != expected_determinism:
        raise RuntimeError("positive source manifest determinism/seed differs from current C build")

    conditioning = manifest.get("conditioning")
    if not isinstance(conditioning, dict) or set(conditioning) != {"candidateId", "conditioningContractSha256", "negativeMode", "positiveEmbeddingSource"}:
        raise RuntimeError("positive source conditioning schema is open or incomplete")
    if conditioning != {
        "candidateId": B_CANDIDATE_ID,
        "conditioningContractSha256": B_CONTRACT_SHA256,
        "negativeMode": "HISTORICAL_ZERO_IMAGE",
        "positiveEmbeddingSource": None,
    }:
        raise RuntimeError("positive source manifest is not the accepted independent B conditioning identity")

    bundle = manifest.get("bundle")
    if not isinstance(bundle, dict):
        raise RuntimeError("positive source bundle identity is missing")
    expected_size = bundle.get("size")
    expected_sha = bundle.get("sha256")
    if not isinstance(expected_size, int) or expected_size < 1 or not isinstance(expected_sha, str) or not SHA256.fullmatch(expected_sha):
        raise RuntimeError("positive source bundle identity is malformed")
    if bundle_path.stat().st_size != expected_size or sha256_file(bundle_path) != expected_sha:
        raise RuntimeError("positive source bundle bytes do not match canonical source manifest")


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


def real_regular_file(path: Path, label: str) -> Path:
    if path.is_symlink() or not path.is_file():
        raise RuntimeError(f"{label} must be a real non-symlink regular file")
    return path.resolve(strict=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def write_exact_file(path: Path, payload: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        path.unlink(missing_ok=True)
        raise


def write_canonical_json_atomic(path: Path, value: dict) -> None:
    payload = canonical_json_bytes(value)
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


def optional_value_after(flag: str) -> str | None:
    matches = [index for index, value in enumerate(sys.argv[1:], start=1) if value == flag]
    if not matches:
        return None
    if len(matches) != 1 or matches[0] + 1 >= len(sys.argv):
        raise RuntimeError(f"{flag} may be supplied at most once with a value")
    value = sys.argv[matches[0] + 1]
    if value.startswith("--"):
        raise RuntimeError(f"{flag} value is missing")
    return value


def replace_arg_value(flag: str, replacement: str) -> None:
    matches = [index for index, value in enumerate(sys.argv[1:], start=1) if value == flag]
    if len(matches) != 1 or matches[0] + 1 >= len(sys.argv):
        raise RuntimeError(f"exactly one {flag} argument is required")
    sys.argv[matches[0] + 1] = replacement


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
