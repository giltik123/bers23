#!/usr/bin/env python3
"""Compare metadata-only ONNX reproducibility fingerprint reports.

This tool consumes reports emitted by fingerprint-onnx-repro.py. It never reads,
rewrites, canonicalizes, repins, signs, or promotes an ONNX model. Its purpose is
to classify cross-run drift after each hosted runner has already proved same-run
byte identity independently.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PURPOSE = "DIAGNOSTIC_ONLY_NO_RELEASE_AUTHORITY"
BYTE_IDENTICAL = "BYTE_IDENTICAL"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def require_sha(value: Any, field: str) -> str:
    require(isinstance(value, str) and SHA256_RE.fullmatch(value) is not None, f"invalid {field}")
    return value


def load_report(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(value, dict), f"{path}: report must be an object")
    require(value.get("schemaVersion") == 1, f"{path}: unsupported schemaVersion")
    require(value.get("purpose") == PURPOSE, f"{path}: wrong diagnostic purpose")

    comparison = value.get("comparison")
    require(isinstance(comparison, dict), f"{path}: missing comparison")
    require(
        comparison.get("classification") == BYTE_IDENTICAL,
        f"{path}: hosted runner did not prove same-run byte identity",
    )

    samples = value.get("samples")
    require(isinstance(samples, list) and len(samples) == 2, f"{path}: exactly two samples required")
    first, second = samples
    require(isinstance(first, dict) and isinstance(second, dict), f"{path}: invalid samples")

    exact_fields = (
        "rawSha256",
        "deterministicProtoSha256",
        "graphSemanticSha256",
        "initializerSemanticSetSha256",
    )
    for field in exact_fields:
        left = require_sha(first.get(field), f"{path}:{field}")
        right = require_sha(second.get(field), f"{path}:{field}")
        require(left == right, f"{path}: {field} disagrees despite BYTE_IDENTICAL classification")

    require(first.get("size") == second.get("size"), f"{path}: sample sizes disagree")
    require(first.get("nodeCount") == second.get("nodeCount"), f"{path}: node counts disagree")
    require(first.get("initializerCount") == second.get("initializerCount"), f"{path}: initializer counts disagree")
    return value


def initializer_map(sample: dict[str, Any], label: str) -> dict[str, dict[str, Any]]:
    values = sample.get("initializers")
    require(isinstance(values, list), f"{label}: missing initializers")
    result: dict[str, dict[str, Any]] = {}
    for item in values:
        require(isinstance(item, dict), f"{label}: invalid initializer entry")
        name = item.get("name")
        require(isinstance(name, str) and name, f"{label}: initializer name missing")
        require(name not in result, f"{label}: duplicate initializer {name}")
        require_sha(item.get("semanticDataSha256"), f"{label}:{name}:semanticDataSha256")
        require_sha(item.get("protoSha256"), f"{label}:{name}:protoSha256")
        require(isinstance(item.get("dataType"), int), f"{label}:{name}: invalid dataType")
        dims = item.get("dims")
        require(isinstance(dims, list) and all(isinstance(v, int) and v >= 0 for v in dims), f"{label}:{name}: invalid dims")
        result[name] = item
    require(len(result) == sample.get("initializerCount"), f"{label}: initializerCount mismatch")
    return result


def classify(samples: list[dict[str, Any]]) -> dict[str, Any]:
    raw_equal = len({sample["rawSha256"] for sample in samples}) == 1
    proto_equal = len({sample["deterministicProtoSha256"] for sample in samples}) == 1
    graph_equal = len({sample["graphSemanticSha256"] for sample in samples}) == 1
    initializer_equal = len({sample["initializerSemanticSetSha256"] for sample in samples}) == 1
    if raw_equal:
        classification = BYTE_IDENTICAL
    elif proto_equal:
        classification = "RAW_SERIALIZATION_ONLY"
    elif graph_equal and initializer_equal:
        classification = "NON_GRAPH_METADATA_OR_PROTO_LAYOUT_DRIFT"
    elif initializer_equal:
        classification = "GRAPH_STRUCTURE_OR_ATTRIBUTE_DRIFT_WITH_EQUAL_INITIALIZERS"
    else:
        classification = "TENSOR_OR_INITIALIZER_DRIFT"
    return {
        "classification": classification,
        "rawBytesEqual": raw_equal,
        "deterministicProtoEqual": proto_equal,
        "graphSemanticsEqual": graph_equal,
        "initializerSemanticsEqual": initializer_equal,
    }


def initializer_drift(samples: list[dict[str, Any]], labels: list[str]) -> dict[str, Any]:
    maps = [initializer_map(sample, label) for sample, label in zip(samples, labels, strict=True)]
    all_names = sorted(set().union(*(mapping.keys() for mapping in maps)))
    changed: list[dict[str, Any]] = []
    for name in all_names:
        entries = [mapping.get(name) for mapping in maps]
        signatures = []
        for entry in entries:
            if entry is None:
                signatures.append(None)
            else:
                signatures.append({
                    "dataType": entry["dataType"],
                    "dims": entry["dims"],
                    "semanticDataSha256": entry["semanticDataSha256"],
                    "protoSha256": entry["protoSha256"],
                })
        canonical = {json.dumps(value, sort_keys=True, separators=(",", ":")) for value in signatures}
        if len(canonical) > 1:
            changed.append({"name": name, "byReport": dict(zip(labels, signatures, strict=True))})
    return {"changedCount": len(changed), "changed": changed}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    require(len(args.reports) >= 2, "at least two independent reports are required")
    reports = [load_report(path) for path in args.reports]
    samples = [report["samples"][0] for report in reports]
    labels = [path.parent.name or path.name for path in args.reports]

    environments = [report.get("environment") for report in reports]
    require(all(isinstance(value, dict) for value in environments), "every report must contain environment metadata")

    result = {
        "schemaVersion": 1,
        "purpose": PURPOSE,
        "reportCount": len(reports),
        "comparison": classify(samples),
        "samples": [
            {
                "report": label,
                "size": sample["size"],
                "rawSha256": sample["rawSha256"],
                "deterministicProtoSha256": sample["deterministicProtoSha256"],
                "graphSemanticSha256": sample["graphSemanticSha256"],
                "initializerSemanticSetSha256": sample["initializerSemanticSetSha256"],
                "nodeCount": sample["nodeCount"],
                "initializerCount": sample["initializerCount"],
                "environment": environment,
            }
            for label, sample, environment in zip(labels, samples, environments, strict=True)
        ],
        "initializerDrift": initializer_drift(samples, labels),
    }
    text = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")


if __name__ == "__main__":
    main()
