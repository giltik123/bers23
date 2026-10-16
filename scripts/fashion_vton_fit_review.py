#!/usr/bin/env python3
"""Offline visual review of actual local generative VTON outputs (research only).

Run after fashion_vton_gpu_smoke.py with locally verified weights and a CUDA GPU.
Never use this report to authorize BERS Core, Artifact, Project, Billing or release.
"""
import argparse
import hashlib
import json
import re
from io import BytesIO
from pathlib import Path

SHA256 = re.compile(r"[a-f0-9]{64}\Z")
RESULT = re.compile(r"result-([0-9]{2})\.png\Z")
MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 16_777_216
REVIEW_AXES = (
    "BODY_POSE_AND_FIT", "OLD_GARMENT_REPLACED", "SLEEVES_ARMS_HAIR_OCCLUSION",
    "HUMAN_IDENTITY_AND_BACKGROUND", "GARMENT_LOGOS_PATTERNS", "DRAPE_AND_LIGHTING",
)


def _regular(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise ValueError("Expected a local regular file without symlinks")
    size = path.stat().st_size
    if size < 1 or size > MAX_BYTES:
        raise ValueError("Review input size exceeds safe limits")
    return path.read_bytes()


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _image(data: bytes):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    with Image.open(BytesIO(data)) as source:
        if source.format not in ("PNG", "JPEG", "WEBP"):
            raise ValueError("Unsupported review image format")
        if source.width < 1 or source.height < 1 or source.width * source.height > MAX_PIXELS:
            raise ValueError("Review image pixel budget exceeded")
        return source.convert("RGB")


def _check_report(value, person_sha, garment_sha, run_dir):
    if (not isinstance(value, dict) or value.get("kind") != "BERS_FASHION_VTON_GPU_RESEARCH_V1"
            or value.get("admittedToProduction") is not False
            or not isinstance(value.get("source"), dict)
            or value["source"].get("personSha256") != person_sha
            or value["source"].get("garmentSha256") != garment_sha):
        raise ValueError("Research run is missing exact person/garment identity")
    runs = value.get("runs")
    if not isinstance(runs, list) or not (1 <= len(runs) <= 10):
        raise ValueError("Expected 1..10 actual generative VTON outputs")
    originals = []
    seen = set()
    for item in runs:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not RESULT.fullmatch(item["name"]):
            raise ValueError("Unsafe or unrecognized model result path")
        name = item["name"]
        if name in seen:
            raise ValueError("Duplicate model output identity")
        seen.add(name)
        if not isinstance(item.get("sha256"), str) or not SHA256.fullmatch(item["sha256"]):
            raise ValueError("Model output is missing immutable SHA-256")
        data = _regular(run_dir / name)
        if _hash(data) != item["sha256"]:
            raise ValueError(f"Model output has changed since GPU execution: {name}")
        originals.append((name, data, item["sha256"]))
    return originals


def _triptych(person, garment, candidate):
    from PIL import Image, ImageDraw, ImageOps
    panel_w, panel_h, footer = 384, 640, 28
    result = Image.new("RGB", (panel_w * 3, panel_h + footer), (30, 30, 30))
    draw = ImageDraw.Draw(result)
    for index, (title, item) in enumerate(zip(
            ("ORIGINAL PERSON", "TARGET GARMENT", "GENERATED TRY-ON"),
            (person, garment, candidate))):
        contained = ImageOps.contain(item, (panel_w, panel_h), method=Image.Resampling.LANCZOS)
        x = index * panel_w + (panel_w - contained.width) // 2
        y = (panel_h - contained.height) // 2
        result.paste(contained, (x, y))
        draw.text((index * panel_w + 8, panel_h + 7), title, fill="white")
    with BytesIO() as stream:
        result.save(stream, format="PNG", optimize=False)
        return stream.getvalue()


def generate_preview(*, person: Path, garment: Path, run_dir: Path, output: Path):
    """Validate all immutable model outputs before creating an isolated review folder."""
    if run_dir.is_symlink() or not run_dir.is_dir():
        raise ValueError("Run directory must be a real local directory")
    if output.exists() or output.is_symlink():
        raise FileExistsError("Never replace an existing reviewer artifact")
    if output.resolve() in (person.resolve(), garment.resolve(), run_dir.resolve()):
        raise ValueError("Review destination must be separate from its inputs")
    person_data = _regular(person)
    garment_data = _regular(garment)
    try:
        run_report = json.loads(_regular(run_dir / "run-report.json").decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed GPU research report") from exc
    files = _check_report(run_report, _hash(person_data), _hash(garment_data), run_dir)
    person_image = _image(person_data)
    garment_image = _image(garment_data)
    images = [(name, _image(data), sha) for name, data, sha in files]
    if sum(image.width * image.height for _, image, _ in images) > 24_000_000:
        raise ValueError("Aggregate review pixel budget exceeded")

    rendered = []
    records = []
    for name, image, source_sha in images:
        preview_bytes = _triptych(person_image, garment_image, image)
        preview_name = f"fit-review-{RESULT.fullmatch(name).group(1)}.png"
        rendered.append((preview_name, preview_bytes))
        records.append({
            "sourceResult": name, "sourceResultSha256": source_sha,
            "generatedImageGeometry": {"width": image.width, "height": image.height},
            "preview": preview_name, "previewSha256": _hash(preview_bytes),
            "humanReview": {axis: "PENDING" for axis in REVIEW_AXES},
        })
    manifest = {
        "schemaVersion": 1, "kind": "BERS_FASHION_VTON_FIT_REVIEW_CANDIDATES_V1",
        "mode": "GENERATIVE_MODEL_OUTPUT_COMPARISON", "authority": "RESEARCH_ONLY",
        "inputSha256": {"person": _hash(person_data), "garment": _hash(garment_data)},
        "generatedModelResults": records,
        "humanReviewStatus": "PENDING", "qualityAccepted": False,
        "productionAuthorityGranted": False, "coreProjectMutation": False,
    }
    output.mkdir(parents=True, exist_ok=False)
    for name, data in rendered:
        (output / name).write_bytes(data)
    (output / "fit-review-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--person", type=Path, required=True)
    parser.add_argument("--garment", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    result = generate_preview(
        person=args.person, garment=args.garment, run_dir=args.run_dir, output=args.output)
    print(json.dumps({"status": "PENDING_HUMAN_FIT_REVIEW", "images": len(result["generatedModelResults"])}))


if __name__ == "__main__":
    main()
