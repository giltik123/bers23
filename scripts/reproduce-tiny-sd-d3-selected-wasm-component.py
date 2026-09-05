#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
from pathlib import Path
from typing import Any

SELECTED_MODULE_PATH = Path(__file__).with_name("reproduce-tiny-sd-d3-selected-wasm.py")
spec = importlib.util.spec_from_file_location("tiny_sd_d3_selected_wasm", SELECTED_MODULE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load accepted D3 selected reproduction implementation")
selected = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selected)
matrix = selected.matrix
baseline = selected.baseline
HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"


def _require_component_d2_report(report: dict[str, Any], component: str, source: Path) -> dict[str, Any]:
    if (
        report.get("status") != "CANDIDATE"
        or report.get("stage") != "D2_COMPONENT_ONNX_CPU_FEASIBILITY"
        or report.get("passCount") != 3
        or report.get("allComponentsPass") is not True
        or report.get("blockedComponents") != {}
        or report.get("runtimeAuthorityGranted") is not False
        or report.get("productionApproval") is not False
        or set(report.get("components") or {}) != set(matrix.COMPONENTS)
    ):
        raise RuntimeError("selected component reproduction did not receive accepted D2 3/3 evidence")
    record = report["components"][component]
    artifact = record.get("artifact") or {}
    if record.get("result") != "PASS" or record.get("ortParityPassed") is not True:
        raise RuntimeError("selected component D2 record is not accepted")
    if not source.is_file() or source.is_symlink():
        raise RuntimeError("selected component D2 FP32 source is missing or symlinked")
    if source.stat().st_size != artifact.get("size") or baseline.sha256_file(source) != artifact.get("sha256"):
        raise RuntimeError("selected component D2 FP32 source identity mismatch")
    model = matrix.onnx.load_model(source, load_external_data=True)
    try:
        if baseline.io_contract(model) != baseline.expected_io_from_d2(record):
            raise RuntimeError("selected component D2 FP32 I/O contract drift")
    finally:
        del model
    return record


