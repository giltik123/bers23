import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const evidence = readFileSync('.github/workflows/hsme-2a-2-1b-sana-parity-evidence.yml', 'utf8');
const contract = readFileSync('.github/workflows/hsme-2a-2-1b-sana-parity-runner-contract.yml', 'utf8');
const runner = readFileSync('scripts/hsme-sana-parity-runner.py', 'utf8');
const runtimeLock = JSON.parse(readFileSync('src/platform/creative/local-ai/hsme/sana-parity-runtime-lock.v1.json', 'utf8'));

test('real evidence workflow is manual-only and has no automatic trigger', () => {
  assert.match(evidence, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(evidence, /^  pull_request:/m);
  assert.doesNotMatch(evidence, /^  push:/m);
  assert.doesNotMatch(evidence, /^  schedule:/m);
});

test('metadata, conditioning pin and exact parity are separate manual operations with fixed source revision', () => {
  assert.match(evidence, /operation == 'PIN_METADATA'/);
  assert.match(evidence, /operation == 'PIN_CONDITIONING'/);
  assert.match(evidence, /operation == 'RUN_EXACT_PARITY'/);
  assert.match(evidence, /SANA_REPO: Efficient-Large-Model\/Sana_Sprint_0\.6B_1024px_diffusers/);
  assert.match(evidence, /SANA_REVISION: a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97/);
  assert.match(runner, /SANA_REVISION = "a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97"/);
});

test('real parity requires a fixed evidence runner and protected environment boundary', () => {
  assert.match(evidence, /runs-on: \[self-hosted, linux, x64, gpu, bers-hsme-evidence\]/);
  assert.match(evidence, /environment: hsme-sana-parity-evidence/);
  assert.match(evidence, /command -v nvidia-smi/);
  assert.doesNotMatch(evidence, /\b(?:replicate|openai|modal|runpod)\b|fal(?:\.ai|_key)|inference endpoint/i);
});

test('metadata pin stays metadata-only and does not install the heavyweight runtime', () => {
  const start = evidence.indexOf('pin-metadata:');
  const end = evidence.indexOf('gpu-evidence:');
  assert.ok(start >= 0 && end > start);
  const metadataJob = evidence.slice(start, end);
  assert.match(metadataJob, /huggingface-hub==1\.32\.0/);
  assert.match(metadataJob, /coreArtifacts'\]\['huggingface-hub'\]/);
  assert.match(metadataJob, /artifact\['sha256'\]/);
  assert.doesNotMatch(metadataJob, /torch==|diffusers==|transformers==|nvidia-smi/);
});

test('conditioning and exact runs require separately tracked evidence-use rights bound by SHA-256', () => {
  assert.match(evidence, /RIGHTS_EVIDENCE: src\/platform\/creative\/local-ai\/hsme\/sana-sprint-evidence-use-rights\.v1\.json/);
  assert.match(evidence, /git ls-files --error-unmatch "\$\{RIGHTS_EVIDENCE\}"/);
  assert.match(evidence, /hashlib\.sha256\(rights_bytes\)\.hexdigest\(\) == request\['rights'\]\['evidenceSha256'\]/);
  assert.match(evidence, /hashlib\.sha256\(rights_bytes\)\.hexdigest\(\) == plan\['rights'\]\['evidenceSha256'\]/);
  assert.match(evidence, /BERS_HSME_SANA_EVIDENCE_USE_RIGHTS_V1/);
  assert.match(evidence, /gemmaTermsReviewed'\] is True/);
  assert.match(evidence, /evidenceUseAllowed'\] is True/);
  assert.match(evidence, /trainingOrDistillationAllowed'\] is False/);
  assert.match(evidence, /productionUseAllowed'\] is False/);
});

test('prompt HMAC is proven before runtime wheel acquisition for both model-byte operations', () => {
  const conditioningProof = evidence.indexOf("hmac.compare_digest(actual, request['promptCommitmentHmacSha256'])");
  const parityProof = evidence.indexOf("hmac.compare_digest(actual, plan['promptCommitmentHmacSha256'])");
  const runtimeFetch = evidence.indexOf('Fetch and verify exact direct runtime artifacts');
  assert.ok(conditioningProof >= 0);
  assert.ok(parityProof >= 0);
  assert.ok(runtimeFetch > conditioningProof);
  assert.ok(runtimeFetch > parityProof);
});

test('exact run records complete installed distribution and GPU inventory as JSON', () => {
  assert.match(evidence, /BERS_HSME_SANA_RUNTIME_INVENTORY_V1/);
  assert.match(evidence, /distributionInventorySha256/);
  assert.match(evidence, /importlib\.metadata\.distributions\(\)/);
  assert.match(evidence, /runtime-inventory\.json/);
});

test('rights, committed Phase-0 and exact parity plan are verified before heavyweight runtime installation', () => {
  const planCheck = evidence.indexOf('Verify reviewed parity plan, Phase-0 evidence and evidence-use rights');
  const phase0Check = evidence.indexOf('Bind committed Phase-0 evidence to parity plan before model network work');
  const runtimeInstall = evidence.indexOf('Install exact evidence runtime from verified direct artifacts');
  assert.ok(planCheck >= 0);
  assert.ok(phase0Check > planCheck);
  assert.ok(runtimeInstall > phase0Check);
  assert.match(evidence, /plan\['rights'\]\['status'\] == 'EVIDENCE_RUN_ALLOWED'/);
  assert.match(evidence, /EXACT_SHA256_SAME_BACKEND/);
  assert.match(evidence, /'postObservationThresholdChangesAllowed': False/);
});

test('raw prompt comes only from protected secrets and is not an artifact', () => {
  assert.match(evidence, /secrets\.HSME_SANA_PROMPT/);
  assert.match(evidence, /secrets\.HSME_SANA_PROMPT_HMAC_KEY/);
  assert.match(evidence, /secrets\.HSME_SANA_PROMPT_HMAC_KEY_ID/);
  assert.doesNotMatch(evidence, /echo .*HSME_SANA_PROMPT/);
  assert.match(runner, /prompt HMAC commitment mismatch/);
});

test('binary model, tensor, cache and image evidence is destroyed before upload', () => {
  const cleanup = evidence.indexOf('Destroy all model/runtime/tensor/image bytes before evidence upload');
  const upload = evidence.indexOf('Upload JSON-only parity evidence');
  assert.ok(cleanup >= 0);
  assert.ok(upload > cleanup);
  assert.match(evidence, /find "\$\{EVIDENCE_DIR\}" -type f ! -name '\*\.json' -delete/);
  assert.match(evidence, /hsme-sana-parity-work/);
  assert.match(evidence, /hsme-sana-hf/);
  assert.match(evidence, /hsme-core-wheels/);
  assert.doesNotMatch(evidence, /upload-artifact[\s\S]{0,500}\.(safetensors|bin|pt|pth|onnx|ort|png|jpg|webp)/i);
});

test('conditioning pin is a separate pre-image stage and downloads only conditioning components', () => {
  assert.match(evidence, /Capture conditioning-only Phase-0 envelope/);
  assert.match(evidence, /Prove conditioning bytes through accepted Phase-0 contract/);
  assert.match(runner, /operation", choices=\("PIN_METADATA", "PIN_CONDITIONING", "RUN_EXACT_PARITY"\)/);
  assert.match(runner, /allow_patterns=\["text_encoder\/\*", "tokenizer\/\*", "model_index\.json"\]/);
  assert.match(runner, /Gemma2Model\.from_pretrained/);
  assert.match(runner, /GemmaTokenizerFast\.from_pretrained/);
  assert.match(runner, /conditioning_preprocessing_policy/);
  const start = runner.indexOf('def pin_conditioning(');
  const end = runner.indexOf('def run_exact_parity(', start);
  assert.ok(start >= 0 && end > start);
  const conditioningRunner = runner.slice(start, end);
  assert.doesNotMatch(conditioningRunner, /output_type|reference = pipe\(/);
});

test('exact parity cannot run before committed Phase-0 envelope and evidence are tracked', () => {
  assert.match(evidence, /PHASE0_ENVELOPE: src\/platform\/creative\/local-ai\/hsme\/sana-sprint-conditioning-envelope\.v1\.json/);
  assert.match(evidence, /PHASE0_EVIDENCE: src\/platform\/creative\/local-ai\/hsme\/sana-sprint-conditioning-evidence\.v1\.json/);
  assert.match(evidence, /git ls-files --error-unmatch "\$\{PHASE0_ENVELOPE\}"/);
  assert.match(evidence, /git ls-files --error-unmatch "\$\{PHASE0_EVIDENCE\}"/);
  assert.match(evidence, /verify-evidence\.mjs" check-phase0-plan/);
  assert.match(runner, /reference embedding digest differs from committed Phase-0 envelope/);
  assert.match(runner, /reference attention-mask digest differs from committed Phase-0 envelope/);
});

test('runtime source identities are pinned to exact release commits and reviewed wheel digests', () => {
  assert.match(runner, /DIFFUSERS_REVISION = "d035dcd7cc7c88e0a154609b62887d50bba9fdc2"/);
  assert.match(runner, /TRANSFORMERS_REVISION = "856157a2f3e9594954310df18fdccc31ffddebe9"/);
  assert.match(runner, /TORCH_REVISION = "2b3ec34829036a65cd9d1398ea72a0167dc37470"/);
  assert.match(runner, /PREPROCESSING_POLICY_SHA256 = "9622d0e38c7ec67ec9ce9895cf60d59b2a50da712ca855162b09d7a0e1e0d4e8"/);
  assert.match(runner, /"conditioningRuntime": \{/);
  assert.match(runner, /contentSha256 must bind the reviewed wheel artifact/);
});

test('Phase-0 verifier and parity verifier share the accepted TypeScript contracts', () => {
  assert.match(evidence, /verify-evidence\.mjs" phase0/);
  assert.match(evidence, /verify-evidence\.mjs" parity/);
  assert.match(contract, /creative-hsme-sana-split-conditioning-envelope-v1\.test\.mjs/);
  assert.match(contract, /creative-hsme-sana-conditioning-parity-evidence-v1\.test\.mjs/);
});

test('runner uses locally-verifiable Hub content identity instead of Xet file-id equivalence', () => {
  assert.match(runner, /get_hf_file_metadata/);
  assert.match(runner, /metadata\.etag/);
  assert.match(runner, /identityKind": "sha256"/);
  assert.doesNotMatch(runner, /xet_file_data|\.xet\.hash/);
});

test('runner uses local-only pipeline load after revision-pinned snapshot acquisition', () => {
  assert.match(runner, /snapshot_download\([\s\S]*revision=SANA_REVISION/);
  assert.match(runner, /SanaSprintPipeline\.from_pretrained\([\s\S]*local_files_only=True[\s\S]*trust_remote_code=False/);
  assert.match(runner, /model repository contains Python source; remote repository code is not admitted/);
  assert.match(runner, /sha256_file\(path\)/);
  assert.doesNotMatch(runner, /sha256_bytes\(path\.read_bytes\(\)\)/);
  assert.match(runner, /CUDA GPU runner is required; cloud\/API fallback is forbidden/);
});

test('reference generation uses the normal prompt path and captures its actual conditioning', () => {
  assert.match(runner, /reference = pipe\([\s\S]*prompt=prompt/);
  assert.match(runner, /def capture_encode_prompt/);
  assert.match(runner, /captured\["prompt_embeds"\]/);
  assert.match(runner, /captured\["prompt_attention_mask"\]/);
  assert.match(runner, /output_type": "np"/);
  assert.match(runner, /"runtimeLockPackages": pinned_versions/);
  assert.doesNotMatch(runner, /installed_runtime_versions\(lock\)[\s\S]{0,120}collect_hub_inventory\(\)/);
});

test('split generation removes local text conditioning authority after byte transport', () => {
  assert.match(runner, /prompt-embeddings\.bf16le/);
  assert.match(runner, /prompt-attention-mask\.i64le/);
  assert.match(runner, /transported_embedding_raw/);
  assert.match(runner, /transported_mask_raw/);
  assert.match(runner, /tensor reconstruction changed canonical bytes/);
  assert.match(runner, /pipe\.text_encoder = None/);
  assert.match(runner, /pipe\.tokenizer = None/);
  assert.match(runner, /split generation invoked the text encoder/);
  assert.match(runner, /prompt_embeds=transported_embeds/);
  assert.match(runner, /prompt_attention_mask=transported_mask/);
});

test('reference and split scheduler noise are independently reset from the same committed seed', () => {
  const matches = runner.match(/torch\.Generator\(device="cpu"\)\.manual_seed\(int\(generation\["seed"\]\)\)/g) ?? [];
  assert.ok(matches.length >= 3, 'expected latent, reference-step and split-step generators to bind the same seed');
  assert.match(runner, /reference generation scheduler timesteps differ from committed plan/);
  assert.match(runner, /split generation scheduler timesteps differ from committed plan/);
});

test('runtime lock is exact and quality-first', () => {
  assert.equal(runtimeLock.schemaVersion, 'BERS_HSME_SANA_PARITY_RUNTIME_LOCK_V1');
  assert.equal(runtimeLock.python, '3.12');
  assert.deepEqual(runtimeLock.packages, {
    torch: '2.14.0',
    diffusers: '0.40.0',
    transformers: '5.17.0',
    'huggingface-hub': '1.32.0',
    safetensors: '0.8.0',
    accelerate: '1.15.0',
    sentencepiece: '0.2.2',
    numpy: '2.5.3',
  });
  assert.deepEqual(Object.keys(runtimeLock.coreArtifacts).sort(), [
    'accelerate', 'diffusers', 'huggingface-hub', 'numpy',
    'safetensors', 'sentencepiece', 'torch', 'transformers',
  ]);
  for (const artifact of Object.values(runtimeLock.coreArtifacts)) {
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    assert.match(artifact.filename, /\.whl$/);
  }
  assert.equal(runtimeLock.policy.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(runtimeLock.policy.modelRepositoryRuntimeCodeAllowed, false);
  assert.equal(runtimeLock.policy.binaryArtifactsPublishable, false);
  assert.equal(runtimeLock.policy.productionAuthorityGranted, false);
});

test('ordinary contract workflow stays bounded and synthetic', () => {
  assert.match(contract, /python -m py_compile scripts\/hsme-sana-parity-runner\.py/);
  assert.match(contract, /python -m unittest tests\/test-hsme-sana-parity-runner\.py/);
  assert.doesNotMatch(contract, /python -m pip install|RUN_EXACT_PARITY|PIN_CONDITIONING|PIN_METADATA|\$\{\{\s*secrets\.HSME_SANA_PROMPT/);
  assert.match(evidence, /Fetch and verify exact direct runtime artifacts/);
  assert.match(evidence, /pip install --disable-pip-version-check --only-binary=:all:/);
  assert.match(evidence, /Validate parity JSON through accepted Phase-1A contract/);
  assert.match(evidence, /finalize-hsme-sana-parity-evidence\.mjs/);
});
