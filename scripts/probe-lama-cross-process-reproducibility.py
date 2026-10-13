#!/usr/bin/env python3
"""Prove release-grade cross-process byte reproducibility for the pinned C8 LaMa ONNX graph.

This parent process never sees the legacy checkpoint. It invokes the accepted C7 multi-shape
exporter in two independent Python interpreters with a fixed PYTHONHASHSEED, requires both child
runs to pass the exact C7 graph/CPU-parity gate, requires byte-for-byte equality across processes,
and then requires the result to match the already discovered C8 release identity exactly.

Passing this probe establishes reproducibility evidence only. It does not sign, publish, install,
or grant production/runtime authority.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

EXPORT_PYTHON_HASH_SEED = "0"
EXPECTED_RESULT = "EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS"
EXPECTED_CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"
EXPECTED_RELEASE_SIZE = 208_593_659
EXPECTED_RELEASE_SHA256 = "8bf7891efa16ea07de31fc98c5f0c017b399956cba0182813ddf23d9072792c7"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def onnx_structure_fingerprint(path: Path) -> dict[str, Any]:
    """Fingerprint graph/tensors without persisting weights or rewriting the ONNX."""
    import onnx

    model = onnx.load_model(str(path), load_external_data=False)
    graph = model.graph

    def digest_messages(messages: Any) -> str:
        digest = hashlib.sha256()
        for message in messages:
            payload = message.SerializeToString(deterministic=True)
            digest.update(len(payload).to_bytes(8, "big"))
            digest.update(payload)
        return digest.hexdigest()

    tensor_hashes: dict[str, str] = {}
    for tensor in graph.initializer:
        if tensor.name in tensor_hashes:
            raise RuntimeError("LaMa ONNX has duplicate initializer names")
        if tensor.data_location == onnx.TensorProto.EXTERNAL:
            raise RuntimeError("LaMa release ONNX must not reference external tensor files")
        tensor_hashes[tensor.name] = hashlib.sha256(
            tensor.SerializeToString(deterministic=True)
        ).hexdigest()
    tensor_summary = json.dumps(tensor_hashes, sort_keys=True, separators=(",", ":")).encode("utf-8")
    header = {
        "irVersion": model.ir_version,
        "producerName": model.producer_name,
        "producerVersion": model.producer_version,
        "domain": model.domain,
        "modelVersion": model.model_version,
        "opsets": [(item.domain, item.version) for item in model.opset_import],
        "graphName": graph.name,
        "metadata": [(item.key, item.value) for item in model.metadata_props],
    }
    op_counts: dict[str, int] = {}
    for node in graph.node:
        operation = f"{node.domain}::{node.op_type}"
        op_counts[operation] = op_counts.get(operation, 0) + 1
    return {
        "header": header,
        "nodeCount": len(graph.node),
        "nodeSerializedSha256": digest_messages(graph.node),
        "opCounts": dict(sorted(op_counts.items())),
        "initializerCount": len(graph.initializer),
        "initializerManifestSha256": hashlib.sha256(tensor_summary).hexdigest(),
        "initializersByName": tensor_hashes,
        "ioAndValueInfoSha256": digest_messages(
            list(graph.input) + list(graph.output) + list(graph.value_info)
        ),
        "sparseInitializerSha256": digest_messages(graph.sparse_initializer),
        "functionSha256": digest_messages(model.functions),
    }


def write_blocked_diagnostics(
    *, first: dict[str, Any], second: dict[str, Any],
    report: Path, reason: str,
) -> None:
    """Leave an auditable, non-authoritative failure report before exit != 0."""
    one = onnx_structure_fingerprint(first["model"])
    two = onnx_structure_fingerprint(second["model"])
    first_tensors = one.pop("initializersByName")
    second_tensors = two.pop("initializersByName")
    different_tensors = [
        name for name in sorted(set(first_tensors) | set(second_tensors))
        if first_tensors.get(name) != second_tensors.get(name)
    ]
    evidence = {
        "schemaVersion": 1,
        "status": "BLOCKED",
        "reason": reason,
        "runtimeAuthorityGranted": False,
        "productionDeviceApproval": False,
        "productionPromotionAllowed": False,
        "releasePublicationAllowed": False,
        "pinned": {"size": EXPECTED_RELEASE_SIZE, "sha256": EXPECTED_RELEASE_SHA256},
        "independentPythonProcesses": 2,
        "pythonHashSeed": EXPORT_PYTHON_HASH_SEED,
        "first": {"size": first["size"], "sha256": first["sha256"], "structure": one},
        "second": {"size": second["size"], "sha256": second["sha256"], "structure": two},
        "crossProcessModelBytesEqual": (
            first["size"] == second["size"] and first["sha256"] == second["sha256"]
        ),
        "crossProcessStructureEqual": one == two,
        "differentInitializerCount": len(different_tensors),
        "differentInitializerNamesFirst32": different_tensors[:32],
        "historicalPinnedOnnxBytesAvailableForStructuralComparison": False,
        "note": (
            "The two current exports can be compared structurally. The historical "
            "pinned artifact bytes were not supplied; no claim about historical "
            "graph or initializer parity is made."
        ),
    }
    report.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "LAMA C8 BLOCKED FORENSICS: "
        + json.dumps({
            "reason": reason,
            "crossProcessModelBytesEqual": evidence["crossProcessModelBytesEqual"],
            "crossProcessStructureEqual": evidence["crossProcessStructureEqual"],
            "differentInitializerCount": evidence["differentInitializerCount"],
            "firstHeader": one["header"],
            "firstNodeCount": one["nodeCount"],
            "firstNodeSha256": one["nodeSerializedSha256"],
            "firstInitializerCount": one["initializerCount"],
            "firstInitializerManifestSha256": one["initializerManifestSha256"],
        }, sort_keys=True),
        flush=True,
    )


def run_child(
    *,
    script: Path,
    source: Path,
    state: Path,
    bridge_report: Path,
    workdir: Path,
    label: str,
) -> dict[str, Any]:
    model = workdir / f"lama-{label}.onnx"
    report = workdir / f"lama-{label}.json"
    browser_input = workdir / f"lama-{label}-browser-input.f32"
    browser_reference = workdir / f"lama-{label}-browser-reference.f32"
    env = os.environ.copy()
    env["PYTHONHASHSEED"] = EXPORT_PYTHON_HASH_SEED
    subprocess.run(
        [
            sys.executable,
            str(script),
            "--source", str(source),
            "--state", str(state),
            "--bridge-report", str(bridge_report),
            "--model-out", str(model),
            "--report", str(report),
            "--browser-input-out", str(browser_input),
            "--browser-reference-out", str(browser_reference),
        ],
        env=env,
        check=True,
    )
    evidence = json.loads(report.read_text(encoding="utf-8"))
    if evidence.get("status") != "CANDIDATE":
        raise RuntimeError(f"{label} child status is not CANDIDATE")
    if evidence.get("runtimeAuthorityGranted") is not False:
        raise RuntimeError(f"{label} child unexpectedly grants runtime authority")
    if evidence.get("productionDeviceApproval") is not False:
        raise RuntimeError(f"{label} child unexpectedly grants production device approval")
    if evidence.get("checkpointSha256") != EXPECTED_CHECKPOINT_SHA256:
        raise RuntimeError(f"{label} child checkpoint trust root changed")
    export = evidence.get("export") or {}
    if export.get("result") != EXPECTED_RESULT:
        raise RuntimeError(f"{label} child export/parity gate did not pass: {export.get('result')}")
    cpu = evidence.get("cpuOrt") or {}
    if cpu.get("result") != "PASS":
        raise RuntimeError(f"{label} child CPU ORT multi-shape gate did not pass")
    graph = evidence.get("graph") or {}
    if graph.get("standardDftNodeCount", 0) <= 0 or graph.get("customNodes") != [] or graph.get("atenLikeNodes") != []:
        raise RuntimeError(f"{label} child graph is not the accepted standard-DFT graph")
    if not graph.get("dynamicHeight") or not graph.get("dynamicWidth"):
        raise RuntimeError(f"{label} child graph lost dynamic spatial dimensions")
    if not model.is_file() or model.stat().st_size <= 0:
        raise RuntimeError(f"{label} child did not produce a non-empty ONNX model")
    actual_sha = sha256(model)
    if export.get("size") != model.stat().st_size or export.get("sha256") != actual_sha:
        raise RuntimeError(f"{label} child report is not byte-bound to its ONNX output")
    return {
        "label": label,
        "model": model,
        "report": report,
        "browserInput": browser_input,
        "browserReference": browser_reference,
        "size": model.stat().st_size,
        "sha256": actual_sha,
        "graph": graph,
        "environment": evidence.get("environment"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--bridge-report", type=Path, required=True)
    parser.add_argument("--model-out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    script = Path(__file__).resolve().with_name("probe-lama-dynamo-multishape.py")
    if not script.is_file():
        raise RuntimeError("accepted C7 multi-shape probe is missing")
    for path, label in ((args.source, "source"), (args.state, "safetensors state"), (args.bridge_report, "bridge report")):
        if not path.exists():
            raise RuntimeError(f"LaMa C8 {label} is missing: {path}")

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="bers-lama-c8-") as directory:
        workdir = Path(directory)
        first = run_child(
            script=script,
            source=args.source.resolve(),
            state=args.state.resolve(),
            bridge_report=args.bridge_report.resolve(),
            workdir=workdir,
            label="first",
        )
        second = run_child(
            script=script,
            source=args.source.resolve(),
            state=args.state.resolve(),
            bridge_report=args.bridge_report.resolve(),
            workdir=workdir,
            label="second",
        )
        if first["size"] != second["size"] or first["sha256"] != second["sha256"]:
            write_blocked_diagnostics(
                first=first, second=second, report=args.report,
                reason="CROSS_PROCESS_BYTES_MISMATCH",
            )
            raise RuntimeError(
                "LaMa ONNX is not byte-reproducible across independent fixed-hash-seed processes: "
                f"first={first['size']}/{first['sha256']} second={second['size']}/{second['sha256']}"
            )
        if first["size"] != EXPECTED_RELEASE_SIZE or first["sha256"] != EXPECTED_RELEASE_SHA256:
            write_blocked_diagnostics(
                first=first, second=second, report=args.report,
                reason="PINNED_IDENTITY_MISMATCH",
            )
            raise RuntimeError(
                "LaMa reproducible bytes differ from pinned C8 release identity; a new model version is required: "
                f"actual={first['size']}/{first['sha256']} expected={EXPECTED_RELEASE_SIZE}/{EXPECTED_RELEASE_SHA256}"
            )
        if first["graph"] != second["graph"]:
            raise RuntimeError("LaMa child graph inventories differ despite identical bytes")
        shutil.copyfile(first["model"], args.model_out)
        retained_sha = sha256(args.model_out)
        if args.model_out.stat().st_size != EXPECTED_RELEASE_SIZE or retained_sha != EXPECTED_RELEASE_SHA256:
            raise RuntimeError("retained LaMa candidate bytes differ from pinned C8 release identity")

        report = {
            "schemaVersion": 1,
            "status": "CANDIDATE",
            "productionDeviceApproval": False,
            "runtimeAuthorityGranted": False,
            "productionPromotionAllowed": False,
            "releasePublicationAllowed": False,
            "checkpointSha256": EXPECTED_CHECKPOINT_SHA256,
            "reproducibility": {
                "result": "PASS",
                "independentPythonProcesses": 2,
                "pythonHashSeed": EXPORT_PYTHON_HASH_SEED,
                "size": EXPECTED_RELEASE_SIZE,
                "sha256": EXPECTED_RELEASE_SHA256,
                "byteIdentical": True,
                "matchesPinnedReleaseIdentity": True,
                "c7ResultRequired": EXPECTED_RESULT,
            },
            "first": {
                "size": first["size"],
                "sha256": first["sha256"],
                "environment": first["environment"],
            },
            "second": {
                "size": second["size"],
                "sha256": second["sha256"],
                "environment": second["environment"],
            },
            "graph": first["graph"],
            "retainedRunnerLocalCandidate": {
                "size": args.model_out.stat().st_size,
                "sha256": retained_sha,
                "published": False,
                "signed": False,
                "gitTracked": False,
            },
        }
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(
            "LAMA C8 CROSS-PROCESS REPRODUCIBILITY: PASS "
            f"size={EXPECTED_RELEASE_SIZE} sha256={EXPECTED_RELEASE_SHA256}"
        )


if __name__ == "__main__":
    main()