def _require_handoff_manifest(fp32_dir: Path, component: str, candidate_sha: str, workflow_run_id: str) -> str:
    path = fp32_dir / "handoff-manifest.json"
    if not path.is_file() or path.is_symlink() or path.stat().st_size <= 0 or path.stat().st_size > 2 * 1024 * 1024:
        raise RuntimeError("selected component D2 handoff manifest is missing, symlinked, empty or oversized")
    value = json.loads(path.read_text(encoding="utf-8"))
    if (
        value.get("schemaVersion") != 1
        or value.get("status") != "CANDIDATE"
        or value.get("stage") != "D3_D2_COMPONENT_HANDOFF"
        or value.get("candidateSha") != candidate_sha
        or value.get("workflowRunId") != workflow_run_id
        or value.get("component") != component
        or value.get("handoffTransport") != HANDOFF_TRANSPORT
        or value.get("crossJobD2Fp32Handoff") is not True
        or value.get("d3CandidateBinaryIncluded") is not False
        or value.get("runtimeAuthorityGranted") is not False
        or value.get("productionApproval") is not False
        or value.get("releaseIdentityPinned") is not False
    ):
        raise RuntimeError("selected component D2 handoff manifest identity/transport/lifecycle mismatch")
    return baseline.sha256_file(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--component", choices=matrix.COMPONENTS, required=True)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--workflow-run-id", required=True)
    parser.add_argument("--fp32-dir", type=Path, required=True)
    parser.add_argument("--d2-report", type=Path, required=True)
    parser.add_argument("--matrix-report", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if matrix.onnx.__version__ != matrix.EXPECTED_ONNX or matrix.ort.__version__ != matrix.EXPECTED_ORT:
        raise RuntimeError(
            f"unexpected ONNX/ORT versions: {matrix.onnx.__version__}/{matrix.ort.__version__}"
        )
    if len(args.candidate_sha) != 40 or any(value not in "0123456789abcdef" for value in args.candidate_sha):
        raise RuntimeError("candidate SHA is not a lowercase 40-hex commit identity")
    if not args.workflow_run_id.isdecimal() or int(args.workflow_run_id) <= 0:
        raise RuntimeError("workflow run id is not a positive decimal identity")

    component = args.component
    fp32_dir = args.fp32_dir.resolve(strict=True)
    handoff_manifest_sha = _require_handoff_manifest(fp32_dir, component, args.candidate_sha, args.workflow_run_id)
    source = fp32_dir / baseline.COMPONENT_FILES[component]
    d2_report_path = args.d2_report.resolve(strict=True)
    d2_report = json.loads(d2_report_path.read_text(encoding="utf-8"))
    d2_record = _require_component_d2_report(d2_report, component, source)

    matrix_report_path = args.matrix_report.resolve(strict=True)
    if matrix_report_path.is_symlink() or matrix_report_path.stat().st_size <= 0 or matrix_report_path.stat().st_size > 4 * 1024 * 1024:
        raise RuntimeError("component matrix JSON evidence is missing, symlinked, empty or oversized")
    component_matrix = json.loads(matrix_report_path.read_text(encoding="utf-8"))
    matrix_record = (component_matrix.get("components") or {}).get(component)
    if (
        component_matrix.get("status") != "CANDIDATE"
        or component_matrix.get("stage") != "D3_WASM_COMPONENT_STRATEGY_MATRIX"
        or component_matrix.get("scope") != "SINGLE_COMPONENT_MULTI_RUNNER_STRATEGY_BOUNDARY"
        or component_matrix.get("candidateSha") != args.candidate_sha
        or component_matrix.get("workflowRunId") != args.workflow_run_id
        or component_matrix.get("component") != component
        or component_matrix.get("d2HandoffTransport") != HANDOFF_TRANSPORT
        or component_matrix.get("d2HandoffManifestSha256") != handoff_manifest_sha
        or component_matrix.get("d2HandoffManifestConsensus") is not True
        or component_matrix.get("crossJobD2Fp32Handoff") is not True
        or component_matrix.get("crossJobD3CandidateBinaryHandoff") is not False
        or component_matrix.get("jsonStrategyEvidenceOnly") is not True
        or component_matrix.get("acceptedSelectionPolicyMatched") is not True
        or component_matrix.get("selectionPolicyMismatches") != {}
        or component_matrix.get("runtimeAuthorityGranted") is not False
        or component_matrix.get("productionApproval") is not False
        or not isinstance(matrix_record, dict)
        or matrix_record.get("result") != "WASM_COMPACT_NATIVE_PASS"
        or matrix_record.get("acceptedSelectionPolicyMatched") is not True
        or matrix_record.get("d2HandoffTransport") != HANDOFF_TRANSPORT
        or matrix_record.get("d2HandoffManifestSha256") != handoff_manifest_sha
    ):
        raise RuntimeError("component matrix evidence is not accepted or D2 handoff identity changed")

    expected_strategy = matrix.ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT[component]
    expected_scheme = matrix.ACCEPTED_SELECTED_SCHEME_BY_COMPONENT[component]
    if matrix_record.get("selectedStrategy") != expected_strategy:
        raise RuntimeError("component matrix selected strategy drift")
    if (matrix_record.get("transform") or {}).get("scheme") != expected_scheme:
        raise RuntimeError("component matrix selected scheme drift")

    output_dir = args.output_dir.resolve()
    fixture_dir = args.fixture_dir.resolve()
    if output_dir.exists():
        shutil.rmtree(output_dir)
    if fixture_dir.exists():
        shutil.rmtree(fixture_dir)
    output_dir.mkdir(parents=True)
    fixture_dir.mkdir(parents=True)

    target = output_dir / baseline.COMPONENT_FILES[component]
    record = selected._selected_component(
        component,
        source,
        target,
        fixture_dir,
        d2_record,
    )
    matrix_candidate = matrix_record.get("candidate") or {}
    if (
        record["selectedStrategy"] != matrix_record["selectedStrategy"]
        or record["acceptedSelectedScheme"] != matrix_record["acceptedSelectedScheme"]
        or record["candidate"]["size"] != matrix_candidate.get("size")
        or record["candidate"]["sha256"] != matrix_candidate.get("sha256")
    ):
        raise RuntimeError("selected reproduction identity does not match accepted component matrix evidence")
    record["matrixEvidenceMatched"] = True
    record["matrixEvidenceSha256"] = baseline.sha256_file(matrix_report_path)
    record["d2Fp32HandoffVerified"] = True
    record["d2HandoffTransport"] = HANDOFF_TRANSPORT
    record["d2HandoffManifestSha256"] = handoff_manifest_sha

    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D3_WASM_COMPACT_PREPARATION",
        "scope": "SINGLE_COMPONENT_BROWSER_REPRODUCTION",
        "componentUnderTest": component,
        "candidateSha": args.candidate_sha,
        "workflowRunId": args.workflow_run_id,
        "strategy": "ACCEPTED_D3_SELECTED_REPRESENTATION_REPRODUCTION",
        "selectionStrategy": expected_strategy,
        "selectionStrategies": dict(matrix.ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT),
        "selectionRule": selected.SELECTION_RULE,
        "selectionPolicySource": selected.SELECTION_POLICY_SOURCE,
        "acceptedScheme": expected_scheme,
        "acceptedSchemes": dict(matrix.ACCEPTED_SELECTED_SCHEME_BY_COMPONENT),
        "acceptedSelectionPolicyMatched": True,
        "reselectionPerformed": False,
        "fullStrategyMatrixExecuted": False,
        "fullStrategyMatrixEvidenceVerified": True,
        "d2HandoffTransport": HANDOFF_TRANSPORT,
        "d2HandoffManifestSha256": handoff_manifest_sha,
        "d2HandoffManifestConsensusVerified": True,
        "crossJobD2Fp32Handoff": True,
        "crossJobD3CandidateBinaryHandoff": False,
        "jsonStrategyEvidenceOnlyFromMatrixJobs": True,
        "fullInt8UniversalPackClaimed": False,
        "components": {component: record},
        "nativePassCount": 1,
        "blockedComponents": {},
        "totals": {
            "sourceFp32BytesForComponent": record["source"]["size"],
            "candidateBytesProducedForComponent": record["candidate"]["size"],
        },
        "browserWasmStillRequired": True,
        "calibrationIsProductionQualityAuthority": False,
        "binaryArtifactsRunnerLocalOnly": False,
        "d3BinaryArtifactsRunnerLocalOnly": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "realDeviceApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "TINY-SD D3 SELECTED WASM COMPONENT REPRODUCTION: "
        f"component={component} strategy={expected_strategy} run={args.workflow_run_id} "
        f"matrix_identity=PASS d2_manifest={handoff_manifest_sha} "
        f"d2_handoff=VERIFIED transport={HANDOFF_TRANSPORT}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
