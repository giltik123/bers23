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
            "packages": {
                "torch": "2.14.0",
                "diffusers": "0.40.0",
                "transformers": "5.17.0",
            },
            "coreArtifacts": {
                "torch": {"filename": "torch.whl", "sha256": "a" * 64},
                "diffusers": {"filename": "diffusers.whl", "sha256": "b" * 64},
                "transformers": {"filename": "transformers.whl", "sha256": "c" * 64},
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

    def test_hub_file_identity_uses_64_hex_etag_as_content_sha256(self):
        self.assertEqual(
            runner.hub_file_identity("transformer/model.safetensors", 123, '"a' + "a" * 63 + '"'),
            {
                "path": "transformer/model.safetensors",
                "size": 123,
                "identityKind": "sha256",
                "identity": "a" * 64,
            },
        )

    def test_hub_file_identity_uses_40_hex_etag_as_git_blob(self):
        value = runner.hub_file_identity("model_index.json", 392, "c" * 40)
        self.assertEqual(value["identityKind"], "git_blob_sha1")
        self.assertEqual(value["identity"], "c" * 40)

    def test_hub_file_identity_accepts_weak_quoted_content_etag_only_after_hex_validation(self):
        value = runner.hub_file_identity("scheduler/scheduler_config.json", 12, 'W/"' + "d" * 40 + '"')
        self.assertEqual(value["identityKind"], "git_blob_sha1")
        self.assertEqual(value["identity"], "d" * 40)

    def test_hub_file_identity_rejects_non_content_storage_id(self):
        with self.assertRaisesRegex(runner.RunnerError, "locally verifiable"):
            runner.hub_file_identity("transformer/model.safetensors", 123, "xet-file-id")

    def test_component_digest_requires_component_files(self):
        with self.assertRaisesRegex(runner.RunnerError, "component inventory is empty"):
            runner.component_digest([], "vae/")

    def test_large_file_hashing_is_streaming_equivalent(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "payload.bin"
            payload = (b"0123456789abcdef" * 1024) + b"tail"
            path.write_bytes(payload)
            self.assertEqual(runner.sha256_file(path, chunk_size=31), runner.sha256_bytes(payload))

    def test_git_blob_sha1_streaming_matches_git_object_identity(self):
        import hashlib
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "object.bin"
            payload = b"git-object-payload" * 100
            path.write_bytes(payload)
            expected = hashlib.sha1(f"blob {len(payload)}\0".encode("ascii") + payload).hexdigest()
            runner.verify_git_blob_sha1(path, expected, chunk_size=17)

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
                "sourceRoot": runner.DIFFUSERS_REPO,
                "immutableRevision": runner.DIFFUSERS_REVISION,
                "contentSha256": "b" * 64,
            },
            "transformersRuntime": {
                "sourceRoot": runner.TRANSFORMERS_REPO,
                "immutableRevision": runner.TRANSFORMERS_REVISION,
                "contentSha256": "c" * 64,
            },
            "torchRuntime": {
                "sourceRoot": runner.TORCH_REPO,
                "immutableRevision": runner.TORCH_REVISION,
                "contentSha256": "a" * 64,
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

    def make_conditioning_request(self, runtime_digest="d" * 64, rights="EVIDENCE_RUN_ALLOWED"):
        identity = {
            "sourceRoot": runner.SANA_REPO,
            "immutableRevision": runner.SANA_REVISION,
            "contentSha256": "a" * 64,
        }
        return {
            "schemaVersion": runner.CONDITIONING_REQUEST_SCHEMA,
            "candidateId": "sana-sprint-0.6b-split-conditioning",
            "qualityPolicy": runner.QUALITY_POLICY,
            "sanaCore": dict(identity),
            "textEncoder": dict(identity),
            "tokenizer": dict(identity),
            "runtime": {
                "sourceRoot": runner.DIFFUSERS_REPO,
                "immutableRevision": runner.DIFFUSERS_REVISION,
                "contentSha256": "b" * 64,
            },
            "runtimeLockSha256": runtime_digest,
            "promptCommitmentKeyId": "test-key",
            "promptCommitmentHmacSha256": "f" * 64,
            "preprocessingPolicySha256": runner.PREPROCESSING_POLICY_SHA256,
            "rights": {
                "status": rights,
                "evidenceSha256": "9" * 64 if rights == "EVIDENCE_RUN_ALLOWED" else "UNKNOWN",
            },
            "rawPromptPersisted": False,
            "modelRepositoryCodeExecutionAllowed": False,
            "runtimeAuthorityGranted": False,
            "binaryPayloadPublishable": False,
        }

    def test_conditioning_request_binds_diffusers_source_commit_and_wheel(self):
        request = self.make_conditioning_request()
        runner.validate_conditioning_request(
            request,
            self.runtime_lock_fixture(),
            "d" * 64,
        )

    def test_conditioning_request_blocks_unresolved_rights(self):
        request = self.make_conditioning_request(rights="UNRESOLVED")
        with self.assertRaisesRegex(runner.RunnerError, "blocked until rights.status"):
            runner.validate_conditioning_request(
                request,
                self.runtime_lock_fixture(),
                "d" * 64,
            )

    def test_conditioning_request_rejects_runtime_source_rebinding(self):
        request = self.make_conditioning_request()
        request["runtime"]["immutableRevision"] = "e" * 40
        with self.assertRaisesRegex(runner.RunnerError, "runtime.immutableRevision mismatch"):
            runner.validate_conditioning_request(
                request,
                self.runtime_lock_fixture(),
                "d" * 64,
            )

    def test_conditioning_request_rejects_unreviewed_runtime_artifact(self):
        request = self.make_conditioning_request()
        request["runtime"]["contentSha256"] = "e" * 64
        with self.assertRaisesRegex(runner.RunnerError, "runtime content digest mismatch"):
            runner.validate_conditioning_request(
                request,
                self.runtime_lock_fixture(),
                "d" * 64,
            )

    def test_conditioning_request_rejects_preprocessing_policy_substitution(self):
        request = self.make_conditioning_request()
        request["preprocessingPolicySha256"] = "7" * 64
        with self.assertRaisesRegex(runner.RunnerError, "preprocessing policy digest mismatch"):
            runner.validate_conditioning_request(
                request,
                self.runtime_lock_fixture(),
                "d" * 64,
            )

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
            runner.validate_plan(plan, self.runtime_lock_fixture(), "d" * 64, require_rights=True)

    def test_runtime_identity_source_is_fail_closed(self):
        plan = self.make_plan()
        plan["diffusersRuntime"]["sourceRoot"] = "someone/fork"
        with self.assertRaisesRegex(runner.RunnerError, "diffusersRuntime.sourceRoot mismatch"):
            runner.validate_plan(plan, self.runtime_lock_fixture(), "d" * 64, require_rights=True)

    def test_real_run_is_blocked_while_rights_unresolved(self):
        plan = self.make_plan(rights="UNRESOLVED")
        with self.assertRaisesRegex(runner.RunnerError, "blocked until rights.status"):
            runner.validate_plan(plan, self.runtime_lock_fixture(), "d" * 64, require_rights=True)

    def test_post_observation_tolerance_is_not_admitted(self):
        plan = self.make_plan()
        plan["parityPolicy"]["imageOutput"] = "LPIPS_LT_0.2"
        with self.assertRaisesRegex(runner.RunnerError, "must be exact"):
            runner.validate_plan(plan, self.runtime_lock_fixture(), "d" * 64, require_rights=True)

    def test_weight_repo_revision_is_hard_pinned(self):
        plan = self.make_plan()
        plan["sanaSnapshot"]["immutableRevision"] = "f" * 40
        with self.assertRaisesRegex(runner.RunnerError, "immutableRevision mismatch"):
            runner.validate_plan(plan, self.runtime_lock_fixture(), "d" * 64, require_rights=True)

    def test_authority_flags_are_fail_closed(self):
        plan = self.make_plan()
        plan["billingAuthorityGranted"] = True
        with self.assertRaisesRegex(runner.RunnerError, "billingAuthorityGranted must be false"):
            runner.validate_plan(plan, self.runtime_lock_fixture(), "d" * 64, require_rights=True)


    def test_accepted_sana_trust_binds_relicensed_revision_and_content_sha_components(self):
        trust_path = ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json"
        candidate, components = runner.accepted_sana_trust(trust_path)
        self.assertEqual(
            candidate["artifactManifest"]["primarySource"],
            {"sourceRoot": runner.SANA_REPO, "immutableRevision": runner.SANA_REVISION},
        )
        self.assertEqual(
            components["sanaSnapshot"],
            "c48d41a5479b31cb420b14660da9893555f745ba348f16e47ddd7e69688b4ed4",
        )
        for name in ("transformer", "vae", "scheduler", "textEncoder", "tokenizer"):
            self.assertRegex(components[name], r"^[0-9a-f]{64}$")

    def test_accepted_sana_trust_rejects_old_revision_rebinding(self):
        source = ROOT / "src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json"
        trust = json.loads(source.read_text())
        candidate = next(
            item for item in trust["candidates"]
            if item["candidateId"] == "sana-sprint-0.6b-split-v1"
        )
        candidate["artifactManifest"]["primarySource"]["immutableRevision"] = (
            "a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "trust.json"
            path.write_text(json.dumps(trust))
            with self.assertRaisesRegex(runner.RunnerError, "artifact source mismatch"):
                runner.accepted_sana_trust(path)

    def test_conditioning_request_must_match_accepted_trust_projection(self):
        request = self.make_conditioning_request()
        components = {
            "sanaSnapshot": "1" * 64,
            "textEncoder": "2" * 64,
            "tokenizer": "3" * 64,
        }
        request["sanaCore"]["contentSha256"] = components["sanaSnapshot"]
        request["textEncoder"]["contentSha256"] = components["textEncoder"]
        request["tokenizer"]["contentSha256"] = components["tokenizer"]
        runner.verify_conditioning_request_against_trust(request, components)
        request["tokenizer"]["contentSha256"] = "4" * 64
        with self.assertRaisesRegex(runner.RunnerError, "tokenizer accepted-trust digest mismatch"):
            runner.verify_conditioning_request_against_trust(request, components)


if __name__ == "__main__":
    unittest.main()
