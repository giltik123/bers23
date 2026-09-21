import hashlib
import hmac
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "hsme-sana-parity-bootstrap.py"
SPEC = importlib.util.spec_from_file_location("hsme_sana_parity_bootstrap", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(mod)

TRUST = ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json"
RIGHTS = ROOT / "src/platform/creative/local-ai/hsme/sana-sprint-evidence-use-rights.v1.json"
LOCK = ROOT / "src/platform/creative/local-ai/hsme/sana-parity-runtime-lock.v1.json"


class SanaParityBootstrapTests(unittest.TestCase):
    def build(self):
        return mod.build_request(TRUST, RIGHTS, LOCK, "synthetic protected prompt", "test-secret-key", "test-key-v1")

    def test_request_binds_accepted_relicensed_sana_and_hmac_only(self):
        request = self.build()
        self.assertEqual(request["schemaVersion"], mod.REQUEST_SCHEMA)
        self.assertEqual(request["qualityPolicy"], mod.QUALITY_POLICY)
        self.assertEqual(request["sanaCore"]["sourceRoot"], mod.SANA_REPO)
        self.assertEqual(request["sanaCore"]["immutableRevision"], mod.SANA_REVISION)
        self.assertEqual(
            request["sanaCore"]["contentSha256"],
            "c48d41a5479b31cb420b14660da9893555f745ba348f16e47ddd7e69688b4ed4",
        )
        expected = hmac.new(
            b"test-secret-key",
            b"synthetic protected prompt",
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(request["promptCommitmentHmacSha256"], expected)
        self.assertEqual(request["promptCommitmentKeyId"], "test-key-v1")
        self.assertNotIn("synthetic protected prompt", json.dumps(request))
        self.assertFalse(request["rawPromptPersisted"])
        self.assertFalse(request["runtimeAuthorityGranted"])
        self.assertFalse(request["binaryPayloadPublishable"])

    def test_request_component_digests_are_accepted_content_sha_projections(self):
        request = self.build()
        self.assertRegex(request["textEncoder"]["contentSha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(request["tokenizer"]["contentSha256"], r"^[0-9a-f]{64}$")
        self.assertNotEqual(request["textEncoder"]["contentSha256"], request["tokenizer"]["contentSha256"])
        trust = json.loads(TRUST.read_text())
        sana = next(item for item in trust["candidates"] if item["candidateId"] == mod.SANA_CANDIDATE)
        artifacts = sana["artifactManifest"]["artifacts"]
        self.assertEqual(
            request["textEncoder"]["contentSha256"],
            mod.sha256_json(mod.component_projection(artifacts, "text_encoder/")),
        )
        self.assertEqual(
            request["tokenizer"]["contentSha256"],
            mod.sha256_json(mod.component_projection(artifacts, "tokenizer/")),
        )

    def test_request_rights_digest_binds_exact_committed_bytes(self):
        request = self.build()
        self.assertEqual(
            request["rights"],
            {
                "status": "EVIDENCE_RUN_ALLOWED",
                "evidenceSha256": hashlib.sha256(RIGHTS.read_bytes()).hexdigest(),
            },
        )

    def test_rights_authority_widening_is_rejected(self):
        rights = json.loads(RIGHTS.read_text())
        rights["productionUseAllowed"] = True
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rights.json"
            path.write_text(json.dumps(rights))
            with self.assertRaisesRegex(mod.BootstrapError, "productionUseAllowed"):
                mod.build_request(TRUST, path, LOCK, "prompt", "key", "key-id")

    def test_old_or_unreviewed_sana_revision_is_rejected(self):
        trust = json.loads(TRUST.read_text())
        sana = next(item for item in trust["candidates"] if item["candidateId"] == mod.SANA_CANDIDATE)
        sana["artifactManifest"]["primarySource"]["immutableRevision"] = (
            "a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "trust.json"
            path.write_text(json.dumps(trust))
            with self.assertRaisesRegex(mod.BootstrapError, "artifact source mismatch"):
                mod.build_request(path, RIGHTS, LOCK, "prompt", "key", "key-id")

    def test_missing_secret_material_fails_closed(self):
        with self.assertRaisesRegex(mod.BootstrapError, "prompt secret"):
            mod.build_request(TRUST, RIGHTS, LOCK, "", "key", "key-id")
        with self.assertRaisesRegex(mod.BootstrapError, "HMAC key"):
            mod.build_request(TRUST, RIGHTS, LOCK, "prompt", "", "key-id")


if __name__ == "__main__":
    unittest.main()
