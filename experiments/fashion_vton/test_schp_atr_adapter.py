"""Unit tests for the isolated SCHP-ATR / FASHN garment adapter."""
import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from schp_atr_adapter import (
    GARMENT_IDS,
    MODEL_SIDE,
    SchpAtrOnnxParser,
    prepare_garment_image,
    prepare_person_image,
)


class FakeOrtSession:
    def __init__(self, label=4, bad_shape=False):
        self.label = label
        self.bad_shape = bad_shape
        self.pixel_values = None

    def run(self, names, feeds):
        assert names == ["logits"]
        self.pixel_values = feeds["pixel_values"]
        assert self.pixel_values.shape == (1, 3, MODEL_SIDE, MODEL_SIDE)
        if self.bad_shape:
            return [np.zeros((1, 17, 512, 512), np.float32)]
        logits = np.zeros((1, 18, MODEL_SIDE, MODEL_SIDE), np.float32)
        logits[0, 0] = 0.25
        logits[0, self.label, 128:384, 128:384] = 1.0
        return [logits]


class SchpAtrAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.checkpoint = Path(self.tmp.name) / "pinned-int8.onnx"
        self.checkpoint.write_bytes(b"offline-test-checkpoint")
        self.sha = hashlib.sha256(self.checkpoint.read_bytes()).hexdigest()
        self.image = Image.new("RGB", (8, 8), (20, 100, 200))

    def parser(self, label=4, bad_shape=False):
        session = FakeOrtSession(label, bad_shape)
        return SchpAtrOnnxParser(self.checkpoint, self.sha, session=session), session

    def test_model_requires_exact_local_digest(self):
        with self.assertRaisesRegex(ValueError, "mismatch"):
            SchpAtrOnnxParser(self.checkpoint, "0" * 64, session=FakeOrtSession())
        with self.assertRaisesRegex(ValueError, "lowercase"):
            SchpAtrOnnxParser(self.checkpoint, "INVALID", session=FakeOrtSession())

    def test_classification_and_resize_are_nearest_neighbor(self):
        parser, session = self.parser()
        labels = parser.predict(self.image)
        self.assertEqual(labels.shape, (8, 8))
        self.assertEqual(labels.dtype, np.uint8)
        self.assertEqual(labels[0, 0], 0)
        self.assertEqual(labels[4, 4], 4)
        # RGB source with reversed ImageNet mean (SCHP training convention).
        expected_r = (20 / 255.0 - 0.406) / 0.225
        self.assertAlmostEqual(float(session.pixel_values[0, 0, 0, 0]), expected_r, places=5)

    def test_model_worn_garment_masks_background_and_preserves_selected(self):
        parser, _ = self.parser()
        result = np.asarray(prepare_garment_image(self.image, "tops", "model", parser=parser))
        self.assertEqual(result[0, 0].tolist(), [127, 127, 127])
        self.assertEqual(result[4, 4].tolist(), [20, 100, 200])
        self.assertEqual(np.asarray(self.image)[0, 0].tolist(), [20, 100, 200])

    def test_flat_lay_does_not_require_parser(self):
        self.assertEqual(
            np.asarray(prepare_garment_image(self.image, "tops", "flat-lay")).tolist(),
            np.asarray(self.image).tolist(),
        )

    def test_fail_closed_for_missing_or_incompatible_segmentation(self):
        with self.assertRaisesRegex(ValueError, "required"):
            prepare_garment_image(self.image, "tops", "model")
        pants_parser, _ = self.parser(label=6)
        with self.assertRaisesRegex(ValueError, "No matching garment"):
            prepare_garment_image(self.image, "tops", "model", parser=pants_parser)
        corrupt, _ = self.parser(bad_shape=True)
        with self.assertRaisesRegex(ValueError, "shape"):
            prepare_garment_image(self.image, "tops", "model", parser=corrupt)
        with self.assertRaisesRegex(ValueError, "category"):
            prepare_garment_image(self.image, "hats", "flat-lay")
        with self.assertRaisesRegex(ValueError, "photo type"):
            prepare_garment_image(self.image, "tops", "unknown")

    def test_person_parsing_is_not_silently_faked(self):
        self.assertEqual(prepare_person_image(self.image).size, (8, 8))
        with self.assertRaisesRegex(ValueError, "hands/torso"):
            prepare_person_image(self.image, segmentation_free=False)

    def test_category_labels_cover_fashn_garment_targets(self):
        self.assertIn(4, GARMENT_IDS["tops"])
        self.assertIn(6, GARMENT_IDS["bottoms"])
        self.assertIn(7, GARMENT_IDS["one-pieces"])


if __name__ == "__main__":
    unittest.main()
