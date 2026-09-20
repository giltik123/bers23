import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "hsme_foundation_candidate_metadata_evidence.py"
SPEC = importlib.util.spec_from_file_location("hsme_metadata", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(mod)


class MetadataEvidenceTests(unittest.TestCase):
    def test_lfs_sha256_uses_no_payload_loader(self):
        called = False
        def loader():
            nonlocal called
            called = True
            return b"forbidden"
        digest = "a" * 64
        method, verified, content, streamed = mod.resolve_identity(
            path="transformer/model.safetensors",
            size=10_000_000_000,
            etag="xet-storage-key-must-not-matter",
            lfs_sha256=digest,
            content_loader=loader,
        )
        self.assertEqual(method, "GIT_LFS_OID_SHA256_VERIFIED")
        self.assertTrue(verified)
        self.assertEqual(content, digest)
        self.assertEqual(streamed, 0)
        self.assertFalse(called)

    def test_git_blob_is_locally_verified_then_sha256_hashed(self):
        payload = b'{"config":true}\n'
        etag = mod.git_blob_sha1(payload)
        method, verified, content, streamed = mod.resolve_identity(
            path="model_index.json",
            size=len(payload),
            etag=etag,
            content_loader=lambda: payload,
        )
        self.assertEqual(method, "STREAMED_LOCAL_SHA256")
        self.assertFalse(verified)
        self.assertEqual(content, hashlib.sha256(payload).hexdigest())
        self.assertEqual(streamed, len(payload))

    def test_git_blob_mismatch_fails_closed(self):
        payload = b"one"
        with self.assertRaisesRegex(mod.EvidenceError, "SHA-1 verification failed"):
            mod.resolve_identity(
                path="config.json",
                size=len(payload),
                etag=mod.git_blob_sha1(b"two"),
                content_loader=lambda: payload,
            )

    def test_unknown_or_storage_like_etag_is_never_accepted_as_content_sha(self):
        with self.assertRaisesRegex(mod.EvidenceError, "lacks explicit LFS content SHA-256"):
            mod.resolve_identity(
                path="transformer/model.safetensors",
                size=100,
                etag="xet-storage-key-not-content-hash",
                content_loader=lambda: b"",
            )

    def test_64_hex_etag_without_explicit_lfs_metadata_is_not_accepted(self):
        with self.assertRaisesRegex(mod.EvidenceError, "not Git blob SHA-1"):
            mod.resolve_identity(
                path="transformer/model.safetensors",
                size=10_000_000_000,
                etag="b" * 64,
                content_loader=lambda: b"",
            )

    def test_role_classification_separates_runtime_from_documentation(self):
        self.assertEqual(mod.classify_artifact("README.md"), ("DOCUMENTATION_ONLY", False))
        self.assertEqual(mod.classify_artifact("preview.png"), ("DOCUMENTATION_ONLY", False))
        self.assertEqual(mod.classify_artifact("tokenizer/tokenizer.json"), ("TOKENIZER_TEXT_ENCODER", True))
        self.assertEqual(mod.classify_artifact("text_encoder/model.safetensors"), ("TOKENIZER_TEXT_ENCODER", True))
        self.assertEqual(mod.classify_artifact("transformer/model.safetensors"), ("DENOISER_TRANSFORMER_UNET", True))
        self.assertEqual(mod.classify_artifact("unet/diffusion_pytorch_model.bin"), ("DENOISER_TRANSFORMER_UNET", True))
        self.assertEqual(mod.classify_artifact("vae/model.safetensors"), ("VAE_DECODER", True))
        self.assertEqual(mod.classify_artifact("scheduler/scheduler_config.json"), ("SCHEDULER_PROCESSOR", True))
        self.assertEqual(mod.classify_artifact("custom_pipeline.py"), ("RUNTIME_CODE", True))

    def test_manifest_digest_is_artifact_order_canonical(self):
        source = {"sourceRoot": "owner/repo", "immutableRevision": "1" * 40}
        def artifact(path, char):
            role, runtime = mod.classify_artifact(path)
            return {
                "logicalId": mod.logical_id(path),
                "source": source,
                "relativePath": path,
                "role": role,
                "bytes": 10,
                "runtimeRequired": runtime,
                "identityMethod": "GIT_LFS_OID_SHA256_VERIFIED",
                "protocolContentSha256Verified": True,
                "contentSha256": char * 64,
            }
        a = artifact("transformer/a.safetensors", "a")
        b = artifact("vae/b.safetensors", "b")
        left = {
            "schemaVersion": mod.MANIFEST_SCHEMA,
            "candidateId": "candidate",
            "state": "PINNED",
            "primarySource": source,
            "artifacts": [a, b],
        }
        right = {**left, "artifacts": [b, a]}
        self.assertEqual(mod.manifest_digest(left), mod.manifest_digest(right))

    def test_campaign_roster_is_exact_six_candidate_set(self):
        candidates = mod.load_campaign(
            ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json"
        )
        self.assertEqual(len(candidates), 6)
        self.assertEqual(
            {item["candidateId"] for item in candidates},
            set(mod.EXPECTED_CANDIDATES),
        )
        self.assertTrue(all(len(item["immutableRevision"]) == 40 for item in candidates))


if __name__ == "__main__":
    unittest.main()
