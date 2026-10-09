"""CPU-only source-fork invariants, no third-party Python packages required."""
import hashlib
import json
import tempfile
import unittest
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

from build_fashion_vton_parserless import (
    UPSTREAM_COMMIT,
    build,
    git_blob_sha,
    replace_one,
    rewrite_pipeline,
    rewrite_pyproject,
    rewrite_checkpoint,
)


# Minimal upstream-shaped fixture. Integration workflow also builds real pinned source.
PIPELINE = '''from fashn_human_parser import CATEGORY_TO_BODY_COVERAGE, FashnHumanParser
from .preprocessing import (
    BODY_COVERAGE_TO_FASHN_LABELS,
    FASHN_LABELS_TO_IDS,
    AspectPreserveResize,
    ResizePad,
    create_clothing_agnostic_image,
    create_garment_image,
)
class Example:
    def __init__(self):
        self._setup_hp_model()
        pass

    def _setup_hp_model(self):
        self.hp_model = FashnHumanParser(device="cpu")

    @torch.inference_mode()
    def _sample(self):
        return None

    def __call__(self, category, garment_photo_type, segmentation_free, num_samples):
        # Set seed
        person_image_np = 1
        garment_image_np = 2
        # Human parsing
        person_seg_pred = self.hp_model.predict(person_image_np)
        garment_seg_pred = self.hp_model.predict(garment_image_np)
        ca_image = create_clothing_agnostic_image(person_seg_pred)
        garment_image_processed = create_garment_image(garment_seg_pred)
        # Resize/pad for model input
        return ca_image, garment_image_processed
'''


class ForkTests(unittest.TestCase):
    def test_git_blob_algorithm(self):
        self.assertEqual(git_blob_sha(b"test\n"), hashlib.sha1(b"blob 5\0test\n").hexdigest())

    def test_pipeline_has_no_parser_and_fails_closed(self):
        code = rewrite_pipeline(PIPELINE)
        self.assertNotIn("FashnHumanParser", code)
        self.assertNotIn("self.hp_model", code)
        self.assertIn("ca_image = person_image_np.copy()", code)
        self.assertIn("garment_image_processed = garment_image_np", code)
        self.assertIn("garment_photo_type != 'flat-lay'", code)
        self.assertIn("segmentation_free is not True", code)
        with self.assertRaisesRegex(ValueError, "parser processing block"):
            rewrite_pipeline(PIPELINE.replace("        # Human parsing", "        # hidden drift"))

    def test_pyproject_drops_dependency(self):
        text = rewrite_pyproject('name = "fashn-vton"\ndependencies = [\n    "fashn-human-parser>=0.1.1",\n    "huggingface_hub>=0.20.0",\n]\n')
        self.assertNotIn('fashn-human-parser', text)
        self.assertNotIn('huggingface_hub', text)
        self.assertIn('bers-vton-parserless-research', text)

    def test_no_network_or_pickle_checkpoint_loading(self):
        code = rewrite_checkpoint('from huggingface_hub import hf_hub_download')
        self.assertNotIn('hf_hub_download', code)
        self.assertNotIn('torch.load', code)
        self.assertIn('safetensors.torch', code)

    def test_replace_one_rejects_duplicate_anchor(self):
        with self.assertRaises(ValueError):
            replace_one('a a', 'a', 'b')

    def test_build_emits_manifest_and_no_parser(self):
        with tempfile.TemporaryDirectory() as tmp:
            upstream = Path(tmp) / 'upstream'
            output = Path(tmp) / 'output'
            (upstream / 'src/fashn_vton/preprocessing').mkdir(parents=True)
            fixtures = {
                'src/fashn_vton/pipeline.py': PIPELINE,
                'src/fashn_vton/preprocessing/__init__.py': 'from .agnostic import create_garment_image\n',
                'src/fashn_vton/preprocessing/agnostic.py': 'import fashn_human_parser\n',
                'src/fashn_vton/preprocessing/masks.py': 'class Mask: pass\n',
                'src/fashn_vton/preprocessing/transforms.py': 'class ResizePad: pass\n',
                'src/fashn_vton/utils/checkpoint.py': 'from huggingface_hub import hf_hub_download\n',
                'pyproject.toml': 'name = "fashn-vton"\ndependencies = [\n    "fashn-human-parser>=0.1.1",\n    "huggingface_hub>=0.20.0",\n]\n',
                'LICENSE': 'Apache-2.0 sample for fixture only\n',
            }
            for name, content in fixtures.items():
                p = upstream / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(content)
            blobs = {key: git_blob_sha(value.encode()) for key, value in fixtures.items()}
            with mock.patch('build_fashion_vton_parserless.EXPECTED_BLOBS', blobs), mock.patch(
                'build_fashion_vton_parserless.subprocess.check_output', side_effect=[UPSTREAM_COMMIT + '\n', '']
            ):
                build(upstream, output)
            self.assertFalse((output / 'src/fashn_vton/preprocessing/agnostic.py').exists())
            self.assertFalse((output / 'src/fashn_vton/preprocessing/masks.py').exists())
            self.assertNotIn('hf_hub_download', (output / 'src/fashn_vton/utils/checkpoint.py').read_text())
            manifest = json.loads((output / 'SOURCE-MANIFEST.json').read_text())
            self.assertEqual(manifest['upstreamCommit'], UPSTREAM_COMMIT)
            self.assertTrue((output / 'LICENSE').is_file())
            with self.assertRaises(FileExistsError):
                build(upstream, output)

    def test_fails_on_parent_or_nested_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            upstream = Path(tmp) / 'upstream'
            upstream.mkdir()
            with self.assertRaises(ValueError):
                build(upstream, upstream / 'output')


if __name__ == '__main__':
    unittest.main()
