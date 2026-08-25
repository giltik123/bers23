#!/usr/bin/env python3
"""Inventory the upstream-authoritative LaMa Drive folder without deserializing model weights.

The script hashes downloaded files, inspects ZIP member metadata, and streams candidate Big-LaMa
checkpoint/config bytes only for SHA-256 calculation. It never imports torch, never executes pickle,
and never grants install/READY/production authority.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO

EXPECTED_SOURCE_REVISION = "786f5936b27fb3dacd2b1ad799e4de968ea697e7"
CHECKPOINT_BASENAME = "best.ckpt"
CONFIG_BASENAMES = {"config.yaml", "config.yml"}

ARCHITECTURE_FRAGMENTS = (
    r"kind:\s*ffc_resnet",
    r"input_nc:\s*4\b",
    r"output_nc:\s*3\b",
    r"ngf:\s*64\b",
    r"n_downsampling:\s*3\b",
    r"n_blocks:\s*18\b",
    r"add_out_act:\s*sigmoid\b",
    r"ratio_gin:\s*0\.75\b",
    r"enable_lfu:\s*false\b",
)


def sha256_stream(stream: BinaryIO) -> str:
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def sha256_file(path: Path) -> str:
    with path.open("rb") as stream:
        return sha256_stream(stream)


def normalize(path: str) -> str:
    return str(PurePosixPath(path.replace("\\", "/")))


def is_big_lama_checkpoint(path: str) -> bool:
    normalized = normalize(path).lower()
    return "big-lama" in normalized and PurePosixPath(normalized).name == CHECKPOINT_BASENAME


def is_big_lama_config(path: str) -> bool:
    normalized = normalize(path).lower()
    return "big-lama" in normalized and PurePosixPath(normalized).name in CONFIG_BASENAMES


def architecture_matches(text: str) -> bool:
    return all(re.search(pattern, text, flags=re.IGNORECASE) for pattern in ARCHITECTURE_FRAGMENTS)


def direct_candidate(path: Path, root: Path) -> dict[str, Any] | None:
    rel = normalize(str(path.relative_to(root)))
    if not (is_big_lama_checkpoint(rel) or is_big_lama_config(rel)):
        return None
    entry: dict[str, Any] = {
        "container": "DIRECT_FILE",
        "containerPath": None,
        "path": rel,
        "size": path.stat().st_size,
        "sha256": sha256_file(path),
    }
    if is_big_lama_config(rel):
        text = path.read_text(encoding="utf-8", errors="replace")
        entry["architectureMatchesPinnedBigLama"] = architecture_matches(text)
    return entry


def zip_candidates(path: Path, root: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rel = normalize(str(path.relative_to(root)))
    archive = {
        "path": rel,
        "size": path.stat().st_size,
        "sha256": sha256_file(path),
        "memberCount": 0,
    }
    candidates: list[dict[str, Any]] = []
    with zipfile.ZipFile(path, "r") as bundle:
        members = [item for item in bundle.infolist() if not item.is_dir()]
        archive["memberCount"] = len(members)
        for item in members:
            member = normalize(item.filename)
            if not (is_big_lama_checkpoint(member) or is_big_lama_config(member)):
                continue
            with bundle.open(item, "r") as stream:
                digest = sha256_stream(stream)
            entry: dict[str, Any] = {
                "container": "ZIP_MEMBER",
                "containerPath": rel,
                "path": member,
                "size": item.file_size,
                "compressedSize": item.compress_size,
                "sha256": digest,
            }
            if is_big_lama_config(member):
                with bundle.open(item, "r") as stream:
                    text = stream.read().decode("utf-8", errors="replace")
                entry["architectureMatchesPinnedBigLama"] = architecture_matches(text)
            candidates.append(entry)
    return archive, candidates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--max-complete-files", type=int, default=49)
    args = parser.parse_args()

    if args.source_revision != EXPECTED_SOURCE_REVISION:
        raise RuntimeError("LaMa source revision mismatch")
    root = args.root.resolve()
    if not root.is_dir():
        raise RuntimeError("Authoritative LaMa folder download is missing")

    files = sorted(path for path in root.rglob("*") if path.is_file())
    if not files:
        raise RuntimeError("Authoritative LaMa folder download is empty")

    # gdown 5.2.x historically has a 50-files-per-folder limit. Fail closed rather than
    # calling a possibly truncated inventory authoritative when the local count reaches it.
    if len(files) > args.max_complete_files:
        raise RuntimeError(
            f"LaMa folder inventory has {len(files)} downloaded files; complete enumeration is not proven"
        )

    regular_files: list[dict[str, Any]] = []
    archives: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []

    for path in files:
        rel = normalize(str(path.relative_to(root)))
        record = {
            "path": rel,
            "size": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        regular_files.append(record)
        direct = direct_candidate(path, root)
        if direct is not None:
            candidates.append(direct)
        if path.suffix.lower() == ".zip":
            archive, member_candidates = zip_candidates(path, root)
            archives.append(archive)
            candidates.extend(member_candidates)

    checkpoints = [entry for entry in candidates if is_big_lama_checkpoint(str(entry["path"]))]
    configs = [entry for entry in candidates if is_big_lama_config(str(entry["path"]))]
    exact_checkpoint = len(checkpoints) == 1
    exact_config = len(configs) == 1
    architecture_ok = exact_config and bool(configs[0].get("architectureMatchesPinnedBigLama"))

    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "sourceRevision": EXPECTED_SOURCE_REVISION,
        "deserializationPerformed": False,
        "completeFolderEnumerationClaimed": True,
        "downloadedFileCount": len(files),
        "files": regular_files,
        "archives": archives,
        "bigLamaCandidates": candidates,
        "identityDiscovery": {
            "exactCheckpointCandidate": exact_checkpoint,
            "exactConfigCandidate": exact_config,
            "architectureMatchesPinnedBigLama": architecture_ok,
            "checkpoint": checkpoints[0] if exact_checkpoint else None,
            "config": configs[0] if exact_config else None,
            "readyToPin": exact_checkpoint and exact_config and architecture_ok,
        },
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "LAMA AUTHORITATIVE INVENTORY: PASS "
        f"files={len(files)} checkpoint_candidates={len(checkpoints)} config_candidates={len(configs)} "
        f"ready_to_pin={report['identityDiscovery']['readyToPin']}"
    )


if __name__ == "__main__":
    main()
