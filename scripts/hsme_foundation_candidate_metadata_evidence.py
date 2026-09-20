#!/usr/bin/env python3
"""HSME-2a.3.2d immutable Hugging Face artifact identity collector.

The collector intentionally does not download LFS/Xet model payloads. It relies
only on a cryptographically explicit 64-hex Hub ETag for Git LFS content and
downloads bounded ordinary Git blobs solely to convert their Git blob SHA-1
identity into locally verified SHA-256 content identity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
from typing import Any, Callable
from urllib.request import Request, urlopen

SCHEMA = "BERS_HSME_FOUNDATION_HUB_ARTIFACT_EVIDENCE_V1"
MANIFEST_SCHEMA = "BERS_HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1"
DOMAIN = "bers:hsme:foundation-benchmark-artifact-manifest:v1"
HEX = set("0123456789abcdef")
MAX_GIT_FILE_BYTES = 8 * 1024 * 1024
MAX_TOTAL_GIT_BYTES = 32 * 1024 * 1024
EXPECTED_CANDIDATES = (
    "tiny-sd-control-v1",
    "sana-sprint-0.6b-split-v1",
    "flux2-klein-4b-distilled-v1",
    "flux2-klein-base-4b-v1",
    "qwen-image-t2i-reference-v1",
    "qwen-image-edit-2511-reference-v1",
)

DOC_NAMES = {
    ".gitattributes",
    ".gitignore",
    "README.md",
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
}
DOC_SUFFIXES = (".md", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
WEIGHT_SUFFIXES = (".safetensors", ".bin", ".pt", ".pth", ".ckpt")


class EvidenceError(RuntimeError):
    pass


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def git_blob_sha1(value: bytes) -> str:
    digest = hashlib.sha1()
    digest.update(f"blob {len(value)}\0".encode("ascii"))
    digest.update(value)
    return digest.hexdigest()


def require_hex(value: Any, length: int, name: str) -> str:
    if not isinstance(value, str) or len(value) != length or any(ch not in HEX for ch in value):
        raise EvidenceError(f"{name} must be lowercase {length}-hex")
    return value


def clean_etag(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value:
        raise EvidenceError(f"missing ETag for {path}")
    cleaned = value.strip()
    if cleaned.startswith("W/"):
        cleaned = cleaned[2:].strip()
    return cleaned.strip('"')


def safe_path(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise EvidenceError("repository path is missing")
    p = PurePosixPath(value)
    if p.is_absolute() or any(part in ("", ".", "..") for part in p.parts):
        raise EvidenceError(f"unsafe repository path: {value}")
    return value


def classify_artifact(path: str) -> tuple[str, bool]:
    path = safe_path(path)
    p = PurePosixPath(path)
    name = p.name
    lower = path.lower()

    if name in DOC_NAMES or lower.endswith(DOC_SUFFIXES):
        return "DOCUMENTATION_ONLY", False
    if lower.endswith(".py"):
        return "RUNTIME_CODE", True
    if lower.startswith(("tokenizer/", "tokenizer_2/", "text_encoder/", "text_encoder_2/", "processor/")):
        return "TOKENIZER_TEXT_ENCODER", True
    if lower.startswith(("transformer/", "unet/")):
        return "DENOISER_TRANSFORMER_UNET", True
    if lower.startswith(("vae/", "decoder/")):
        return "VAE_DECODER", True
    if lower.startswith("scheduler/"):
        return "SCHEDULER_PROCESSOR", True
    if lower.endswith(WEIGHT_SUFFIXES):
        return "DENOISER_TRANSFORMER_UNET", True
    if name == "model_index.json" or lower.endswith((".json", ".txt", ".model", ".jinja")):
        return "METADATA_CONFIG", True
    return "RUNTIME_ASSET", True


def logical_id(path: str) -> str:
    return "file/" + sha256_bytes(path.encode("utf-8"))[:24]


def resolve_identity(
    *,
    path: str,
    size: int,
    etag: str,
    content_loader: Callable[[], bytes],
    lfs_sha256: str | None = None,
) -> tuple[str, bool, str, int]:
    if not isinstance(size, int) or size < 0:
        raise EvidenceError(f"invalid size for {path}")

    # A large-file content SHA is accepted only from explicit LFS metadata.
    # Xet storage/chunk hashes are intentionally never passed as lfs_sha256.
    if lfs_sha256 is not None:
        require_hex(lfs_sha256, 64, f"{path}.lfs.sha256")
        return "GIT_LFS_OID_SHA256_VERIFIED", True, lfs_sha256, 0

    cleaned = clean_etag(etag, path)
    if len(cleaned) != 40:
        raise EvidenceError(
            f"{path} lacks explicit LFS content SHA-256 and ETag is not Git blob SHA-1"
        )
    require_hex(cleaned, 40, f"{path}.etag")
    if size > MAX_GIT_FILE_BYTES:
        raise EvidenceError(
            f"{path} is a non-LFS/unresolved large object and requires dedicated streamed hashing"
        )
    payload = content_loader()
    if len(payload) != size:
        raise EvidenceError(f"{path} streamed size mismatch")
    if git_blob_sha1(payload) != cleaned:
        raise EvidenceError(f"{path} Git blob SHA-1 verification failed")
    return "STREAMED_LOCAL_SHA256", False, sha256_bytes(payload), len(payload)


def manifest_digest(manifest: dict[str, Any]) -> str:
    if manifest.get("schemaVersion") != MANIFEST_SCHEMA:
        raise EvidenceError("manifest schema mismatch")
    if manifest.get("state") != "PINNED":
        raise EvidenceError("manifest must be PINNED before modelContentSha256 derivation")
    normalized = {
        "candidateId": manifest["candidateId"],
        "primarySource": manifest["primarySource"],
        "artifacts": sorted(manifest["artifacts"], key=lambda item: item["logicalId"]),
    }
    return sha256_bytes(DOMAIN.encode("utf-8") + b"\0" + canonical_bytes(normalized))


def load_campaign(path: Path) -> list[dict[str, str]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    candidates = raw.get("candidates")
    if not isinstance(candidates, list):
        raise EvidenceError("campaign candidates missing")
    result: list[dict[str, str]] = []
    for item in candidates:
        cid = item.get("candidateId")
        root = item.get("sourceRoot")
        revision = item.get("immutableRevision")
        if not isinstance(cid, str) or not isinstance(root, str):
            raise EvidenceError("campaign candidate source binding invalid")
        require_hex(revision, 40, f"{cid}.immutableRevision")
        result.append({"candidateId": cid, "sourceRoot": root, "immutableRevision": revision})
    ids = tuple(item["candidateId"] for item in result)
    if set(ids) != set(EXPECTED_CANDIDATES) or len(ids) != len(EXPECTED_CANDIDATES):
        raise EvidenceError("campaign roster differs from the accepted six candidates")
    return result


def fetch_small(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "BERS-HSME-metadata-evidence/1"})
    with urlopen(request, timeout=60) as response:
        return response.read(MAX_GIT_FILE_BYTES + 1)


def attr(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def collect_candidate(candidate: dict[str, str]) -> tuple[dict[str, Any], int]:
    from huggingface_hub import HfApi, get_hf_file_metadata, hf_hub_url

    cid = candidate["candidateId"]
    root = candidate["sourceRoot"]
    revision = candidate["immutableRevision"]
    info = HfApi().model_info(root, revision=revision, files_metadata=True)
    if info.sha != revision:
        raise EvidenceError(f"{cid} Hub revision mismatch: {info.sha}")
    siblings = list(info.siblings or [])
    if not siblings:
        raise EvidenceError(f"{cid} Hub inventory is empty")

    source = {"sourceRoot": root, "immutableRevision": revision}
    artifacts: list[dict[str, Any]] = []
    streamed_total = 0
    lfs_count = 0
    streamed_count = 0

    for sibling in siblings:
        path = safe_path(attr(sibling, "rfilename"))
        metadata = get_hf_file_metadata(hf_hub_url(root, path, revision=revision))
        if metadata.commit_hash != revision:
            raise EvidenceError(f"{cid}:{path} metadata revision mismatch")
        if not isinstance(metadata.size, int):
            raise EvidenceError(f"{cid}:{path} metadata size missing")

        lfs = attr(sibling, "lfs")
        lfs_sha256 = None
        if lfs is not None:
            lfs_sha256 = attr(lfs, "sha256")
            if not isinstance(lfs_sha256, str):
                raise EvidenceError(f"{cid}:{path} explicit LFS sha256 missing")
            lfs_size = attr(lfs, "size")
            if isinstance(lfs_size, int) and lfs_size != metadata.size:
                raise EvidenceError(f"{cid}:{path} LFS/file size mismatch")

        # xet_file_data may identify Xet storage/chunks, but is never a source
        # for contentSha256. Without explicit LFS content identity, large Xet
        # objects fail closed and move to a dedicated streamed-hash runner.
        url = hf_hub_url(root, path, revision=revision)
        method, protocol_verified, content_sha256, streamed = resolve_identity(
            path=path,
            size=metadata.size,
            etag=metadata.etag,
            lfs_sha256=lfs_sha256,
            content_loader=lambda url=url: fetch_small(url),
        )
        streamed_total += streamed
        if streamed_total > MAX_TOTAL_GIT_BYTES:
            raise EvidenceError(f"{cid} bounded Git metadata download budget exceeded")
        if method == "GIT_LFS_OID_SHA256_VERIFIED":
            lfs_count += 1
        else:
            streamed_count += 1

        role, runtime_required = classify_artifact(path)
        if role == "RUNTIME_CODE" and runtime_required:
            raise EvidenceError(
                f"{cid} contains model-repository Python runtime code: {path}"
            )
        artifacts.append(
            {
                "logicalId": logical_id(path),
                "source": source,
                "relativePath": path,
                "role": role,
                "bytes": metadata.size,
                "runtimeRequired": runtime_required,
                "identityMethod": method,
                "protocolContentSha256Verified": protocol_verified,
                "contentSha256": content_sha256,
            }
        )

    artifacts.sort(key=lambda item: item["logicalId"])
    if len({item["logicalId"] for item in artifacts}) != len(artifacts):
        raise EvidenceError(f"{cid} logicalId collision")
    if len({item["relativePath"] for item in artifacts}) != len(artifacts):
        raise EvidenceError(f"{cid} duplicate repository path")
    if not any(item["runtimeRequired"] for item in artifacts):
        raise EvidenceError(f"{cid} has no runtime-required artifacts")

    manifest = {
        "schemaVersion": MANIFEST_SCHEMA,
        "candidateId": cid,
        "state": "PINNED",
        "primarySource": source,
        "artifacts": artifacts,
    }
    evidence = {
        "candidateId": cid,
        "sourceRoot": root,
        "immutableRevision": revision,
        "repoFileCount": len(artifacts),
        "runtimeRequiredFileCount": sum(1 for item in artifacts if item["runtimeRequired"]),
        "lfsSha256VerifiedCount": lfs_count,
        "gitBlobStreamedSha256Count": streamed_count,
        "smallGitBytesDownloaded": streamed_total,
        "xetStorageIdsUsedAsContentSha256": False,
        "artifactManifest": manifest,
        "modelContentSha256": manifest_digest(manifest),
    }
    return evidence, streamed_total


def collect(campaign_path: Path) -> dict[str, Any]:
    import huggingface_hub

    candidates = load_campaign(campaign_path)
    evidence: list[dict[str, Any]] = []
    total_streamed = 0
    for candidate in candidates:
        item, streamed = collect_candidate(candidate)
        evidence.append(item)
        total_streamed += streamed
        if total_streamed > MAX_TOTAL_GIT_BYTES * len(EXPECTED_CANDIDATES):
            raise EvidenceError("global bounded Git metadata download budget exceeded")

    evidence.sort(key=lambda item: item["candidateId"])
    return {
        "schemaVersion": SCHEMA,
        "qualityPolicy": "QUALITY_FLOOR_BEFORE_EFFICIENCY",
        "candidateOutputsObserved": False,
        "ordinaryCiModelInferenceExecuted": False,
        "largeModelPayloadsDownloaded": False,
        "xetStorageIdsUsedAsContentSha256": False,
        "huggingfaceHubVersion": huggingface_hub.__version__,
        "candidates": evidence,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = collect(args.campaign)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schemaVersion": result["schemaVersion"],
        "candidateCount": len(result["candidates"]),
        "modelContentSha256": {
            item["candidateId"]: item["modelContentSha256"]
            for item in result["candidates"]
        },
        "largeModelPayloadsDownloaded": result["largeModelPayloadsDownloaded"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
