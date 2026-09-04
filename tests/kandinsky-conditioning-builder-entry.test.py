import argparse
import hashlib
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'scripts' / 'kandinsky-conditioning-builder.py'
IMPL = ROOT / 'scripts' / '_kandinsky-conditioning-builder-impl.py'
REGISTRY = ROOT / 'scripts' / 'kandinsky-conditioning-candidate-registry.mjs'

B_CANDIDATE_ID = 'B_REALISM_ZERO_NEGATIVE'
C_CANDIDATE_ID = 'C_PRESERVATION_EXPLICIT_NEGATIVE'
B_CONTRACT_SHA256 = 'd0dc3f97e84e7439c063f5fbcb1c3eae9b668c3d84dd8adfa1ed116837e3f175'
D1_MANIFEST_PATH = 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json'


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def load_entry():
    return load_module(ENTRY, 'kandinsky_d2c_entry')


def load_impl():
    return load_module(IMPL, 'kandinsky_d2c_impl')


def accepted_registry_identities():
    source = REGISTRY.read_text(encoding='utf-8')
    pattern = re.compile(
        r"\n  ([A-Z][A-Z0-9_]+): Object\.freeze\(\{\n"
        r"    conditioningContractSha256: '([0-9a-f]{64})',\n"
        r"    negativeMode: '([A-Z][A-Z0-9_]+)',\n"
        r"    positiveEmbeddingSourceCandidateId: (null|'[A-Z][A-Z0-9_]+'),\n"
        r"  \}\),"
    )
    matches = pattern.findall(source)
    if len(matches) != 3:
        raise AssertionError('accepted JS candidate registry no longer matches the reviewed closed form')
    result = {}
    for candidate_id, contract_sha, negative_mode, raw_source in matches:
        source_id = None if raw_source == 'null' else raw_source[1:-1]
        if candidate_id in result:
            raise AssertionError('accepted JS candidate registry contains duplicate identities')
        result[candidate_id] = (contract_sha, negative_mode, source_id)
    return result


def tested_toolchain_lock():
    return {
        'schemaVersion': 1,
        'status': 'TESTED_EXACT',
        'containerImageDigest': f"sha256:{'0' * 64}",
        'pythonVersion': '3.10.13',
        'diffusersVersion': '0.21.4',
        'torchVersion': '2.1.2',
        'transformersVersion': '4.36.2',
        'numpyVersion': '1.26.4',
        'safetensorsVersion': '0.4.2',
        'platformMachine': 'x86_64',
    }


def canonical_json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')


