#!/usr/bin/env python3
"""Validate exact upstream EfficientSAM-Ti split ONNX artifacts for a BERS CANDIDATE pack.

This script does not trust a filename or Git checkout alone. It verifies:
- exact upstream Git revision;
- exact Git blob identity and byte size for both ONNX files;
- SHA-256 of the exact bytes used for the BERS pack;
- ONNX structural validity, opset and exact split graph I/O names/types.

It only produces acquisition metadata. It does not sign, publish or grant production approval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import onnx
from onnx import TensorProto


UPSTREAM_REVISION = "d525f622e6f640acf5a0fc37c7ca1f243da5bde0"
OPSET = 17
MODEL_ID = "efficient-sam-ti"
MODEL_VERSION = "1.0.0-candidate.1"

ARTIFACTS = {
    "encoder": {
        "path": "weights/efficient_sam_vitt_encoder.onnx",
        "gitBlob": "6458f72477ae216a1bd68db41ffa14802c8d54f1",
        "size": 24_799_761,
        "inputs": {"batched_images": TensorProto.FLOAT},
        "outputs": {"image_embeddings": TensorProto.FLOAT},
    },
    "decoder": {
        "path": "weights/efficient_sam_vitt_decoder.onnx",
        "gitBlob": "f9310202c916fe5a4ec9a6897edae855caf023f4",
        "size": 16_565_728,
        "inputs": {
            "image_embeddings": TensorProto.FLOAT,
            "batched_point_coords": TensorProto.FLOAT,
            "batched_point_labels": TensorProto.FLOAT,
            "orig_im_size": TensorProto.INT64,
        },
        "outputs": {
            "output_masks": TensorProto.FLOAT,
            "iou_predictions": TensorProto.FLOAT,
        },
    },
}


def run_git(source: Path, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), *args], text=True, stderr=subprocess.STDOUT
        ).strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(f"Git verification failed: {' '.join(args)}") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dims(value: onnx.ValueInfoProto) -> list[int | str | None]:
    result: list[int | str | None] = []
    for item in value.type.tensor_type.shape.dim:
        if item.HasField("dim_value"):
            result.append(int(item.dim_value))
        elif item.HasField("dim_param"):
            result.append(item.dim_param)
        else:
            result.append(None)
    return result


def graph_values(values: Any) -> dict[str, dict[str, Any]]:
    return {
        item.name: {
            "dtype": int(item.type.tensor_type.elem_type),
            "dtypeName": TensorProto.DataType.Name(item.type.tensor_type.elem_type),
            "dims": dims(item),
        }
        for item in values
    }


def validate_graph(path: Path, expected_inputs: dict[str, int], expected_outputs: dict[str, int]) -> dict[str, Any]:
    model = onnx.load(path, load_external_data=False)
    onnx.checker.check_model(model, full_check=True)
    default_opsets = [item.version for item in model.opset_import if item.domain in ("", "ai.onnx")]
    if default_opsets != [OPSET]:
        raise RuntimeError(f"{path.name}: unexpected default ONNX opset {default_opsets!r}; expected [{OPSET}]")

    inputs = graph_values(model.graph.input)
    outputs = graph_values(model.graph.output)
    if list(inputs) != list(expected_inputs):
        raise RuntimeError(f"{path.name}: unexpected input names/order {list(inputs)!r}")
    if list(outputs) != list(expected_outputs):
        raise RuntimeError(f"{path.name}: unexpected output names/order {list(outputs)!r}")
    for name, expected_type in expected_inputs.items():
        if inputs[name]["dtype"] != expected_type:
            raise RuntimeError(f"{path.name}: input {name} has unexpected dtype {inputs[name]['dtypeName']}")
    for name, expected_type in expected_outputs.items():
        if outputs[name]["dtype"] != expected_type:
            raise RuntimeError(f"{path.name}: output {name} has unexpected dtype {outputs[name]['dtypeName']}")

    return {
        "irVersion": int(model.ir_version),
        "opset": OPSET,
        "inputs": inputs,
        "outputs": outputs,
        "nodeCount": len(model.graph.node),
        "initializerCount": len(model.graph.initializer),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="Pinned yformer/EfficientSAM Git checkout")
    parser.add_argument("--metadata", type=Path, required=True, help="Output acquisition metadata JSON")
    args = parser.parse_args()

    if run_git(args.source, "rev-parse", "HEAD") != UPSTREAM_REVISION:
        raise RuntimeError("EfficientSAM source revision mismatch")

    report_artifacts: dict[str, Any] = {}
    for name, contract in ARTIFACTS.items():
        path = args.source / str(contract["path"])
        if not path.is_file():
            raise RuntimeError(f"Missing upstream artifact: {contract['path']}")
        actual_size = path.stat().st_size
        if actual_size != contract["size"]:
            raise RuntimeError(f"{name}: size mismatch {actual_size} != {contract['size']}")
        blob = run_git(args.source, "hash-object", str(contract["path"]))
        if blob != contract["gitBlob"]:
            raise RuntimeError(f"{name}: Git blob mismatch {blob} != {contract['gitBlob']}")
        graph = validate_graph(path, contract["inputs"], contract["outputs"])
        report_artifacts[name] = {
            "upstreamPath": contract["path"],
            "gitBlob": blob,
            "size": actual_size,
            "sha256": sha256(path),
            "graph": graph,
        }

    report = {
        "schemaVersion": 1,
        "modelId": MODEL_ID,
        "version": MODEL_VERSION,
        "status": "CANDIDATE",
        "productionDeviceApproval": False,
        "upstream": {
            "repository": "https://github.com/yformer/EfficientSAM",
            "revision": UPSTREAM_REVISION,
            "license": "Apache-2.0",
            "exportScript": "export_to_onnx.py",
        },
        "artifacts": report_artifacts,
        "runtimeContract": {
            "imageRange": [0, 1],
            "imageLayout": "NCHW",
            "maskDecision": "output_masks >= 0",
        },
    }
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("EFFICIENTSAM-TI UPSTREAM ONNX ACQUISITION: PASS (CANDIDATE only)")


if __name__ == "__main__":
    main()
