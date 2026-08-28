#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import os
import pathlib
import shutil
import sys
from typing import Any

import numpy as np
import onnxruntime as ort
from onnxruntime.tools.convert_onnx_models_to_ort import OptimizationStyle, convert_onnx_models_to_ort

COMPONENTS = ("text_encoder", "unet", "vae_decoder")
EXPECTED_ORT_VERSION = "1.27.0"
THRESHOLD_KEYS = ("maxAbsOverReferenceMaxAbs", "rmseOverReferenceRms")
CONVERTER_DIAGNOSTIC_LIMIT = 4096


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_identity(path: pathlib.Path) -> dict[str, Any]:
    return {"size": path.stat().st_size, "sha256": sha256_file(path)}


def load_fixture_array(path: pathlib.Path, dtype: str, shape: list[int]) -> np.ndarray:
    if dtype == "float32":
        array = np.fromfile(path, dtype=np.float32)
    elif dtype == "int64":
        array = np.fromfile(path, dtype=np.int64)
    else:
        raise RuntimeError(f"unsupported D4 fixture dtype: {dtype}")
    expected = int(np.prod(shape, dtype=np.int64))
    if array.size != expected:
        raise RuntimeError(f"fixture element count mismatch for {path}: {array.size} != {expected}")
    return array.reshape(shape)


def normalized_parity(reference: np.ndarray, actual: np.ndarray, thresholds: dict[str, float]) -> dict[str, Any]:
    expected = reference.astype(np.float64, copy=False)
    observed = actual.astype(np.float64, copy=False)
    if expected.shape != observed.shape:
        raise RuntimeError(f"D4 output shape mismatch: {observed.shape} != {expected.shape}")
    if not np.isfinite(observed).all():
        raise RuntimeError("D4 ORT output contains non-finite values")
    delta = observed - expected
    max_abs = float(np.max(np.abs(delta))) if delta.size else 0.0
    rmse = float(np.sqrt(np.mean(np.square(delta)))) if delta.size else 0.0
    reference_max_abs = float(np.max(np.abs(expected))) if expected.size else 0.0
    reference_rms = float(np.sqrt(np.mean(np.square(expected)))) if expected.size else 0.0
    normalized = {
        "maxAbsOverReferenceMaxAbs": max_abs / max(reference_max_abs, 1e-12),
        "rmseOverReferenceRms": rmse / max(reference_rms, 1e-12),
    }
    passed = all(normalized[key] <= float(thresholds[key]) for key in THRESHOLD_KEYS)
    return {
        "metrics": {"maxAbs": max_abs, "rmse": rmse},
        "referenceScale": {"maxAbs": reference_max_abs, "rms": reference_rms},
        "normalizedMetrics": normalized,
        "thresholds": {key: float(thresholds[key]) for key in THRESHOLD_KEYS},
        "passed": passed,
        "referenceKind": "D2_ACCEPTED_FP32_CPU_ORT_OUTPUT",
    }


def validate_fixture(component: str, fixture_dir: pathlib.Path, record: dict[str, Any]) -> tuple[dict[str, np.ndarray], np.ndarray]:
    fixture = record["browserFixture"]
    component_dir = fixture_dir / component
    feeds: dict[str, np.ndarray] = {}
    for item in fixture["inputs"]:
        path = component_dir / item["path"]
        identity = file_identity(path)
        if identity != {"size": item["bytes"], "sha256": item["sha256"]}:
            raise RuntimeError(f"{component}/{item['name']} D2 fixture identity mismatch")
        feeds[item["name"]] = load_fixture_array(path, item["dtype"], item["shape"])
    reference_info = fixture["reference"]
    if reference_info["authority"] != "D2_ACCEPTED_FP32_CPU_ORT_OUTPUT":
        raise RuntimeError(f"{component} fixture reference authority changed")
    reference_path = component_dir / reference_info["path"]
    identity = file_identity(reference_path)
    if identity != {"size": reference_info["bytes"], "sha256": reference_info["sha256"]}:
        raise RuntimeError(f"{component} D2 reference identity mismatch")
    reference = load_fixture_array(reference_path, reference_info["dtype"], reference_info["shape"])
    return feeds, reference


