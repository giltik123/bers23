"""Research-only offline tests for byte identities, not GPU/runtime acceptance."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from fashion_vton_weight_preflight import REQUIRED_FILES, SCHEMA, verify_weights


class WeightPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.weights = self.root / 'weights'
        self.weights.mkdir()
        files = {}
        for name in REQUIRED_FILES:
            data = ('fixture-' + name).encode()
            file = self.weights / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
            files[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        self.manifest = self.root / 'manifest.json'
        self.write_manifest({'schema': SCHEMA, 'files': files})

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self, value):
        self.manifest.write_text(json.dumps(value))

    def test_all_three_weights_verified(self):
        result = verify_weights(self.weights, self.manifest)
        self.assertEqual(result['filesVerified'], 3)

    def test_mutated_weight_rejected(self):
        (self.weights / REQUIRED_FILES[0]).write_bytes(b'tiny')
        with self.assertRaisesRegex(ValueError, 'size mismatch'):
            verify_weights(self.weights, self.manifest)

    def test_same_size_corruption_rejected(self):
        path = self.weights / REQUIRED_FILES[0]
        path.write_bytes(b'X' * path.stat().st_size)
        with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
            verify_weights(self.weights, self.manifest)

    def test_missing_and_extra_manifest_keys_rejected(self):
        data = json.loads(self.manifest.read_text())
        data['files'].pop(REQUIRED_FILES[0])
        self.write_manifest(data)
        with self.assertRaisesRegex(ValueError, 'precisely'):
            verify_weights(self.weights, self.manifest)

    def test_symlink_weights_rejected(self):
        file = self.weights / REQUIRED_FILES[0]
        file.unlink()
        file.symlink_to(self.manifest)
        with self.assertRaisesRegex(ValueError, 'regular weight'):
            verify_weights(self.weights, self.manifest)

    def test_bad_sha_and_bad_size_types_rejected(self):
        data = json.loads(self.manifest.read_text())
        data['files'][REQUIRED_FILES[0]]['bytes'] = True
        self.write_manifest(data)
        with self.assertRaisesRegex(ValueError, 'size'):
            verify_weights(self.weights, self.manifest)


if __name__ == '__main__':
    unittest.main()
