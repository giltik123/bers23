import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "hsme-sana-parity-runner.py"

spec = importlib.util.spec_from_file_location("hsme_sana_parity_runner", SCRIPT)
runner = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(runner)


class Obj:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class HsmeSanaParityRunnerTest(unittest.TestCase):
    def runtime_lock_fixture(self, repository_code_allowed=False):
        return {
            "schemaVersion": runner.RUNTIME_LOCK_SCHEMA,
            "python": "3.12",
            "packages": {"torch": "2.14.0"},
            "coreArtifacts": {
                "torch": {"filename": "torch.whl", "sha256": "a" * 64},
                "diffusers": {"filename": "diffusers.whl", "sha256": "b" * 64},
                "transformers": {"filename": "transformers.whl", "sha256": "c" * 64},
                "huggingface-hub": {"filename": "hub.whl", "sha256": "d" * 64},
                "safetensors": {"filename": "safetensors.whl", "sha256": "e" * 64},
            },
            "policy": {
                "qualityPolicy": runner.QUALITY_POLICY,
                "modelRepositoryRuntimeCodeAllowed": repository_code_allowed,
                "binaryArtifactsPublishable": False,
                "productionAuthorityGranted": False,
                "providerAuthorityGranted": False,
                "billingAuthorityGranted": False,
                "projectArtifactMutationAllowed": False,
            },
        }

    def test_canonical_json_digest_is_order_independent(self):
        self.assertEqual(
            runner.sha256_json({"b": 2, "a": 1}),
            runner.sha256_json({"a": 1, "b": 2}),
        )

    def test_sibling_identity_prefers_lfs_sha256(self):
        sibling = Obj(
            rfilename="transformer/model.safetensors",
            size=123,
            lfs={"sha256": "a" * 64},
            blob_id="b" * 40,
        )
        self.assertEqual(
            runner.sibling_identity(sibling),
            {
                "path": "transformer/model.safetensors",
                "size": 123,
                "identityKind": "sha256",
                "identity": "a" * 64,
            },
        )

    def test_sibling_identity_falls_back_to_git_blob(self):
        sibling = Obj(
            rfilename="model_index.json",
            size=392,
            lfs=None,
            xet_file_data=None,
            blob_id="c" * 40,
        )
        self.assertEqual(runner.sibling_identity(sibling)["identityKind"], "git_blob_sha1")

    def test_component_digest_requires_component_files(self):
        with self.assertRaisesRegex(runner.RunnerError, "component inventory is empty"):
            runner.component_digest([], "vae/")

    def test_runtime_lock_is_quality_first_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lock.json"
            path.write_text(json.dumps(self.runtime_lock_fixture()), encoding="utf-8")
            lock, digest = runner.runtime_lock_digest(path)
            self.assertEqual(lock["policy"]["qualityPolicy"], runner.QUALITY_POLICY)
            self.assertRegex(digest, r"^[0-9a-f]{64}$")

    def test_runtime_lock_rejects_repository_code_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lock.json"
            path.write_text(json.dumps(self.runtime_lock_fixture(repository_code_allowed=True)), encoding="utf-8")
            with self.assertRaisesRegex(runner.RunnerError, "must be false"):
                runner.runtime_lock_digest(path)

    def test_runtime_lock_rejects_missing_core_artifact_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lock.json"
            value = self.runtime_lock_fixture()
            value["coreArtifacts"]["torch"]["sha256"] = "not-a-sha"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(runner.RunnerError, "core artifact sha256"):
                runner.runtime_lock_digest(path)

    def make_plan(self, runtime_digest="d" * 64, rights="EVIDENCE_RUN_ALLOWED"):
        identity = {
            "sourceRoot": runner.SANA_REPO,
            "immutableRevision": runner.SANA_REVISION,
            "contentSha256": "a" * 64,
        }
        return {
            "schemaVersion": runner.PLAN_SCHEMA,
            "candidateId": "sana-sprint-0.6b-exact-conditioning-parity",
            "qualityPolicy": runner.QUALITY_POLICY,
            "phase0EnvelopeDigest": "0" * 64,
            "sanaSnapshot": dict(identity),
            "transformer": dict(identity),
            "vae": dict(identity),
            "scheduler": dict(identity),
            "textEncoder": dict(identity),
            "tokenizer": dict(identity),
            "diffusersRuntime": {
                "sourceRoot": "huggingface/diffusers",
                "immutableRevision": "b" * 40,
                "contentSha256": "b" * 64,
            },
            "transformersRuntime": {
                "sourceRoot": "huggingface/transformers",
                "immutableRevision": "c" * 40,
                "contentSha256": "c" * 64,
            },
            "torchRuntime": {
                "sourceRoot": "pytorch/pytorch",
                "immutableRevision": "e" * 40,
                "contentSha256": "e" * 64,
            },
            "runtimeLockSha256": runtime_digest,
            "promptCommitmentKeyId": "test-key",
            "promptCommitmentHmacSha256": "f" * 64,
            "generation": {
                "width": 1024,
                "height": 1024,
                "inferenceSteps": 2,
                "seed": 424242,
                "latentSha256": "1" * 64,
                "schedulerTimestepsSha256": "2" * 64,
                "guidanceScaleMilli": 4500,
                "transformerDtype": "BF16",
                "textEncoderDtype": "BF16",
                "vaeDtype": "BF16",
                "executionProvider": "CUDA_SAME_DEVICE",
            },
            "parityPolicy": dict(runner.ALLOWED_PLAN_OUTCOME_POLICY),
            "rights": {
                "status": rights,
                "evidenceSha256": "9" * 64 if rights == "EVIDENCE_RUN_ALLOWED" else "UNKNOWN",
            },
            "rawPromptPersisted": False,
            "modelRepositoryCodeExecutionAllowed": False,
            "productionAuthorityGranted": False,
            "providerAuthorityGranted": False,
            "billingAuthorityGranted": False,
            "projectArtifactMutationAllowed": False,
            "binaryArtifactsPublishable": False,
        }

    def test_phase1_plan_digest_uses_contract_order_not_file_order(self):
        plan = self.make_plan()
        reordered = dict(reversed(list(plan.items())))
        self.assertEqual(runner.phase1_plan_digest(plan), runner.phase1_plan_digest(reordered))

    def test_generation_digest_uses_contract_order_not_file_order(self):
        generation = self.make_plan()["generation"]
        reordered = dict(reversed(list(generation.items())))
        self.assertEqual(
            runner.runtime_generation_digest(generation),
            runner.runtime_generation_digest(reordered),
        )

    def test_unknown_plan_field_is_rejected_before_digest_or_execution(self):
        plan = self.make_plan()
        plan["observedAfterRunTolerance"] = 0.2
        with self.assertRaisesRegex(runner.RunnerError, "plan fields mismatch"):
            runner.validate_plan(plan, "d" * 64, require_rights=True)

    def test_runtime_identity_source_is_fail_closed(self):
        plan = self.make_plan()
        plan["diffusersRuntime"]["sourceRoot"] = "someone/fork"
        with self.assertRaisesRegex(runner.RunnerError, "diffusersRuntime.sourceRoot mismatch"):
            runner.validate_plan(plan, "d" * 64, require_rights=True)

    def test_real_run_is_blocked_while_rights_unresolved(self):
        plan = self.make_plan(rights="UNRESOLVED")
        with self.assertRaisesRegex(runner.RunnerError, "blocked until rights.status"):
            runner.validate_plan(plan, "d" * 64, require_rights=True)

    def test_post_observation_tolerance_is_not_admitted(self):
        plan = self.make_plan()
        plan["parityPolicy"]["imageOutput"] = "LPIPS_LT_0.2"
        with self.assertRaisesRegex(runner.RunnerError, "must be exact"):
            runner.validate_plan(plan, "d" * 64, require_rights=True)

    def test_weight_repo_revision_is_hard_pinned(self):
        plan = self.make_plan()
        plan["sanaSnapshot"]["immutableRevision"] = "f" * 40
        with self.assertRaisesRegex(runner.RunnerError, "immutableRevision mismatch"):
            runner.validate_plan(plan, "d" * 64, require_rights=True)

    def test_authority_flags_are_fail_closed(self):
        plan = self.make_plan()
        plan["billingAuthorityGranted"] = True
        with self.assertRaisesRegex(runner.RunnerError, "billingAuthorityGranted must be false"):
            runner.validate_plan(plan, "d" * 64, require_rights=True)


if __name__ == "__main__":
    unittest.main()
