from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


materializer = load_module(
    "teacher_acquisition_plan_materializer",
    ROOT / "scripts" / "materialize-hsme-teacher-acquisition-plans.py",
)
inspector = load_module(
    "teacher_snapshot_inspector",
    ROOT / "scripts" / "inspect-hsme-teacher-snapshot.py",
)


def synthetic_remote() -> tuple[dict, dict[str, bytes]]:
    files = {
        "model_index.json": b'{"_class_name":"ExamplePipeline"}\n',
        "transformer/model.safetensors": b"denoiser-bytes",
        "transformer/config.json": b'{"layers":4}\n',
        "text_encoder/model.safetensors": b"text-encoder-bytes",
        "vae/model.safetensors": b"vae-bytes",
        "tokenizer/tokenizer.json": b'{"version":"1.0"}\n',
        "scheduler/scheduler_config.json": b'{"name":"scheduler"}\n',
    }
    role_by_path = {
        "model_index.json": ("model-index", "MODEL_CONFIG"),
        "transformer/model.safetensors": ("transformer", "DENOISER"),
        "transformer/config.json": ("transformer", "DENOISER"),
        "text_encoder/model.safetensors": ("text-encoder", "TEXT_ENCODER"),
        "vae/model.safetensors": ("vae", "VAE"),
        "tokenizer/tokenizer.json": ("tokenizer", "TOKENIZER_ASSET"),
        "scheduler/scheduler_config.json": ("scheduler", "SCHEDULER_ASSET"),
    }
    source = {
        "provider": "HUGGING_FACE",
        "sourceRoot": "example/teacher-a",
        "immutableRevision": "a" * 40,
    }
    artifacts = []
    for relative_path, payload in files.items():
        component_id, role = role_by_path[relative_path]
        artifacts.append(
            {
                "componentId": component_id,
                "relativePath": relative_path,
                "role": role,
                "bytes": len(payload),
                "contentSha256": materializer.sha256_bytes(payload),
                "identityMethod": (
                    "GIT_LFS_OID_SHA256_VERIFIED"
                    if relative_path.endswith(".safetensors")
                    else "STREAMED_GIT_BLOB_SHA256"
                ),
            }
        )
    artifacts.sort(key=lambda item: (item["componentId"], item["relativePath"]))
    manifest = {
        "schemaVersion": materializer.REMOTE_MANIFEST_SCHEMA,
        "state": "REMOTE_METADATA_RESOLVED",
        "teacherCandidateId": "teacher-a",
        "source": source,
        "requestedCapabilities": ["IMAGE_EDITING"],
        "artifacts": artifacts,
        "componentByteTotals": {},
        "roleByteTotals": {},
        "totalBytes": sum(len(value) for value in files.values()),
        "modelRepositoryCodeExecutionAllowed": False,
        "deserializationOccurred": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
    }
    for artifact in artifacts:
        manifest["componentByteTotals"][artifact["componentId"]] = (
            manifest["componentByteTotals"].get(artifact["componentId"], 0) + artifact["bytes"]
        )
        manifest["roleByteTotals"][artifact["role"]] = (
            manifest["roleByteTotals"].get(artifact["role"], 0) + artifact["bytes"]
        )
    manifest["componentByteTotals"] = dict(sorted(manifest["componentByteTotals"].items()))
    manifest["roleByteTotals"] = dict(sorted(manifest["roleByteTotals"].items()))
    teacher = {
        "teacherCandidateId": "teacher-a",
        "source": source,
        "artifactCount": len(artifacts),
        "lfsSha256VerifiedCount": 3,
        "gitBlobStreamedSha256Count": len(artifacts) - 3,
        "smallGitBytesDownloaded": sum(
            artifact["bytes"]
            for artifact in artifacts
            if artifact["identityMethod"] == "STREAMED_GIT_BLOB_SHA256"
        ),
        "largeModelPayloadsDownloaded": False,
        "xetStorageIdsUsedAsContentSha256": False,
        "artifactManifest": manifest,
        "artifactManifestSha256": materializer.domain_digest(
            materializer.REMOTE_MANIFEST_DOMAIN, manifest
        ),
    }
    evidence = {
        "schemaVersion": materializer.REMOTE_EVIDENCE_SCHEMA,
        "requestSetId": "teacher-request-set",
        "requestSetSha256": "b" * 64,
        "qualityPolicy": "QUALITY_FLOOR_BEFORE_EFFICIENCY",
        "huggingfaceHubVersion": "0.36.0",
        "hfXetVersion": "1.1.10",
        "teacherCount": 1,
        "largeModelPayloadsDownloaded": False,
        "modelRepositoryCodeExecutionAllowed": False,
        "deserializationOccurred": False,
        "rightsResolved": False,
        "qualityMeasured": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "productionAuthorityGranted": False,
        "teachers": [teacher],
    }
    evidence["evidenceSha256"] = materializer.domain_digest(
        materializer.REMOTE_EVIDENCE_DOMAIN, evidence
    )
    return evidence, files


