import importlib.util
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "kandinsky-conditioning-compose-c.py"
SPEC = importlib.util.spec_from_file_location("kandinsky_conditioning_compose_c", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class KandinskyConditioningComposeCTest(unittest.TestCase):
    def test_c_bundle_reuses_b_positive_bytes_and_raw_c_negative_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            b_bundle = root / "B.conditioning.safetensors"
            raw_c_bundle = root / "C.raw.conditioning.safetensors"
            b_image = struct.pack("<2f", 1.25, -2.5)
            b_negative = struct.pack("<2f", 0.0, 0.5)
            raw_c_image = struct.pack("<2f", 9.0, 10.0)
            c_negative = struct.pack("<2f", -3.0, 4.0)
            MODULE.write_safetensors_atomic(b_bundle, [1, 2], b_image, [1, 2], b_negative)
            MODULE.write_safetensors_atomic(raw_c_bundle, [1, 2], raw_c_image, [1, 2], c_negative)

            b_manifest = root / "B.manifest.json"
            MODULE.write_canonical_json_atomic(b_manifest, {
                "bundle": bundle_identity(b_bundle),
                "conditioning": {
                    "candidateId": MODULE.B_ID,
                    "conditioningContractSha256": MODULE.B_CONTRACT_SHA256,
                    "negativeMode": "HISTORICAL_ZERO_IMAGE",
                },
            })
            raw_c_evidence = root / "C.raw.builder-evidence.json"
            MODULE.write_canonical_json_atomic(raw_c_evidence, raw_evidence(raw_c_bundle))
            output = root / "out"

            run_main([
                "compose",
                "--positive-source-manifest", str(b_manifest),
                "--positive-source-bundle", str(b_bundle),
                "--raw-c-bundle", str(raw_c_bundle),
                "--raw-c-evidence", str(raw_c_evidence),
                "--output-dir", str(output),
            ])

            final_bundle_path = output / f"{MODULE.C_ID}.conditioning.safetensors"
            final = MODULE.parse_safetensors(final_bundle_path, "final")
            self.assertEqual(final["data"]["image_embeds"], b_image)
            self.assertEqual(final["data"]["negative_image_embeds"], c_negative)
            self.assertNotEqual(final["data"]["image_embeds"], raw_c_image)

            evidence = json.loads((output / f"{MODULE.C_ID}.builder-evidence.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["composition"]["positiveSource"]["candidateId"], MODULE.B_ID)
            self.assertEqual(evidence["composition"]["positiveSource"]["imageEmbedsSha256"], MODULE.sha256_bytes(b_image))
            self.assertEqual(evidence["composition"]["negativeSource"]["discardedRawImageEmbedsSha256"], MODULE.sha256_bytes(raw_c_image))
            self.assertEqual(evidence["composition"]["negativeSource"]["negativeImageEmbedsSha256"], MODULE.sha256_bytes(c_negative))

    def test_source_manifest_bundle_identity_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            b_bundle = root / "B.conditioning.safetensors"
            raw_c_bundle = root / "C.raw.conditioning.safetensors"
            MODULE.write_safetensors_atomic(b_bundle, [1, 1], struct.pack("<f", 1.0), [1, 1], struct.pack("<f", 0.0))
            MODULE.write_safetensors_atomic(raw_c_bundle, [1, 1], struct.pack("<f", 2.0), [1, 1], struct.pack("<f", -1.0))
            bad_identity = bundle_identity(b_bundle)
            bad_identity["sha256"] = "0" * 64
            b_manifest = root / "B.manifest.json"
            MODULE.write_canonical_json_atomic(b_manifest, {
                "bundle": bad_identity,
                "conditioning": {
                    "candidateId": MODULE.B_ID,
                    "conditioningContractSha256": MODULE.B_CONTRACT_SHA256,
                    "negativeMode": "HISTORICAL_ZERO_IMAGE",
                },
            })
            raw_c_evidence = root / "C.raw.builder-evidence.json"
            MODULE.write_canonical_json_atomic(raw_c_evidence, raw_evidence(raw_c_bundle))
            with self.assertRaisesRegex(RuntimeError, "size/SHA mismatch"):
                run_main([
                    "compose",
                    "--positive-source-manifest", str(b_manifest),
                    "--positive-source-bundle", str(b_bundle),
                    "--raw-c-bundle", str(raw_c_bundle),
                    "--raw-c-evidence", str(raw_c_evidence),
                    "--output-dir", str(root / "out"),
                ])

    def test_parser_rejects_trailing_unreferenced_tensor_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "bad.safetensors"
            MODULE.write_safetensors_atomic(path, [1, 1], struct.pack("<f", 1.0), [1, 1], struct.pack("<f", 2.0))
            path.write_bytes(path.read_bytes() + b"x")
            with self.assertRaisesRegex(RuntimeError, "trailing or unreferenced"):
                MODULE.parse_safetensors(path, "bad")


def raw_evidence(bundle_path: Path):
    return {
        "schemaVersion": 1,
        "stage": "F5B1_D2C_CONDITIONING_BUILD",
        "status": "BUILT_NOT_ADMITTED",
        "candidateId": MODULE.C_ID,
        "conditioningContractSha256": MODULE.C_CONTRACT_SHA256,
        "sourceTrust": {},
        "toolchain": {},
        "determinism": {},
        "bundle": bundle_identity(bundle_path),
    }


def bundle_identity(path: Path):
    parsed = MODULE.parse_safetensors(path, "fixture")
    value = MODULE.bundle_evidence(path, parsed)
    return dict(value)


def run_main(argv):
    previous = sys.argv
    sys.argv = argv
    try:
        MODULE.main()
    finally:
        sys.argv = previous


if __name__ == "__main__":
    unittest.main()
