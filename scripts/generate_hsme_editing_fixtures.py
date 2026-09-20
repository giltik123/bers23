#!/usr/bin/env python3
"""Generate deterministic repository-owned HSME editing fixtures.

No external images, fonts, logos, biometric/person data, or network access are
used. PNG bytes are encoded with Python stdlib only so the committed fixture
identity is reproducible across CI and developer machines.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import zlib
from pathlib import Path
from typing import Iterable

WIDTH = 512
HEIGHT = 512
GENERATOR_SCHEMA = "BERS_HSME_GENERATED_EDITING_FIXTURE_V1"
FIXTURE_RIGHTS_ID = "BERS_REPOSITORY_OWNED_SYNTHETIC_FIXTURE_V1"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

PALETTE = {
    "background": (230, 232, 228),
    "panel": (204, 209, 201),
    "skin": (185, 126, 92),
    "skin_shadow": (145, 92, 68),
    "hair": (45, 36, 31),
    "eye": (28, 31, 34),
    "shirt": (53, 83, 108),
    "shirt_dark": (38, 60, 82),
    "accent": (194, 87, 61),
    "accent2": (232, 177, 68),
    "ink": (24, 28, 31),
    "white": (244, 244, 240),
    "green": (76, 126, 92),
    "blue": (73, 116, 154),
    "red": (176, 73, 67),
}

FONT = {
    "A": ("01110","10001","10001","11111","10001","10001","10001"),
    "B": ("11110","10001","10001","11110","10001","10001","11110"),
    "E": ("11111","10000","10000","11110","10000","10000","11111"),
    "L": ("10000","10000","10000","10000","10000","10000","11111"),
    "R": ("11110","10001","10001","11110","10100","10010","10001"),
    "S": ("01111","10000","10000","01110","00001","00001","11110"),
    " ": ("00000",)*7,
}


def canonical_bytes(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class Canvas:
    def __init__(self, width: int = WIDTH, height: int = HEIGHT, bg=PALETTE["background"]):
        self.width = width
        self.height = height
        self.data = bytearray(bg * (width * height))

    def pixel(self, x: int, y: int, rgb) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            i = (y * self.width + x) * 3
            self.data[i:i+3] = bytes(rgb)

    def rect(self, x0: int, y0: int, x1: int, y1: int, rgb) -> None:
        for y in range(max(0, y0), min(self.height, y1)):
            for x in range(max(0, x0), min(self.width, x1)):
                self.pixel(x, y, rgb)

    def circle(self, cx: int, cy: int, r: int, rgb) -> None:
        rr = r * r
        for y in range(cy-r, cy+r+1):
            dy = y - cy
            for x in range(cx-r, cx+r+1):
                dx = x - cx
                if dx*dx + dy*dy <= rr:
                    self.pixel(x, y, rgb)

    def line(self, x0: int, y0: int, x1: int, y1: int, rgb, width: int = 1) -> None:
        dx = abs(x1-x0)
        sx = 1 if x0 < x1 else -1
        dy = -abs(y1-y0)
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            for oy in range(-(width//2), width//2+1):
                for ox in range(-(width//2), width//2+1):
                    self.pixel(x0+ox, y0+oy, rgb)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def polygon(self, points: list[tuple[int,int]], rgb) -> None:
        ys = [p[1] for p in points]
        for y in range(max(0,min(ys)), min(self.height,max(ys)+1)):
            xs = []
            j = len(points)-1
            for i in range(len(points)):
                xi, yi = points[i]
                xj, yj = points[j]
                if (yi > y) != (yj > y):
                    x = int(xi + (y-yi) * (xj-xi) / (yj-yi))
                    xs.append(x)
                j = i
            xs.sort()
            for i in range(0, len(xs)-1, 2):
                self.rect(xs[i], y, xs[i+1]+1, y+1, rgb)

    def text(self, x: int, y: int, text: str, rgb, scale: int = 4) -> None:
        cursor = x
        for char in text:
            glyph = FONT[char]
            for gy, row in enumerate(glyph):
                for gx, bit in enumerate(row):
                    if bit == "1":
                        self.rect(
                            cursor + gx*scale,
                            y + gy*scale,
                            cursor + (gx+1)*scale,
                            y + (gy+1)*scale,
                            rgb,
                        )
            cursor += 6 * scale


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)


def png_bytes(canvas: Canvas) -> bytes:
    raw = bytearray()
    stride = canvas.width * 3
    for y in range(canvas.height):
        raw.append(0)
        start = y * stride
        raw.extend(canvas.data[start:start+stride])
    ihdr = struct.pack(">IIBBBBB", canvas.width, canvas.height, 8, 2, 0, 0, 0)
    return (
        PNG_SIGNATURE
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(bytes(raw), level=9))
        + png_chunk(b"IEND", b"")
    )


def draw_protected_background(c: Canvas) -> None:
    c.rect(0, 0, WIDTH, HEIGHT, PALETTE["background"])
    c.rect(20, 24, 145, 170, PALETTE["panel"])
    c.rect(367, 25, 491, 170, PALETTE["panel"])
    c.circle(78, 92, 34, PALETTE["green"])
    c.rect(385, 55, 463, 140, PALETTE["blue"])
    c.line(385, 55, 463, 140, PALETTE["white"], 4)
    c.line(463, 55, 385, 140, PALETTE["white"], 4)
    c.rect(18, 420, 494, 488, PALETTE["panel"])
    for x in range(28, 488, 22):
        c.line(x, 424, x+28, 484, PALETTE["accent2"], 3)


def draw_subject(c: Canvas, shirt_color=PALETTE["shirt"], logo=True, plaid=True) -> None:
    # Body and garment silhouette with intentionally asymmetric details.
    c.circle(256, 145, 69, PALETTE["skin"])
    c.circle(246, 141, 68, PALETTE["skin"])
    c.polygon([(188,112),(209,72),(286,70),(324,116),(312,91),(278,57),(218,63)], PALETTE["hair"])
    c.circle(225, 142, 8, PALETTE["white"])
    c.circle(288, 137, 8, PALETTE["white"])
    c.circle(227, 143, 4, PALETTE["eye"])
    c.circle(286, 136, 4, PALETTE["eye"])
    c.line(260, 145, 253, 169, PALETTE["skin_shadow"], 3)
    c.line(235, 184, 276, 180, PALETTE["skin_shadow"], 3)
    c.circle(199, 155, 11, PALETTE["skin_shadow"])  # left-only landmark
    c.polygon([(181,230),(220,205),(292,207),(334,232),(368,413),(145,413)], shirt_color)
    c.polygon([(181,230),(145,413),(108,349),(143,239)], PALETTE["shirt_dark"])
    c.polygon([(334,232),(368,413),(400,350),(370,240)], PALETTE["shirt_dark"])
    c.line(256, 211, 256, 410, PALETTE["white"], 3)
    c.rect(205, 286, 247, 333, PALETTE["shirt_dark"])  # one pocket
    c.line(205, 286, 247, 286, PALETTE["white"], 2)
    if plaid:
        for x in range(169, 354, 24):
            c.line(x, 231, x+8, 406, PALETTE["accent2"], 2)
        for y in range(245, 405, 24):
            c.line(159, y, 358, y+5, PALETTE["accent"], 2)
    if logo:
        c.rect(270, 275, 345, 321, PALETTE["white"])
        c.text(277, 282, "BERS", PALETTE["ink"], 3)
        c.text(285, 305, "LAB", PALETTE["red"], 2)


def subject_primary() -> Canvas:
    c = Canvas()
    draw_protected_background(c)
    draw_subject(c)
    # Explicit local edit target: left sleeve patch.
    c.rect(119, 285, 158, 326, PALETTE["accent"])
    c.line(119, 285, 158, 326, PALETTE["white"], 2)
    c.line(158, 285, 119, 326, PALETTE["white"], 2)
    return c


def garment_reference() -> Canvas:
    c = Canvas(bg=PALETTE["white"])
    c.rect(18, 18, 494, 494, PALETTE["panel"])
    c.polygon([(122,120),(190,78),(322,78),(390,120),(352,178),(335,438),(177,438),(160,178)], PALETTE["shirt"])
    c.polygon([(122,120),(72,205),(132,240),(175,160)], PALETTE["shirt_dark"])
    c.polygon([(390,120),(440,205),(380,240),(337,160)], PALETTE["shirt_dark"])
    c.line(256, 83, 256, 436, PALETTE["white"], 3)
    c.rect(201, 246, 249, 300, PALETTE["shirt_dark"])
    for x in range(170, 350, 22):
        c.line(x, 150, x+8, 430, PALETTE["accent2"], 2)
    for y in range(175, 425, 22):
        c.line(155, y, 355, y+5, PALETTE["accent"], 2)
    c.rect(275, 231, 355, 281, PALETTE["white"])
    c.text(281, 237, "BERS", PALETTE["ink"], 3)
    c.text(290, 261, "LAB", PALETTE["red"], 2)
    return c


def material_reference() -> Canvas:
    c = Canvas(bg=PALETTE["white"])
    c.rect(24, 24, 488, 488, PALETTE["shirt"])
    for x in range(28, 488, 24):
        c.rect(x, 24, x+5, 488, PALETTE["accent2"])
        c.rect(x+11, 24, x+14, 488, PALETTE["shirt_dark"])
    for y in range(28, 488, 24):
        c.rect(24, y, 488, y+5, PALETTE["accent"])
        c.rect(24, y+11, 488, y+14, PALETTE["shirt_dark"])
    c.rect(142, 187, 370, 326, PALETTE["white"])
    c.text(164, 208, "BERS", PALETTE["ink"], 8)
    c.text(193, 273, "LAB", PALETTE["red"], 6)
    return c


def protected_background_reference() -> Canvas:
    c = Canvas()
    draw_protected_background(c)
    # Deliberately no person: this reference freezes non-target regions.
    c.rect(178, 190, 334, 378, PALETTE["white"])
    c.text(197, 245, "BERS", PALETTE["ink"], 6)
    c.text(218, 298, "LAB", PALETTE["red"], 4)
    return c


FIXTURES = {
    "editing-subject-primary.png": {
        "builder": subject_primary,
        "roles": ["PRIMARY_EDIT_INPUT", "IDENTITY_REFERENCE", "NON_TARGET_PRESERVATION_REFERENCE"],
        "caseClasses": ["IDENTITY", "GARMENT_CONSTRUCTION", "LOGO_TEXT", "PATTERN_MATERIAL", "NON_TARGET", "LOCAL_EDIT_TARGET"],
    },
    "editing-garment-reference.png": {
        "builder": garment_reference,
        "roles": ["GARMENT_REFERENCE", "MULTI_REFERENCE_INPUT_2"],
        "caseClasses": ["GARMENT_CONSTRUCTION", "LOGO_TEXT", "PATTERN_MATERIAL", "MULTI_REFERENCE"],
    },
    "editing-material-reference.png": {
        "builder": material_reference,
        "roles": ["MATERIAL_REFERENCE", "MULTI_REFERENCE_INPUT_3"],
        "caseClasses": ["LOGO_TEXT", "PATTERN_MATERIAL", "MULTI_REFERENCE"],
    },
    "editing-background-reference.png": {
        "builder": protected_background_reference,
        "roles": ["NON_TARGET_REFERENCE"],
        "caseClasses": ["NON_TARGET", "LOGO_TEXT"],
    },
}

T2I_SUPPLEMENT = [
    {
        "fixtureId": "t2i-fashion-material-v1",
        "caseClass": "fashion-material",
        "prompt": "A studio fashion photograph of an adult wearing a navy wool blazer with a clearly visible herringbone weave, realistic fabric fibers, natural folds, neutral gray background, high material realism.",
        "reviewFocus": ["adult anatomy", "navy blazer", "visible herringbone weave", "fabric fibers", "natural folds"],
    },
    {
        "fixtureId": "t2i-text-logo-rendering-v1",
        "caseClass": "text-logo-rendering",
        "prompt": "A clean studio product photograph of a white cotton T-shirt with the exact centered text BERS LAB in bold black capital letters, no other text or logo, realistic cotton texture.",
        "reviewFocus": ["exact BERS LAB text", "no extra text", "centered placement", "white cotton T-shirt", "realistic cotton texture"],
    },
    {
        "fixtureId": "t2i-difficult-texture-v1",
        "caseClass": "difficult-texture",
        "prompt": "A macro studio photograph of navy, warm red, and gold woven plaid fabric, clearly resolved crossing threads, repeated check geometry, realistic textile fibers and shallow grazing light.",
        "reviewFocus": ["plaid geometry", "crossing threads", "navy red gold palette", "textile fibers", "grazing light"],
    },
]

CASES = [
    {
        "caseId": "edit-local-sleeve-color-v1",
        "instruction": "Change only the left sleeve patch from warm red to cool green. Preserve face identity, garment construction, BERS LAB logo/text, plaid pattern, pocket, seams, and every background object.",
        "referenceOrder": ["editing-subject-primary.png"],
        "dimensions": ["identity-preservation","garment-logo-pattern-preservation","non-target-preservation","edit-compliance","anatomy-artifact-rate","text-fidelity"],
    },
    {
        "caseId": "edit-garment-transfer-v1",
        "instruction": "Use the garment reference to preserve the shirt silhouette, pocket, seam, BERS LAB logo/text, and plaid material while retaining the primary subject identity and protected background.",
        "referenceOrder": ["editing-subject-primary.png","editing-garment-reference.png"],
        "dimensions": ["identity-preservation","garment-logo-pattern-preservation","non-target-preservation","edit-compliance","text-fidelity","multi-reference-consistency"],
    },
    {
        "caseId": "edit-logo-text-v1",
        "instruction": "Change only the chest logo text from BERS LAB to BERS AI. Preserve face identity, shirt silhouette, pocket, seams, plaid geometry, sleeve patch, material cues, and every background object.",
        "referenceOrder": ["editing-subject-primary.png","editing-garment-reference.png"],
        "dimensions": ["identity-preservation","garment-logo-pattern-preservation","non-target-preservation","edit-compliance","text-fidelity","multi-reference-consistency"],
    },
    {
        "caseId": "edit-material-reference-v1",
        "instruction": "Apply the exact plaid/material cues from the material reference to the existing shirt only. Preserve the BERS LAB logo/text, face identity, garment geometry, and all non-target background regions.",
        "referenceOrder": ["editing-subject-primary.png","editing-material-reference.png","editing-background-reference.png"],
        "dimensions": ["identity-preservation","garment-logo-pattern-preservation","non-target-preservation","edit-compliance","text-fidelity","multi-reference-consistency"],
    },
]


def generate(output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    asset_records = []
    for filename, spec in FIXTURES.items():
        payload = png_bytes(spec["builder"]())
        path = output / filename
        path.write_bytes(payload)
        asset_records.append({
            "assetId": filename.removesuffix(".png"),
            "relativePath": filename,
            "mediaType": "image/png",
            "width": WIDTH,
            "height": HEIGHT,
            "contentSha256": sha256_bytes(payload),
            "roles": spec["roles"],
            "caseClasses": spec["caseClasses"],
            "sourceKind": "DETERMINISTIC_REPOSITORY_GENERATED",
            "rightsId": FIXTURE_RIGHTS_ID,
            "rightsConclusion": "ADMITTED",
            "privateUserData": False,
            "thirdPartyBrandOrLogo": False,
            "syntheticTextLogo": "BERS LAB",
        })

    preprocessing = {
        "decode": "PNG_RGB8_EXACT",
        "exif": "NONE_GENERATED",
        "resize": "NONE_SOURCE_512",
        "crop": "NONE",
        "colorProfile": "UNTAGGED_SRGB_SEMANTICS",
    }
    t2i_records = []
    for item in T2I_SUPPLEMENT:
        t2i_records.append({
            **item,
            "promptSha256": sha256_bytes(item["prompt"].encode("utf-8")),
        })

    case_records = []
    for case in CASES:
        case_records.append({
            **case,
            "instructionSha256": sha256_bytes(case["instruction"].encode("utf-8")),
            "referenceOrderingSha256": sha256_bytes(canonical_bytes(case["referenceOrder"])),
        })

    manifest = {
        "schemaVersion": GENERATOR_SCHEMA,
        "generator": {
            "language": "python-stdlib",
            "pngEncoder": "BERS_MINIMAL_RGB8_PNG_ZLIB9_V1",
            "width": WIDTH,
            "height": HEIGHT,
            "networkAccessRequired": False,
            "externalFontsRequired": False,
            "externalImagesRequired": False,
            "randomnessUsed": False,
        },
        "rights": {
            "rightsId": FIXTURE_RIGHTS_ID,
            "owner": "BERS_PROJECT",
            "generatedFromThirdPartyContent": False,
            "privateUserDataAllowed": False,
            "scrapedBiometricDataAllowed": False,
            "thirdPartyBrandLogoAllowed": False,
            "productionAuthorityGranted": False,
        },
        "preprocessing": preprocessing,
        "preprocessingSha256": sha256_bytes(canonical_bytes(preprocessing)),
        "assets": sorted(asset_records, key=lambda value: value["assetId"]),
        "t2iSupplement": t2i_records,
        "cases": case_records,
        "candidateOutputsObserved": False,
        "winnerSelectionAllowed": False,
        "productionAuthorityGranted": False,
        "trainingOrDistillationAllowed": False,
    }
    (output / "fixture-manifest.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = generate(args.output)
    print(json.dumps({
        "schemaVersion": manifest["schemaVersion"],
        "assetCount": len(manifest["assets"]),
        "t2iSupplementCount": len(manifest["t2iSupplement"]),
        "caseCount": len(manifest["cases"]),
        "assets": {item["assetId"]: item["contentSha256"] for item in manifest["assets"]},
        "preprocessingSha256": manifest["preprocessingSha256"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
