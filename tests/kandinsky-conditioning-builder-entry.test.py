import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'scripts' / 'kandinsky-conditioning-builder.py'


def load_entry():
    spec = importlib.util.spec_from_file_location('kandinsky_d2c_entry', ENTRY)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class KandinskyD2cBuilderEntryTests(unittest.TestCase):
    def fixture(self, root: Path, candidate_id='A_NEUTRAL_ZERO_NEGATIVE'):
        prior = root / 'prior-root'
        prior.mkdir()
        identities = [
            {'path': 'image_encoder/model.safetensors', 'size': 1, 'sha256': '1' * 64},
            {'path': 'prior/diffusion_pytorch_model.safetensors', 'size': 1, 'sha256': '2' * 64},
        ]
        configs = [
            {'path': 'model_index.json', 'size': 2, 'sha256': '3' * 64},
            {'path': 'tokenizer/vocab.json', 'size': 2, 'sha256': '4' * 64},
        ]
        for entry in [*identities, *configs]:
            path = prior / entry['path']
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'x' * entry['size'])
        manifest = root / 'd1.json'
        manifest.write_text(json.dumps({'offlinePrior': {'safeWeights': identities, 'requiredConfigIdentity': {'files': configs}}}), encoding='utf-8')
        prompt = root / 'prompt.json'
        prompt.write_text(json.dumps({'candidateId': candidate_id}), encoding='utf-8')
        return prior, manifest, prompt

    def invoke(self, prior: Path, manifest: Path, prompt: Path, extra=None):
        module = load_entry()
        observed = []
        module.runpy.run_path = lambda path, run_name: observed.append((path, run_name))
        old = sys.argv
        try:
            sys.argv = [
                str(ENTRY), '--prior-root', str(prior), '--d1-manifest', str(manifest),
                '--prompt-contract', str(prompt), '--output-dir', 'unused', *(extra or []),
            ]
            module.main()
        finally:
            sys.argv = old
        return observed

    def test_exact_allowlist_reaches_internal_builder(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt = self.fixture(Path(tmp))
            observed = self.invoke(prior, manifest, prompt)
            self.assertEqual(len(observed), 1)
            self.assertTrue(observed[0][0].endswith('_kandinsky-conditioning-builder-impl.py'))
            self.assertEqual(observed[0][1], '__main__')

    def test_candidate_c_requires_b_source_before_prior_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt = self.fixture(Path(tmp), 'C_PRESERVATION_EXPLICIT_NEGATIVE')
            with self.assertRaisesRegex(RuntimeError, 'candidate C requires'):
                self.invoke(prior, manifest, prompt)

    def test_positive_source_is_forbidden_for_self_generated_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt = self.fixture(Path(tmp))
            with self.assertRaisesRegex(RuntimeError, 'allowed only'):
                self.invoke(prior, manifest, prompt, ['--positive-source-manifest', 'x', '--positive-source-bundle', 'y'])

    def test_extra_or_missing_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt = self.fixture(Path(tmp))
            (prior / 'tokenizer' / 'unpinned.json').write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, 'file set mismatch'):
                self.invoke(prior, manifest, prompt)
            (prior / 'tokenizer' / 'unpinned.json').unlink()
            (prior / 'model_index.json').unlink()
            with self.assertRaisesRegex(RuntimeError, 'file set mismatch'):
                self.invoke(prior, manifest, prompt)

    def test_symlink_fails_closed(self):
        if not hasattr(Path, 'symlink_to'):
            self.skipTest('symlink unsupported')
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt = self.fixture(Path(tmp))
            target = prior / 'model_index.json'
            target.unlink()
            external = Path(tmp) / 'outside.json'
            external.write_text('{}', encoding='utf-8')
            try:
                target.symlink_to(external)
            except OSError:
                self.skipTest('symlink unavailable in environment')
            with self.assertRaisesRegex(RuntimeError, 'symlink'):
                self.invoke(prior, manifest, prompt)


if __name__ == '__main__':
    unittest.main()
