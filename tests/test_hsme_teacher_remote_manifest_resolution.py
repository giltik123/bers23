from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPT = Path(__file__).parents[1] / "scripts" / "resolve-hsme-teacher-remote-manifest.py"
SPEC = importlib.util.spec_from_file_location("teacher_remote_manifest", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
resolver = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = resolver
SPEC.loader.exec_module(resolver)


def request() -> dict:
    return {
        "teacherCandidateId": "teacher-a",
        "source": {
            "provider": "HUGGING_FACE",
            "sourceRoot": "example/teacher-a",
            "immutableRevision": "a" * 40,
        },
        "requestedCapabilities": ["IMAGE_EDITING"],
        "componentRoots": [
            {
                "componentId": "model-index",
                "relativePath": "model_index.json",
                "kind": "FILE",
                "role": "MODEL_CONFIG",
            },
            {
                "componentId": "transformer",
                "relativePath": "transformer",
                "kind": "DIRECTORY",
                "role": "DENOISER",
            },
        ],
        "publicMetadataLicenseId": "Apache-2.0",
        "rightsConclusion": "REVIEW_REQUIRED",
        "distillationOutputUse": "REVIEW_REQUIRED",
        "qualityGateStatus": "UNMEASURED",
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
    }


class FakeTransport:
    def __init__(self) -> None:
        self.revision = "a" * 40
        self.small = b'{"_class_name":"ExamplePipeline"}\n'
        self.small_etag = resolver.git_blob_sha1(self.small)
        self.lfs_sha = "b" * 64
        self.siblings = [
            {
                "rfilename": "README.md",
                "size": 10,
                "blob_id": "1" * 40,
                "lfs": None,
            },
            {
                "rfilename": "model_index.json",
                "size": len(self.small),
                "blob_id": self.small_etag,
                "lfs": None,
            },
            {
                "rfilename": "transformer/model-00001-of-00002.safetensors",
                "size": 1_000,
                "blob_id": "2" * 40,
                "lfs": {"sha256": self.lfs_sha, "size": 1_000},
            },
        ]

    def repo_info(self) -> SimpleNamespace:
        return SimpleNamespace(sha=self.revision, siblings=self.siblings)

    def metadata(self, root: str, path: str, revision: str) -> SimpleNamespace:
        assert root == "example/teacher-a"
        assert revision == self.revision
        if path == "model_index.json":
            return SimpleNamespace(
                commit_hash=self.revision,
                size=len(self.small),
                etag=self.small_etag,
            )
        if path.startswith("transformer/"):
            return SimpleNamespace(
                commit_hash=self.revision,
                size=1_000,
                etag=self.lfs_sha,
            )
        raise AssertionError(path)

    def content(self, root: str, path: str, revision: str) -> bytes:
        assert root == "example/teacher-a"
        assert path == "model_index.json"
        assert revision == self.revision
        return self.small


class RemoteManifestTests(unittest.TestCase):
    def test_resolves_explicit_lfs_and_locally_verified_git_blob_without_large_download(self) -> None:
        transport = FakeTransport()
        result = resolver.resolve_teacher_request(
            request(),
            transport.repo_info(),
            transport.metadata,
            transport.content,
        )
        self.assertEqual(result["artifactCount"], 2)
        self.assertEqual(result["lfsSha256VerifiedCount"], 1)
        self.assertEqual(result["gitBlobStreamedSha256Count"], 1)
        self.assertEqual(result["smallGitBytesDownloaded"], len(transport.small))
        self.assertFalse(result["largeModelPayloadsDownloaded"])
        self.assertFalse(result["xetStorageIdsUsedAsContentSha256"])
        self.assertRegex(result["artifactManifestSha256"], r"^[0-9a-f]{64}$")

        manifest = result["artifactManifest"]
        self.assertEqual(manifest["state"], "REMOTE_METADATA_RESOLVED")
        self.assertFalse(manifest["modelRepositoryCodeExecutionAllowed"])
        self.assertFalse(manifest["deserializationOccurred"])
        self.assertFalse(manifest["teacherAdmissionAllowed"])
        self.assertFalse(manifest["trainingStartAllowed"])
        by_path = {item["relativePath"]: item for item in manifest["artifacts"]}
        self.assertEqual(
            by_path["transformer/model-00001-of-00002.safetensors"]["contentSha256"],
            transport.lfs_sha,
        )
        self.assertEqual(
            by_path["model_index.json"]["contentSha256"],
            resolver.sha256_bytes(transport.small),
        )

    def test_remote_revision_must_equal_pinned_request_revision(self) -> None:
        transport = FakeTransport()
        info = transport.repo_info()
        info.sha = "c" * 40
        with self.assertRaisesRegex(resolver.ResolutionError, "Hub revision mismatch"):
            resolver.resolve_teacher_request(
                request(), info, transport.metadata, transport.content
            )

    def test_64_hex_etag_without_explicit_lfs_metadata_is_not_content_sha256(self) -> None:
        transport = FakeTransport()
        transport.siblings[-1]["lfs"] = None
        with self.assertRaisesRegex(
            resolver.ResolutionError,
            "lacks explicit LFS SHA-256 and Git blob SHA-1 identity",
        ):
            resolver.resolve_teacher_request(
                request(), transport.repo_info(), transport.metadata, transport.content
            )

    def test_git_blob_sha1_is_verified_before_local_sha256_derivation(self) -> None:
        transport = FakeTransport()

        def wrong_content(root: str, path: str, revision: str) -> bytes:
            return b"x" * len(transport.small)

        with self.assertRaisesRegex(resolver.ResolutionError, "Git blob SHA-1 verification failed"):
            resolver.resolve_teacher_request(
                request(), transport.repo_info(), transport.metadata, wrong_content
            )

    def test_selected_model_repository_python_code_is_rejected(self) -> None:
        transport = FakeTransport()
        transport.siblings.append(
            {
                "rfilename": "transformer/custom_pipeline.py",
                "size": 10,
                "blob_id": "3" * 40,
                "lfs": None,
            }
        )
        with self.assertRaisesRegex(resolver.ResolutionError, "Python code"):
            resolver.resolve_teacher_request(
                request(), transport.repo_info(), transport.metadata, transport.content
            )

    def test_every_requested_component_root_must_resolve(self) -> None:
        transport = FakeTransport()
        value = request()
        value["componentRoots"].append(
            {
                "componentId": "vae",
                "relativePath": "vae",
                "kind": "DIRECTORY",
                "role": "VAE",
            }
        )
        with self.assertRaisesRegex(resolver.ResolutionError, "component root resolved no files"):
            resolver.resolve_teacher_request(
                value, transport.repo_info(), transport.metadata, transport.content
            )

    def test_overlapping_component_roots_fail_closed(self) -> None:
        transport = FakeTransport()
        value = request()
        value["componentRoots"].append(
            {
                "componentId": "transformer-shard",
                "relativePath": "transformer/model-00001-of-00002.safetensors",
                "kind": "FILE",
                "role": "DENOISER",
            }
        )
        with self.assertRaisesRegex(resolver.ResolutionError, "overlapping component roots"):
            resolver.resolve_teacher_request(
                value, transport.repo_info(), transport.metadata, transport.content
            )

    def test_request_set_output_keeps_admission_and_training_authority_false(self) -> None:
        transport = FakeTransport()
        normalized = {
            "schemaVersion": "BERS_HSME_TEACHER_ACQUISITION_PIN_REQUEST_SET_V1",
            "requestSetId": "test-set",
            "requests": [request()],
            "qualityPolicy": "QUALITY_FLOOR_BEFORE_EFFICIENCY",
            "teacherAdmissionAllowed": False,
            "trainingStartAllowed": False,
            "productionAuthorityGranted": False,
        }
        result = resolver.resolve_request_set(
            normalized,
            "d" * 64,
            lambda root, revision: transport.repo_info(),
            transport.metadata,
            transport.content,
            huggingface_hub_version="0.36.0",
            hf_xet_version="1.1.10",
        )
        self.assertEqual(result["teacherCount"], 1)
        self.assertFalse(result["largeModelPayloadsDownloaded"])
        self.assertFalse(result["modelRepositoryCodeExecutionAllowed"])
        self.assertFalse(result["deserializationOccurred"])
        self.assertFalse(result["rightsResolved"])
        self.assertFalse(result["qualityMeasured"])
        self.assertFalse(result["teacherAdmissionAllowed"])
        self.assertFalse(result["trainingStartAllowed"])
        self.assertFalse(result["productionAuthorityGranted"])
        self.assertRegex(result["evidenceSha256"], r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
