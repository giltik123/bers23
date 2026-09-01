#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gc
import importlib.util
import json
import shutil
from pathlib import Path
from typing import Any

MATRIX_MODULE_PATH = Path(__file__).with_name("prepare-tiny-sd-d3-wasm-strategy-matrix.py")
spec = importlib.util.spec_from_file_location("tiny_sd_d3_wasm_strategy_matrix", MATRIX_MODULE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load accepted D3 WASM strategy implementation")
matrix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matrix)
baseline = matrix.baseline

SELECTED_SCHEME = "EXACT_FP16_STORAGE_FP32_COMPUTE"
SELECTED_STRATEGY = "exact_fp16_storage"
SELECTION_RULE = "PINNED_ACCEPTED_SCHEME_REPRODUCTION_NO_RESELECTION"


def _selected_component(
    component: str,
    source: Path,
    target: Path,
    fixture_dir: Path,
    d2_record: dict[str, Any],
) -> dict[str, Any]:
    fixture = baseline.browser_fixture(component, source, fixture_dir, d2_record)
    candidate = matrix._candidate_record(
        component,
        source,
        target,
        d2_record,
        matrix.exact_fp16_storage_fp32_compute,
    )
    if candidate.get("result") != "PASS":
        raise RuntimeError(
            f"{component} accepted D3 selected representation failed reproduction: "
            f"{candidate.get('result')} {candidate.get('error')}"
        )
    transform = candidate.get("transform") or {}
    artifact = candidate.get("artifact") or {}
    parity = candidate.get("nativeOrtParity") or {}
    if transform.get("scheme") != SELECTED_SCHEME:
        raise RuntimeError(f"{component} selected D3 scheme drift: {transform.get('scheme')!r}")
    if transform.get("valueRoundtripExactByConstruction") is not True:
        raise RuntimeError(f"{component} selected D3 transform lost exact-roundtrip construction")
    if transform.get("storagePrecisionIsNotComputePrecision") is not True:
        raise RuntimeError(f"{component} selected D3 storage/compute precision contract drift")
    if parity.get("passed") is not True:
        raise RuntimeError(f"{component} selected D3 native ORT parity is not PASS")
    if artifact.get("sizeRatio", 1.0) >= 0.80:
        raise RuntimeError(f"{component} selected D3 candidate is no longer compact")
    if artifact.get("graph", {}).get("domains") != ["ai.onnx"]:
        raise RuntimeError(f"{component} selected D3 candidate left standard ONNX domain")
    if artifact.get("graph", {}).get("functionCount") != 0:
        raise RuntimeError(f"{component} selected D3 candidate contains local functions")
    if not target.is_file() or target.is_symlink():
        raise RuntimeError(f"{component} selected D3 candidate binary missing")
    if target.stat().st_size != artifact.get("size") or baseline.sha256_file(target) != artifact.get("sha256"):
        raise RuntimeError(f"{component} selected D3 candidate identity drift after write")
    return {
        "status": "CANDIDATE",
        "result": "WASM_COMPACT_NATIVE_PASS",
        "source": {"size": source.stat().st_size, "sha256": baseline.sha256_file(source)},
        "candidate": artifact,
        "nativeOrtParity": parity,
        "transform": transform,
        "selectedStrategy": SELECTED_STRATEGY,
        "browserFixture": fixture,
        "compactSizePassed": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fp32-dir", type=Path, required=True)
    parser.add_argument("--d2-report", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if matrix.onnx.__version__ != matrix.EXPECTED_ONNX or matrix.ort.__version__ != matrix.EXPECTED_ORT:
        raise RuntimeError(
            f"unexpected ONNX/ORT versions: {matrix.onnx.__version__}/{matrix.ort.__version__}"
        )

    fp32_dir = args.fp32_dir.resolve(strict=True)
    d2_report = json.loads(args.d2_report.resolve(strict=True).read_text(encoding="utf-8"))
    baseline.require_d2_report(d2_report, fp32_dir)

    output_dir = args.output_dir.resolve()
    fixture_dir = args.fixture_dir.resolve()
    if output_dir.exists():
        shutil.rmtree(output_dir)
    if fixture_dir.exists():
        shutil.rmtree(fixture_dir)
    output_dir.mkdir(parents=True)
    fixture_dir.mkdir(parents=True)

    components: dict[str, Any] = {}
    for component in matrix.COMPONENTS:
        filename = baseline.COMPONENT_FILES[component]
        source = fp32_dir / filename
        target = output_dir / filename
        components[component] = _selected_component(
            component,
            source,
            target,
            fixture_dir,
            d2_report["components"][component],
        )
        gc.collect()

    source_bytes = sum(int(value["source"]["size"]) for value in components.values())
    selected_bytes = sum(int(value["candidate"]["size"]) for value in components.values())
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D3_WASM_COMPACT_PREPARATION",
        "environment": {
            "onnx": matrix.onnx.__version__,
            "onnxruntime": matrix.ort.__version__,
            "numpy": matrix.np.__version__,
        },
        "strategy": "ACCEPTED_D3_SELECTED_REPRESENTATION_REPRODUCTION",
        "selectionStrategy": SELECTED_STRATEGY,
        "selectionRule": SELECTION_RULE,
        "acceptedScheme": SELECTED_SCHEME,
        "reselectionPerformed": False,
        "fullStrategyMatrixExecuted": False,
        "fullInt8UniversalPackClaimed": False,
        "components": components,
        "nativePassCount": len(components),
        "blockedComponents": {},
        "totals": {
            "sourceFp32Bytes": source_bytes,
            "candidateBytesProduced": selected_bytes,
            "producedSizeRatio": selected_bytes / source_bytes,
        },
        "browserWasmStillRequired": True,
        "calibrationIsProductionQualityAuthority": False,
        "binaryArtifactsRunnerLocalOnly": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "realDeviceApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "TINY-SD D3 SELECTED WASM REPRODUCTION: "
        f"native_pass={report['nativePassCount']}/3 scheme={SELECTED_SCHEME} "
        f"selected_bytes={selected_bytes}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
