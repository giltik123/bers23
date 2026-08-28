#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from diffusers import DPMSolverMultistepScheduler

AUTHORITY = "COMPOSITION_ONLY_NOT_QUALITY_ADMISSION"
REFERENCE_STAGE = "D5_CONTROL_SEMANTICS_REFERENCE"
PIPELINE_STAGE = "D5_PIPELINE_HISTORICAL_RUNTIME_CONTROL"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized(value: Any) -> Any:
    if value == float("-inf"):
        return "-Infinity"
    if isinstance(value, tuple):
        return list(value)
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--control-reference", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    snapshot = args.snapshot.resolve(strict=True)
    control_path = args.control_reference.resolve(strict=True)
    control_bytes = control_path.read_bytes()
    control = json.loads(control_bytes)
    if control.get("stage") != REFERENCE_STAGE or control.get("authority") != AUTHORITY:
        raise RuntimeError("unexpected D5 control reference")
    if control.get("runtimeAuthorityGranted") is not False or control.get("productionApproval") is not False:
        raise RuntimeError("D5 control reference unexpectedly grants authority")

    scheduler_file = snapshot / "scheduler" / "scheduler_config.json"
    expected_scheduler_file = ((control.get("upstream") or {}).get("files") or {}).get("scheduler/scheduler_config.json") or {}
    if sha256(scheduler_file) != expected_scheduler_file.get("sha256"):
        raise RuntimeError("scheduler config SHA drift against accepted D5 control reference")
    if scheduler_file.stat().st_size != expected_scheduler_file.get("bytes"):
        raise RuntimeError("scheduler config size drift against accepted D5 control reference")

    scheduler = DPMSolverMultistepScheduler.from_pretrained(snapshot, subfolder="scheduler", local_files_only=True)
    expected_config = control.get("schedulerConfig") or {}
    for key, expected in expected_config.items():
        actual = normalized(getattr(scheduler.config, key, None))
        if actual != expected:
            raise RuntimeError(f"historical DPM scheduler config drift at {key}: {actual!r} != {expected!r}")

    init_noise_sigma = float(scheduler.init_noise_sigma)
    if not math.isfinite(init_noise_sigma) or init_noise_sigma <= 0:
        raise RuntimeError(f"invalid historical init_noise_sigma: {init_noise_sigma}")

    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": PIPELINE_STAGE,
        "authority": AUTHORITY,
        "referenceLibrary": "diffusers==0.19.0",
        "schedulerClass": scheduler.__class__.__name__,
        "schedulerConfigSha256": sha256(scheduler_file),
        "controlReferenceSha256": hashlib.sha256(control_bytes).hexdigest(),
        "initialNoiseSigma": init_noise_sigma,
        "initialLatentScalingPolicy": "SEEDED_GAUSSIAN_FLOAT32_MULTIPLIED_BY_HISTORICAL_INIT_NOISE_SIGMA",
        "scaleModelInputPolicy": "IDENTITY_PROVED_BY_D5_CONTROL_REFERENCE",
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "editorAuthorityGranted": False,
        "cloudFallbackAllowed": False,
        "realDeviceApproval": False,
        "imageQualityAdmission": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"TINY-SD D5 PIPELINE CONTROL: PASS init_noise_sigma={init_noise_sigma}")


if __name__ == "__main__":
    main()
