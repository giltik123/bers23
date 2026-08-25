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
            raise RuntimeError(
                "LaMa ONNX is not byte-reproducible across independent fixed-hash-seed processes: "
                f"first={first['size']}/{first['sha256']} second={second['size']}/{second['sha256']}"
            )
        if first["size"] != EXPECTED_RELEASE_SIZE or first["sha256"] != EXPECTED_RELEASE_SHA256:
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
