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

test('metadata pin and exact parity are separate jobs with fixed source revision', () => {
  assert.match(evidence, /operation == 'PIN_METADATA'/);
  assert.match(evidence, /operation == 'RUN_EXACT_PARITY'/);
  assert.match(evidence, /SANA_REPO: Efficient-Large-Model\/Sana_Sprint_0\.6B_1024px_diffusers/);
  assert.match(evidence, /SANA_REVISION: a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97/);
  assert.match(runner, /SANA_REVISION = "a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97"/);
});

test('real parity requires a fixed evidence runner and protected environment boundary', () => {
  assert.match(evidence, /runs-on: \[self-hosted, linux, x64, gpu, hsme-evidence\]/);
  assert.match(evidence, /environment: hsme-sana-parity-evidence/);
  assert.match(evidence, /command -v nvidia-smi/);
  assert.doesNotMatch(evidence, /\b(?:replicate|openai|modal|runpod)\b|fal(?:\.ai|_key)|inference endpoint/i);
});

test('rights and exact parity are verified before heavyweight runtime installation', () => {
  const planCheck = evidence.indexOf('Verify immutable candidate and committed reviewed plan before network work');
  const runtimeInstall = evidence.indexOf('Install exact evidence runtime');
  assert.ok(planCheck >= 0);
  assert.ok(runtimeInstall > planCheck);
  assert.match(evidence, /plan\['rights'\]\['status'\] == 'EVIDENCE_RUN_ALLOWED'/);
  assert.match(evidence, /EXACT_SHA256_SAME_BACKEND/);
  assert.match(evidence, /postObservationThresholdChangesAllowed'\] is False/);
});

test('raw prompt comes only from protected secrets and is not an artifact', () => {
  assert.match(evidence, /secrets\.HSME_SANA_PROMPT/);
  assert.match(evidence, /secrets\.HSME_SANA_PROMPT_HMAC_KEY/);
  assert.match(evidence, /secrets\.HSME_SANA_PROMPT_HMAC_KEY_ID/);
  assert.doesNotMatch(evidence, /echo .*HSME_SANA_PROMPT/);
  assert.match(runner, /prompt HMAC commitment mismatch/);
});

test('binary model, tensor, cache and image evidence is destroyed before upload', () => {
  const cleanup = evidence.indexOf('Destroy all model/tensor/image bytes before evidence upload');
  const upload = evidence.indexOf('Upload JSON-only parity evidence');
  assert.ok(cleanup >= 0);
  assert.ok(upload > cleanup);
  assert.match(evidence, /find "\$\{EVIDENCE_DIR\}" -type f ! -name '\*\.json' -delete/);
  assert.match(evidence, /rm -rf "\$\{RUNNER_TEMP\}\/hsme-sana-parity-work" "\$\{RUNNER_TEMP\}\/hsme-sana-hf"/);
  assert.doesNotMatch(evidence, /upload-artifact[\s\S]{0,500}\.(safetensors|bin|pt|pth|onnx|ort|png|jpg|webp)/i);
});

test('runner uses local-only pipeline load after revision-pinned snapshot acquisition', () => {
  assert.match(runner, /snapshot_download\([\s\S]*revision=SANA_REVISION/);
  assert.match(runner, /SanaSprintPipeline\.from_pretrained\([\s\S]*local_files_only=True/);
  assert.match(runner, /model repository contains Python source; remote repository code is not admitted/);
  assert.match(runner, /CUDA GPU runner is required; cloud\/API fallback is forbidden/);
});

test('reference generation uses the normal prompt path and captures its actual conditioning', () => {
  assert.match(runner, /reference = pipe\([\s\S]*prompt=prompt/);
  assert.match(runner, /def capture_encode_prompt/);
  assert.match(runner, /captured\["prompt_embeds"\]/);
  assert.match(runner, /captured\["prompt_attention_mask"\]/);
  assert.match(runner, /output_type": "np"/);
  assert.doesNotMatch(runner, /"runtimeVersions": versions/);
});

test('split generation removes local text conditioning authority', () => {
  assert.match(runner, /pipe\.text_encoder = None/);
  assert.match(runner, /pipe\.tokenizer = None/);
  assert.match(runner, /split generation invoked the text encoder/);
  assert.match(runner, /prompt_embeds=transported_embeds/);
  assert.match(runner, /prompt_attention_mask=transported_mask/);
});

test('reference and split scheduler noise are independently reset from the same committed seed', () => {
  const matches = runner.match(/torch\.Generator\(device="cpu"\)\.manual_seed\(int\(generation\["seed"\]\)\)/g) ?? [];
  assert.ok(matches.length >= 3, 'expected latent, reference-step and split-step generators to bind the same seed');
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
  assert.equal(runtimeLock.policy.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(runtimeLock.policy.modelRepositoryRuntimeCodeAllowed, false);
  assert.equal(runtimeLock.policy.binaryArtifactsPublishable, false);
  assert.equal(runtimeLock.policy.productionAuthorityGranted, false);
});

test('ordinary contract workflow stays bounded and synthetic', () => {
  assert.match(contract, /python -m py_compile scripts\/hsme-sana-parity-runner\.py/);
  assert.match(contract, /python -m unittest tests\/test-hsme-sana-parity-runner\.py/);
  assert.doesNotMatch(contract, /python -m pip install|RUN_EXACT_PARITY|PIN_METADATA|secrets\.HSME_SANA_PROMPT/);
});
