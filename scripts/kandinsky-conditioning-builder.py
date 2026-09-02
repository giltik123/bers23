#!/usr/bin/env python3
"""Strict public entrypoint for the F5b.1 D2c offline conditioning builder."""
from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path

IMPL = Path(__file__).with_name("_kandinsky-conditioning-builder-impl.py")


def main() -> None:
    prior_root = value_after("--prior-root")
    d1_manifest = value_after("--d1-manifest")
    root = Path(prior_root)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError("D2c prior root must be a real non-symlink directory")
    root = root.resolve(strict=True)
    d1_path = Path(d1_manifest)
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

    sys.argv[0] = str(IMPL)
    runpy.run_path(str(IMPL), run_name="__main__")


def value_after(flag: str) -> str:
    matches = [index for index, value in enumerate(sys.argv[1:], start=1) if value == flag]
    if len(matches) != 1 or matches[0] + 1 >= len(sys.argv):
        raise RuntimeError(f"exactly one {flag} argument is required")
    value = sys.argv[matches[0] + 1]
    if value.startswith("--"):
        raise RuntimeError(f"{flag} value is missing")
    return value


if __name__ == "__main__":
    main()
