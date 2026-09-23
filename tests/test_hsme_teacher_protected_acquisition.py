from __future__ import annotations

import importlib.util
import json
import shutil
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


runner = load_module(
    "teacher_protected_acquisition",
    ROOT / "scripts" / "acquire-hsme-teacher-snapshot.py",
)
inspector = load_module(
    "teacher_snapshot_inspector_for_acquisition_test",
    ROOT / "scripts" / "inspect-hsme-teacher-snapshot.py",
)


def fixture():
    source = {
        "provider": "HUGGING_FACE",
        "sourceRoot": "example/teacher-a",
        "immutableRevision": "a" * 40,
    }
    files = {
        "model_index.json": b'{"_class_name":"ExamplePipeline"}\n',
        "transformer/model.safetensors": b"exact-weight-bytes",
    }
    artifacts = [
        {
            "logicalId": "file/model-index",
            "source": source,
            "relativePath": "model_index.json",
            "role": "MODEL_CONFIG",
            "runtimeRequired": True,
        },
        {
            "logicalId": "file/transformer-weight",
            "source": source,
            "relativePath": "transformer/model.safetensors",
            "role": "DENOISER_WEIGHT",
            "runtimeRequired": True,
        },
    ]
    plan = {
        "schemaVersion": inspector.PLAN_SCHEMA,
        "teacherCandidateId": "teacher-a",
        "primarySource": source,
        "sources": [
            {
                "source": source,
                "materializedSubdir": "teacher-a",
            }
        ],
        "artifacts": artifacts,
    }
    expected = {
        "schemaVersion": inspector.MANIFEST_SCHEMA,
        "teacherCandidateId": "teacher-a",
        "primarySource": source,
        "artifacts": [
            {
                **artifact,
                "contentSha256": runner.sha256_bytes(files[artifact["relativePath"]]),
                "bytes": len(files[artifact["relativePath"]]),
            }
            for artifact in artifacts
        ],
    }
    expected["artifacts"].sort(key=lambda value: value["logicalId"])
    return plan, expected, files


def downloader_for(files, *, corrupt_path=None, escape_root=None):
    calls = []

    def download(source, relative_path, destination_root):
        calls.append((source, relative_path, destination_root))
        if escape_root is not None:
            target = escape_root / relative_path
        else:
            target = destination_root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = files[relative_path]
        if relative_path == corrupt_path:
            payload = b"x" * len(payload)
        target.write_bytes(payload)
        return target

    download.calls = calls
    return download


