#!/usr/bin/env python3
"""Strict public entrypoint for the F5b.1 D2c offline conditioning builder."""
from __future__ import annotations

import json
import runpy
import sys
import tempfile
from pathlib import Path

IMPL = Path(__file__).with_name("_kandinsky-conditioning-builder-impl.py")
COMPOSER = Path(__file__).with_name("kandinsky-conditioning-compose-c.py")
C_ID = "C_PRESERVATION_EXPLICIT_NEGATIVE"


def main() -> None:
    prior_root = value_after("--prior-root")
    d1_manifest = value_after("--d1-manifest")
    prompt_contract_path = value_after("--prompt-contract")
    output_dir = value_after("--output-dir")
    verify_only = "--verify-only" in sys.argv[1:]
    prompt_contract = read_json_real_file(Path(prompt_contract_path), "D2b prompt contract")
    candidate_id = prompt_contract.get("candidateId")
    positive_manifest = optional_value_after("--positive-source-manifest")
    positive_bundle = optional_value_after("--positive-source-bundle")

    validate_sealed_prior(Path(prior_root), Path(d1_manifest))
    if candidate_id == C_ID and not verify_only:
        if positive_manifest is None or positive_bundle is None:
            raise RuntimeError("candidate C requires --positive-source-manifest and --positive-source-bundle")
        run_c_composed_build(output_dir, positive_manifest, positive_bundle)
        return
    if positive_manifest is not None or positive_bundle is not None:
        raise RuntimeError("positive-source arguments are allowed only for a non-verify candidate C build")
    run_impl(strip_positive_source_args(sys.argv))


def run_c_composed_build(output_dir: str, positive_manifest: str, positive_bundle: str) -> None:
    with tempfile.TemporaryDirectory(prefix="bers-kandinsky-d2c-raw-") as temp_dir:
        raw_argv = strip_positive_source_args(sys.argv)
        raw_argv = replace_arg(raw_argv, "--output-dir", temp_dir)
        run_impl(raw_argv)
        raw_bundle = Path(temp_dir) / f"{C_ID}.conditioning.safetensors"
        raw_evidence = Path(temp_dir) / f"{C_ID}.builder-evidence.json"
        composer_argv = [
            str(COMPOSER),
            "--positive-source-manifest", positive_manifest,
            "--positive-source-bundle", positive_bundle,
            "--raw-c-bundle", str(raw_bundle),
            "--raw-c-evidence", str(raw_evidence),
            "--output-dir", output_dir,
        ]
        run_script(COMPOSER, composer_argv)


def run_impl(argv: list[str]) -> None:
    run_script(IMPL, argv)


def run_script(path: Path, argv: list[str]) -> None:
    previous = sys.argv
    sys.argv = argv
    try:
        try:
            runpy.run_path(str(path), run_name="__main__")
        except SystemExit as exc:
            if exc.code not in (None, 0):
                raise
    finally:
        sys.argv = previous


def validate_sealed_prior(root_input: Path, d1_path: Path) -> None:
    root = root_input
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError("D2c prior root must be a real non-symlink directory")
    root = root.resolve(strict=True)
    if d1_path.is_symlink() or not d1_path.is_file():
        raise RuntimeError("D2c D1 manifest must be a real file")
    d1 = json.loads(d1_path.read_text(encoding="utf-8"))
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


def read_json_real_file(path: Path, label: str) -> dict:
    if path.is_symlink() or not path.is_file():
        raise RuntimeError(f"{label} must be a real non-symlink file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"{label} is invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be an object")
    return value


def value_after(flag: str) -> str:
    value = optional_value_after(flag)
    if value is None:
        raise RuntimeError(f"exactly one {flag} argument is required")
    return value


def optional_value_after(flag: str) -> str | None:
    matches = [index for index, value in enumerate(sys.argv[1:], start=1) if value == flag]
    if not matches:
        return None
    if len(matches) != 1 or matches[0] + 1 >= len(sys.argv):
        raise RuntimeError(f"exactly one {flag} argument is allowed")
    value = sys.argv[matches[0] + 1]
    if value.startswith("--"):
        raise RuntimeError(f"{flag} value is missing")
    return value


def strip_positive_source_args(argv: list[str]) -> list[str]:
    result = list(argv)
    for flag in ("--positive-source-manifest", "--positive-source-bundle"):
        while flag in result:
            index = result.index(flag)
            if index + 1 >= len(result):
                raise RuntimeError(f"{flag} value is missing")
            del result[index:index + 2]
    return result


def replace_arg(argv: list[str], flag: str, value: str) -> list[str]:
    result = list(argv)
    matches = [index for index, item in enumerate(result) if item == flag]
    if len(matches) != 1 or matches[0] + 1 >= len(result):
        raise RuntimeError(f"exactly one {flag} argument is required")
    result[matches[0] + 1] = value
    return result


if __name__ == "__main__":
    main()
