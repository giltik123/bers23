#!/usr/bin/env python3
"""Create a deliberately restricted, non-deployable parserless FASHN VTON R&D copy.

No weights are downloaded and no upstream files are changed. The builder
rejects unknown upstream SHA/source changes rather than blindly patching
unreviewed releases.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess

UPSTREAM_COMMIT = "7c0f10af3f91ad4048fe9729c470a13ef905d25a"
UPSTREAM_BLOBS = {
    "src/fashn_vton/pipeline.py": "16f69bafd24cd52c9e28d2a701a77b158a8b0108",
    "src/fashn_vton/preprocessing/__init__.py": "635d4ec524359caa9e33c839ec5c4dee245c92c4",
    "src/fashn_vton/preprocessing/agnostic.py": "09f864fae9d9d31931830a39684b8ae47b19503f",
    "scripts/download_weights.py": "4acf26aa33b9d9ad77f107af301d8e4110e69f59",
    "scripts/debug_masks.py": "64e1bfc1b00ee8f7a30acf63c022390e15e32777",
    "pyproject.toml": "80338675e2ef107e92cba49326320970dd457837",
}

RESEARCH_README = """# BERS Fashion AI — parserless FASHN VTON v1.5 R&D copy

NOT FOR PRODUCTION OR CUSTOMER IMAGES. NOT AN ADMITTED BERS EXECUTOR.

Source: https://github.com/fashn-AI/fashn-vton-1.5
Exact source commit: 7c0f10af3f91ad4048fe9729c470a13ef905d25a
Upstream main model: Apache-2.0. DWPose: upstream describes Apache-2.0.
Keep LICENSE, notices, provenance and review downstream dependencies.

Supported pilot ONLY: segmentation_free=True, garment_photo_type="flat-lay",
and category in tops/bottoms/one-pieces.
The person's photograph and flat-lay garment RGB go directly to the original
image/pose/tensor transforms. We omit human parsing and its masked processing.

This is a conservative experimental fork. It makes NO claim of equivalent
model quality, certified full-dependency commercial license, or GPU inference
on a target machine. Bring reviewed model/DWPose weights independently and
test local inference only after license and source attestation. No networked
weights loader or HTTP/BERS integration is supplied.

Disallowed: masking, model-worn garment inputs, arbitrary parsing masks,
opaque replacement parsers, browser provider calls and production finalization.

The upstream README (historical instructions, including human parser) is
preserved separately for attribution as THIRD_PARTY_UPSTREAM_README.md.
"""

GUARD = """def _bers_require_parserless_input(*, segmentation_free: bool, garment_photo_type: str) -> None:
    # The only pilot route for which source RGB requires no human-parser labels.
    if segmentation_free is not True or garment_photo_type != "flat-lay":
        raise ValueError(
            "BERS FASHN R&D only supports segmentation_free=True and "
            "garment_photo_type='flat-lay'; all other inputs require a "
            "separately licensed and validated segmentation pipeline"
        )


