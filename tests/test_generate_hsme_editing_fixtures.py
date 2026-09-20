import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "generate_hsme_editing_fixtures.py"
SPEC = importlib.util.spec_from_file_location("hsme_fixtures", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(mod)


class GeneratedFixtureTests(unittest.TestCase):
    def test_generation_is_byte_deterministic(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            left = mod.generate(Path(a))
            right = mod.generate(Path(b))
            self.assertEqual(left, right)
            for asset in left["assets"]:
                self.assertEqual(
                    (Path(a) / asset["relativePath"]).read_bytes(),
                    (Path(b) / asset["relativePath"]).read_bytes(),
                )

    def test_pngs_are_exact_rgb8_512_without_external_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = mod.generate(Path(tmp))
            self.assertEqual(len(manifest["assets"]), 4)
            for asset in manifest["assets"]:
                data = (Path(tmp) / asset["relativePath"]).read_bytes()
                self.assertTrue(data.startswith(mod.PNG_SIGNATURE))
                self.assertEqual(hashlib.sha256(data).hexdigest(), asset["contentSha256"])
                self.assertEqual(asset["width"], 512)
                self.assertEqual(asset["height"], 512)
                self.assertFalse(asset["privateUserData"])
                self.assertFalse(asset["thirdPartyBrandOrLogo"])
                self.assertEqual(asset["syntheticTextLogo"], "BERS LAB")

    def test_t2i_supplement_adds_only_missing_quality_classes(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = mod.generate(Path(tmp))
            self.assertEqual(
                [item["caseClass"] for item in manifest["t2iSupplement"]],
                ["fashion-material", "text-logo-rendering", "difficult-texture"],
            )
            for item in manifest["t2iSupplement"]:
                self.assertEqual(
                    hashlib.sha256(item["prompt"].encode("utf-8")).hexdigest(),
                    item["promptSha256"],
                )
            text = next(item for item in manifest["t2iSupplement"] if item["caseClass"] == "text-logo-rendering")
            self.assertIn("exact centered text BERS LAB", text["prompt"])
            self.assertIn("no other text or logo", text["prompt"])

    def test_fixture_cases_cover_every_editing_hard_dimension(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = mod.generate(Path(tmp))
            covered = {
                dimension
                for case in manifest["cases"]
                for dimension in case["dimensions"]
            }
            required = {
                "identity-preservation",
                "garment-logo-pattern-preservation",
                "non-target-preservation",
                "edit-compliance",
                "anatomy-artifact-rate",
                "text-fidelity",
                "multi-reference-consistency",
            }
            self.assertEqual(covered, required)

    def test_reference_order_is_explicit_and_multi_reference_is_real(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = mod.generate(Path(tmp))
            multi = [case for case in manifest["cases"] if len(case["referenceOrder"]) >= 2]
            self.assertGreaterEqual(len(multi), 2)
            self.assertTrue(any(len(case["referenceOrder"]) >= 3 for case in multi))
            logo = next(case for case in manifest["cases"] if case["caseId"] == "edit-logo-text-v1")
            self.assertIn("BERS LAB to BERS AI", logo["instruction"])
            for case in manifest["cases"]:
                self.assertEqual(
                    case["referenceOrderingSha256"],
                    hashlib.sha256(mod.canonical_bytes(case["referenceOrder"])).hexdigest(),
                )

    def test_rights_surface_is_repository_owned_generated_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = mod.generate(Path(tmp))
            rights = manifest["rights"]
            self.assertEqual(rights["rightsId"], "BERS_REPOSITORY_OWNED_SYNTHETIC_FIXTURE_V1")
            self.assertFalse(rights["generatedFromThirdPartyContent"])
            self.assertFalse(rights["privateUserDataAllowed"])
            self.assertFalse(rights["scrapedBiometricDataAllowed"])
            self.assertFalse(rights["thirdPartyBrandLogoAllowed"])
            self.assertFalse(rights["productionAuthorityGranted"])

    def test_no_observation_or_training_authority(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = mod.generate(Path(tmp))
            self.assertFalse(manifest["candidateOutputsObserved"])
            self.assertFalse(manifest["winnerSelectionAllowed"])
            self.assertFalse(manifest["productionAuthorityGranted"])
            self.assertFalse(manifest["trainingOrDistillationAllowed"])


if __name__ == "__main__":
    unittest.main()
