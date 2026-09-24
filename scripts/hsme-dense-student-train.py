#!/usr/bin/env python3
"""BERS HSME dense-student training entrypoint identity.

HSME-2b2.4 defines only the exact argv contract. It deliberately does not
execute training. A later protected-runner stage may replace the implementation
only by producing a new content-addressed toolchain manifest.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

HEX64 = re.compile(r"^[0-9a-f]{64}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]*$")

NETWORK_POLICY = "SEALED_INPUTS_ONLY"
CACHE_MODEL_INPUT_POLICY = "READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS"


def _digest(value: str) -> str:
    if not HEX64.fullmatch(value):
        raise argparse.ArgumentTypeError("expected lowercase SHA-256")
    return value


def _identifier(value: str) -> str:
    if len(value) > 200 or not IDENTIFIER.fullmatch(value):
        raise argparse.ArgumentTypeError("invalid identifier")
    return value


def _positive_int(value: str) -> int:
    parsed = int(value, 10)
    if parsed < 1:
        raise argparse.ArgumentTypeError("expected positive integer")
    return parsed


def _nonnegative_int(value: str) -> int:
    parsed = int(value, 10)
    if parsed < 0:
        raise argparse.ArgumentTypeError("expected nonnegative integer")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hsme-dense-student-train.py",
        allow_abbrev=False,
    )
    parser.add_argument("--candidate-id", required=True, type=_identifier)
    parser.add_argument("--request-evidence-sha256", required=True, type=_digest)
    parser.add_argument("--admission-evidence-sha256", required=True, type=_digest)
    parser.add_argument("--teacher-decision-sha256", required=True, type=_digest)
    parser.add_argument("--reproduction-evidence-sha256", required=True, type=_digest)
    parser.add_argument("--corpus-root-digest", required=True, type=_digest)
    parser.add_argument("--recipe-digest", required=True, type=_digest)
    parser.add_argument("--checkpoint-sha256", required=True, type=_digest)
    parser.add_argument("--resume-checkpoint-sha256", required=True)
    parser.add_argument("--output-staging-authority-id", required=True, type=_identifier)
    parser.add_argument("--output-staging-policy-sha256", required=True, type=_digest)
    parser.add_argument("--max-training-examples", required=True, type=_positive_int)
    parser.add_argument("--max-gpu-seconds", required=True, type=_positive_int)
    parser.add_argument("--max-training-cost-microusd", required=True, type=_nonnegative_int)
    parser.add_argument("--target-step-count", required=True, type=_positive_int)
    parser.add_argument("--active-parameters-millions", required=True, type=_positive_int)
    parser.add_argument(
        "--network-policy",
        required=True,
        choices=[NETWORK_POLICY],
    )
    parser.add_argument(
        "--cache-model-input-policy",
        required=True,
        choices=[CACHE_MODEL_INPUT_POLICY],
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.resume_checkpoint_sha256 != "NONE":
        _digest(args.resume_checkpoint_sha256)
    sys.stderr.write(json.dumps({
        "schemaVersion": "BERS_HSME_DENSE_STUDENT_TRAINING_ENTRYPOINT_V1",
        "state": "TRAINING_EXECUTION_NOT_IMPLEMENTED_IN_2B2_4",
        "processSpawned": False,
        "trainingStarted": False,
    }, sort_keys=True) + "\n")
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
