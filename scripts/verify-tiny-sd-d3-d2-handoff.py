#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

COMPONENT_FILES = {
    "text_encoder": "text_encoder.onnx",
    "unet": "unet.onnx",
    "vae_decoder": "vae_decoder.onnx",
}
HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_D2_REPORT_BYTES = 4 * 1024 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_regular(path: Path, *, max_bytes: int | None = None) -> None:
    if not path.is_file() or path.is_symlink():
        raise RuntimeError(f"handoff path is not a regular file: {path.name}")
    size = path.stat().st_size
    if size <= 0:
        raise RuntimeError(f"handoff file is empty: {path.name}")
    if max_bytes is not None and size > max_bytes:
        raise RuntimeError(f"handoff file exceeds size bound: {path.name}")


def require_bool_false(record: dict[str, Any], key: str, context: str) -> None:
    if record.get(key) is not False:
        raise RuntimeError(f"{context} unexpectedly grants {key}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--component", choices=tuple(COMPONENT_FILES), required=True)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--workflow-run-id", required=True)
    parser.add_argument("--upstream-revision", required=True)
    parser.add_argument("--input-dir", type=Path, required=True)
    args = parser.parse_args()

    if len(args.candidate_sha) != 40 or any(value not in "0123456789abcdef" for value in args.candidate_sha):
        raise RuntimeError("candidate SHA is not a lowercase 40-hex commit identity")
    if not args.workflow_run_id.isdecimal() or int(args.workflow_run_id) <= 0:
        raise RuntimeError("workflow run id is not a positive decimal identity")
    if len(args.upstream_revision) != 40 or any(value not in "0123456789abcdef" for value in args.upstream_revision):
        raise RuntimeError("upstream revision is not a lowercase 40-hex commit identity")

    root = args.input_dir.resolve(strict=True)
    if not root.is_dir() or root.is_symlink():
        raise RuntimeError("D2 handoff root is not a regular directory")

    filename = COMPONENT_FILES[args.component]
    expected_names = {filename, "d2-components.json", "handoff-manifest.json"}
    entries = list(root.iterdir())
    if any(value.is_dir() for value in entries):
        raise RuntimeError("D2 handoff contains a subdirectory")
    if {value.name for value in entries} != expected_names:
        raise RuntimeError(
            f"D2 handoff file allowlist mismatch: expected={sorted(expected_names)} observed={sorted(value.name for value in entries)}"
        )

    model_path = root / filename
    d2_path = root / "d2-components.json"
    manifest_path = root / "handoff-manifest.json"
    require_regular(model_path)
    require_regular(d2_path, max_bytes=MAX_D2_REPORT_BYTES)
    require_regular(manifest_path, max_bytes=MAX_MANIFEST_BYTES)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        manifest.get("schemaVersion") != 1
        or manifest.get("status") != "CANDIDATE"
        or manifest.get("stage") != "D3_D2_COMPONENT_HANDOFF"
        or manifest.get("candidateSha") != args.candidate_sha
        or manifest.get("workflowRunId") != args.workflow_run_id
        or manifest.get("upstreamRevision") != args.upstream_revision
        or manifest.get("component") != args.component
        or manifest.get("handoffTransport") != HANDOFF_TRANSPORT
        or manifest.get("d3CandidateBinaryIncluded") is not False
        or manifest.get("crossJobD2Fp32Handoff") is not True
        or manifest.get("releaseIdentityPinned") is not False
    ):
        raise RuntimeError("D2 handoff manifest identity/lifecycle/transport contract mismatch")
    require_bool_false(manifest, "runtimeAuthorityGranted", "D2 handoff manifest")
    require_bool_false(manifest, "productionApproval", "D2 handoff manifest")

    d2_report = json.loads(d2_path.read_text(encoding="utf-8"))
    if (
        d2_report.get("status") != "CANDIDATE"
        or d2_report.get("stage") != "D2_COMPONENT_ONNX_CPU_FEASIBILITY"
        or d2_report.get("passCount") != 3
        or d2_report.get("allComponentsPass") is not True
        or d2_report.get("blockedComponents") != {}
        or set(d2_report.get("components") or {}) != set(COMPONENT_FILES)
    ):
        raise RuntimeError("D2 handoff report is not accepted 3/3 component evidence")
    require_bool_false(d2_report, "runtimeAuthorityGranted", "D2 handoff report")
    require_bool_false(d2_report, "productionApproval", "D2 handoff report")

    component_record = d2_report["components"][args.component]
    artifact = component_record.get("artifact") or {}
    if component_record.get("result") != "PASS" or component_record.get("ortParityPassed") is not True:
        raise RuntimeError("D2 handoff component is not accepted")

    model_size = model_path.stat().st_size
    model_sha = sha256_file(model_path)
    manifest_model = manifest.get("model") or {}
    if (
        artifact.get("size") != model_size
        or artifact.get("sha256") != model_sha
        or manifest_model.get("filename") != filename
        or manifest_model.get("size") != model_size
        or manifest_model.get("sha256") != model_sha
    ):
        raise RuntimeError("D2 FP32 model identity mismatch across report/manifest/file")

    d2_size = d2_path.stat().st_size
    d2_sha = sha256_file(d2_path)
    manifest_d2 = manifest.get("d2Report") or {}
    if manifest_d2.get("size") != d2_size or manifest_d2.get("sha256") != d2_sha:
        raise RuntimeError("D2 report identity mismatch across manifest/file")

    print(
        "TINY-SD D3 D2 HANDOFF: PASS "
        f"component={args.component} run={args.workflow_run_id} transport={HANDOFF_TRANSPORT} "
        f"bytes={model_size} sha256={model_sha} candidate={args.candidate_sha}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