def native_ort_parity(component: str, ort_path: pathlib.Path, fixture_dir: pathlib.Path, record: dict[str, Any]) -> dict[str, Any]:
    feeds, reference = validate_fixture(component, fixture_dir, record)
    session = ort.InferenceSession(str(ort_path), providers=["CPUExecutionProvider"])
    fixture = record["browserFixture"]
    output = session.run([fixture["reference"]["name"]], feeds)[0]
    return normalized_parity(reference, output, record["nativeOrtParity"]["thresholds"])


def diagnostic_tail(value: str) -> str:
    return value[-CONVERTER_DIAGNOSTIC_LIMIT:]


def convert_component(source: pathlib.Path, output_dir: pathlib.Path) -> tuple[pathlib.Path, dict[str, Any]]:
    diagnostics = io.StringIO()
    try:
        with contextlib.redirect_stdout(diagnostics), contextlib.redirect_stderr(diagnostics):
            convert_onnx_models_to_ort(
                source,
                output_dir=output_dir,
                optimization_styles=[OptimizationStyle.Fixed],
                custom_op_library_path=None,
                target_platform=None,
                save_optimized_onnx_model=False,
                allow_conversion_failures=False,
                enable_type_reduction=False,
            )
    except Exception as error:
        tail = diagnostic_tail(diagnostics.getvalue())
        if tail:
            print(tail, file=sys.stderr)
        raise RuntimeError(
            f"ORT conversion API failed ({type(error).__name__}: {error}); converterOutputTail={tail!r}"
        ) from error

    ort_path = output_dir / f"{source.stem}.ort"
    if not ort_path.is_file():
        raise RuntimeError(f"ORT converter reported success but did not create {ort_path}")
    return ort_path, {
        "api": "onnxruntime.tools.convert_onnx_models_to_ort.convert_onnx_models_to_ort",
        "optimizationStyle": "Fixed",
        "optimizationLevel": "all",
        "targetPlatform": None,
        "converterOutputTail": diagnostic_tail(diagnostics.getvalue()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx-dir", required=True, type=pathlib.Path)
    parser.add_argument("--fixture-dir", required=True, type=pathlib.Path)
    parser.add_argument("--d3-report", required=True, type=pathlib.Path)
    parser.add_argument("--output-dir", required=True, type=pathlib.Path)
    parser.add_argument("--report", required=True, type=pathlib.Path)
    args = parser.parse_args()

    if ort.__version__ != EXPECTED_ORT_VERSION:
        raise RuntimeError(f"D4 ORT converter version mismatch: {ort.__version__} != {EXPECTED_ORT_VERSION}")
    optimization_level = os.environ.get("ORT_CONVERT_ONNX_MODELS_TO_ORT_OPTIMIZATION_LEVEL", "all")
    if optimization_level != "all":
        raise RuntimeError(f"D4 ORT optimization level must remain all, got {optimization_level!r}")

    d3_bytes = args.d3_report.read_bytes()
    d3 = json.loads(d3_bytes)
    if d3.get("status") != "CANDIDATE" or d3.get("stage") != "D3_WASM_COMPACT_PREPARATION":
        raise RuntimeError("D4 requires accepted D3 WASM preparation evidence")
    if d3.get("nativePassCount") != 3 or set(d3.get("components", {})) != set(COMPONENTS):
        raise RuntimeError("D4 requires D3 native 3/3 component evidence")
    if d3.get("runtimeAuthorityGranted") is not False or d3.get("productionApproval") is not False:
        raise RuntimeError("D3 evidence unexpectedly grants authority")

    if args.output_dir.exists():
        shutil.rmtree(args.output_dir)
    args.output_dir.mkdir(parents=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)

    components: dict[str, Any] = {}
    total_onnx = 0
    total_ort = 0
    ort_pass_count = 0

    for component in COMPONENTS:
        source_record = d3["components"][component]
        if source_record.get("result") != "WASM_COMPACT_NATIVE_PASS":
            raise RuntimeError(f"{component} D3 selected candidate is not native PASS")
        if source_record.get("transform", {}).get("scheme") != "EXACT_FP16_STORAGE_FP32_COMPUTE":
            raise RuntimeError(f"{component} D4 source is not the accepted exact-storage D3 tier")
        if source_record.get("nativeOrtParity", {}).get("passed") is not True:
            raise RuntimeError(f"{component} D3 native parity is not PASS")

        source = args.onnx_dir / f"{component}.onnx"
        source_identity = file_identity(source)
        candidate = source_record["candidate"]
        if source_identity != {"size": candidate["size"], "sha256": candidate["sha256"]}:
            raise RuntimeError(f"{component} D3 ONNX candidate identity mismatch")
        validate_fixture(component, args.fixture_dir, source_record)
        total_onnx += source_identity["size"]

        base = {
            "status": "CANDIDATE",
            "component": component,
            "sourceD3Onnx": {**source_identity, "scheme": source_record["transform"]["scheme"]},
            "browserFixture": source_record["browserFixture"],
            "thresholds": source_record["nativeOrtParity"]["thresholds"],
            "runtimeAuthorityGranted": False,
            "productionApproval": False,
        }
        try:
            ort_path, conversion_details = convert_component(source, args.output_dir)
            ort_identity = file_identity(ort_path)
            parity = native_ort_parity(component, ort_path, args.fixture_dir, source_record)
            result = "D4_ORT_NATIVE_PASS" if parity["passed"] else "D4_ORT_PARITY_FAILED"
            if parity["passed"]:
                ort_pass_count += 1
            total_ort += ort_identity["size"]
            components[component] = {
                **base,
                "result": result,
                "ortArtifact": {
                    **ort_identity,
                    "sizeRatioToD3Onnx": ort_identity["size"] / source_identity["size"],
                    "singleArtifactSharedByOrtRuntimeVariants": True,
                },
                "conversion": {
                    "onnxruntimeVersion": ort.__version__,
                    "module": "onnxruntime.tools.convert_onnx_models_to_ort",
                    **conversion_details,
                    "nchwcTransformerExcludedByConverterForNonAmd64Target": True,
                },
                "nativeOrtParity": parity,
                "browserVariants": [
                    {"id": "ONNX_BASELINE", "artifact": "sourceD3Onnx", "sessionPolicy": "PRODUCTION_DEFAULT_ONNX"},
                    {"id": "ORT_DEFAULT", "artifact": "ortArtifact", "sessionPolicy": "ORT_WEB_DEFAULT_DIRECT_MODEL_BYTES"},
                    {"id": "ORT_MEMORY_FIRST", "artifact": "ortArtifact", "sessionPolicy": "DIRECT_INITIALIZER_BYTES_DISABLE_PREPACKING"},
                ],
            }
        except Exception as error:
            components[component] = {
                **base,
                "result": "D4_ORT_CONVERSION_BLOCKED",
                "errorType": type(error).__name__,
                "error": str(error),
                "ortArtifact": None,
                "nativeOrtParity": None,
                "browserVariants": [
                    {"id": "ONNX_BASELINE", "artifact": "sourceD3Onnx", "sessionPolicy": "PRODUCTION_DEFAULT_ONNX"},
                ],
            }

    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D4_ORT_PACKAGING_PREPARATION",
        "sourceD3EvidenceSha256": hashlib.sha256(d3_bytes).hexdigest(),
        "strategy": "ONE_ORT_ARTIFACT_TWO_RUNTIME_POLICIES_PLUS_ONNX_BASELINE",
        "components": components,
        "ortNativePassCount": ort_pass_count,
        "blockedComponents": {key: value["result"] for key, value in components.items() if value["result"] != "D4_ORT_NATIVE_PASS"},
        "totals": {
            "d3OnnxBytes": total_onnx,
            "ortBytesForSuccessfulConversions": total_ort,
            "ortSuccessfulComponentCount": sum(value.get("ortArtifact") is not None for value in components.values()),
        },
        "browserComparisonStillRequired": True,
        "workerFreeRuntimeRequired": True,
        "binaryArtifactsRunnerLocalOnly": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
        "editorAuthorityGranted": False,
    }
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"TINY-SD D4 ORT PREPARATION: native-pass={ort_pass_count}/3 blocked={report['blockedComponents']}")


if __name__ == "__main__":
    main()
