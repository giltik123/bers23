#!/usr/bin/env python3
"""Patch exactly pinned FASHN VTON 1.5 into an isolated BERS SCHP-ATR R&D fork.

No production wiring, no weight downloads, no license approval. Refuses a
dirty checkout, unexpected upstream revision or changed source APIs.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

FASHN_REVISION = "7c0f10af3f91ad4048fe9729c470a13ef905d25a"
PARSER_SOURCE = Path(__file__).resolve().with_name("bers_human_parser.py")

def replace_once(text: str, old: str, new: str, file: str) -> str:
    if text.count(old) != 1:
        raise ValueError(f"{file}: exact upstream anchor missing or ambiguous")
    return text.replace(old, new, 1)

def patch_files(upstream: Path, parser_source: Path = PARSER_SOURCE) -> list[str]:
    """File-only transform, separately testable on disposable fixtures."""
    pipeline = upstream / "src/fashn_vton/pipeline.py"
    agnostic = upstream / "src/fashn_vton/preprocessing/agnostic.py"
    pyproject = upstream / "pyproject.toml"
    downloader = upstream / "scripts/download_weights.py"
    debug_masks = upstream / "scripts/debug_masks.py"
    mandatory = [pipeline, agnostic, pyproject, downloader, debug_masks]
    if not all(p.is_file() and not p.is_symlink() for p in mandatory):
        raise ValueError("Pinned FASHN checkout layout is incomplete or symlink-substituted")

    sources = {p: p.read_text(encoding="utf-8") for p in mandatory}
    sources[pipeline] = replace_once(
        sources[pipeline],
        "from fashn_human_parser import CATEGORY_TO_BODY_COVERAGE, FashnHumanParser",
        "from .bers_human_parser import CATEGORY_TO_BODY_COVERAGE, BersSchpAtrParser",
        pipeline.name,
    )
    sources[pipeline] = replace_once(
        sources[pipeline],
        "self.hp_model = FashnHumanParser(device=hp_device)",
        "self.hp_model = BersSchpAtrParser(weights_dir=self.weights_dir, device=hp_device)",
        pipeline.name,
    )
    sources[agnostic] = replace_once(
        sources[agnostic],
        "from fashn_human_parser import BODY_COVERAGE_TO_LABELS, IDENTITY_LABELS, LABELS_TO_IDS",
        "from ..bers_human_parser import BODY_COVERAGE_TO_LABELS, IDENTITY_LABELS, LABELS_TO_IDS",
        agnostic.name,
    )
    sources[pyproject] = replace_once(
        sources[pyproject], '    "fashn-human-parser>=0.1.1",\n', "", pyproject.name,
    )

    original = sources[downloader]
    begin = original.find("def download_human_parser() -> None:")
    end = original.find("def main()", begin)
    if begin < 0 or end < begin or original.count("download_human_parser()") != 2:
        raise ValueError("download_weights.py: unrecognized parser downloader")
    original = original[:begin] + original[end:]
    original = replace_once(
        original, "    download_human_parser()\n",
        "    print('SCHP ATR ONNX checkpoint must be provisioned manually after model/license review.')\n",
        downloader.name,
    )
    original = original.replace("    - FashnHumanParser weights (auto-cached by HuggingFace)", "    - SCHP checkpoint must be separately provisioned and SHA-verified")
    if "fashn_human_parser" in original or "FashnHumanParser" in original:
        raise ValueError("Legacy human-parser loader remains")
    sources[downloader] = original
    if not parser_source.is_file():
        raise ValueError("Missing BERS SCHP adapter")
    replacement = upstream / "src/fashn_vton/bers_human_parser.py"
    if replacement.exists():
        raise ValueError("BersSchpAtrParser already present; patch must be one-shot")
    # A second script (debug_masks) directly imports the restricted package.
    # Remove it rather than accidentally leave a back-door dependency.
    if "fashn_human_parser" not in sources[debug_masks] and "FashnHumanParser" not in sources[debug_masks]:
        raise ValueError("Unexpected debug masks script: no known parser import")

    # Fully preflight the original Python sources before mutating anything.
    for p, text in sources.items():
        if p == debug_masks:
            continue
        if "fashn_human_parser" in text or "fashn-human-parser" in text or "FashnHumanParser" in text:
            raise ValueError(f"Restricted FASHN parser dependency remains in {p}")

    for p in [pipeline, agnostic, pyproject, downloader]:
        p.write_text(sources[p], encoding="utf-8")
    shutil.copyfile(parser_source, replacement)
    debug_masks.unlink()
    return [str(x.relative_to(upstream)) for x in [pipeline, agnostic, pyproject, downloader, replacement, debug_masks]]

def patch_verified_checkout(upstream: Path) -> list[str]:
    upstream = upstream.resolve(strict=True)
    def git(*args: str) -> str:
        return subprocess.check_output(["git", "-C", str(upstream), *args], text=True).strip()
    if git("rev-parse", "--show-toplevel") != str(upstream):
        raise ValueError("Patch target must be the exact upstream repository root")
    if git("rev-parse", "HEAD") != FASHN_REVISION:
        raise ValueError("Upstream commit differs from exact approved research SHA")
    if git("status", "--porcelain"):
        raise ValueError("Upstream checkout must be clean before patching")
    return patch_files(upstream)

if __name__ == "__main__":
    cli = argparse.ArgumentParser(description="Patch an exact-revision local FASHN checkout for SCHP-ATR R&D only")
    cli.add_argument("--upstream", required=True, type=Path, help="Already cloned, clean, exact-revision upstream repository")
    args = cli.parse_args()
    for changed in patch_verified_checkout(args.upstream):
        print(f"patched: {changed}")
    print("R&D ONLY: parser model weight/license and FASHN accuracy gates are NOT approved.")
