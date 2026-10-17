"""CPU-only tests; these fixtures do not simulate or validate generative quality."""
import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fashion_vton_fit_review import generate_preview


def png(rgb):
    image = Image.new("RGB", (20, 30), rgb)
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def sha(data):
    return hashlib.sha256(data).hexdigest()


class FitReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.person = self.root / "person.png"
        self.garment = self.root / "garment.png"
        self.person.write_bytes(png((200, 120, 70)))
        self.garment.write_bytes(png((40, 20, 130)))
        self.run = self.root / "gpu-run"
        self.run.mkdir()
        self.output = self.root / "review"
        result = png((220, 60, 80))
        (self.run / "result-01.png").write_bytes(result)
        report = {
            "kind": "BERS_FASHION_VTON_GPU_RESEARCH_V1",
            "admittedToProduction": False,
            "source": {
                "personSha256": sha(self.person.read_bytes()),
                "garmentSha256": sha(self.garment.read_bytes()),
            },
            "runs": [{
                "name": "result-01.png", "sha256": sha(result),
                "latencyMs": 100, "peakCudaAllocatedBytes": 100,
            }],
        }
        (self.run / "run-report.json").write_text(json.dumps(report))

    def test_visual_review_is_generated_but_never_automatically_accepted(self):
        manifest = generate_preview(
            person=self.person, garment=self.garment, run_dir=self.run, output=self.output)
        self.assertEqual(manifest["mode"], "GENERATIVE_MODEL_OUTPUT_COMPARISON")
        self.assertEqual(manifest["humanReviewStatus"], "PENDING")
        self.assertFalse(manifest["qualityAccepted"])
        self.assertFalse(manifest["productionAuthorityGranted"])
        self.assertEqual(manifest["inputSha256"]["person"], sha(self.person.read_bytes()))
        sample = manifest["generatedModelResults"][0]
        self.assertEqual(sample["sourceResult"], "result-01.png")
        self.assertTrue(all(value == "PENDING" for value in sample["humanReview"].values()))
        data = (self.output / sample["preview"]).read_bytes()
        self.assertEqual(sha(data), sample["previewSha256"])
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.size, (1152, 668))
        self.assertTrue((self.output / "fit-review-manifest.json").is_file())
        with self.assertRaises(FileExistsError):
            generate_preview(
                person=self.person, garment=self.garment, run_dir=self.run, output=self.output)

    def test_modified_result_refused_before_writing(self):
        (self.run / "result-01.png").write_bytes(png((0, 0, 0)))
        with self.assertRaisesRegex(ValueError, "changed"):
            generate_preview(
                person=self.person, garment=self.garment, run_dir=self.run, output=self.output)
        self.assertFalse(self.output.exists())

    def test_identity_mismatch_traversal_and_symlink_rejected(self):
        report_file = self.run / "run-report.json"
        report = json.loads(report_file.read_text())
        report["source"]["personSha256"] = "a" * 64
        report_file.write_text(json.dumps(report))
        with self.assertRaisesRegex(ValueError, "person/garment"):
            generate_preview(
                person=self.person, garment=self.garment, run_dir=self.run, output=self.output)
        report["source"]["personSha256"] = sha(self.person.read_bytes())
        report["runs"][0]["name"] = "../result-01.png"
        report_file.write_text(json.dumps(report))
        with self.assertRaisesRegex(ValueError, "path"):
            generate_preview(
                person=self.person, garment=self.garment, run_dir=self.run, output=self.output)
        report["runs"][0]["name"] = "result-01.png"
        report_file.write_text(json.dumps(report))
        (self.run / "result-01.png").unlink()
        (self.run / "result-01.png").symlink_to(self.person)
        with self.assertRaisesRegex(ValueError, "symlinks"):
            generate_preview(
                person=self.person, garment=self.garment, run_dir=self.run, output=self.output)
        self.assertFalse(self.output.exists())

    def test_bad_image_fails_before_writing(self):
        self.garment.write_bytes(b"broken")
        report_file = self.run / "run-report.json"
        report = json.loads(report_file.read_text())
        report["source"]["garmentSha256"] = sha(b"broken")
        report_file.write_text(json.dumps(report))
        with self.assertRaises(Exception):
            generate_preview(
                person=self.person, garment=self.garment, run_dir=self.run, output=self.output)
        self.assertFalse(self.output.exists())


    def test_aggregate_budget_rejected_using_headers_before_pixel_decode(self):
        # Deliberately truncated compressed pixel streams: Pillow can read
        # their PNG geometry, but decode would fail. Prove the total budget is
        # checked before loading a 26-million-pixel pair into memory.
        import struct
        import zlib

        def header_only_png(width, height):
            def chunk(tag, payload):
                return (len(payload).to_bytes(4, "big") + tag + payload
                        + zlib.crc32(tag + payload).to_bytes(4, "big"))
            ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
            return (b"\\x89PNG\\r\\n\\x1a\\n"
                    + chunk(b"IHDR", ihdr)
                    + chunk(b"IDAT", zlib.compress(b"\\x00"))
                    + chunk(b"IEND", b""))

        oversized_pair = header_only_png(3600, 3600)
        report_file = self.run / "run-report.json"
        report = json.loads(report_file.read_text())
        report["runs"] = []
        for index in range(1, 3):
            name = f"result-{index:02d}.png"
            (self.run / name).write_bytes(oversized_pair)
            report["runs"].append({"name": name, "sha256": sha(oversized_pair)})
        report_file.write_text(json.dumps(report))
        with self.assertRaisesRegex(ValueError, "Aggregate review pixel budget exceeded"):
            generate_preview(person=self.person, garment=self.garment,
                             run_dir=self.run, output=self.output)
        self.assertFalse(self.output.exists())

    def test_multiple_valid_results_reviewed_without_automatic_approval(self):
        second = png((90, 100, 110))
        (self.run / "result-02.png").write_bytes(second)
        report_file = self.run / "run-report.json"
        report = json.loads(report_file.read_text())
        report["runs"].append({"name": "result-02.png", "sha256": sha(second)})
        report_file.write_text(json.dumps(report))
        manifest = generate_preview(person=self.person, garment=self.garment,
                                    run_dir=self.run, output=self.output)
        self.assertEqual(len(manifest["generatedModelResults"]), 2)
        self.assertEqual([item["sourceResult"] for item in manifest["generatedModelResults"]],
                         ["result-01.png", "result-02.png"])
        self.assertTrue(all(all(value == "PENDING" for value in item["humanReview"].values())
                            for item in manifest["generatedModelResults"]))
        self.assertFalse(manifest["qualityAccepted"])


if __name__ == "__main__":
    unittest.main()
