"""Offline stdlib contract tests; never download or load restricted weights."""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent

def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

adapter = load("bers_human_parser", "bers_human_parser.py")
patcher = load("fashn_patcher", "patch_upstream.py")

class ParserSemanticTests(unittest.TestCase):
    def test_complete_atr_remapping_and_explicit_gaps(self):
        self.assertEqual(len(adapter.ATR_TO_FASHN), 18)
        self.assertEqual(adapter.remap_atr_labels([list(range(18))]), [list(adapter.ATR_TO_FASHN)])
        self.assertEqual(adapter.UNSUPPORTED_FASHN_CLASSES, ("hands", "torso", "jewelry"))
        self.assertEqual(adapter.ATR_TO_FASHN[14:16], (12, 12))
        self.assertEqual(adapter.ATR_TO_FASHN[9:11], (15, 15))
        self.assertEqual(adapter.BODY_COVERAGE_TO_LABELS["upper"], ["top", "dress", "scarf"])
        self.assertEqual(adapter.IDENTITY_LABELS, ["face", "hair", "jewelry", "bag", "glasses", "hat"])

    def test_invalid_maps_fail_closed(self):
        for invalid in ([], [[]], [[0], [1, 2]], [[18]], [[-1]], [[1.0]], [["0"]], [[True]]):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    adapter.remap_atr_labels(invalid)

    def test_missing_hash_fails_before_loading_runtime(self):
        with tempfile.TemporaryDirectory() as td, patch.dict(os.environ, {"BERS_SCHP_ATR_ONNX_SHA256": ""}):
            with self.assertRaisesRegex(ValueError, "pinned lowercase"):
                adapter.BersSchpAtrParser(weights_dir=td, device="cpu")

    def test_invalid_checkpoint_is_rejected_without_network(self):
        with tempfile.TemporaryDirectory() as td:
            folder = Path(td) / "schp"
            folder.mkdir()
            (folder / adapter.MODEL_FILENAME).write_bytes(b"not a model")
            with patch.dict(os.environ, {"BERS_SCHP_ATR_ONNX_SHA256": "0" * 64}):
                with self.assertRaisesRegex(ValueError, "SHA-256"):
                    adapter.BersSchpAtrParser(weights_dir=td, device="cpu")

class ExactForkPatchTests(unittest.TestCase):
    def create_fixture(self, root: Path):
        paths = (
            "src/fashn_vton/pipeline.py",
            "src/fashn_vton/preprocessing/agnostic.py",
            "pyproject.toml",
            "scripts/download_weights.py",
            "scripts/debug_masks.py",
        )
        for p in paths:
            (root / p).parent.mkdir(parents=True, exist_ok=True)
        (root / paths[0]).write_text(
            "from fashn_human_parser import CATEGORY_TO_BODY_COVERAGE, FashnHumanParser\n"
            '        self.logger.info("Loading FashnHumanParser")\n'
            "        self.hp_model = FashnHumanParser(device=hp_device)\n"
            '        self.logger.info("FashnHumanParser loaded")\n', encoding="utf-8")
        (root / paths[1]).write_text(
            "from fashn_human_parser import BODY_COVERAGE_TO_LABELS, IDENTITY_LABELS, LABELS_TO_IDS\n", encoding="utf-8")
        (root / paths[2]).write_text(
            '[project]\ndependencies = [\n    "fashn-human-parser>=0.1.1",\n]\n', encoding="utf-8")
        (root / paths[3]).write_text(
            '    - FashnHumanParser weights (auto-cached by HuggingFace)\n'
            'def download_human_parser() -> None:\n'
            '    from fashn_human_parser import FashnHumanParser\n'
            '    FashnHumanParser(device="cpu")\n'
            '\n'
            'def main():\n'
            '    download_human_parser()\n', encoding="utf-8")
        (root / paths[4]).write_text(
            "from fashn_human_parser import FashnHumanParser\n", encoding="utf-8")

    def test_no_proprietary_parser_survives_rewrite(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.create_fixture(root)
            touched = patcher.patch_files(root)
            self.assertEqual(len(touched), 6)
            self.assertFalse((root / "scripts/debug_masks.py").exists())
            self.assertTrue((root / "src/fashn_vton/bers_human_parser.py").exists())
            for filename in ["src/fashn_vton/pipeline.py", "src/fashn_vton/preprocessing/agnostic.py", "pyproject.toml", "scripts/download_weights.py"]:
                body = (root / filename).read_text(encoding="utf-8")
                self.assertNotIn("fashn_human_parser", body)
                self.assertNotIn("fashn-human-parser", body)
            pipeline = (root / "src/fashn_vton/pipeline.py").read_text(encoding="utf-8")
            self.assertIn("BersSchpAtrParser(weights_dir=self.weights_dir", pipeline)
            self.assertIn("SCHP checkpoint must be separately provisioned", (root / "scripts/download_weights.py").read_text())
            with self.assertRaisesRegex(ValueError, "already present"):
                patcher.patch_files(root)

    def test_upstream_api_drift_fails_before_file_mutation(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.create_fixture(root)
            p = root / "src/fashn_vton/pipeline.py"
            p.write_text(p.read_text().replace("FashnHumanParser(device=hp_device)", "DifferentApi(device=hp_device)"))
            before = p.read_bytes()
            with self.assertRaisesRegex(ValueError, "exact upstream anchor"):
                patcher.patch_files(root)
            self.assertEqual(p.read_bytes(), before)
            self.assertFalse((root / "src/fashn_vton/bers_human_parser.py").exists())

if __name__ == "__main__":
    unittest.main()
