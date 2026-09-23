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
    "verified_acquisition_plan_materializer",
    ROOT / "scripts" / "materialize-hsme-teacher-acquisition-plans.py",
)
runner = load_module(
    "verified_teacher_snapshot_acquisition",
    ROOT / "scripts" / "acquire-hsme-teacher-snapshot.py",
)


def build_remote() -> tuple[dict, dict[str, bytes]]:
    files = {
        "model_index.json": b'{"_class_name":"ExamplePipeline"}\n',
        "transformer/model.safetensors": b"denoiser-bytes",
        "text_encoder/model.safetensors": b"text-encoder-bytes",
        "vae/model.safetensors": b"vae-bytes",
    }
    role_by_path = {
        "model_index.json": ("model-index", "MODEL_CONFIG"),
        "transformer/model.safetensors": ("transformer", "DENOISER"),
        "text_encoder/model.safetensors": ("text-encoder", "TEXT_ENCODER"),
        "vae/model.safetensors": ("vae", "VAE"),
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
    component_totals = {}
    role_totals = {}
    for artifact in artifacts:
        component_totals[artifact["componentId"]] = component_totals.get(
            artifact["componentId"], 0
        ) + artifact["bytes"]
        role_totals[artifact["role"]] = role_totals.get(artifact["role"], 0) + artifact["bytes"]

    manifest = {
        "schemaVersion": materializer.REMOTE_MANIFEST_SCHEMA,
        "state": "REMOTE_METADATA_RESOLVED",
        "teacherCandidateId": "teacher-a",
        "source": source,
        "requestedCapabilities": ["IMAGE_EDITING"],
        "artifacts": artifacts,
        "componentByteTotals": dict(sorted(component_totals.items())),
        "roleByteTotals": dict(sorted(role_totals.items())),
        "totalBytes": sum(len(value) for value in files.values()),
        "modelRepositoryCodeExecutionAllowed": False,
        "deserializationOccurred": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
    }
    teacher = {
        "teacherCandidateId": "teacher-a",
        "source": source,
        "artifactCount": len(artifacts),
        "lfsSha256VerifiedCount": 3,
        "gitBlobStreamedSha256Count": 1,
        "smallGitBytesDownloaded": len(files["model_index.json"]),
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


def create_bundle(root: Path) -> tuple[Path, dict[str, bytes]]:
    remote, files = build_remote()
    bundle = materializer.materialize_bundle(remote)
    bundle_dir = root / "bundle"
    materializer.write_outputs(bundle, bundle_dir)
    return bundle_dir, files


class VerifiedSnapshotAcquisitionTests(unittest.TestCase):
    def test_exact_download_is_verified_then_destroyed_before_evidence_returns(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_dir, files = create_bundle(root)
            materialized = root / "ephemeral" / "teacher-bytes"
            calls = []

            def download(repo_id: str, filename: str, revision: str, local_dir: Path) -> Path:
                calls.append((repo_id, filename, revision, local_dir))
                target = local_dir / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(files[filename])
                return target

            expected_bytes = sum(len(value) for value in files.values())
            evidence = runner.acquire_and_verify(
                bundle_dir,
                "teacher-a",
                materialized,
                expected_bytes,
                download,
            )
            self.assertEqual(evidence["expectedBytes"], expected_bytes)
            self.assertEqual(evidence["downloadedArtifactCount"], len(files))
            self.assertEqual(
                evidence["downloadedRelativePaths"],
                sorted(files),
            )
            self.assertTrue(evidence["hashBeforeDeserialization"])
            self.assertFalse(evidence["deserializationPerformed"])
            self.assertFalse(evidence["modelRepositoryRuntimeCodeExecuted"])
            self.assertTrue(evidence["ephemeralModelBytesDestroyed"])
            self.assertTrue(evidence["cleanupVerifiedBeforeEvidenceWrite"])
            self.assertFalse(evidence["binaryPayloadPublished"])
            self.assertFalse(evidence["teacherAdmissionAllowed"])
            self.assertFalse(evidence["trainingStartAllowed"])
            self.assertFalse(evidence["runtimeAuthorityGranted"])
            self.assertFalse(evidence["productionAuthorityGranted"])
            self.assertFalse(evidence["providerAuthorityGranted"])
            self.assertFalse(evidence["billingAuthorityGranted"])
            self.assertFalse(evidence["projectArtifactMutationAllowed"])
            self.assertRegex(evidence["evidenceSha256"], r"^[0-9a-f]{64}$")
            self.assertFalse(materialized.exists())
            self.assertEqual(len(calls), len(files))

    def test_byte_budget_fails_before_any_download(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_dir, files = create_bundle(root)
            materialized = root / "ephemeral" / "teacher-bytes"
            calls = []

            def download(*args):
                calls.append(args)
                raise AssertionError("download should not start")

            total = sum(len(value) for value in files.values())
            with self.assertRaisesRegex(runner.AcquisitionRunError, "exceed explicit maxDownloadBytes"):
                runner.acquire_and_verify(
                    bundle_dir,
                    "teacher-a",
                    materialized,
                    total - 1,
                    download,
                )
            self.assertEqual(calls, [])
            self.assertFalse(materialized.exists())

    def test_sha_mismatch_fails_closed_and_still_destroys_downloaded_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_dir, files = create_bundle(root)
            materialized = root / "ephemeral" / "teacher-bytes"

            def download(repo_id: str, filename: str, revision: str, local_dir: Path) -> Path:
                target = local_dir / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                payload = files[filename]
                if filename == "transformer/model.safetensors":
                    payload = b"tampered-bytes"
                target.write_bytes(payload)
                return target

            with self.assertRaisesRegex(runner.AcquisitionRunError, "downloaded"):
                runner.acquire_and_verify(
                    bundle_dir,
                    "teacher-a",
                    materialized,
                    sum(len(value) for value in files.values()),
                    download,
                )
            self.assertFalse(materialized.exists())

    def test_download_path_drift_fails_closed_and_cleans_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_dir, files = create_bundle(root)
            materialized = root / "ephemeral" / "teacher-bytes"

            def download(repo_id: str, filename: str, revision: str, local_dir: Path) -> Path:
                target = local_dir / ("wrong-" + Path(filename).name)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(files[filename])
                return target

            with self.assertRaisesRegex(runner.AcquisitionRunError, "download target path drift"):
                runner.acquire_and_verify(
                    bundle_dir,
                    "teacher-a",
                    materialized,
                    sum(len(value) for value in files.values()),
                    download,
                )
            self.assertFalse(materialized.exists())

    def test_preexisting_materialized_bytes_are_never_deleted_or_reused(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_dir, files = create_bundle(root)
            materialized = root / "ephemeral" / "teacher-bytes"
            materialized.mkdir(parents=True)
            marker = materialized / "do-not-touch.txt"
            marker.write_text("existing")

            with self.assertRaisesRegex(runner.AcquisitionRunError, "must not contain pre-existing files"):
                runner.acquire_and_verify(
                    bundle_dir,
                    "teacher-a",
                    materialized,
                    sum(len(value) for value in files.values()),
                    lambda *args: (_ for _ in ()).throw(AssertionError("no download")),
                )
            self.assertTrue(marker.is_file())
            self.assertEqual(marker.read_text(), "existing")

    def test_bundle_authority_widening_blocks_acquisition_before_network(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_dir, files = create_bundle(root)
            index_path = bundle_dir / "acquisition-plan-bundle.json"
            index = json.loads(index_path.read_text())
            index["teacherAdmissionAllowed"] = True
            index_path.write_text(json.dumps(index, indent=2) + "\n")
            calls = []

            with self.assertRaisesRegex(runner.AcquisitionRunError, "must remain false"):
                runner.acquire_and_verify(
                    bundle_dir,
                    "teacher-a",
                    root / "ephemeral" / "teacher-bytes",
                    sum(len(value) for value in files.values()),
                    lambda *args: calls.append(args),
                )
            self.assertEqual(calls, [])

    def test_unknown_candidate_cannot_trigger_download(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_dir, files = create_bundle(root)
            calls = []
            with self.assertRaisesRegex(runner.AcquisitionRunError, "exactly one acquisition bundle entry"):
                runner.acquire_and_verify(
                    bundle_dir,
                    "other-teacher",
                    root / "ephemeral" / "teacher-bytes",
                    sum(len(value) for value in files.values()),
                    lambda *args: calls.append(args),
                )
            self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
