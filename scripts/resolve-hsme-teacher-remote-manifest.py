#!/usr/bin/env python3
"""Resolve pinned teacher repository metadata without downloading model payloads.

Large-file content identity is accepted only from explicit Git LFS SHA-256
metadata. Ordinary Git blobs are downloaded only inside a bounded small-file
budget so their Git SHA-1 can be verified before locally deriving SHA-256.
Xet chunk/storage identifiers are never treated as content SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Callable
from urllib.request import Request, urlopen

SCHEMA = "BERS_HSME_TEACHER_REMOTE_MANIFEST_EVIDENCE_V1"
MANIFEST_SCHEMA = "BERS_HSME_TEACHER_REMOTE_ARTIFACT_MANIFEST_V1"
MANIFEST_DOMAIN = b"bers:hsme:teacher-remote-artifact-manifest:v1\0"
EVIDENCE_DOMAIN = b"bers:hsme:teacher-remote-manifest-evidence:v1\0"
MAX_GIT_FILE_BYTES = 8 * 1024 * 1024
MAX_GIT_BYTES_PER_TEACHER = 32 * 1024 * 1024
MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991
HEX = set("0123456789abcdef")


class ResolutionError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise ResolutionError(message)


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def domain_digest(domain: bytes, value: Any) -> str:
    return sha256_bytes(domain + canonical_bytes(value))


def git_blob_sha1(value: bytes) -> str:
    digest = hashlib.sha1()
    digest.update(f"blob {len(value)}\0".encode("ascii"))
    digest.update(value)
    return digest.hexdigest()


def require_hex(value: Any, length: int, label: str) -> str:
    if not isinstance(value, str) or len(value) != length or any(ch not in HEX for ch in value):
        fail(f"{label} must be lowercase {length}-hex")
    return value


def require_safe_integer(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > MAX_SAFE_JSON_INTEGER:
        fail(f"{label} must be a non-negative JSON-safe integer")
    return value


def attr(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def safe_path(value: Any) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        fail("repository path is invalid")
    pure = PurePosixPath(value)
    if pure.is_absolute() or any(part in ("", ".", "..") for part in pure.parts):
        fail(f"unsafe repository path: {value}")
    return value


def clean_etag(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value:
        fail(f"missing ETag for {path}")
    cleaned = value.strip()
    if cleaned.startswith("W/"):
        cleaned = cleaned[2:].strip()
    return cleaned.strip('"')


def load_pin_validator() -> Any:
    script = Path(__file__).with_name("validate-hsme-teacher-acquisition-pin-requests.py")
    spec = importlib.util.spec_from_file_location("hsme_teacher_pin_request_validator", script)
    if spec is None or spec.loader is None:
        fail("unable to load teacher pin-request validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_normalized_requests(path: Path) -> tuple[dict[str, Any], str]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"unable to read pin requests: {error}")
    validator = load_pin_validator()
    try:
        normalized = validator.normalize(raw)
        request_set_sha256 = validator.digest(normalized)
    except Exception as error:
        fail(f"pin-request validation failed: {error}")
    require_hex(request_set_sha256, 64, "requestSetSha256")
    return normalized, request_set_sha256


def root_matches(path: str, root: dict[str, str]) -> bool:
    root_path = root["relativePath"]
    if root["kind"] == "FILE":
        return path == root_path
    return path.startswith(root_path + "/")


def select_component(path: str, roots: list[dict[str, str]]) -> dict[str, str] | None:
    matches = [root for root in roots if root_matches(path, root)]
    if len(matches) > 1:
        fail(f"repository path matches overlapping component roots: {path}")
    return matches[0] if matches else None


def fetch_small_file(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "BERS-HSME-teacher-remote-manifest/1"})
    with urlopen(request, timeout=60) as response:
        payload = response.read(MAX_GIT_FILE_BYTES + 1)
    if len(payload) > MAX_GIT_FILE_BYTES:
        fail("bounded small Git blob download limit exceeded")
    return payload


def resolve_file_identity(
    *,
    path: str,
    size: int,
    etag: str,
    lfs: Any,
    content_loader: Callable[[], bytes],
) -> tuple[str, str, int]:
    require_safe_integer(size, f"{path}.bytes")
    if lfs is not None:
        lfs_sha = attr(lfs, "sha256")
        lfs_size = attr(lfs, "size")
        require_hex(lfs_sha, 64, f"{path}.lfs.sha256")
        if lfs_size is not None and require_safe_integer(lfs_size, f"{path}.lfs.size") != size:
            fail(f"{path} LFS/file size mismatch")
        return "GIT_LFS_OID_SHA256_VERIFIED", lfs_sha, 0

    cleaned = clean_etag(etag, path)
    # A 64-hex ETag without explicit LFS metadata can be a Xet identity. It is
    # intentionally not accepted as content SHA-256.
    if len(cleaned) != 40:
        fail(f"{path} lacks explicit LFS SHA-256 and Git blob SHA-1 identity")
    require_hex(cleaned, 40, f"{path}.gitBlobSha1")
    if size > MAX_GIT_FILE_BYTES:
        fail(f"{path} non-LFS object exceeds bounded local hashing limit")
    payload = content_loader()
    if len(payload) != size:
        fail(f"{path} streamed size mismatch")
    if git_blob_sha1(payload) != cleaned:
        fail(f"{path} Git blob SHA-1 verification failed")
    return "STREAMED_GIT_BLOB_SHA256", sha256_bytes(payload), len(payload)


def resolve_teacher_request(
    request: dict[str, Any],
    repo_info: Any,
    metadata_loader: Callable[[str, str, str], Any],
    content_loader: Callable[[str, str, str], bytes],
) -> dict[str, Any]:
    candidate_id = request["teacherCandidateId"]
    source = request["source"]
    source_root = source["sourceRoot"]
    revision = source["immutableRevision"]
    if attr(repo_info, "sha") != revision:
        fail(f"{candidate_id} Hub revision mismatch")

    siblings = list(attr(repo_info, "siblings") or [])
    if not siblings:
        fail(f"{candidate_id} remote repository inventory is empty")

    roots = list(request["componentRoots"])
    root_hits = {root["componentId"]: 0 for root in roots}
    artifacts: list[dict[str, Any]] = []
    small_git_bytes = 0

    for sibling in siblings:
        path = safe_path(attr(sibling, "rfilename"))
        root = select_component(path, roots)
        if root is None:
            continue
        if path.lower().endswith(".py"):
            fail(f"{candidate_id} selected component contains model-repository Python code: {path}")

        metadata = metadata_loader(source_root, path, revision)
        if attr(metadata, "commit_hash") != revision:
            fail(f"{candidate_id}:{path} metadata revision mismatch")
        size = require_safe_integer(attr(metadata, "size"), f"{candidate_id}:{path}.bytes")
        method, content_sha256, streamed = resolve_file_identity(
            path=path,
            size=size,
            etag=attr(metadata, "etag"),
            lfs=attr(sibling, "lfs"),
            content_loader=lambda root=source_root, p=path, rev=revision: content_loader(root, p, rev),
        )
        small_git_bytes += streamed
        if small_git_bytes > MAX_GIT_BYTES_PER_TEACHER:
            fail(f"{candidate_id} bounded Git metadata byte budget exceeded")

        root_hits[root["componentId"]] += 1
        artifacts.append(
            {
                "componentId": root["componentId"],
                "relativePath": path,
                "role": root["role"],
                "bytes": size,
                "contentSha256": require_hex(content_sha256, 64, f"{candidate_id}:{path}.contentSha256"),
                "identityMethod": method,
            }
        )

    for root in roots:
        count = root_hits[root["componentId"]]
        if count == 0:
            fail(f"{candidate_id} component root resolved no files: {root['componentId']}")
        if root["kind"] == "FILE" and count != 1:
            fail(f"{candidate_id} FILE component must resolve exactly once: {root['componentId']}")

    artifacts.sort(key=lambda item: (item["componentId"], item["relativePath"]))
    paths = [item["relativePath"] for item in artifacts]
    if len(set(paths)) != len(paths):
        fail(f"{candidate_id} duplicate remote artifact path")

    total_bytes = sum(item["bytes"] for item in artifacts)
    require_safe_integer(total_bytes, f"{candidate_id}.totalBytes")
    component_totals: dict[str, int] = {}
    role_totals: dict[str, int] = {}
    for item in artifacts:
        component_totals[item["componentId"]] = component_totals.get(item["componentId"], 0) + item["bytes"]
        role_totals[item["role"]] = role_totals.get(item["role"], 0) + item["bytes"]
    for label, value in [*component_totals.items(), *role_totals.items()]:
        require_safe_integer(value, f"{candidate_id}.aggregate.{label}")

    manifest = {
        "schemaVersion": MANIFEST_SCHEMA,
        "state": "REMOTE_METADATA_RESOLVED",
        "teacherCandidateId": candidate_id,
        "source": source,
        "requestedCapabilities": request["requestedCapabilities"],
        "artifacts": artifacts,
        "componentByteTotals": dict(sorted(component_totals.items())),
        "roleByteTotals": dict(sorted(role_totals.items())),
        "totalBytes": total_bytes,
        "modelRepositoryCodeExecutionAllowed": False,
        "deserializationOccurred": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
    }
    return {
        "teacherCandidateId": candidate_id,
        "source": source,
        "artifactCount": len(artifacts),
        "lfsSha256VerifiedCount": sum(
            1 for item in artifacts if item["identityMethod"] == "GIT_LFS_OID_SHA256_VERIFIED"
        ),
        "gitBlobStreamedSha256Count": sum(
            1 for item in artifacts if item["identityMethod"] == "STREAMED_GIT_BLOB_SHA256"
        ),
        "smallGitBytesDownloaded": small_git_bytes,
        "largeModelPayloadsDownloaded": False,
        "xetStorageIdsUsedAsContentSha256": False,
        "artifactManifest": manifest,
        "artifactManifestSha256": domain_digest(MANIFEST_DOMAIN, manifest),
    }


def resolve_request_set(
    normalized: dict[str, Any],
    request_set_sha256: str,
    repo_loader: Callable[[str, str], Any],
    metadata_loader: Callable[[str, str, str], Any],
    content_loader: Callable[[str, str, str], bytes],
    *,
    huggingface_hub_version: str,
    hf_xet_version: str,
) -> dict[str, Any]:
    teachers = [
        resolve_teacher_request(
            request,
            repo_loader(request["source"]["sourceRoot"], request["source"]["immutableRevision"]),
            metadata_loader,
            content_loader,
        )
        for request in normalized["requests"]
    ]
    teachers.sort(key=lambda item: item["teacherCandidateId"])
    evidence = {
        "schemaVersion": SCHEMA,
        "requestSetId": normalized["requestSetId"],
        "requestSetSha256": require_hex(request_set_sha256, 64, "requestSetSha256"),
        "qualityPolicy": normalized["qualityPolicy"],
        "huggingfaceHubVersion": huggingface_hub_version,
        "hfXetVersion": hf_xet_version,
        "teacherCount": len(teachers),
        "largeModelPayloadsDownloaded": False,
        "modelRepositoryCodeExecutionAllowed": False,
        "deserializationOccurred": False,
        "rightsResolved": False,
        "qualityMeasured": False,
        "teacherAdmissionAllowed": False,
        "trainingStartAllowed": False,
        "productionAuthorityGranted": False,
        "teachers": teachers,
    }
    evidence["evidenceSha256"] = domain_digest(EVIDENCE_DOMAIN, evidence)
    return evidence


def collect_remote(request_path: Path) -> dict[str, Any]:
    import huggingface_hub
    from huggingface_hub import HfApi, get_hf_file_metadata, hf_hub_url

    normalized, request_set_sha256 = load_normalized_requests(request_path)
    api = HfApi()

    def repo_loader(root: str, revision: str) -> Any:
        return api.model_info(root, revision=revision, files_metadata=True)

    def metadata_loader(root: str, path: str, revision: str) -> Any:
        return get_hf_file_metadata(hf_hub_url(root, path, revision=revision))

    def content_loader(root: str, path: str, revision: str) -> bytes:
        return fetch_small_file(hf_hub_url(root, path, revision=revision))

    return resolve_request_set(
        normalized,
        request_set_sha256,
        repo_loader,
        metadata_loader,
        content_loader,
        huggingface_hub_version=huggingface_hub.__version__,
        hf_xet_version=importlib.metadata.version("hf-xet"),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--requests", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        evidence = collect_remote(args.requests)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(evidence, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    "schemaVersion": evidence["schemaVersion"],
                    "requestSetSha256": evidence["requestSetSha256"],
                    "teacherCount": evidence["teacherCount"],
                    "evidenceSha256": evidence["evidenceSha256"],
                    "largeModelPayloadsDownloaded": evidence["largeModelPayloadsDownloaded"],
                    "teacherAdmissionAllowed": evidence["teacherAdmissionAllowed"],
                },
                sort_keys=True,
            )
        )
        return 0
    except (ResolutionError, OSError, ValueError, RuntimeError) as error:
        print(f"HSME teacher remote manifest resolution failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
