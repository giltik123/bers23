#!/usr/bin/env python3
"""Build a non-production, parser-free FASHN VTON 1.5 research package.

Input: clean checkout of one strictly pinned upstream source commit.
Output: small modified source package, without model weights or runtime authority.

Copyright for upstream files remains with their authors under Apache-2.0.
This builder is BERS-owned and does NOT grant commercial approval for a stack.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

SOURCE_URL = "https://github.com/fashn-AI/fashn-vton-1.5"
SOURCE_SHA = "7c0f10af3f91ad4048fe9729c470a13ef905d25a"
SOURCE_BLOBS = {
    "src/fashn_vton/pipeline.py": "16f69bafd24cd52c9e28d2a701a77b158a8b0108",
    "src/fashn_vton/preprocessing/__init__.py": "635d4ec524359caa9e33c839ec5c4dee245c92c4",
    "pyproject.toml": "80338675e2ef107e92cba49326320970dd457837",
}
MODEL_SHA256 = "d6cd38286885bc29fa487ea9383f80ffeb95862e7747c630d42c5d3c05bdd35a"


def fail(message: str) -> None:
    raise ValueError(message)


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(root), *args], text=True, stderr=subprocess.STDOUT
    ).strip()


def assert_clean_pinned_checkout(root: Path) -> None:
    if not root.is_dir():
        fail("FASHN upstream checkout directory does not exist")
    if git(root, "rev-parse", "HEAD") != SOURCE_SHA:
        fail("FASHN upstream HEAD differs from the reviewed exact commit")
    if git(root, "status", "--porcelain", "--untracked-files=all"):
        fail("FASHN upstream checkout is not clean")
    if git(root, "remote", "get-url", "origin").removesuffix(".git").lower().rstrip("/") != SOURCE_URL.lower():
        fail("FASHN upstream origin is not the reviewed repository")
    for rel, expected in SOURCE_BLOBS.items():
        source = root / rel
        if not source.is_file() or source.is_symlink():
            fail(f"Missing or linked pinned source file: {rel}")
        data = source.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual != expected:
            fail(f"FASHN upstream source blob SHA mismatch: {rel}")
    if not (root / "LICENSE").is_file():
        fail("Upstream Apache-2.0 LICENSE must be present")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if content.count(old) != 1:
        fail(f"Unexpected upstream source drift in {label}")
    return content.replace(old, new, 1)


def patch_pipeline(src: str) -> str:
    src = replace_once(
        src,
        "from fashn_human_parser import CATEGORY_TO_BODY_COVERAGE, FashnHumanParser\n",
        "",
        "parser import",
    )
    start = src.index("from .preprocessing import (\n")
    end = src.index(")\n", start) + 2
    old_imports = src[start:end]
    for name in ("AspectPreserveResize", "ResizePad", "create_garment_image"):
        if name not in old_imports:
            fail(f"Missing expected upstream import: {name}")
    src = replace_once(
        src, old_imports,
        "from .preprocessing import AspectPreserveResize, ResizePad\n",
        "preprocessing imports",
    )
    src = replace_once(
        src,
        "        self._setup_hp_model()\n",
        "        # Human Parser intentionally absent in restricted BERS R&D mode.\n",
        "parser setup call",
    )
    start = src.index("    def _setup_hp_model(self):\n")
    end = src.index("    @torch.inference_mode()\n", start)
    src = replace_once(src, src[start:end], "", "parser setup method")
    src = replace_once(
        src, "        # Set seed\n",
        '        # Fail before pose/model inference on all unsupported modes.\n'
        '        if segmentation_free is not True or garment_photo_type != "flat-lay":\n'
        '            raise ValueError("BERS R&D supports only segmentation_free=True with flat-lay garments")\n'
        '        # Set seed\n',
        "early mode boundary",
    )
    start = src.index("        # Human parsing\n")
    end = src.index("        # Resize/pad for model input\n", start)
    src = replace_once(
        src, src[start:end],
        '        # Parserless path: by upstream semantics the person is unchanged\n'
        '        # when segmentation_free=True, and flat-lay garment is unchanged.\n'
        '        ca_image = person_image_np.copy()\n'
        '        garment_image_processed = garment_image_np.copy()\n\n',
        "parserless preprocessing",
    )
    if "FashnHumanParser" in src or "fashn_human_parser" in src or "hp_model" in src:
        fail("Human Parser survived pipeline patch")
    return src


def build(upstream: Path, dest: Path) -> None:
    upstream = upstream.resolve()
    dest = dest.resolve()
    if dest == upstream or upstream in dest.parents:
        fail("Output must not be inside the upstream source tree")
    if dest.exists():
        fail("Output already exists; refusing to overwrite it")
    assert_clean_pinned_checkout(upstream)
    for file in (upstream / "src/fashn_vton").rglob("*"):
        if file.is_symlink():
            fail("Refusing upstream symbolic links in runtime source")
    dest.mkdir(parents=True, exist_ok=False)
    try:
        shutil.copytree(upstream / "src/fashn_vton", dest / "src/fashn_vton")
        shutil.copy2(upstream / "pyproject.toml", dest / "pyproject.toml")
        shutil.copy2(upstream / "LICENSE", dest / "LICENSE")
        notice = upstream / "NOTICE"
        if notice.exists():
            shutil.copy2(notice, dest / "NOTICE.upstream")
        pkg = dest / "src/fashn_vton"
        pipeline = pkg / "pipeline.py"
        pipeline.write_text(patch_pipeline(pipeline.read_text(encoding="utf-8")), encoding="utf-8")
        preprocess = pkg / "preprocessing"
        (preprocess / "agnostic.py").unlink()
        (preprocess / "__init__.py").write_text(
            '"""Restricted parser-free BERS R&D preprocessing exports."""\n'
            "from .transforms import AspectPreserveResize, PadToShape, ResizePad\n"
            '__all__ = ["AspectPreserveResize", "PadToShape", "ResizePad"]\n',
            encoding="utf-8",
        )
        project = dest / "pyproject.toml"
        project.write_text(replace_once(
            project.read_text(encoding="utf-8"),
            '    "fashn-human-parser>=0.1.1",\n',
            "",
            "dependency removal",
        ), encoding="utf-8")
        for py in dest.rglob("*.py"):
            contents = py.read_text(encoding="utf-8")
            if "fashn_human_parser" in contents or "fashn-human-parser" in contents:
                fail(f"Unexpected Human Parser dependency in {py.relative_to(dest)}")
        (dest / "BERS_PROVENANCE.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "upstream": SOURCE_URL,
                "upstreamCommit": SOURCE_SHA,
                "sourceBlobGitSha1": SOURCE_BLOBS,
                "fashnModelSafetensorsSha256": MODEL_SHA256,
                "mode": {
                    "segmentationFree": True, "garmentPhotoType": "flat-lay",
                    "categories": ["tops", "bottoms", "one-pieces"],
                },
                "humanParserIncluded": False,
                "weightsIncluded": False,
                "modelRunProven": False,
                "commercialStackLicenseApproved": False,
                "productionExecutable": False,
                "runtimeAuthorityGranted": False,
            }, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        (dest / "README_BERS.md").write_text(
            "# BERS Fashion AI FASHN VTON 1.5 research slice\n\n"
            "Modified from FASHN AI's Apache-2.0 source; see LICENSE and BERS_PROVENANCE.json.\n"
            "This is an offline research-only build with NO weights or production admission.\n"
            "Only person-photo + **flat-lay** garment and **segmentation_free=True** are allowed.\n"
            "Unsupported masked / model-worn garment paths **raise** before inference.\n"
            "No Human Parser dependency, parser weights, or automatic downloads are included.\n"
            "This change has NOT passed GPU inference, quality, DWPose artifact license review,\n"
            "independent Core ownership checks, or product legal clearance.\n"
            "Preserve upstream Apache-2.0 license and copyright notices.\n",
            encoding="utf-8",
        )
    except BaseException:
        shutil.rmtree(dest)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        build(args.upstream_dir, args.output_dir)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"FAIL_CLOSED: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    print(f"PASS: parserless R&D source generated from {SOURCE_SHA}; no runtime/production authority")
