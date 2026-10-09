"""BERS R&D SCHP-ATR ONNX replacement for the non-commercial FASHN parser.

This module is ONLY installed into a pinned local research fork by patch_upstream.py.
No automatic downloads, runtime prompts, arbitrary remote code, or commercial
approval. The 18 ATR classes are not identical to FASHN's 18 classes: missing
hands, torso and jewelry remain a known quality gap.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

# Canonical FASHN label IDs, preserved for upstream agnostic.py and pipeline.py.
IDS_TO_LABELS = {
    0: "background", 1: "face", 2: "hair", 3: "top", 4: "dress",
    5: "skirt", 6: "pants", 7: "belt", 8: "bag", 9: "hat",
    10: "scarf", 11: "glasses", 12: "arms", 13: "hands",
    14: "legs", 15: "feet", 16: "torso", 17: "jewelry",
}
LABELS_TO_IDS = {name: label for label, name in IDS_TO_LABELS.items()}
CATEGORY_TO_BODY_COVERAGE = {"tops": "upper", "bottoms": "lower", "one-pieces": "full"}
BODY_COVERAGE_TO_LABELS = {
    "upper": ["top", "dress", "scarf"],
    "lower": ["skirt", "pants", "belt"],
    "full": ["top", "dress", "scarf", "skirt", "pants", "belt"],
}
IDENTITY_LABELS = ["face", "hair", "jewelry", "bag", "glasses", "hat"]

# Source: SCHP ATR checkpoint's explicit 0..17 id2label; see pinned manifest.
# Both shoes are provisionally mapped to feet. ATR does NOT distinguish skin
# hands, exposed torso or jewelry: no fake prediction for those classes.
ATR_TO_FASHN = (
    0,  # Background -> background
    9,  # Hat
    2,  # Hair
    11, # Sunglasses -> glasses
    3,  # Upper-clothes -> top
    5,  # Skirt
    6,  # Pants
    4,  # Dress
    7,  # Belt
    15, # Left-shoe -> feet (APPROXIMATE)
    15, # Right-shoe -> feet (APPROXIMATE)
    1,  # Face
    14, # Left-leg -> legs
    14, # Right-leg -> legs
    12, # Left-arm -> arms (includes hands if predicted as arm)
    12, # Right-arm -> arms (includes hands if predicted as arm)
    8,  # Bag
    10, # Scarf
)
UNSUPPORTED_FASHN_CLASSES = ("hands", "torso", "jewelry")
MODEL_FILENAME = "schp-atr-18-int8-static.onnx"
MODEL_SHA_ENV = "BERS_SCHP_ATR_ONNX_SHA256"
MODEL_SIZE_LIMIT = 128 * 1024 * 1024
CHANNEL_MEAN = (0.406, 0.456, 0.485)
CHANNEL_STD = (0.225, 0.224, 0.229)


def remap_atr_labels(rows: list[list[int]]) -> list[list[int]]:
    """Pure mapping for test vectors; reject invalid model outputs fail-closed."""
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], list) or not rows[0]:
        raise ValueError("ATR labels require a nonempty rectangular two-dimensional map")
    width = len(rows[0])
    output = []
    for row in rows:
        if not isinstance(row, list) or len(row) != width:
            raise ValueError("ATR label map is not rectangular")
        mapped = []
        for value in row:
            if type(value) is not int or value < 0 or value >= len(ATR_TO_FASHN):
                raise ValueError("ATR label is outside 0..17")
            mapped.append(ATR_TO_FASHN[value])
        output.append(mapped)
    return output


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class BersSchpAtrParser:
    """Locally provisioned ONNX model; no Hub access or proprietary parser.

    Caller must set BERS_SCHP_ATR_ONNX_SHA256 to a separately independently
    verified, pinned model-byte digest. This is operator R&D evidence only.
    The model/dataset/license gate remains CLOSED for commercial deployment.
    """

    def __init__(self, *, weights_dir: str, device: str = "cpu") -> None:
        expected = os.environ.get(MODEL_SHA_ENV, "")
        if len(expected) != 64 or any(x not in "0123456789abcdef" for x in expected):
            raise ValueError(f"{MODEL_SHA_ENV} must be a pinned lowercase 64-hex digest")
        if device not in ("cpu", "cuda"):
            raise ValueError("Unsupported SCHP parser device")

        model = Path(weights_dir) / "schp" / MODEL_FILENAME
        if model.is_symlink() or not model.is_file():
            raise ValueError("SCHP ONNX checkpoint is missing or symbolic-link substituted")
        size = model.stat().st_size
        if size < 1 or size > MODEL_SIZE_LIMIT:
            raise ValueError("SCHP ONNX checkpoint exceeds bounded model size")
        if _sha256_file(model) != expected:
            raise ValueError("SCHP checkpoint SHA-256 differs from pinned expected bytes")

        import onnxruntime as ort  # Optional R&D-only install; NEVER on BERS Core.
        providers = ort.get_available_providers()
        provider = "CUDAExecutionProvider" if device == "cuda" else "CPUExecutionProvider"
        if provider not in providers:
            raise RuntimeError(f"SCHP requested ONNX provider is unavailable: {provider}")
        self.session = ort.InferenceSession(str(model), providers=[provider])
        if (len(self.session.get_inputs()) != 1
                or self.session.get_inputs()[0].name != "pixel_values"
                or "logits" not in [item.name for item in self.session.get_outputs()]):
            raise ValueError("SCHP ONNX execution interface is not the pinned contract")

    def predict(self, image):
        import numpy as np
        from PIL import Image

        if isinstance(image, Image.Image):
            image = np.asarray(image.convert("RGB"))
        if not isinstance(image, np.ndarray) or image.dtype != np.uint8 or image.ndim != 3 or image.shape[2] != 3:
            raise ValueError("SCHP source must be uint8 HxWx3 RGB")
        h, w = image.shape[:2]
        if h < 1 or w < 1 or h > 4096 or w > 4096 or h * w > 4096 * 2048:
            raise ValueError("SCHP source geometry exceeds bounded limits")

        # Matches the published SCHP-ATR image processor: bilinear RGB
        # resize to 512 and BGR-indexed normalizers in RGB channel order.
        resized = np.asarray(Image.fromarray(image).resize((512, 512), resample=Image.Resampling.BILINEAR), dtype=np.float32)
        normalized = (resized / 255.0 - np.asarray(CHANNEL_MEAN, dtype=np.float32)) / np.asarray(CHANNEL_STD, dtype=np.float32)
        tensor = np.transpose(normalized, (2, 0, 1))[None, ...].astype(np.float32)
        raw = self.session.run(["logits"], {"pixel_values": tensor})[0]
        if raw.ndim != 4 or raw.shape[0] != 1 or raw.shape[1] != 18 or raw.shape[2:] != (512, 512):
            raise ValueError("SCHP logits shape differs from accepted 18-class contract")
        if not np.all(np.isfinite(raw)):
            raise ValueError("SCHP produced non-finite logits")
        atr = np.argmax(raw, axis=1)[0].astype(np.uint8)
        restored = np.asarray(
            Image.fromarray(atr).resize((w, h), resample=Image.Resampling.NEAREST),
            dtype=np.uint8,
        )
        return np.take(np.asarray(ATR_TO_FASHN, dtype=np.uint8), restored)
