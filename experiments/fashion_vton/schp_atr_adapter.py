"""Experimental FASHN input adapter for SCHP-ATR-18 human parsing.

This module intentionally does NOT import fashn_human_parser, download weights,
create a provider, or authorize production execution. It handles only the
segmentation-free PERSON input and the model-worn GARMENT preprocessing step.
The external SCHP parser is supplied by an audited caller via predict(RGB).
"""

from typing import Literal, Protocol

import numpy as np


class ParserContractError(ValueError):
    """Invalid segmentation, image, or unsupported preprocessing mode."""


class AtrParser(Protocol):
    def predict(self, image_rgb: np.ndarray) -> np.ndarray:
        """Return ATR class IDs (0..17), with the same height/width as input."""


# ATR schema IDs, not FASHN parser IDs. The schemas are NOT interchangeable.
# FASHN's BODY_COVERAGE_TO_LABELS are retained semantically for garment masking.
ATR_GARMENT_LABELS = {
    "tops": frozenset({4, 7, 17}),        # upper-clothes, dress, scarf
    "bottoms": frozenset({5, 6, 8}),     # skirt, pants, belt
    "one-pieces": frozenset({4, 5, 6, 7, 8, 17}),
}

ATR_LABELS_NOT_PRESENT = frozenset({"hands", "torso", "jewelry"})


def _validate_rgb(image_rgb: np.ndarray) -> None:
    if not isinstance(image_rgb, np.ndarray):
        raise ParserContractError("Image must be a numpy ndarray")
    if image_rgb.ndim != 3 or image_rgb.shape[2] != 3:
        raise ParserContractError("Image must have RGB shape (height, width, 3)")
    if image_rgb.dtype != np.uint8:
        raise ParserContractError("Image must be uint8 RGB")
    if image_rgb.shape[0] == 0 or image_rgb.shape[1] == 0:
        raise ParserContractError("Image dimensions must be nonzero")


def _validate_atr(segmentation: np.ndarray, image_rgb: np.ndarray) -> None:
    if not isinstance(segmentation, np.ndarray):
        raise ParserContractError("SCHP parser must return a numpy ndarray")
    if segmentation.shape != image_rgb.shape[:2]:
        raise ParserContractError("SCHP parsing resolution differs from RGB image")
    if segmentation.dtype.kind not in "iu":
        raise ParserContractError("SCHP labels must be integers")
    if segmentation.size == 0 or np.any(segmentation < 0) or np.any(segmentation > 17):
        raise ParserContractError("SCHP-ATR labels must be in the range 0..17")


def prepare_person_image(
    person_rgb: np.ndarray, *, segmentation_free: bool = True
) -> np.ndarray:
    """Keep entire person RGB for FASHN segmentation-free inference.

    Masked inference is forbidden: ATR lacks separate hands/torso/jewelry,
    which FASHN's masking/preservation algorithm expects to identify.
    """
    _validate_rgb(person_rgb)
    if not segmentation_free:
        raise ParserContractError("Masked person preprocessing requires reviewed body/identity masks")
    return person_rgb.copy()


def prepare_garment_image(
    garment_rgb: np.ndarray,
    *,
    category: Literal["tops", "bottoms", "one-pieces"],
    garment_photo_type: Literal["model", "flat-lay"],
    parser: AtrParser | None = None,
    mask_value: int = 127,
) -> np.ndarray:
    """Prepare FASHN's garment RGB input from a SCHP-ATR semantic mask.

    Flat-lays bypass parser as FASHN already does. Model-worn photos keep the
    ATR clothing classes for the selected category and mask other pixels to
    neutral gray. This is a candidate transformation, NOT visual-parity proof.
    """
    _validate_rgb(garment_rgb)
    if category not in ATR_GARMENT_LABELS:
        raise ParserContractError(f"Unsupported garment category: {category!r}")
    if garment_photo_type not in ("model", "flat-lay"):
        raise ParserContractError(f"Unsupported garment photo type: {garment_photo_type!r}")
    if type(mask_value) is not int or not 0 <= mask_value <= 255:
        raise ParserContractError("mask_value must be integer 0..255")
    if garment_photo_type == "flat-lay":
        return garment_rgb.copy()
    if parser is None:
        raise ParserContractError("An audited, local SCHP-ATR parser is required for model photos")

    labels = parser.predict(garment_rgb.copy())
    _validate_atr(labels, garment_rgb)
    keep_mask = np.isin(labels, tuple(ATR_GARMENT_LABELS[category]))
    if not keep_mask.any():
        raise ParserContractError("No target garment class detected; do not generate an all-gray image")
    processed = garment_rgb.copy()
    processed[~keep_mask] = mask_value
    return processed
