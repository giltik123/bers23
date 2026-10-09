"""Offline, GPU-free gate for the research-only FASHN parsing route."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from fashion_vton_parser_policy import ParserPolicyRejected, plan_parser_route


class ParserRouteTests(unittest.TestCase):
    def test_flat_lay_never_needs_a_parser(self):
        for category in ("tops", "bottoms", "one-pieces"):
            result = plan_parser_route(
                category=category, garment_photo_type="flat-lay",
                segmentation_free=True,
            )
            self.assertEqual((result.person, result.garment), ("NONE", "NONE"))
            self.assertTrue(result.person_masking_disabled)
            self.assertTrue(result.garment_masking_disabled)

    def test_model_photo_prefers_approved_mask(self):
        result = plan_parser_route(
            category="tops", garment_photo_type="model",
            segmentation_free=True, approved_garment_mask=True,
            admitted_semantic_parser=True,
        )
        self.assertEqual(result.garment, "APPROVED_MASK")
        self.assertFalse(result.garment_masking_disabled)

    def test_model_photo_allows_separately_admitted_parser(self):
        result = plan_parser_route(
            category="bottoms", garment_photo_type="model",
            segmentation_free=True, admitted_semantic_parser=True,
        )
        self.assertEqual(result.garment, "ADMITTED_SEMANTIC_PARSER")

    def test_model_photo_fails_closed_without_mask_or_parser(self):
        with self.assertRaises(ParserPolicyRejected):
            plan_parser_route(
                category="tops", garment_photo_type="model",
                segmentation_free=True,
            )

    def test_masked_person_mode_not_admitted(self):
        with self.assertRaises(ParserPolicyRejected):
            plan_parser_route(
                category="one-pieces", garment_photo_type="flat-lay",
                segmentation_free=False,
            )

    def test_invalid_category_and_photo_type_rejected(self):
        for category, photo_type in (
            ("hats", "flat-lay"), ("tops", "unknown"),
        ):
            with self.assertRaises(ParserPolicyRejected):
                plan_parser_route(
                    category=category, garment_photo_type=photo_type,
                    segmentation_free=True,
                )

    def test_browser_like_untyped_flags_rejected(self):
        for flags in (
            {"approved_garment_mask": "true"},
            {"admitted_semantic_parser": 1},
            {"segmentation_free": "true"},
        ):
            with self.assertRaises(ParserPolicyRejected):
                kwargs = {
                    "category": "tops", "garment_photo_type": "model",
                    "segmentation_free": True,
                }
                kwargs.update(flags)
                plan_parser_route(**kwargs)


if __name__ == "__main__":
    unittest.main()
