"""GPU benchmark contract/unit checks without installing PyTorch or downloading weights."""
import argparse
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from fashion_vton_gpu_smoke import _image_path, _validate, assert_parserless_package, main


class SmokeContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.person = self.root / 'person.png'
        self.garment = self.root / 'garment.png'
        self.person.write_bytes(b'not-real-image-fixture')
        self.garment.write_bytes(b'not-real-image-fixture')
        self.output = self.root / 'result'

    def tearDown(self):
        self.temp.cleanup()

    def args(self, **extra):
        values = {'person': str(self.person), 'garment': str(self.garment),
                  'category': 'tops', 'runs': 3, 'seed': 42, 'output': str(self.output)}
        values.update(extra)
        return argparse.Namespace(**values)

    def test_valid_contract_without_gpu(self):
        self.assertEqual(_validate(self.args()), (self.person, self.garment, self.output))

    def test_incorrect_category_rejected(self):
        with self.assertRaisesRegex(ValueError, 'category'):
            _validate(self.args(category='hats'))

    def test_invalid_repeat_and_seed_rejected(self):
        for n in (0, 11, True):
            with self.assertRaises(ValueError):
                _validate(self.args(runs=n))
        for seed in (-1, 2**33, '42'):
            with self.assertRaises(ValueError):
                _validate(self.args(seed=seed))

    def test_existing_result_not_overwritten(self):
        self.output.mkdir()
        with self.assertRaises(FileExistsError):
            _validate(self.args())

    def test_symlink_image_rejected(self):
        self.person.unlink()
        self.person.symlink_to(self.garment)
        with self.assertRaises(ValueError):
            _image_path(self.person)

    def test_invalid_file_sizes_rejected(self):
        self.person.write_bytes(b'')
        with self.assertRaisesRegex(ValueError, 'size'):
            _validate(self.args())

    def test_refuses_installed_stock_fashn_package(self):
        # A PyPI installation with the upstream name must never run accidentally.
        fake_init = self.root / 'stock_fashn' / '__init__.py'
        fake_init.parent.mkdir()
        fake_init.write_text('import fashn_human_parser\\n')
        with mock.patch('importlib.util.find_spec', return_value=argparse.Namespace(origin=str(fake_init))):
            with self.assertRaisesRegex(RuntimeError, 'not the exact generated parserless'):
                assert_parserless_package()

    def test_preflight_before_torch_or_model_import(self):
        with mock.patch('fashion_vton_gpu_smoke.verify_weights', side_effect=ValueError('bad manifest')):
            with self.assertRaisesRegex(ValueError, 'bad manifest'):
                main(['--person', str(self.person), '--garment', str(self.garment),
                      '--output', str(self.output), '--category', 'tops',
                      '--weights-dir', str(self.root), '--weights-manifest', str(self.person)])


if __name__ == '__main__':
    unittest.main()
