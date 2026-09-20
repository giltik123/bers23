import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "hsme_foundation_rights_evidence.py"
SPEC = importlib.util.spec_from_file_location("hsme_rights", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(mod)


def artifact(path, logical_id):
    return {
        "logicalId": logical_id,
        "source": {"sourceRoot": "owner/repo", "immutableRevision": "1" * 40},
        "relativePath": path,
        "role": "TOKENIZER_TEXT_ENCODER" if path.startswith(("text_encoder/", "tokenizer/")) else "DENOISER_TRANSFORMER_UNET",
        "bytes": 1,
        "runtimeRequired": True,
        "identityMethod": "CONTENT_SHA256",
        "protocolContentSha256Verified": False,
        "contentSha256": "a" * 64,
    }


class RightsEvidenceTests(unittest.TestCase):
    def test_path_prefix_then_remainder_covers_each_runtime_artifact_once(self):
        runtime = [
            artifact("text_encoder/model.safetensors", "file/a"),
            artifact("tokenizer/tokenizer.json", "file/b"),
            artifact("transformer/model.safetensors", "file/c"),
        ]
        remaining = {item["logicalId"] for item in runtime}
        text = mod.select_group(runtime, remaining, {
            "kind": "PATH_PREFIXES",
            "prefixes": ["text_encoder/", "tokenizer/"],
        })
        self.assertEqual({item["logicalId"] for item in text}, {"file/a", "file/b"})
        for item in text:
            remaining.remove(item["logicalId"])
        rest = mod.select_group(runtime, remaining, {"kind": "REMAINDER_RUNTIME"})
        self.assertEqual([item["logicalId"] for item in rest], ["file/c"])

    def test_selector_matching_zero_artifacts_fails_closed(self):
        runtime = [artifact("transformer/model.safetensors", "file/c")]
        with self.assertRaisesRegex(mod.RightsEvidenceError, "matched zero"):
            mod.select_group(runtime, {"file/c"}, {
                "kind": "PATH_PREFIXES",
                "prefixes": ["text_encoder/"],
            })

    def test_domain_hash_is_key_order_canonical(self):
        left = {"a": 1, "b": {"c": 2}}
        right = {"b": {"c": 2}, "a": 1}
        self.assertEqual(
            mod.domain_hash("test:v1", left),
            mod.domain_hash("test:v1", right),
        )

    def test_policy_is_benchmark_only_and_requires_future_product_legal_review(self):
        policy = json.loads((
            ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-rights-admission-policy.v1.json"
        ).read_text())
        self.assertEqual(policy["scope"], "BENCHMARK_EVIDENCE_ONLY_NOT_PRODUCTION_APPROVAL")
        self.assertTrue(policy["legalReviewRequiredBeforeProductDeployment"])
        self.assertFalse(policy["candidateOutputsObserved"])
        for field in [
            "productionAuthorityGranted",
            "providerAuthorityGranted",
            "billingAuthorityGranted",
            "projectArtifactMutationAllowed",
            "durableModelFleetPromotionAllowed",
            "trainingOrDistillationAllowed",
        ]:
            self.assertFalse(policy[field], field)
        self.assertEqual(len(policy["candidates"]), 6)

    def test_runtime_projection_ignores_revision_but_not_runtime_bytes(self):
        old = {
            "artifactManifest": {
                "artifacts": [
                    artifact("transformer/model.safetensors", "file/a"),
                    {
                        **artifact("README.md", "file/readme"),
                        "role": "DOCUMENTATION_ONLY",
                        "runtimeRequired": False,
                    },
                ],
            },
        }
        new = json.loads(json.dumps(old))
        new["artifactManifest"]["artifacts"][0]["source"]["immutableRevision"] = "2" * 40
        new["artifactManifest"]["artifacts"][1]["source"]["immutableRevision"] = "2" * 40
        new["artifactManifest"]["artifacts"][1]["contentSha256"] = "b" * 64
        self.assertEqual(mod.runtime_projection(old), mod.runtime_projection(new))
        new["artifactManifest"]["artifacts"][0]["contentSha256"] = "c" * 64
        self.assertNotEqual(mod.runtime_projection(old), mod.runtime_projection(new))

    def test_sana_repin_is_explicit_and_gemma_terms_remain_separate(self):
        policy = json.loads((
            ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-rights-admission-policy.v1.json"
        ).read_text())
        sana = next(item for item in policy["candidates"] if item["candidateId"] == "sana-sprint-0.6b-split-v1")
        self.assertEqual(sana["commercialUseConclusion"], "COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS")
        repin = sana["rightsSafeRepin"]
        self.assertEqual(repin["oldRevision"], "a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97")
        self.assertEqual(repin["newRevision"], "aa76e7f4f4928f378716b6716a2130fba3caf5b1")
        self.assertTrue(repin["runtimeBytesMustRemainIdentical"])
        self.assertEqual(repin["oldPinnedLicenseId"], "NSCL-V2-CUSTOM")
        self.assertEqual(repin["newPinnedLicenseId"], "APACHE-2.0")
        self.assertEqual({group["licenseId"] for group in sana["groups"]}, {
            "GEMMA-TERMS-2026-04-01",
            "APACHE-2.0",
        })
        gemma = next(group for group in sana["groups"] if group["licenseId"].startswith("GEMMA"))
        self.assertTrue(gemma["obligations"]["enforceUseRestrictions"])
        self.assertTrue(gemma["obligations"]["provideAgreementOnDistribution"])
        self.assertTrue(gemma["obligations"]["noticeFileRequiredForNonHostedDistribution"])

    def test_tiny_sd_openrail_obligations_cannot_be_downgraded_to_plain_apache(self):
        policy = json.loads((
            ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-rights-admission-policy.v1.json"
        ).read_text())
        tiny = next(item for item in policy["candidates"] if item["candidateId"] == "tiny-sd-control-v1")
        self.assertEqual(tiny["aggregateLicenseId"], "CREATIVEML-OPENRAIL-M")
        self.assertEqual(tiny["commercialUseConclusion"], "COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS")
        self.assertTrue(tiny["groups"][0]["obligations"]["enforceUseRestrictions"])

    def test_permissive_candidates_still_keep_redistribution_obligations(self):
        policy = json.loads((
            ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-rights-admission-policy.v1.json"
        ).read_text())
        for candidate_id in [
            "flux2-klein-4b-distilled-v1",
            "flux2-klein-base-4b-v1",
            "qwen-image-t2i-reference-v1",
            "qwen-image-edit-2511-reference-v1",
        ]:
            item = next(value for value in policy["candidates"] if value["candidateId"] == candidate_id)
            self.assertEqual(item["commercialUseConclusion"], "COMMERCIAL_ADMISSIBLE")
            self.assertTrue(all(
                group["obligations"]["preserveLicenseAndNoticesOnRedistribution"]
                for group in item["groups"]
            ))


if __name__ == "__main__":
    unittest.main()
