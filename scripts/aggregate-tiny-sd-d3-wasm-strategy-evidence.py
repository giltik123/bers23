#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
from typing import Any

COMPONENT_STRATEGIES = {
    "text_encoder": (
        "dynamic_signed",
        "dynamic_signed_reduce_range",
        "weight_only_s8",
        "exact_fp16_storage",
    ),
    "unet": (
        "static_s8s8_qdq",
        "static_u8u8_qdq",
        "weight_only_s8",
        "exact_fp16_storage",
    ),
    "vae_decoder": (
        "static_s8s8_qdq",
        "static_u8u8_qdq",
        "weight_only_s8",
        "exact_fp16_storage",
    ),
}
HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"
ALLOWED_RESULTS = {"PASS", "SIZE_BLOCKED", "NUMERIC_RISK", "TRANSFORM_BLOCKED"}
MAX_STRATEGY_RECORD_BYTES = 4 * 1024 * 1024
SELECTION_RULE = "MIN_SIZE_AMONG_ORIGINAL_D3_NATIVE_PARITY_PASSING_CANDIDATES"


def _strategy_names_from_list(node: ast.AST, aliases: dict[str, str]) -> tuple[str, ...]:
    if not isinstance(node, ast.List):
        raise RuntimeError("canonical D3 strategy definition no longer returns a literal list")
    names: list[str] = []
    for element in node.elts:
        if isinstance(element, ast.Tuple) and element.elts and isinstance(element.elts[0], ast.Constant) and isinstance(element.elts[0].value, str):
            names.append(element.elts[0].value)
            continue
        if isinstance(element, ast.Name) and element.id in aliases:
            names.append(aliases[element.id])
            continue
        raise RuntimeError("canonical D3 strategy definition contains an unsupported selectable entry")
    return tuple(names)


def _load_canonical_contract(path: Path) -> tuple[dict[str, str], dict[str, str]]:
    source = path.read_text(encoding="utf-8")
    module = ast.parse(source, filename=str(path))
    values: dict[str, Any] = {}
    wanted = {
        "ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT",
        "ACCEPTED_SELECTED_SCHEME_BY_COMPONENT",
    }
    strategy_function: ast.FunctionDef | None = None
    for node in module.body:
        if isinstance(node, ast.FunctionDef) and node.name == "_strategy_definitions":
            strategy_function = node
        if not isinstance(node, ast.Assign) or len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            continue
        name = node.targets[0].id
        if name in wanted:
            values[name] = ast.literal_eval(node.value)
    if set(values) != wanted:
        raise RuntimeError("unable to read accepted D3 strategy/scheme policy from canonical matrix script")
    if strategy_function is None:
        raise RuntimeError("canonical D3 strategy definition function is missing")

    aliases: dict[str, str] = {}
    text_encoder_strategies: tuple[str, ...] | None = None
    cnn_strategies: tuple[str, ...] | None = None
    for node in strategy_function.body:
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and isinstance(node.value, ast.Tuple)
            and node.value.elts
            and isinstance(node.value.elts[0], ast.Constant)
            and isinstance(node.value.elts[0].value, str)
        ):
            aliases[node.targets[0].id] = node.value.elts[0].value
            continue
        if isinstance(node, ast.If):
            for branch_node in node.body:
                if isinstance(branch_node, ast.Return):
                    text_encoder_strategies = _strategy_names_from_list(branch_node.value, aliases)
            continue
        if isinstance(node, ast.Return):
            cnn_strategies = _strategy_names_from_list(node.value, aliases)

    canonical_selectable = {
        "text_encoder": text_encoder_strategies,
        "unet": cnn_strategies,
        "vae_decoder": cnn_strategies,
    }
    if canonical_selectable != COMPONENT_STRATEGIES:
        raise RuntimeError(
            "D3 selectable strategy fanout drifted from canonical matrix implementation: "
            f"canonical={canonical_selectable} fanout={COMPONENT_STRATEGIES}"
        )

    strategies = values["ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT"]
    schemes = values["ACCEPTED_SELECTED_SCHEME_BY_COMPONENT"]
    if not isinstance(strategies, dict) or not isinstance(schemes, dict):
        raise RuntimeError("canonical D3 accepted policy is not a dictionary")
    if set(strategies) != set(COMPONENT_STRATEGIES) or set(schemes) != set(COMPONENT_STRATEGIES):
        raise RuntimeError("canonical D3 accepted policy component set drift")
    return strategies, schemes


def _require_sha256(value: Any, context: str) -> str:
    if not isinstance(value, str) or len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
        raise RuntimeError(f"{context} is not a lowercase SHA-256 identity")
    return value


