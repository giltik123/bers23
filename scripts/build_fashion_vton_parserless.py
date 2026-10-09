#!/usr/bin/env python3
"""Build a pinned, offline-source FASHN v1.5 parserless R&D package.

Never downloads source/weights and never modifies the upstream checkout.
The output is research-only and is not a BERS production runtime.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

UPSTREAM_COMMIT = "7c0f10af3f91ad4048fe9729c470a13ef905d25a"
EXPECTED_BLOBS = {
    "pyproject.toml": "80338675e2ef107e92cba49326320970dd457837",
    "src/fashn_vton/pipeline.py": "16f69bafd24cd52c9e28d2a701a77b158a8b0108",
    "src/fashn_vton/preprocessing/__init__.py": "635d4ec524359caa9e33c839ec5c4dee245c92c4",
    "src/fashn_vton/preprocessing/agnostic.py": "09f864fae9d9d31931830a39684b8ae47b19503f",
    "LICENSE": "2a35f0c24ccd9ce4e4031ab1ff835b4e7dd5b904",
    "src/fashn_vton/utils/checkpoint.py": "7155575d96debb10c9f7725a9d5f277cc2ae80d7",
}


def replace_one(contents: str, source: str, target: str) -> str:
    """Reject unexpected upstream changes, including repeated anchors."""
    if contents.count(source) != 1:
        raise ValueError(f"Expected one upstream anchor, found {contents.count(source)}: {source[:80]!r}")
    return contents.replace(source, target, 1)


def rewrite_pipeline(contents: str) -> str:
    contents = replace_one(
        contents,
        "from fashn_human_parser import CATEGORY_TO_BODY_COVERAGE, FashnHumanParser\n",
        "",
    )
    contents = replace_one(
        contents,
        "from .preprocessing import (\n"
        "    BODY_COVERAGE_TO_FASHN_LABELS,\n"
        "    FASHN_LABELS_TO_IDS,\n"
        "    AspectPreserveResize,\n"
        "    ResizePad,\n"
        "    create_clothing_agnostic_image,\n"
        "    create_garment_image,\n"
        ")\n",
        "from .preprocessing import AspectPreserveResize, ResizePad\n",
    )
    contents = replace_one(contents, "        self._setup_hp_model()\n", "")
    start = "    def _setup_hp_model(self):\n"
    end = "    @torch.inference_mode()\n    def _sample("
    if contents.count(start) != 1 or contents.count(end) != 1:
        raise ValueError("Unexpected parser method boundaries")
    head, tail = contents.split(start, 1)
    if end not in tail:
        raise ValueError("Missing sampling boundary")
    contents = head + end + tail.split(end, 1)[1]
    contents = replace_one(
        contents,
        "        # Set seed\n",
        "        # Research build: the original maskless/flat-lay dataflow only.\n"
        "        if category not in self.CATEGORY_TO_LABEL:\n"
        "            raise ValueError('Unsupported garment category')\n"
        "        if garment_photo_type != 'flat-lay' or segmentation_free is not True:\n"
        "            raise ValueError('Parserless research runtime only supports segmentation_free=True and flat-lay garments')\n"
        "        if not isinstance(num_samples, int) or isinstance(num_samples, bool) or not 1 <= num_samples <= 4:\n"
        "            raise ValueError('num_samples must be 1..4')\n"
        "        # Set seed\n",
    )
    start = "        # Human parsing\n"
    end = "        # Resize/pad for model input\n"
    if contents.count(start) != 1 or contents.count(end) != 1:
        raise ValueError("Unexpected parser processing block")
    head, tail = contents.split(start, 1)
    if end not in tail:
        raise ValueError("Missing resize boundary")
    contents = (
        head
        + "        # Original masking functions return these inputs unchanged in this mode.\n"
        + "        ca_image = person_image_np.copy()\n"
        + "        garment_image_processed = garment_image_np\n\n"
        + end
        + tail.split(end, 1)[1]
    )
    for forbidden in ("fashn_human_parser", "FashnHumanParser", "hp_model", "person_seg_pred", "garment_seg_pred"):
        if forbidden in contents:
            raise ValueError(f"Parser reference survived: {forbidden}")
    compile(contents, "pipeline.py", "exec")
    return contents


def rewrite_preprocessing(_: str) -> str:
    return (
        '"""Only preprocessing used by the parserless flat-lay research runtime."""\n'
        "from .transforms import AspectPreserveResize, PadToShape, ResizePad\n"
        '__all__ = ["AspectPreserveResize", "PadToShape", "ResizePad"]\n'
    )


def rewrite_pyproject(contents: str) -> str:
    contents = replace_one(contents, 'name = "fashn-vton"', 'name = "bers-vton-parserless-research"')
    contents = replace_one(contents, '    "fashn-human-parser>=0.1.1",\n', '')
    contents = replace_one(contents, '    "huggingface_hub>=0.20.0",\n', '')
    return contents


def rewrite_checkpoint(_: str) -> str:
    """Drop implicit HuggingFace fetch and unsafe pickle loading from runtime."""
    return (
        '"""Local safetensors-only checkpoint loading for BERS research."""\n'
        'from pathlib import Path\n'
        'from safetensors.torch import load_file\n'
        '\n'
        'def load_checkpoint(checkpoint_path: str, device: str = "cpu") -> dict:\n'
        '    path = Path(checkpoint_path)\n'
        '    if path.suffix != ".safetensors" or not path.is_file() or path.is_symlink():\n'
        '        raise ValueError("A local, regular .safetensors checkpoint is required")\n'
        '    return load_file(str(path), device=device)\n'
    )


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def verify_upstream(source: Path) -> None:
    try:
        revision = subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
        tracked_changes = subprocess.check_output(
            ["git", "-C", str(source), "status", "--porcelain", "--untracked-files=no"], text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError("Input must be a local, valid Git checkout") from exc
    if revision != UPSTREAM_COMMIT or tracked_changes:
        raise ValueError("Unpinned or modified FASHN upstream checkout")
    for relative, expected in EXPECTED_BLOBS.items():
        actual = git_blob_sha((source / relative).read_bytes())
        if actual != expected:
            raise ValueError(f"Upstream blob identity mismatch: {relative}")


def build(source: Path, target: Path) -> Path:
    source, target = source.resolve(), target.resolve()
    if target == source or source in target.parents or target in source.parents:
        raise ValueError("Output must be separate from upstream checkout")
    if target.exists():
        raise FileExistsError(f"Refusing to overwrite: {target}")
    verify_upstream(source)
    package = source / "src" / "fashn_vton"
    if not package.is_dir():
        raise ValueError("FASHN source package not found")
    try:
        shutil.copytree(package, target / "src" / "fashn_vton", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        pipeline_path = target / "src" / "fashn_vton" / "pipeline.py"
        pipeline_path.write_text(rewrite_pipeline(pipeline_path.read_text(encoding="utf-8")), encoding="utf-8")
        prep = target / "src" / "fashn_vton" / "preprocessing"
        init = prep / "__init__.py"
        init.write_text(rewrite_preprocessing(init.read_text(encoding="utf-8")), encoding="utf-8")
        (prep / "agnostic.py").unlink()
        (prep / "masks.py").unlink()
        ckpt = target / "src" / "fashn_vton" / "utils" / "checkpoint.py"
        ckpt.write_text(rewrite_checkpoint(ckpt.read_text(encoding="utf-8")), encoding="utf-8")
        (target / "pyproject.toml").write_text(
            rewrite_pyproject((source / "pyproject.toml").read_text(encoding="utf-8")), encoding="utf-8"
        )
        (target / "src" / "fashn_vton" / "research_identity.py").write_text(
            '# GENERATED BERS parserless research identity; no production admission.\\n'
            'KIND = "BERS_FASHION_PARSERLESS_RESEARCH_V1"\\n'
            f'UPSTREAM_SHA = "{UPSTREAM_COMMIT}"\\n',
            encoding="utf-8",
        )
        shutil.copy2(source / "LICENSE", target / "LICENSE")
        (target / "NOTICE.BERS-RESEARCH.txt").write_text(
            "FASHN VTON v1.5, copyright its original contributors, Apache-2.0.\n"
            f"Exact upstream source: {UPSTREAM_COMMIT}\n"
            "Modifications: removed FASHN Human Parser, network checkpoint loading, pickle checkpoint loading; "
            "restrict inference to segmentation-free flat-lay inputs.\n"
            "DWPose/YOLOX and separate weights require their own license and source review.\n"
            "RESEARCH ONLY: no BERS Core admission or redistribution approval.\n",
            encoding="utf-8",
        )
        for file in (target / "src").rglob("*.py"):
            text = file.read_text(encoding="utf-8")
            if any(marker in text for marker in ("fashn_human_parser", "FashnHumanParser", "hf_hub_download", "weights_only=False")):
                raise ValueError(f"Parser dependency in emitted package: {file}")
            compile(text, str(file), "exec")
        files = {
            str(p.relative_to(target)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(target.rglob("*")) if p.is_file()
        }
        (target / "SOURCE-MANIFEST.json").write_text(
            json.dumps({"upstreamCommit": UPSTREAM_COMMIT, "filesSha256": files}, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, required=True, help="Pinned clean local upstream git checkout")
    parser.add_argument("--output", type=Path, required=True, help="New research package output directory")
    args = parser.parse_args()
    print(build(args.upstream, args.output))


if __name__ == "__main__":
    main()