class KandinskyD2cBuilderEntryTests(unittest.TestCase):
    def fixture(self, root: Path):
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
        manifest.write_text(json.dumps({
            'modelId': 'kandinsky-2-2-prior-fixture',
            'version': 'test-v1',
            'offlinePrior': {
                'repository': 'kandinsky-community/kandinsky-2-2-prior',
                'revision': 'fixture-revision',
                'safeWeights': identities,
                'requiredConfigIdentity': {'files': configs},
            },
        }), encoding='utf-8')
        prompt = root / 'prompt.json'
        prompt.write_text(json.dumps({'candidateId': 'A_NEUTRAL_ZERO_NEGATIVE'}), encoding='utf-8')
        toolchain = root / 'toolchain.json'
        toolchain.write_bytes(canonical_json_bytes(tested_toolchain_lock()))
        return prior, manifest, prompt, toolchain

    def invoke(
        self,
        prior: Path,
        manifest: Path,
        prompt: Path,
        toolchain: Path,
        seed: str = '123456',
        positive_source_manifest: Path | None = None,
        positive_source_bundle: Path | None = None,
    ):
        module = load_entry()
        observed = []

        def fake_run_path(path, run_name):
            d1_index = sys.argv.index('--d1-manifest')
            snapshot_path = Path(sys.argv[d1_index + 1])
            observed.append((path, run_name, str(snapshot_path), snapshot_path.read_bytes()))

        module.runpy.run_path = fake_run_path
        old = sys.argv
        try:
            argv = [
                str(ENTRY), '--prior-root', str(prior), '--d1-manifest', str(manifest),
                '--prompt-contract', str(prompt), '--toolchain-lock', str(toolchain),
                '--output-dir', 'unused', '--seed', seed, '--verify-only',
            ]
            if positive_source_manifest is not None:
                argv.extend(['--positive-source-manifest', str(positive_source_manifest)])
            if positive_source_bundle is not None:
                argv.extend(['--positive-source-bundle', str(positive_source_bundle)])
            sys.argv = argv
            module.main()
        finally:
            sys.argv = old
        return observed

    def write_c_source_fixture(self, root: Path, d1_path: Path, toolchain_path: Path, seed: int = 123456):
        d1 = json.loads(d1_path.read_text(encoding='utf-8'))
        toolchain_lock = json.loads(toolchain_path.read_text(encoding='utf-8'))
        bundle_path = root / 'b.conditioning.safetensors'
        bundle_path.write_bytes(b'accepted-b-conditioning-bundle')
        prior = d1['offlinePrior']
        source_manifest = {
            'schemaVersion': 2,
            'stage': 'F5B1_D2_CONDITIONING_RESEARCH',
            'status': 'RESEARCH_CANDIDATE',
            'productionExecutable': False,
            'runtimeAuthorityGranted': False,
            'priorRuntimeDependencyAllowed': False,
            'sourceTrust': {
                'd1ManifestPath': D1_MANIFEST_PATH,
                'd1ModelId': d1['modelId'],
                'd1Version': d1['version'],
                'priorRepository': prior['repository'],
                'priorRevision': prior['revision'],
                'priorSafeWeights': prior['safeWeights'],
                'priorConfigFiles': prior['requiredConfigIdentity']['files'],
            },
            'historicalPipeline': {
                'diffusersRevision': '746215670a61af1034c470d0b6555be9c60cb7b6',
                'pipelineClass': 'KandinskyV22PriorPipeline',
                'numImagesPerPrompt': 1,
                'numInferenceSteps': 25,
                'guidanceScale': 4,
                'outputType': 'pt',
            },
            'toolchain': {key: value for key, value in toolchain_lock.items() if key not in {'schemaVersion', 'status'}},
            'determinism': {
                'device': 'cpu',
                'outputDtype': 'float32',
                'torchDeterministicAlgorithms': True,
                'numThreads': 1,
                'numInteropThreads': 1,
                'ompNumThreads': 1,
                'mklNumThreads': 1,
                'seed': seed,
                'generatorPolicy': 'TORCH_CPU_GENERATOR_SINGLE_SEED',
                'latentPolicy': 'NO_EXTERNAL_LATENTS_PIPELINE_RANDN',
            },
            'conditioning': {
                'candidateId': B_CANDIDATE_ID,
                'conditioningContractSha256': B_CONTRACT_SHA256,
                'negativeMode': 'HISTORICAL_ZERO_IMAGE',
                'positiveEmbeddingSource': None,
            },
            'bundle': {
                'size': bundle_path.stat().st_size,
                'sha256': hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
            },
        }
        manifest_path = root / 'b.manifest.json'
        manifest_path.write_bytes(canonical_json_bytes(source_manifest))
        c_prompt = root / 'c-prompt.json'
        c_prompt.write_text(json.dumps({
            'candidateId': C_CANDIDATE_ID,
            'positiveEmbeddingSourceCandidateId': B_CANDIDATE_ID,
        }), encoding='utf-8')
        return c_prompt, manifest_path, bundle_path, source_manifest

    def test_exact_allowlist_reaches_internal_builder_through_exact_d1_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt, toolchain = self.fixture(Path(tmp))
            original_bytes = manifest.read_bytes()
            observed = self.invoke(prior, manifest, prompt, toolchain)
            self.assertEqual(len(observed), 1)
            self.assertTrue(observed[0][0].endswith('_kandinsky-conditioning-builder-impl.py'))
            self.assertEqual(observed[0][1], '__main__')
            self.assertNotEqual(Path(observed[0][2]), manifest.resolve())
            self.assertEqual(observed[0][3], original_bytes)

    def test_extra_or_missing_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt, toolchain = self.fixture(Path(tmp))
            (prior / 'tokenizer' / 'unpinned.json').write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, 'file set mismatch'):
                self.invoke(prior, manifest, prompt, toolchain)
            (prior / 'tokenizer' / 'unpinned.json').unlink()
            (prior / 'model_index.json').unlink()
            with self.assertRaisesRegex(RuntimeError, 'file set mismatch'):
                self.invoke(prior, manifest, prompt, toolchain)

    def test_symlink_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt, toolchain = self.fixture(Path(tmp))
            target = prior / 'model_index.json'
            target.unlink()
            external = Path(tmp) / 'outside.json'
            external.write_text('{}', encoding='utf-8')
            try:
                target.symlink_to(external)
            except OSError:
                self.skipTest('symlink unavailable in environment')
            with self.assertRaisesRegex(RuntimeError, 'symlink'):
                self.invoke(prior, manifest, prompt, toolchain)

    def test_public_entry_rejects_seed_above_js_safe_integer_before_internal_builder(self):
        with tempfile.TemporaryDirectory() as tmp:
            prior, manifest, prompt, toolchain = self.fixture(Path(tmp))
            with self.assertRaisesRegex(RuntimeError, 'safe-integer limit'):
                self.invoke(prior, manifest, prompt, toolchain, str(2**53))

    def test_public_entry_rejects_forged_b_source_trust_before_internal_builder(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prior, d1, _prompt, toolchain = self.fixture(root)
            c_prompt, source_manifest_path, source_bundle, source_manifest = self.write_c_source_fixture(root, d1, toolchain)
            source_manifest['sourceTrust']['priorRevision'] = 'forged-revision'
            source_manifest_path.write_bytes(canonical_json_bytes(source_manifest))
            with self.assertRaisesRegex(RuntimeError, 'exact D1 prior identity'):
                self.invoke(prior, d1, c_prompt, toolchain, positive_source_manifest=source_manifest_path, positive_source_bundle=source_bundle)

    def test_public_entry_rejects_b_toolchain_or_seed_drift_before_internal_builder(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prior, d1, _prompt, toolchain = self.fixture(root)
            c_prompt, source_manifest_path, source_bundle, source_manifest = self.write_c_source_fixture(root, d1, toolchain)

            source_manifest['toolchain']['torchVersion'] = 'forged'
            source_manifest_path.write_bytes(canonical_json_bytes(source_manifest))
            with self.assertRaisesRegex(RuntimeError, 'toolchain differs'):
                self.invoke(prior, d1, c_prompt, toolchain, positive_source_manifest=source_manifest_path, positive_source_bundle=source_bundle)

            _c_prompt, source_manifest_path, source_bundle, source_manifest = self.write_c_source_fixture(root, d1, toolchain)
            source_manifest['determinism']['seed'] += 1
            source_manifest_path.write_bytes(canonical_json_bytes(source_manifest))
            with self.assertRaisesRegex(RuntimeError, 'determinism/seed differs'):
                self.invoke(prior, d1, c_prompt, toolchain, positive_source_manifest=source_manifest_path, positive_source_bundle=source_bundle)

    def test_valid_b_preflight_reaches_internal_builder(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prior, d1, _prompt, toolchain = self.fixture(root)
            c_prompt, source_manifest, source_bundle, _source_value = self.write_c_source_fixture(root, d1, toolchain)
            observed = self.invoke(prior, d1, c_prompt, toolchain, positive_source_manifest=source_manifest, positive_source_bundle=source_bundle)
            self.assertEqual(len(observed), 1)

    def test_public_entry_seals_builder_evidence_to_exact_d1_bytes(self):
        module = load_entry()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence_path = root / 'A_NEUTRAL_ZERO_NEGATIVE.builder-evidence.json'
            evidence_path.write_text(json.dumps({
                'candidateId': 'A_NEUTRAL_ZERO_NEGATIVE',
                'sourceTrust': {
                    'd1ModelId': 'model',
                    'd1Version': 'version',
                    'priorRepository': 'repo',
                    'priorRevision': 'revision',
                    'priorPipelineGitBlobSha1': '1' * 40,
                },
            }), encoding='utf-8')
            d1_sha = hashlib.sha256(b'exact-d1-bytes').hexdigest()
            module.seal_builder_evidence(root, 'A_NEUTRAL_ZERO_NEGATIVE', d1_sha)
            raw = evidence_path.read_bytes()
            parsed = json.loads(raw)
            self.assertEqual(parsed['sourceTrust']['d1ManifestSha256'], d1_sha)
            self.assertTrue(raw.endswith(b'\n'))
            self.assertEqual(raw, (json.dumps(parsed, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8'))


class KandinskyD2cCandidateBindingTests(unittest.TestCase):
    def contract(self, candidate_id: str):
        source = None if candidate_id != 'C_PRESERVATION_EXPLICIT_NEGATIVE' else 'B_REALISM_ZERO_NEGATIVE'
        negative_mode = 'EXPLICIT_NEGATIVE_PRIOR' if source else 'HISTORICAL_ZERO_IMAGE'
        return {
            'schemaVersion': 1,
            'stage': 'F5B1_D2B_PROMPT_SEMANTICS_RESEARCH',
            'candidateId': candidate_id,
            'positivePrompt': 'positive prompt',
            'negativePrompt': 'negative prompt' if source else None,
            'negativeMode': negative_mode,
            'positiveEmbeddingSourceCandidateId': source,
            'prior': {
                'diffusersRevision': '746215670a61af1034c470d0b6555be9c60cb7b6',
                'pipelineClass': 'KandinskyV22PriorPipeline',
                'numImagesPerPrompt': 1,
                'numInferenceSteps': 25,
                'guidanceScale': 4,
                'outputType': 'pt',
            },
            'decoder': {
                'pipelineClass': 'KandinskyV22InpaintPipeline',
                'guidanceScale': 4,
                'embeddingOrder': ['negative_image_embeds', 'image_embeds'],
            },
            'intent': 'GARMENT_APPEARANCE_REFINEMENT_RESEARCH_ONLY',
        }

    def args(self, manifest=None, bundle=None):
        return argparse.Namespace(positive_source_manifest=manifest, positive_source_bundle=bundle)

    def test_a_and_b_forbid_positive_source_inputs(self):
        impl = load_impl()
        for candidate in ('A_NEUTRAL_ZERO_NEGATIVE', 'B_REALISM_ZERO_NEGATIVE'):
            contract = self.contract(candidate)
            self.assertEqual(impl.validate_prompt_contract(contract), candidate)
            self.assertIsNone(impl.resolve_positive_source_arguments(self.args(), contract))
            with self.assertRaisesRegex(RuntimeError, 'forbid positive source'):
                impl.resolve_positive_source_arguments(self.args('x.json', 'x.safetensors'), contract)

    def test_c_requires_real_b_source_pair(self):
        impl = load_impl()
        contract = self.contract('C_PRESERVATION_EXPLICIT_NEGATIVE')
        self.assertEqual(impl.validate_prompt_contract(contract), 'C_PRESERVATION_EXPLICIT_NEGATIVE')
        with self.assertRaisesRegex(RuntimeError, 'requires both'):
            impl.resolve_positive_source_arguments(self.args(), contract)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / 'b.manifest.json'
            bundle = root / 'b.conditioning.safetensors'
            manifest.write_text('{}', encoding='utf-8')
            bundle.write_bytes(b'fixture')
            resolved = impl.resolve_positive_source_arguments(self.args(str(manifest), str(bundle)), contract)
            self.assertEqual(resolved, (manifest.resolve(), bundle.resolve()))

    def test_c_source_policy_drift_fails_closed(self):
        impl = load_impl()
        contract = self.contract('C_PRESERVATION_EXPLICIT_NEGATIVE')
        contract['positiveEmbeddingSourceCandidateId'] = None
        with self.assertRaisesRegex(RuntimeError, 'source policy drift'):
            impl.validate_prompt_contract(contract)

    def test_python_candidate_maps_equal_accepted_js_registry(self):
        impl = load_impl()
        accepted = accepted_registry_identities()
        self.assertEqual(set(accepted), set(impl.CANDIDATE_CONTRACT_SHA256))
        self.assertEqual(set(accepted), set(impl.NEGATIVE_MODE_BY_CANDIDATE))
        self.assertEqual(set(accepted), set(impl.POSITIVE_SOURCE_BY_CANDIDATE))
        for candidate_id, (contract_sha, negative_mode, source_id) in accepted.items():
            self.assertEqual(impl.CANDIDATE_CONTRACT_SHA256[candidate_id], contract_sha)
            self.assertEqual(impl.NEGATIVE_MODE_BY_CANDIDATE[candidate_id], negative_mode)
            self.assertEqual(impl.POSITIVE_SOURCE_BY_CANDIDATE[candidate_id], source_id)

    def test_accepted_contract_hashes_are_closed(self):
        impl = load_impl()
        self.assertEqual(set(impl.CANDIDATE_CONTRACT_SHA256), {
            'A_NEUTRAL_ZERO_NEGATIVE',
            'B_REALISM_ZERO_NEGATIVE',
            'C_PRESERVATION_EXPLICIT_NEGATIVE',
        })
        self.assertEqual(impl.POSITIVE_SOURCE_BY_CANDIDATE['C_PRESERVATION_EXPLICIT_NEGATIVE'], 'B_REALISM_ZERO_NEGATIVE')
        for value in impl.CANDIDATE_CONTRACT_SHA256.values():
            self.assertRegex(value, r'^[0-9a-f]{64}$')


if __name__ == '__main__':
    unittest.main()
