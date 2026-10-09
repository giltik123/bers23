"""Read-only contract tests for a generated exact-upstream parserless R&D copy."""
from __future__ import annotations

import argparse
import ast
import importlib.util
from pathlib import Path
import tomllib
import unittest


parser = argparse.ArgumentParser()
parser.add_argument("--upstream", required=True, type=Path)
parser.add_argument("--patched", required=True, type=Path)
ARGS, _ = parser.parse_known_args()

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "fashn_rnd_builder", ROOT / "scripts/build-fashn-vton15-parserless-rnd.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FashnMasklessContract(unittest.TestCase):
    def setUp(self):
        self.pipeline = (ARGS.patched / "src/fashn_vton/pipeline.py").read_text()
        self.source = (ARGS.upstream / "src/fashn_vton/pipeline.py").read_text()

    def test_pinned_source_and_no_human_parser_download_or_install(self):
        for path, digest in module.UPSTREAM_BLOBS.items():
            self.assertEqual(module.git_blob_sha(ARGS.upstream / path), digest)
        self.assertEqual(
            module.subprocess.check_output(
                ["git", "-C", str(ARGS.upstream), "rev-parse", "HEAD"], text=True
            ).strip(),
            module.UPSTREAM_COMMIT,
        )
        for source in (ARGS.patched / "src").rglob("*.py"):
            self.assertNotIn("fashn_human_parser", source.read_text(), str(source))
        self.assertFalse((ARGS.patched / "scripts/download_weights.py").exists())
        self.assertFalse((ARGS.patched / "scripts/debug_masks.py").exists())
        self.assertFalse((ARGS.patched / "src/fashn_vton/preprocessing/agnostic.py").exists())
        self.assertFalse((ARGS.patched / "examples/basic_inference.py").exists())
        meta = tomllib.loads((ARGS.patched / "pyproject.toml").read_text())
        self.assertEqual(meta["project"]["name"], "bers-fashn-vton-maskless-rnd")
        self.assertEqual(meta["project"]["license"]["text"], "Apache-2.0")
        self.assertFalse(any("human-parser" in dep for dep in meta["project"]["dependencies"]))
        self.assertTrue((ARGS.patched / "LICENSE").is_file())
        self.assertTrue((ARGS.patched / "THIRD_PARTY_UPSTREAM_README.md").is_file())

    def test_maskless_category_and_flatlay_only_preflight(self):
        tree = ast.parse(self.pipeline)
        guard = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "_bers_require_parserless_input"
        )
        namespace = {}
        isolated = ast.Module(body=[guard], type_ignores=[])
        exec(compile(ast.fix_missing_locations(isolated), "<guard>", "exec"), namespace)
        check = namespace["_bers_require_parserless_input"]
        check(segmentation_free=True, garment_photo_type="flat-lay")
        for masked, garment_type in (
            (False, "flat-lay"), (True, "model"),
            (False, "model"), (1, "flat-lay"), (True, "unknown"),
        ):
            with self.assertRaisesRegex(ValueError, "only supports"):
                check(segmentation_free=masked, garment_photo_type=garment_type)
        # The guarded function must run before GPU seeding / pose/matrix execution.
        self.assertLess(
            self.pipeline.index("        _bers_require_parserless_input("),
            self.pipeline.index("        torch.manual_seed(seed)")
        )
        self.assertIn("        if category not in self.CATEGORY_TO_LABEL:", self.pipeline)

    def test_preserves_original_diffusion_and_pose_math_and_bypasses_segmentation(self):
        self.assertIn("from .dwpose import DWposeDetector, draw_pose", self.pipeline)
        self.assertIn("self._setup_tryon_model()", self.pipeline)
        self.assertIn("self._setup_pose_model()", self.pipeline)
        self.assertIn("self._sample(", self.pipeline)
        self.assertIn("ca_image = person_image_np.copy()", self.pipeline)
        self.assertIn("garment_image_processed = garment_image_np.copy()", self.pipeline)
        self.assertIn("person_pose = self.pose_model(", self.pipeline)
        self.assertNotIn("self._setup_hp_model", self.pipeline)
        self.assertNotIn("self.hp_model", self.pipeline)
        self.assertNotIn("create_clothing_agnostic_image", self.pipeline)
        self.assertNotIn("create_garment_image", self.pipeline)
        self.assertNotIn("from fashn_human_parser", self.pipeline)
        # Inference sampling code, including the model conditioning and
        # output conversion, is completely unchanged by this R&D source split.
        marker = "        # Resize/pad for model input\n"
        self.assertEqual(self.pipeline.split(marker)[1], self.source.split(marker)[1])
        upstream_sampling = self.source.split("    @torch.inference_mode()\n    def _sample(", 1)[1].split("    @torch.inference_mode()\n    def __call__(", 1)[0]
        patched_sampling = self.pipeline.split("    @torch.inference_mode()\n    def _sample(", 1)[1].split("    @torch.inference_mode()\n    def __call__(", 1)[0]
        self.assertEqual(patched_sampling, upstream_sampling)

    def test_does_not_grant_production_or_download_model_weights(self):
        self.assertIn("NOT FOR PRODUCTION", (ARGS.patched / "README.md").read_text())
        self.assertIn("no human", (ARGS.patched / "README.md").read_text().lower())
        self.assertNotIn("fashn_human_parser", (ARGS.patched / "src/fashn_vton/preprocessing/__init__.py").read_text())
        self.assertFalse((ARGS.patched / "weights").exists())
        with self.assertRaisesRegex(ValueError, "expected exactly one"):
            module.replace_exact("v1", "missing", "v2", "unreviewed source")


if __name__ == "__main__":
    unittest.main(argv=[__file__], verbosity=2)
