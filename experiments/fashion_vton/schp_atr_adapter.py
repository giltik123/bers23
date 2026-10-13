"""Offline SCHP-ATR garment conditioning experiment for FASHN VTON 1.5.

R&D ONLY: no Core/Project/Artifact/Billing authority and no production registration.
Dependencies for this isolated spike: numpy, Pillow, onnxruntime (CPU build).
No HF remote code, network downloads or implicit model fallback.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

MODEL_SIDE = 512
# Source: pirocheto/schp-atr-18 preprocessor_config.json.
# RGB tensor with BGR-indexed training normalization (not the usual ImageNet order).
RGB_MEAN = np.array((0.406, 0.456, 0.485), dtype=np.float32).reshape(1, 1, 3)
RGB_STD = np.array((0.225, 0.224, 0.229), dtype=np.float32).reshape(1, 1, 3)
ATR_LABELS = (
    "background", "hat", "hair", "sunglasses", "upper-clothes",
    "skirt", "pants", "dress", "belt", "left-shoe", "right-shoe",
    "face", "left-leg", "right-leg", "left-arm", "right-arm",
    "bag", "scarf",
)
# FASHN garment-region intent, expressed directly in ATR labels.
# This intentionally DOES NOT pretend ATR can detect FASHN hands/torso/jewelry.
GARMENT_IDS = {
    "tops": frozenset((4, 7, 17)),
    "bottoms": frozenset((5, 6, 8)),
    "one-pieces": frozenset((4, 5, 6, 7, 8, 17)),
}
MAX_IMAGE_PIXELS = 25_000_000


def _rgb(image: Image.Image) -> Image.Image:
    if not isinstance(image, Image.Image):
        raise TypeError("Expected a PIL image")
    if image.width < 1 or image.height < 1 or image.width * image.height > MAX_IMAGE_PIXELS:
        raise ValueError("Image dimensions outside experimental limits")
    return image.convert("RGB")


def _verified_model(path: str | Path, expected_sha256: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise ValueError("A lowercase, pinned model SHA-256 is required")
    model_path = Path(path).resolve(strict=True)
    if not model_path.is_file():
        raise ValueError("ONNX checkpoint must be a regular local file")
    sha = hashlib.sha256()
    with model_path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(block)
    if sha.hexdigest() != expected_sha256:
        raise ValueError("ONNX checkpoint SHA-256 mismatch")
    return model_path


class SchpAtrOnnxParser:
    """Run an already-approved local SCHP-ATR-18 ONNX checkpoint.

    A session may be injected for tests; no checkpoint is fetched or trusted
    solely because of its file name. The normal runtime uses CPU ORT by default.
    """

    def __init__(self, model_path: str | Path, expected_sha256: str, *, session: Any = None):
        model = _verified_model(model_path, expected_sha256)
        if session is None:
            import onnxruntime as ort
            session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
        self.session = session

    def predict(self, image: Image.Image) -> np.ndarray:
        rgb = _rgb(image)
        resized = rgb.resize((MODEL_SIDE, MODEL_SIDE), Image.Resampling.BILINEAR)
        pixels = np.asarray(resized, dtype=np.float32) / 255.0
        batch = np.ascontiguousarray(((pixels - RGB_MEAN) / RGB_STD).transpose(2, 0, 1)[None])
        outputs = self.session.run(["logits"], {"pixel_values": batch})
        if len(outputs) != 1:
            raise ValueError("Unexpected SCHP output count")
        logits = np.asarray(outputs[0])
        if logits.shape != (1, len(ATR_LABELS), MODEL_SIDE, MODEL_SIDE):
            raise ValueError("Unexpected SCHP logits shape")
        if not np.isfinite(logits).all():
            raise ValueError("Non-finite SCHP output")
        ids = logits.argmax(axis=1)[0].astype(np.uint8)
        # Semantic class IDs must never be resized using bilinear interpolation.
        label_image = Image.fromarray(ids, mode="L")
        return np.asarray(label_image.resize(rgb.size, Image.Resampling.NEAREST), dtype=np.uint8)


def prepare_garment_image(
    garment_image: Image.Image,
    category: str,
    garment_photo_type: str,
    *,
    parser: SchpAtrOnnxParser | None = None,
    mask_value: int = 127,
) -> Image.Image:
    """Generate FASHN-compatible RGB garment condition for the maskless branch.

    Flat-lay bypasses semantic parsing (as FASHN does). Model-worn clothing
    uses SCHP ATR clothing labels, with explicit failure for empty selections.
    """
    if category not in GARMENT_IDS:
        raise ValueError("Unsupported FASHN garment category")
    if garment_photo_type not in ("flat-lay", "model"):
        raise ValueError("Unsupported garment photo type")
    if not isinstance(mask_value, int) or not 0 <= mask_value <= 255:
        raise ValueError("mask_value must be an integer byte")
    rgb = _rgb(garment_image)
    if garment_photo_type == "flat-lay":
        return rgb
    if parser is None:
        raise ValueError("Offline SCHP parser required for model-worn garment")
    seg = np.asarray(parser.predict(rgb))
    if seg.shape != (rgb.height, rgb.width) or seg.dtype.kind not in ("i", "u"):
        raise ValueError("Invalid SCHP segmentation map")
    if np.any(seg < 0) or np.any(seg >= len(ATR_LABELS)):
        raise ValueError("SCHP segmentation contains unknown classes")
    selected = np.isin(seg, tuple(GARMENT_IDS[category]))
    if not np.any(selected):
        raise ValueError("No matching garment pixels: fail closed, do not generate")
    pixels = np.asarray(rgb).copy()
    pixels[~selected] = mask_value
    return Image.fromarray(pixels, mode="RGB")


def prepare_person_image(person_image: Image.Image, *, segmentation_free: bool = True) -> Image.Image:
    """Only the verified maskless-person experimental path is supported."""
    if not segmentation_free:
        raise ValueError("Masked-person mode requires a separately validated hands/torso parser")
    return _rgb(person_image)
