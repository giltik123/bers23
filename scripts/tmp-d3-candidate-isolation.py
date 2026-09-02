from pathlib import Path


def replace_one(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one anchor, found {count}: {old!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


matrix = 'scripts/prepare-tiny-sd-d3-wasm-strategy-matrix.py'

replace_one(
    matrix,
    'import json\nimport shutil\nfrom pathlib import Path\n',
    'import json\nimport shutil\nimport subprocess\nimport sys\nfrom pathlib import Path\n',
)

replace_one(
    matrix,
    'COMPONENTS = tuple(baseline.COMPONENT_FILES)\n\n',
    'COMPONENTS = tuple(baseline.COMPONENT_FILES)\nMAX_WORKER_RECORD_BYTES = 2 * 1024 * 1024\nALLOWED_CANDIDATE_RESULTS = {"PASS", "SIZE_BLOCKED", "NUMERIC_RISK", "TRANSFORM_BLOCKED"}\n\n',
)

worker_helpers = r'''

def _resolve_strategy(component: str, strategy_name: str) -> Callable[[Path, Path], dict[str, Any]]:
    matches = [transform for name, transform in _strategy_definitions(component) if name == strategy_name]
    if len(matches) != 1:
        raise RuntimeError(f"candidate worker strategy is not uniquely registered: {component}/{strategy_name}")
    return matches[0]


def _read_candidate_worker_record(record_path: Path) -> dict[str, Any]:
    if not record_path.is_file() or record_path.is_symlink() or record_path.stat().st_size <= 0:
        raise RuntimeError("candidate worker record is missing, symlinked or empty")
    if record_path.stat().st_size > MAX_WORKER_RECORD_BYTES:
        raise RuntimeError("candidate worker record exceeds bounded JSON size")
    try:
        value = json.loads(record_path.read_text(encoding="utf-8"))
    except Exception as error:
        raise RuntimeError(f"candidate worker record is malformed: {type(error).__name__}: {error}") from error
    if not isinstance(value, dict) or value.get("result") not in ALLOWED_CANDIDATE_RESULTS:
        raise RuntimeError("candidate worker record is malformed: unexpected result contract")
    return value


def _validate_candidate_worker_record(record: dict[str, Any], target: Path) -> None:
    result = record["result"]
    if result == "TRANSFORM_BLOCKED":
        if record.get("artifact") is not None or record.get("nativeOrtParity") is not None:
            raise RuntimeError("candidate worker blocked record unexpectedly contains accepted artifact evidence")
        return
    artifact = record.get("artifact")
    parity = record.get("nativeOrtParity")
    transform = record.get("transform")
    if not isinstance(artifact, dict) or not isinstance(parity, dict) or not isinstance(transform, dict):
        raise RuntimeError("candidate worker record is malformed: incomplete candidate evidence")
    if not target.is_file() or target.is_symlink():
        raise RuntimeError("candidate worker artifact is missing or symlinked")
    expected_size = artifact.get("size")
    expected_sha = artifact.get("sha256")
    if (
        not isinstance(expected_size, int)
        or expected_size <= 0
        or not isinstance(expected_sha, str)
        or len(expected_sha) != 64
        or target.stat().st_size != expected_size
        or baseline.sha256_file(target) != expected_sha
    ):
        raise RuntimeError("candidate worker artifact identity mismatch")


def _run_candidate_isolated(
    component: str,
    strategy_name: str,
    source: Path,
    target: Path,
    d2_report_path: Path,
    record_path: Path,
) -> dict[str, Any]:
    for path in (target, record_path):
        if path.exists() or path.is_symlink():
            path.unlink()
    completed = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve()),
            "--candidate-worker",
            "--component",
            component,
            "--strategy",
            strategy_name,
            "--source",
            str(source),
            "--d2-report",
            str(d2_report_path),
            "--target",
            str(target),
            "--record",
            str(record_path),
        ],
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"candidate worker exited non-zero: {component}/{strategy_name} rc={completed.returncode}")
    try:
        record = _read_candidate_worker_record(record_path)
        _validate_candidate_worker_record(record, target)
        return record
    finally:
        if record_path.exists() or record_path.is_symlink():
            record_path.unlink()


def candidate_worker_main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-worker", action="store_true", required=True)
    parser.add_argument("--component", required=True)
    parser.add_argument("--strategy", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--d2-report", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--record", type=Path, required=True)
    args = parser.parse_args()

    if onnx.__version__ != EXPECTED_ONNX or ort.__version__ != EXPECTED_ORT:
        raise RuntimeError(f"unexpected ONNX/ORT versions: {onnx.__version__}/{ort.__version__}")
    if args.component not in COMPONENTS:
        raise RuntimeError(f"candidate worker component is not registered: {args.component}")

    source = args.source.resolve(strict=True)
    if not source.is_file() or source.is_symlink() or source.name != baseline.COMPONENT_FILES[args.component]:
        raise RuntimeError("candidate worker source is outside the component contract")
    d2_report_path = args.d2_report.resolve(strict=True)
    d2_report = json.loads(d2_report_path.read_text(encoding="utf-8"))
    if (
        d2_report.get("status") != "CANDIDATE"
        or d2_report.get("stage") != "D2_COMPONENT_ONNX_CPU_FEASIBILITY"
        or d2_report.get("passCount") != 3
        or d2_report.get("allComponentsPass") is not True
        or d2_report.get("blockedComponents") != {}
        or d2_report.get("runtimeAuthorityGranted") is not False
        or d2_report.get("productionApproval") is not False
    ):
        raise RuntimeError("candidate worker did not receive accepted D2 evidence")
    d2_record = (d2_report.get("components") or {}).get(args.component)
    if not isinstance(d2_record, dict) or d2_record.get("result") != "PASS" or d2_record.get("ortParityPassed") is not True:
        raise RuntimeError("candidate worker D2 component is not accepted")
    source_artifact = d2_record.get("artifact") or {}
    if source.stat().st_size != source_artifact.get("size") or baseline.sha256_file(source) != source_artifact.get("sha256"):
        raise RuntimeError("candidate worker source identity mismatch")

    target = args.target.resolve()
    record_path = args.record.resolve()
    if record_path.exists() or record_path.is_symlink():
        raise RuntimeError("candidate worker record path must not preexist")
    target.parent.mkdir(parents=True, exist_ok=True)
    record_path.parent.mkdir(parents=True, exist_ok=True)
    transform = _resolve_strategy(args.component, args.strategy)
    record = _candidate_record(args.component, source, target, d2_record, transform)
    encoded = json.dumps(record, indent=2, sort_keys=True) + "\n"
    if len(encoded.encode("utf-8")) > MAX_WORKER_RECORD_BYTES:
        raise RuntimeError("candidate worker record exceeds bounded JSON size")
    record_path.write_text(encoded, encoding="utf-8")
    return 0
'''

replace_one(
    matrix,
    '\n\ndef accepted_strategy_definition(component: str) -> tuple[str, Callable[[Path, Path], dict[str, Any]]]:\n',
    worker_helpers + '\n\ndef accepted_strategy_definition(component: str) -> tuple[str, Callable[[Path, Path], dict[str, Any]]]:\n',
)

replace_one(
    matrix,
    '            record = _candidate_record(component, source, candidate_path, d2_record, transform)\n',
    '            record_path = scratch / f"{component}--{strategy_name}.record.json"\n            record = _run_candidate_isolated(\n                component,\n                strategy_name,\n                source,\n                candidate_path,\n                args.d2_report.resolve(strict=True),\n                record_path,\n            )\n',
)

replace_one(
    matrix,
    'if __name__ == "__main__":\n    raise SystemExit(main())\n',
    'if __name__ == "__main__":\n    if "--candidate-worker" in sys.argv:\n        raise SystemExit(candidate_worker_main())\n    raise SystemExit(main())\n',
)

workflow = '.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml'
replace_one(
    workflow,
    '          node --test tests/tiny-sd-d3-policy.test.mjs\n          python -m py_compile \\\n            scripts/prepare-tiny-sd-d3-wasm-quantized.py \\\n',
    '          node --test tests/tiny-sd-d3-policy.test.mjs tests/tiny-sd-d3-candidate-isolation-policy.test.mjs\n          python -m py_compile \\\n            scripts/prepare-tiny-sd-d3-wasm-quantized.py \\\n            scripts/prepare-tiny-sd-d3-wasm-strategy-matrix.py \\\n',
)
