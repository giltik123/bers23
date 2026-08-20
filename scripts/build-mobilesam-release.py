#!/usr/bin/env python3
"""Export and validate the pinned MobileSAM encoder/decoder ONNX pack."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch


REVISION = "f706ad9c4eb7f219c00d9050e46328518ffb65d2"
CHECKPOINT_SHA256 = "6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f"
OPSET = 17


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dimensions(value: onnx.ValueInfoProto) -> list[int | str | None]:
    result: list[int | str | None] = []
    for dimension in value.type.tensor_type.shape.dim:
        result.append(dimension.dim_value or dimension.dim_param or None)
    return result


def validate_contract(path: Path, inputs: dict[str, list[int | str | None]], outputs: dict[str, list[int | str | None]] | None = None) -> None:
    model = onnx.load(path)
    onnx.checker.check_model(model, full_check=True)
    actual_inputs = {item.name: dimensions(item) for item in model.graph.input}
    if actual_inputs != inputs:
        raise RuntimeError(f"{path.name}: unexpected inputs {actual_inputs!r}")
    if outputs is not None:
        actual_outputs = {item.name: dimensions(item) for item in model.graph.output}
        if actual_outputs != outputs:
            raise RuntimeError(f"{path.name}: unexpected outputs {actual_outputs!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    args = parser.parse_args()

    checkpoint = args.source / "weights/mobile_sam.pt"
    if sha256(checkpoint) != CHECKPOINT_SHA256:
        raise RuntimeError("MobileSAM checkpoint SHA-256 mismatch")

    # Import only after the caller has checked out the pinned upstream source.
    import sys
    sys.path.insert(0, str(args.source))
    from mobile_sam import sam_model_registry
    from mobile_sam.utils.onnx import SamOnnxModel

    torch.manual_seed(0)
    np.random.seed(0)
    model = sam_model_registry["vit_t"](checkpoint=str(checkpoint)).eval()
    args.output.mkdir(parents=True, exist_ok=True)
    encoder_path = args.output / "mobilesam-encoder.onnx"
    decoder_path = args.output / "mobilesam-decoder.onnx"

    encoder_input = torch.zeros(1, 3, 1024, 1024, dtype=torch.float32)
    torch.onnx.export(
        model.image_encoder,
        encoder_input,
        encoder_path,
        export_params=True,
        opset_version=OPSET,
        do_constant_folding=True,
        input_names=["input_image"],
        output_names=["image_embeddings"],
    )

    decoder = SamOnnxModel(model=model, return_single_mask=False)
    decoder_inputs: dict[str, torch.Tensor] = {
        "image_embeddings": torch.zeros(1, 256, 64, 64, dtype=torch.float32),
        "point_coords": torch.tensor([[[512.0, 512.0]]]),
        "point_labels": torch.tensor([[1.0]]),
        "mask_input": torch.zeros(1, 1, 256, 256, dtype=torch.float32),
        "has_mask_input": torch.tensor([0.0]),
        "orig_im_size": torch.tensor([1024.0, 1024.0]),
    }
    torch.onnx.export(
        decoder,
        tuple(decoder_inputs.values()),
        decoder_path,
        export_params=True,
        opset_version=OPSET,
        do_constant_folding=True,
        input_names=list(decoder_inputs),
        output_names=["masks", "iou_predictions", "low_res_masks"],
        dynamic_axes={"point_coords": {1: "num_points"}, "point_labels": {1: "num_points"}},
    )

    validate_contract(
        encoder_path,
        {"input_image": [1, 3, 1024, 1024]},
        {"image_embeddings": [1, 256, 64, 64]},
    )
    validate_contract(
        decoder_path,
        {
            "image_embeddings": [1, 256, 64, 64],
            "point_coords": [1, "num_points", 2],
            "point_labels": [1, "num_points"],
            "mask_input": [1, 1, 256, 256],
            "has_mask_input": [1],
            "orig_im_size": [2],
        },
    )

    # CPUExecutionProvider is an ONNX graph sanity test, not browser-WASM acceptance.
    encoder_session = ort.InferenceSession(str(encoder_path), providers=["CPUExecutionProvider"])
    embeddings = encoder_session.run(None, {"input_image": np.zeros((1, 3, 1024, 1024), np.float32)})[0]
    decoder_session = ort.InferenceSession(str(decoder_path), providers=["CPUExecutionProvider"])
    sanity_inputs: dict[str, Any] = {key: value.numpy() for key, value in decoder_inputs.items()}
    sanity_inputs["image_embeddings"] = embeddings
    decoder_session.run(None, sanity_inputs)
    print("ONNX GRAPH SANITY TEST: PASS (CPUExecutionProvider; not browser-WASM acceptance)")

    metadata = {
        name: {"size": path.stat().st_size, "sha256": sha256(path)}
        for name, path in (("encoder", encoder_path), ("decoder", decoder_path))
    }
    args.metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