class AcquisitionPlanMaterializationTests(unittest.TestCase):
    def test_bridge_output_is_exactly_consumable_by_snapshot_inspector(self) -> None:
        remote, files = synthetic_remote()
        bundle = materializer.materialize_bundle(remote)
        self.assertEqual(bundle["teacherCount"], 1)
        self.assertFalse(bundle["networkAccessPerformed"])
        self.assertFalse(bundle["modelPayloadsDownloaded"])
        self.assertFalse(bundle["deserializationOccurred"])
        self.assertFalse(bundle["teacherAdmissionAllowed"])
        self.assertFalse(bundle["trainingStartAllowed"])
        self.assertFalse(bundle["runtimeAuthorityGranted"])
        self.assertFalse(bundle["productionAuthorityGranted"])

        entry = bundle["entries"][0]
        plan = inspector.normalize_plan(entry["plan"])
        expected = entry["expectedManifest"]

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / "teacher-a"
            for relative_path, payload in files.items():
                target = source_root / relative_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)

            observed = inspector.build_manifest(plan, root)
            self.assertEqual(
                inspector.canonical_json(observed),
                inspector.canonical_json(expected),
            )

        roles = {
            artifact["relativePath"]: artifact["role"]
            for artifact in expected["artifacts"]
        }
        self.assertEqual(roles["transformer/model.safetensors"], "DENOISER_WEIGHT")
        self.assertEqual(roles["text_encoder/model.safetensors"], "TEXT_ENCODER_WEIGHT")
        self.assertEqual(roles["vae/model.safetensors"], "VAE_WEIGHT")
        self.assertEqual(roles["transformer/config.json"], "RUNTIME_ASSET")
        self.assertEqual(roles["tokenizer/tokenizer.json"], "TOKENIZER_ASSET")
        self.assertEqual(roles["scheduler/scheduler_config.json"], "SCHEDULER_ASSET")
        self.assertRegex(entry["planSha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(entry["expectedManifestSha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(bundle["bundleSha256"], r"^[0-9a-f]{64}$")

    def test_remote_evidence_digest_is_independently_reverified(self) -> None:
        remote, _ = synthetic_remote()
        remote["teachers"][0]["artifactCount"] += 1
        with self.assertRaisesRegex(materializer.MaterializationError, "remote evidence digest mismatch"):
            materializer.materialize_bundle(remote)

    def test_remote_teacher_manifest_digest_is_independently_reverified(self) -> None:
        remote, _ = synthetic_remote()
        manifest = remote["teachers"][0]["artifactManifest"]
        manifest["totalBytes"] += 1
        remote_payload = dict(remote)
        remote_payload.pop("evidenceSha256")
        remote["evidenceSha256"] = materializer.domain_digest(
            materializer.REMOTE_EVIDENCE_DOMAIN, remote_payload
        )
        with self.assertRaisesRegex(materializer.MaterializationError, "remote manifest digest mismatch"):
            materializer.materialize_bundle(remote)

    def test_runtime_code_cannot_enter_acquisition_plan(self) -> None:
        remote, _ = synthetic_remote()
        artifact = remote["teachers"][0]["artifactManifest"]["artifacts"][0]
        artifact["relativePath"] = "transformer/custom_pipeline.py"
        teacher = remote["teachers"][0]
        teacher["artifactManifestSha256"] = materializer.domain_digest(
            materializer.REMOTE_MANIFEST_DOMAIN, teacher["artifactManifest"]
        )
        payload = dict(remote)
        payload.pop("evidenceSha256")
        remote["evidenceSha256"] = materializer.domain_digest(
            materializer.REMOTE_EVIDENCE_DOMAIN, payload
        )
        with self.assertRaisesRegex(materializer.MaterializationError, "runtime code rejected"):
            materializer.materialize_bundle(remote)

    def test_zero_byte_artifact_is_rejected_before_snapshot_acquisition(self) -> None:
        remote, _ = synthetic_remote()
        artifact = remote["teachers"][0]["artifactManifest"]["artifacts"][0]
        artifact["bytes"] = 0
        teacher = remote["teachers"][0]
        teacher["artifactManifestSha256"] = materializer.domain_digest(
            materializer.REMOTE_MANIFEST_DOMAIN, teacher["artifactManifest"]
        )
        payload = dict(remote)
        payload.pop("evidenceSha256")
        remote["evidenceSha256"] = materializer.domain_digest(
            materializer.REMOTE_EVIDENCE_DOMAIN, payload
        )
        with self.assertRaisesRegex(materializer.MaterializationError, "zero-byte"):
            materializer.materialize_bundle(remote)

    def test_unsupported_component_role_cannot_be_mapped_heuristically(self) -> None:
        remote, _ = synthetic_remote()
        artifact = remote["teachers"][0]["artifactManifest"]["artifacts"][0]
        artifact["role"] = "UNKNOWN_MAGIC_COMPONENT"
        teacher = remote["teachers"][0]
        teacher["artifactManifestSha256"] = materializer.domain_digest(
            materializer.REMOTE_MANIFEST_DOMAIN, teacher["artifactManifest"]
        )
        payload = dict(remote)
        payload.pop("evidenceSha256")
        remote["evidenceSha256"] = materializer.domain_digest(
            materializer.REMOTE_EVIDENCE_DOMAIN, payload
        )
        with self.assertRaisesRegex(materializer.MaterializationError, "unsupported remote component role"):
            materializer.materialize_bundle(remote)

    def test_write_outputs_keeps_only_json_plans_and_expected_manifests(self) -> None:
        remote, _ = synthetic_remote()
        bundle = materializer.materialize_bundle(remote)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            materializer.write_outputs(bundle, output)
            index = json.loads((output / "acquisition-plan-bundle.json").read_text())
            self.assertEqual(index["teacherCount"], 1)
            self.assertFalse(index["networkAccessPerformed"])
            self.assertFalse(index["modelPayloadsDownloaded"])
            self.assertFalse(index["teacherAdmissionAllowed"])
            self.assertFalse(index["trainingStartAllowed"])
            self.assertFalse(index["runtimeAuthorityGranted"])
            self.assertTrue((output / index["entries"][0]["planPath"]).is_file())
            self.assertTrue((output / index["entries"][0]["expectedManifestPath"]).is_file())
            self.assertEqual(
                sorted(path.suffix for path in output.rglob("*") if path.is_file()),
                [".json", ".json", ".json"],
            )


if __name__ == "__main__":
    unittest.main()