class ProtectedAcquisitionTests(unittest.TestCase):
    def test_exact_files_are_hashed_before_deserialization_and_match_expected_manifest(self):
        plan, expected, files = fixture()
        fake = downloader_for(files)
        with tempfile.TemporaryDirectory() as temp:
            materialized = Path(temp) / "materialized"
            manifest, evidence = runner.acquire(
                plan,
                expected,
                materialized,
                downloader=fake,
            )
            self.assertEqual(
                inspector.canonical_json(manifest),
                inspector.canonical_json(expected),
            )
            self.assertEqual(evidence["downloadedArtifactCount"], 2)
            self.assertEqual(
                evidence["expectedDownloadBytes"],
                sum(len(value) for value in files.values()),
            )
            self.assertEqual(evidence["observedBytes"], evidence["expectedDownloadBytes"])
            self.assertTrue(evidence["matchesExpectedManifest"])
            self.assertTrue(evidence["hashBeforeDeserialization"])
            self.assertFalse(evidence["deserializationPerformed"])
            self.assertFalse(evidence["modelRepositoryRuntimeCodeExecuted"])
            self.assertFalse(evidence["binaryPayloadPublished"])
            self.assertFalse(evidence["teacherAdmissionAllowed"])
            self.assertFalse(evidence["trainingStartAllowed"])
            self.assertFalse(evidence["runtimeAuthorityGranted"])
            self.assertFalse(evidence["productionAuthorityGranted"])
            self.assertRegex(evidence["evidenceSha256"], r"^[0-9a-f]{64}$")
            self.assertEqual(
                [(call[0]["sourceRoot"], call[0]["immutableRevision"], call[1]) for call in fake.calls],
                [
                    ("example/teacher-a", "a" * 40, "model_index.json"),
                    ("example/teacher-a", "a" * 40, "transformer/model.safetensors"),
                ],
            )

    def test_explicit_download_byte_ceiling_blocks_network_before_first_file(self):
        plan, expected, files = fixture()
        fake = downloader_for(files)
        with tempfile.TemporaryDirectory() as temp:
            total = sum(len(value) for value in files.values())
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "exceed explicit maxDownloadBytes",
            ):
                runner.acquire(
                    plan,
                    expected,
                    Path(temp) / "materialized",
                    max_download_bytes=total - 1,
                    downloader=fake,
                )
            self.assertEqual(fake.calls, [])

    def test_corrupt_downloaded_bytes_fail_expected_manifest_identity(self):
        plan, expected, files = fixture()
        fake = downloader_for(files, corrupt_path="transformer/model.safetensors")
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "identity mismatch against remote expected manifest",
            ):
                runner.acquire(
                    plan,
                    expected,
                    Path(temp) / "materialized",
                    downloader=fake,
                )

    def test_downloader_path_escape_is_rejected(self):
        plan, expected, files = fixture()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            escape = root / "outside"
            fake = downloader_for(files, escape_root=escape)
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "escaped source root",
            ):
                runner.acquire(
                    plan,
                    expected,
                    root / "materialized",
                    downloader=fake,
                )

    def test_materialized_root_must_be_empty(self):
        plan, expected, files = fixture()
        fake = downloader_for(files)
        with tempfile.TemporaryDirectory() as temp:
            materialized = Path(temp) / "materialized"
            materialized.mkdir()
            (materialized / "stale.bin").write_bytes(b"stale")
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "must be empty",
            ):
                runner.acquire(plan, expected, materialized, downloader=fake)

    def test_model_repository_python_file_cannot_be_downloaded_as_runtime_asset(self):
        plan, expected, files = fixture()
        source = plan["primarySource"]
        payload = b"print('unsafe model code')\n"
        files["transformer/custom_pipeline.py"] = payload
        plan["artifacts"].append(
            {
                "logicalId": "file/runtime-code-disguised",
                "source": source,
                "relativePath": "transformer/custom_pipeline.py",
                "role": "RUNTIME_ASSET",
                "runtimeRequired": True,
            }
        )
        expected["artifacts"].append(
            {
                **plan["artifacts"][-1],
                "contentSha256": runner.sha256_bytes(payload),
                "bytes": len(payload),
            }
        )
        fake = downloader_for(files)
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "Python runtime code",
            ):
                runner.acquire(
                    plan,
                    expected,
                    Path(temp) / "materialized",
                    downloader=fake,
                )

    def test_expected_manifest_cannot_change_plan_role_or_path_binding(self):
        plan, expected, files = fixture()
        expected["artifacts"][0]["role"] = "RUNTIME_ASSET"
        fake = downloader_for(files)
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "plan binding mismatch",
            ):
                runner.acquire(
                    plan,
                    expected,
                    Path(temp) / "materialized",
                    downloader=fake,
                )

    def test_cleanup_proof_fails_until_model_and_cache_paths_are_physically_removed(self):
        plan, expected, files = fixture()
        fake = downloader_for(files)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            materialized = root / "materialized"
            hf_home = root / "hf-cache"
            hf_home.mkdir()
            _, evidence = runner.acquire(
                plan,
                expected,
                materialized,
                downloader=fake,
            )
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "model bytes still exist",
            ):
                runner.prove_cleanup(materialized, hf_home, evidence)

            shutil.rmtree(materialized)
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "cache bytes still exist",
            ):
                runner.prove_cleanup(materialized, hf_home, evidence)

            shutil.rmtree(hf_home)
            cleanup = runner.prove_cleanup(materialized, hf_home, evidence)
            self.assertFalse(cleanup["modelBytesPresent"])
            self.assertFalse(cleanup["hubCacheBytesPresent"])
            self.assertFalse(cleanup["binaryPayloadPublishable"])
            self.assertFalse(cleanup["teacherAdmissionAllowed"])
            self.assertFalse(cleanup["trainingStartAllowed"])
            self.assertFalse(cleanup["runtimeAuthorityGranted"])
            self.assertFalse(cleanup["productionAuthorityGranted"])
            self.assertEqual(
                cleanup["acquisitionEvidenceSha256"],
                evidence["evidenceSha256"],
            )
            self.assertRegex(cleanup["cleanupEvidenceSha256"], r"^[0-9a-f]{64}$")

    def test_cleanup_rehashes_acquisition_evidence(self):
        plan, expected, files = fixture()
        fake = downloader_for(files)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            materialized = root / "materialized"
            hf_home = root / "hf-cache"
            _, evidence = runner.acquire(
                plan,
                expected,
                materialized,
                downloader=fake,
            )
            shutil.rmtree(materialized)
            tampered = dict(evidence)
            tampered["expectedDownloadBytes"] += 1
            with self.assertRaisesRegex(
                runner.ProtectedAcquisitionError,
                "evidence digest mismatch",
            ):
                runner.prove_cleanup(materialized, hf_home, tampered)


if __name__ == "__main__":
    unittest.main()
