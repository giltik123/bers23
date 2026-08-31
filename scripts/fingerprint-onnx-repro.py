#!/usr/bin/env python3
"""Produce semantic and byte-level fingerprints for ONNX reproducibility diagnostics.

This tool is intentionally read-only: it never rewrites, canonicalizes, repins, signs, or
promotes a model. It distinguishes raw/protobuf byte identity from graph and tensor identity
so exporter drift can be classified before any release-authority change is considered.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from pathlib import Path
from typing import Any

import numpy as np
import onnx
from onnx import numpy_helper


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_sha(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return sha256_bytes(encoded)


def tensor_fingerprint(tensor: onnx.TensorProto) -> dict[str, Any]:
    array = numpy_helper.to_array(tensor)
    contiguous = np.ascontiguousarray(array)
    return {
        "name": tensor.name,
        "dataType": int(tensor.data_type),
        "dims": [int(v) for v in tensor.dims],
        "elementCount": int(contiguous.size),
        "semanticDataSha256": sha256_bytes(contiguous.tobytes(order="C")),
        "protoSha256": sha256_bytes(tensor.SerializeToString(deterministic=True)),
    }


def attribute_fingerprint(attribute: onnx.AttributeProto) -> dict[str, Any]:
    value: dict[str, Any] = {
        "name": attribute.name,
        "type": int(attribute.type),
    }
    if attribute.type == onnx.AttributeProto.TENSOR:
        value["tensor"] = tensor_fingerprint(attribute.t)
    elif attribute.type == onnx.AttributeProto.TENSORS:
        value["tensors"] = [tensor_fingerprint(v) for v in attribute.tensors]
    else:
        value["protoSha256"] = sha256_bytes(attribute.SerializeToString(deterministic=True))
    return value


def value_info_fingerprint(value: onnx.ValueInfoProto) -> dict[str, Any]:
    tensor_type = value.type.tensor_type
    dimensions: list[Any] = []
    for dim in tensor_type.shape.dim:
        if dim.HasField("dim_value"):
            dimensions.append(int(dim.dim_value))
        elif dim.HasField("dim_param"):
            dimensions.append({"param": dim.dim_param})
        else:
            dimensions.append(None)
    return {
        "name": value.name,
        "elemType": int(tensor_type.elem_type),
        "shape": dimensions,
    }


def node_fingerprint(node: onnx.NodeProto) -> dict[str, Any]:
    return {
        "opType": node.op_type,
        "domain": node.domain,
        "inputs": list(node.input),
        "outputs": list(node.output),
        "attributes": [attribute_fingerprint(value) for value in sorted(node.attribute, key=lambda item: item.name)],
    }


def fingerprint(path: Path) -> dict[str, Any]:
    model = onnx.load(path, load_external_data=False)
    onnx.checker.check_model(model, full_check=True)

    initializers = [tensor_fingerprint(value) for value in sorted(model.graph.initializer, key=lambda item: item.name)]
    nodes = [node_fingerprint(value) for value in model.graph.node]
    graph_semantics = {
        "inputs": [value_info_fingerprint(value) for value in model.graph.input],
        "outputs": [value_info_fingerprint(value) for value in model.graph.output],
        "nodes": nodes,
        "initializers": [
            {
                "name": value["name"],
                "dataType": value["dataType"],
                "dims": value["dims"],
                "semanticDataSha256": value["semanticDataSha256"],
            }
            for value in initializers
        ],
        "opsets": sorted((entry.domain, int(entry.version)) for entry in model.opset_import),
    }
    return {
        "path": str(path),
        "size": path.stat().st_size,
        "rawSha256": sha256_file(path),
        "deterministicProtoSha256": sha256_bytes(model.SerializeToString(deterministic=True)),
        "irVersion": int(model.ir_version),
        "producerName": model.producer_name,
        "producerVersion": model.producer_version,
        "graphName": model.graph.name,
        "nodeCount": len(model.graph.node),
        "initializerCount": len(initializers),
        "graphSemanticSha256": canonical_json_sha(graph_semantics),
        "initializerSemanticSetSha256": canonical_json_sha([
            (value["name"], value["dataType"], value["dims"], value["semanticDataSha256"])
            for value in initializers
        ]),
        "initializers": initializers,
    }


def comparison(values: list[dict[str, Any]]) -> dict[str, Any]:
    if len(values) < 2:
        return {"classification": "SINGLE_SAMPLE"}
    raw_equal = len({value["rawSha256"] for value in values}) == 1
    deterministic_proto_equal = len({value["deterministicProtoSha256"] for value in values}) == 1
    graph_equal = len({value["graphSemanticSha256"] for value in values}) == 1
    initializer_equal = len({value["initializerSemanticSetSha256"] for value in values}) == 1
    if raw_equal:
        classification = "BYTE_IDENTICAL"
    elif deterministic_proto_equal:
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
        "deterministicProtoEqual": deterministic_proto_equal,
        "graphSemanticsEqual": graph_equal,
        "initializerSemanticsEqual": initializer_equal,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    samples = [fingerprint(path) for path in args.inputs]
    report = {
        "schemaVersion": 1,
        "purpose": "DIAGNOSTIC_ONLY_NO_RELEASE_AUTHORITY",
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "onnx": onnx.__version__,
            "numpy": np.__version__,
        },
        "comparison": comparison(samples),
        "samples": samples,
    }
    text = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")


if __name__ == "__main__":
    main()
