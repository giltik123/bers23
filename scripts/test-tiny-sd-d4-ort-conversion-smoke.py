#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import pathlib
import shutil

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper
from onnxruntime.tools.convert_onnx_models_to_ort import OptimizationStyle, convert_onnx_models_to_ort

EXPECTED_ORT_VERSION = "1.27.0"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", required=True, type=pathlib.Path)
    args = parser.parse_args()

    if ort.__version__ != EXPECTED_ORT_VERSION:
        raise RuntimeError(f"D4 ORT smoke version mismatch: {ort.__version__} != {EXPECTED_ORT_VERSION}")
    optimization_level = os.environ.get("ORT_CONVERT_ONNX_MODELS_TO_ORT_OPTIMIZATION_LEVEL", "all")
    if optimization_level != "all":
        raise RuntimeError(f"D4 ORT smoke requires optimization level all, got {optimization_level!r}")

    if args.work_dir.exists():
        shutil.rmtree(args.work_dir)
    args.work_dir.mkdir(parents=True)
    try:
        input_info = helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 2])
        output_info = helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 2])
        graph = helper.make_graph([helper.make_node("Identity", ["input"], ["output"])], "d4_ort_smoke", [input_info], [output_info])
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 18)], producer_name="bers-d4-ort-smoke")
        model.ir_version = min(model.ir_version, 10)
        onnx.checker.check_model(model, full_check=True)
        source = args.work_dir / "smoke.onnx"
        onnx.save(model, source)

        convert_onnx_models_to_ort(
            source,
            output_dir=args.work_dir,
            optimization_styles=[OptimizationStyle.Fixed],
            custom_op_library_path=None,
            target_platform=None,
            save_optimized_onnx_model=False,
            allow_conversion_failures=False,
            enable_type_reduction=False,
        )
        converted = args.work_dir / "smoke.ort"
        if not converted.is_file() or converted.stat().st_size <= 0:
            raise RuntimeError("D4 ORT smoke converter did not create a non-empty smoke.ort")

        session = ort.InferenceSession(str(converted), providers=["CPUExecutionProvider"])
        value = np.asarray([[1.25, -2.5]], dtype=np.float32)
        observed = session.run(["output"], {"input": value})[0]
        if not np.array_equal(observed, value):
            raise RuntimeError(f"D4 ORT smoke inference mismatch: {observed!r} != {value!r}")
        print(f"TINY-SD D4 ORT CONVERSION SMOKE: PASS bytes={converted.stat().st_size}")
    finally:
        shutil.rmtree(args.work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