"""


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def replace_exact(value: str, old: str, new: str, label: str) -> str:
    occurrences = value.count(old)
    if occurrences != 1:
        raise ValueError(f"{label}: expected exactly one source anchor, found {occurrences}")
    return value.replace(old, new)


def produce(upstream: Path, output: Path) -> None:
    upstream = upstream.resolve(strict=True)
    output = output.resolve()
    if output == upstream or upstream in output.parents:
        raise ValueError("R&D output must be outside the upstream checkout")
    if output.exists():
        raise FileExistsError(f"Output must not exist: {output}")
    commit = subprocess.check_output(
        ["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True
    ).strip()
    if commit != UPSTREAM_COMMIT:
        raise ValueError(f"FASHN upstream must be pinned to {UPSTREAM_COMMIT}, not {commit}")
    dirty = subprocess.check_output(
        ["git", "-C", str(upstream), "status", "--porcelain"], text=True
    ).strip()
    if dirty:
        raise ValueError("FASHN upstream checkout must be clean")
    for rel, blob in UPSTREAM_BLOBS.items():
        actual = git_blob_sha(upstream / rel)
        if actual != blob:
            raise ValueError(f"FASHN upstream byte mismatch: {rel}")
    if not (upstream / "LICENSE").is_file():
        raise ValueError("FASHN upstream LICENSE must be retained")

    shutil.copytree(
        upstream, output, ignore=shutil.ignore_patterns(
            ".git", "__pycache__", ".venv", "weights", "outputs", ".cache"
        )
    )
    try:
        pipeline_path = output / "src/fashn_vton/pipeline.py"
        pipeline = pipeline_path.read_text(encoding="utf8")
        pipeline = replace_exact(
            pipeline,
            "from fashn_human_parser import CATEGORY_TO_BODY_COVERAGE, FashnHumanParser\n",
            "",
            "parser import",
        )
        for name in (
            "BODY_COVERAGE_TO_FASHN_LABELS",
            "FASHN_LABELS_TO_IDS",
            "create_clothing_agnostic_image",
            "create_garment_image",
        ):
            pipeline = replace_exact(pipeline, f"    {name},\n", "", f"unused {name} import")
        pipeline = replace_exact(pipeline, "        self._setup_hp_model()\n", "", "parser initialization")
        parser_start = "    def _setup_hp_model(self):\n"
        parser_end = "    @torch.inference_mode()\n    def _sample("
        if pipeline.count(parser_start) != 1 or pipeline.count(parser_end) != 1:
            raise ValueError("Parser setup method boundaries changed")
        a = pipeline.index(parser_start)
        b = pipeline.index(parser_end)
        if a >= b:
            raise ValueError("Parser setup method moved unexpectedly")
        pipeline = pipeline[:a] + pipeline[b:]
        pipeline = replace_exact(
            pipeline,
            "@dataclass\nclass PipelineOutput:",
            GUARD + "@dataclass\nclass PipelineOutput:",
            "parserless input guard",
        )
        pipeline = replace_exact(
            pipeline,
            "        # Set seed\n",
            "        _bers_require_parserless_input(\n"
            "            segmentation_free=segmentation_free,\n"
            "            garment_photo_type=garment_photo_type,\n"
            "        )\n"
            "        if category not in self.CATEGORY_TO_LABEL:\n"
            "            raise ValueError('Unsupported BERS garment category')\n"
            "        # Set seed\n",
            "input preflight",
        )
        begin, end = "        # Human parsing\n", "        # Resize/pad for model input\n"
        if pipeline.count(begin) != 1 or pipeline.count(end) != 1:
            raise ValueError("Human parser preprocessing boundaries changed")
        a, b = pipeline.index(begin), pipeline.index(end)
        if a >= b:
            raise ValueError("Human parser preprocessing moved unexpectedly")
        pipeline = pipeline[:a] + (
            "        # BERS parserless pilot: both inputs stay RGB, with no\n"
            "        # segmentation labels or masking. The original pose/model\n"
            "        # tensor transformations below are retained unchanged.\n"
            "        ca_image = person_image_np.copy()\n"
            "        garment_image_processed = garment_image_np.copy()\n\n"
        ) + pipeline[b:]
        if "fashn_human_parser" in pipeline or "self.hp_model" in pipeline:
            raise ValueError("Human Parser dependency remains after transformation")
        pipeline_path.write_text(pipeline, encoding="utf8")

        # Do not even import the parser-dependent preprocessing package.
        preproc = output / "src/fashn_vton/preprocessing/__init__.py"
        preproc.write_text(
            '"""BERS parserless R&D preprocessing: image transforms only."""\n'
            "from .transforms import AspectPreserveResize, PadToShape, ResizePad\n"
            "__all__ = ['AspectPreserveResize', 'ResizePad', 'PadToShape']\n",
            encoding="utf8",
        )

        pyproject_path = output / "pyproject.toml"
        pyproject = pyproject_path.read_text(encoding="utf8")
        pyproject = replace_exact(
            pyproject, '    "fashn-human-parser>=0.1.1",\n', "",
            "third-party noncommercial parser dependency",
        )
        pyproject = replace_exact(
            pyproject, 'name = "fashn-vton"\n',
            'name = "bers-fashn-vton-maskless-rnd"\n', "R&D package identity"
        )
        pyproject_path.write_text(pyproject, encoding="utf8")

        # Remove inactive parser/masked code and upstream scripts that would
        # download restricted weights; retain the upstream license.
        for rel in (
            "src/fashn_vton/preprocessing/agnostic.py",
            "src/fashn_vton/preprocessing/masks.py",
            "scripts/download_weights.py",
            "scripts/debug_masks.py",
            "examples/basic_inference.py",
        ):
            p = output / rel
            if p.exists():
                p.unlink()
        (output / "README.md").rename(output / "THIRD_PARTY_UPSTREAM_README.md")
        (output / "README.md").write_text(RESEARCH_README, encoding="utf8")

        for p in (output / "src").rglob("*.py"):
            if "fashn_human_parser" in p.read_text(encoding="utf8"):
                raise ValueError(f"Disallowed parser import remains: {p}")
    except Exception:
        shutil.rmtree(output)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    produce(args.upstream, args.out)
    print("PASS: pinned, parserless flat-lay R&D source copy produced; no weights or runtime admission")
