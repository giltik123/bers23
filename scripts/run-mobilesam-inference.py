"""Run one real promptable MobileSAM encoder/decoder inference for acceptance.

The model pack is supplied outside Git.  This deliberately uses ONNX Runtime's
CPU provider so a successful result cannot be produced by the deterministic
test doubles used by the editing-provider tests.
"""

import json
import pathlib
import sys
import time

import numpy as np
import onnxruntime as ort


def artifact(root: pathlib.Path, stem: str) -> pathlib.Path:
    candidates = (root / f"{stem}.onnx", root / f"mobilesam-{stem}.onnx")
    return next((candidate for candidate in candidates if candidate.is_file()), candidates[0])


def main() -> None:
    root = pathlib.Path(sys.argv[1])
    encoder_path, decoder_path = artifact(root, "encoder"), artifact(root, "decoder")
    started = time.perf_counter()
    encoder = ort.InferenceSession(str(encoder_path), providers=["CPUExecutionProvider"])
    decoder = ort.InferenceSession(str(decoder_path), providers=["CPUExecutionProvider"])

    # A deterministic, non-uniform RGB input catches disconnected/stub runtimes
    # while keeping the acceptance pack independent from repository fixtures.
    yy, xx = np.mgrid[0:1024, 0:1024]
    rgb = np.stack((xx / 1023 * 255, yy / 1023 * 255, np.where((xx-512) ** 2 + (yy-512) ** 2 < 230 ** 2, 240, 24)), axis=0).astype(np.float32)
    image = ((rgb - np.array([123.675, 116.28, 103.53], dtype=np.float32)[:, None, None]) / np.array([58.395, 57.12, 57.375], dtype=np.float32)[:, None, None])[None]
    encoder_input = encoder.get_inputs()[0].name
    embedding = encoder.run(None, {encoder_input: image})[0]

    feeds = {}
    for value in decoder.get_inputs():
        name = value.name.lower()
        if "embedding" in name:
            feeds[value.name] = embedding
        elif "point" in name and ("coord" in name or "point_coords" in name):
            feeds[value.name] = np.array([[[512.0, 512.0]]], dtype=np.float32)
        elif "label" in name:
            feeds[value.name] = np.array([[1.0]], dtype=np.float32)
        elif "mask" in name and "has" not in name:
            feeds[value.name] = np.zeros((1, 1, 256, 256), dtype=np.float32)
        elif "has" in name and "mask" in name:
            feeds[value.name] = np.zeros((1,), dtype=np.float32)
        elif "orig" in name and "size" in name:
            feeds[value.name] = np.array([1024.0, 1024.0], dtype=np.float32)
        else:
            raise RuntimeError(f"Unsupported MobileSAM decoder input: {value.name}")
    outputs = decoder.run(None, feeds)
    named = dict(zip((item.name for item in decoder.get_outputs()), outputs))
    masks = next((value for name, value in named.items() if "mask" in name.lower() and value.ndim >= 3), outputs[0])
    scores = next((value for name, value in named.items() if "iou" in name.lower() or "score" in name.lower()), None)
    masks = masks.reshape((-1, masks.shape[-2], masks.shape[-1]))
    index = int(np.argmax(np.asarray(scores).reshape(-1))) if scores is not None and np.asarray(scores).size == masks.shape[0] else 0
    mask = masks[index] > 0
    coverage = float(mask.mean())
    if not np.isfinite(coverage) or coverage <= 0 or coverage >= 1:
        raise RuntimeError(f"MobileSAM returned a degenerate mask (coverage={coverage})")
    print(json.dumps({"provider": decoder.get_providers()[0], "coverage": coverage, "maskWidth": int(mask.shape[1]), "maskHeight": int(mask.shape[0]), "latencyMs": round((time.perf_counter()-started)*1000, 2)}))


if __name__ == "__main__":
    main()
