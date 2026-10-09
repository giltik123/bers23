#!/usr/bin/env python3
"""Static acceptance of the isolated, parserless FASHN VTON 1.5 R&D slice.

No ML weights, CUDA, torch, external user photos, or commercial approval are
required to run this test. Actual inference/quality remain NOT PROVEN.
"""
import argparse
import ast
import json
import re
import sys
from pathlib import Path


def verify(root: Path) -> None:
    root = root.resolve()
    expected = [
        root / "pyproject.toml", root / "LICENSE", root / "README_BERS.md",
        root / "BERS_PROVENANCE.json", root / "src/fashn_vton/pipeline.py",
        root / "src/fashn_vton/preprocessing/__init__.py",
    ]
    if not all(p.is_file() for p in expected):
        raise AssertionError("Required slim-slice source/license/provenance files missing")
    assert not (root / "src/fashn_vton/preprocessing/agnostic.py").exists()
    assert not (root / "scripts").exists()
    assert not (root / ".github").exists()
    assert not (root / ".git").exists()
    manifest = json.loads((root / "BERS_PROVENANCE.json").read_text())
    assert manifest["upstreamCommit"] == "7c0f10af3f91ad4048fe9729c470a13ef905d25a"
    assert manifest["mode"] == {
        "segmentationFree": True,
        "garmentPhotoType": "flat-lay",
        "categories": ["tops", "bottoms", "one-pieces"],
    }
    assert manifest["humanParserIncluded"] is False
    assert manifest["weightsIncluded"] is False
    assert manifest["modelRunProven"] is False
    assert manifest["commercialStackLicenseApproved"] is False
    assert manifest["productionExecutable"] is False
    assert manifest["runtimeAuthorityGranted"] is False

    project = (root / "pyproject.toml").read_text()
    assert "fashn-human-parser" not in project
    assert "Apache-2.0" in project
    pipeline = (root / "src/fashn_vton/pipeline.py").read_text()
    prep = (root / "src/fashn_vton/preprocessing/__init__.py").read_text()
    assert "fashn_human_parser" not in pipeline
    assert "FashnHumanParser" not in pipeline
    assert "hp_model" not in pipeline
    assert ".agnostic" not in prep
    assert "fashn_human_parser" not in prep
    assert "create_clothing_agnostic_image" not in pipeline
    assert "create_garment_image" not in pipeline

    for src in (root / "src").rglob("*.py"):
        txt = src.read_text()
        ast.parse(txt, filename=str(src))
        assert "fashn_human_parser" not in txt
        assert "fashn-human-parser" not in txt
    tree = ast.parse(pipeline)
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "TryOnPipeline")
    assert not any(isinstance(n, ast.FunctionDef) and n.name == "_setup_hp_model" for n in cls.body)
    call = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "__call__")
    first_action = call.body[1]  # body[0] is the function docstring
    assert isinstance(first_action, ast.If), "Fail-closed mode check must happen before any inference"
    assert "segmentation_free" in ast.unparse(first_action.test)
    assert "garment_photo_type" in ast.unparse(first_action.test)
    assert "flat-lay" in ast.unparse(first_action.test)
    assert any(isinstance(x, ast.Raise) for x in ast.walk(first_action))
    assert isinstance(call.body[2], (ast.Expr, ast.Assign, ast.If)), "Unexpected upstream mode-check ordering"
    flattened = ast.unparse(call)
    assert flattened.index("BERS R&D supports only") < flattened.index("torch.manual_seed")
    assert "person_image_np.copy()" in pipeline
    assert "garment_image_np.copy()" in pipeline
    # The protected full Human Parser feature must never silently fall back to
    # non-equivalent model-worn or masked Try-On.
    assert "segmentation_free is not True" in pipeline
    assert "garment_photo_type != \"flat-lay\"" in pipeline
    for candidate in root.rglob("*"):
        if candidate.is_symlink():
            raise AssertionError("Slim source contains symlink")
        if candidate.is_file() and candidate.suffix in (".safetensors", ".onnx", ".pt", ".pth", ".ckpt"):
            raise AssertionError("Unexpected model weights in source-only R&D slice")


if __name__ == "__main__":
    arg = argparse.ArgumentParser()
    arg.add_argument("--slice-dir", type=Path, required=True)
    opts = arg.parse_args()
    try:
        verify(opts.slice_dir)
    except (AssertionError, ValueError, SyntaxError, OSError) as exc:
        print(f"FAIL_CLOSED: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    print("PASS: FASHN parserless flat-lay source slice pinned; NO inference or production approval")