def _load_strategy_record(
    path: Path,
    component: str,
    strategy: str,
    candidate_sha: str,
    workflow_run_id: str,
) -> tuple[dict[str, Any], str]:
    if not path.is_file() or path.is_symlink() or path.stat().st_size <= 0:
        raise RuntimeError(f"strategy evidence is missing/symlinked/empty: {strategy}")
    if path.stat().st_size > MAX_STRATEGY_RECORD_BYTES:
        raise RuntimeError(f"strategy evidence exceeds bounded JSON size: {strategy}")
    wrapper = json.loads(path.read_text(encoding="utf-8"))
    if (
        wrapper.get("schemaVersion") != 1
        or wrapper.get("status") != "CANDIDATE"
        or wrapper.get("stage") != "D3_WASM_SINGLE_STRATEGY_EVIDENCE"
        or wrapper.get("candidateSha") != candidate_sha
        or wrapper.get("workflowRunId") != workflow_run_id
        or wrapper.get("component") != component
        or wrapper.get("strategy") != strategy
        or wrapper.get("d2Fp32HandoffVerified") is not True
        or wrapper.get("d2HandoffTransport") != HANDOFF_TRANSPORT
        or wrapper.get("crossJobD2Fp32Handoff") is not True
        or wrapper.get("d3CandidateBinaryCrossJobHandoff") is not False
        or wrapper.get("runtimeAuthorityGranted") is not False
        or wrapper.get("productionApproval") is not False
    ):
        raise RuntimeError(f"strategy wrapper contract mismatch: {component}/{strategy}")
    handoff_manifest_sha = _require_sha256(
        wrapper.get("d2HandoffManifestSha256"),
        f"strategy D2 handoff manifest SHA: {component}/{strategy}",
    )
    record = wrapper.get("workerRecord")
    if not isinstance(record, dict) or record.get("result") not in ALLOWED_RESULTS:
        raise RuntimeError(f"strategy worker record contract mismatch: {component}/{strategy}")
    if record["result"] == "TRANSFORM_BLOCKED":
        if record.get("artifact") is not None or record.get("nativeOrtParity") is not None:
            raise RuntimeError(f"blocked strategy unexpectedly contains accepted artifact evidence: {strategy}")
    else:
        artifact = record.get("artifact")
        parity = record.get("nativeOrtParity")
        transform = record.get("transform")
        if not isinstance(artifact, dict) or not isinstance(parity, dict) or not isinstance(transform, dict):
            raise RuntimeError(f"strategy evidence is incomplete: {strategy}")
        if not isinstance(artifact.get("size"), int) or artifact["size"] <= 0:
            raise RuntimeError(f"strategy artifact size is invalid: {strategy}")
        _require_sha256(artifact.get("sha256"), f"strategy artifact SHA: {strategy}")
    return record, handoff_manifest_sha


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--component", choices=tuple(COMPONENT_STRATEGIES), required=True)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--workflow-run-id", required=True)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--matrix-script", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if len(args.candidate_sha) != 40 or any(value not in "0123456789abcdef" for value in args.candidate_sha):
        raise RuntimeError("candidate SHA is not a lowercase 40-hex commit identity")
    if not args.workflow_run_id.isdecimal() or int(args.workflow_run_id) <= 0:
        raise RuntimeError("workflow run id is not a positive decimal identity")

    input_dir = args.input_dir.resolve(strict=True)
    if not input_dir.is_dir() or input_dir.is_symlink():
        raise RuntimeError("strategy evidence root is not a regular directory")
    strategies = COMPONENT_STRATEGIES[args.component]
    expected_names = {f"{args.component}--{strategy}.json" for strategy in strategies}
    entries = list(input_dir.iterdir())
    if any(value.is_dir() or value.is_symlink() for value in entries):
        raise RuntimeError("strategy evidence contains a directory or symlink")
    if {value.name for value in entries} != expected_names:
        raise RuntimeError(
            f"strategy evidence file allowlist mismatch: expected={sorted(expected_names)} observed={sorted(value.name for value in entries)}"
        )

    accepted_strategies, accepted_schemes = _load_canonical_contract(args.matrix_script.resolve(strict=True))
    records: dict[str, dict[str, Any]] = {}
    handoff_manifest_shas: set[str] = set()
    passing: list[tuple[int, str, dict[str, Any]]] = []
    observed: list[tuple[float, str]] = []
    for strategy in strategies:
        record, handoff_manifest_sha = _load_strategy_record(
            input_dir / f"{args.component}--{strategy}.json",
            args.component,
            strategy,
            args.candidate_sha,
            args.workflow_run_id,
        )
        records[strategy] = record
        handoff_manifest_shas.add(handoff_manifest_sha)
        parity = record.get("nativeOrtParity") or {}
        normalized = parity.get("normalizedMetrics") or {}
        if "rmseOverReferenceRms" in normalized:
            observed.append((float(normalized["rmseOverReferenceRms"]), strategy))
        if record["result"] == "PASS":
            passing.append((int(record["artifact"]["size"]), strategy, record))

    if len(handoff_manifest_shas) != 1:
        raise RuntimeError(
            f"strategy jobs did not use one identical D2 handoff manifest: {sorted(handoff_manifest_shas)}"
        )
    handoff_manifest_sha = next(iter(handoff_manifest_shas))
    if not passing:
        raise RuntimeError(f"D3 component strategy fanout produced no native-parity compact PASS: {args.component}")
    _, selected_strategy, selected_record = min(passing, key=lambda item: (item[0], item[1]))
    selected_scheme = (selected_record.get("transform") or {}).get("scheme")
    expected_strategy = accepted_strategies[args.component]
    expected_scheme = accepted_schemes[args.component]
    policy_mismatches = {}
    if selected_strategy != expected_strategy or selected_scheme != expected_scheme:
        policy_mismatches[args.component] = {
            "expectedStrategy": expected_strategy,
            "observedStrategy": selected_strategy,
            "expectedScheme": expected_scheme,
            "observedScheme": selected_scheme,
        }

    best_observed = None
    if observed:
        best_rmse, best_strategy = min(observed)
        best_observed = {"strategy": best_strategy, "rmseOverReferenceRms": best_rmse}

    component_record = {
        "status": "CANDIDATE",
        "result": "WASM_COMPACT_NATIVE_PASS",
        "candidate": selected_record["artifact"],
        "nativeOrtParity": selected_record["nativeOrtParity"],
        "transform": selected_record["transform"],
        "selectedStrategy": selected_strategy,
        "acceptedSelectedStrategy": expected_strategy,
        "acceptedSelectedScheme": expected_scheme,
        "acceptedSelectionPolicyMatched": not policy_mismatches,
        "d2HandoffTransport": HANDOFF_TRANSPORT,
        "d2HandoffManifestSha256": handoff_manifest_sha,
        "bestObservedByNormalizedRmse": best_observed,
        "strategies": records,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "releaseIdentityPinned": False,
    }
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D3_WASM_COMPONENT_STRATEGY_MATRIX",
        "scope": "SINGLE_COMPONENT_MULTI_RUNNER_STRATEGY_BOUNDARY",
        "candidateSha": args.candidate_sha,
        "workflowRunId": args.workflow_run_id,
        "component": args.component,
        "strategy": "MULTI_STRATEGY_NATIVE_PARITY_SELECTION",
        "strategyOrderIsNotAuthority": True,
        "selectionRule": SELECTION_RULE,
        "acceptedSelectionPolicy": dict(accepted_strategies),
        "acceptedSchemePolicy": dict(accepted_schemes),
        "acceptedSelectionPolicyMatched": not policy_mismatches,
        "selectionPolicyMismatches": policy_mismatches,
        "selectionPolicyUpdateRequiredOnWinnerChange": True,
        "selectableStrategyCount": len(strategies),
        "selectableStrategySetBoundToCanonicalImplementation": True,
        "d2HandoffTransport": HANDOFF_TRANSPORT,
        "d2HandoffManifestSha256": handoff_manifest_sha,
        "d2HandoffManifestConsensus": True,
        "crossJobD2Fp32Handoff": True,
        "crossJobD3CandidateBinaryHandoff": False,
        "jsonStrategyEvidenceOnly": True,
        "components": {args.component: component_record},
        "nativePassCount": 1,
        "blockedComponents": {},
        "runtimeAuthorityGranted": False,
        "realDeviceApproval": False,
        "productionApproval": False,
        "releaseIdentityPinned": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "TINY-SD D3 WASM STRATEGY AGGREGATE: "
        f"component={args.component} run={args.workflow_run_id} selected={selected_strategy} "
        f"expected={expected_strategy} d2_manifest={handoff_manifest_sha} "
        f"transport={HANDOFF_TRANSPORT} policy_match={not policy_mismatches}"
    )
    if policy_mismatches:
        raise RuntimeError(
            "D3 minimum-size winner diverged from accepted per-component selection policy; "
            f"explicit accepted-selection policy update required: {policy_mismatches}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
