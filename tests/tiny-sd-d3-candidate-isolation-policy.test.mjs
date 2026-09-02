import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const matrix = fs.readFileSync('scripts/prepare-tiny-sd-d3-wasm-strategy-matrix.py', 'utf8');
const d4Selected = fs.readFileSync('scripts/reproduce-tiny-sd-d3-selected-wasm.py', 'utf8');
const workflow = fs.readFileSync('.github/workflows/tiny-sd-d3-candidate-process-isolation-policy.yml', 'utf8');

test('D3 bounds native candidate lifetime with one checked-in subprocess worker per strategy', () => {
  assert.match(matrix, /MAX_WORKER_RECORD_BYTES = 2 \* 1024 \* 1024/);
  assert.match(matrix, /--candidate-worker/);
  assert.match(matrix, /subprocess\.run\(/);
  assert.match(matrix, /sys\.executable/);
  assert.match(matrix, /def _resolve_strategy\([\s\S]*?_strategy_definitions\(component\)/);
  assert.match(matrix, /def candidate_worker_main\([\s\S]*?_candidate_record\(/);

  const loopStart = matrix.indexOf('for strategy_name, transform in _strategy_definitions(component):');
  const loopEnd = matrix.indexOf('selected_name = None', loopStart);
  assert.ok(loopStart >= 0 && loopEnd > loopStart, 'D3 strategy loop must remain explicit');
  const strategyLoop = matrix.slice(loopStart, loopEnd);
  assert.match(strategyLoop, /_run_candidate_isolated\(/);
  assert.doesNotMatch(strategyLoop, /_candidate_record\(/, 'matrix parent must not retain candidate ORT sessions in-process');
});

test('D3 candidate worker records fail closed and preserve the original selection authority', () => {
  assert.match(matrix, /ALLOWED_CANDIDATE_RESULTS = \{[\s\S]*?"PASS"[\s\S]*?"SIZE_BLOCKED"[\s\S]*?"NUMERIC_RISK"[\s\S]*?"TRANSFORM_BLOCKED"/);
  assert.match(matrix, /candidate worker exited non-zero/);
  assert.match(matrix, /candidate worker record is missing, symlinked or empty/);
  assert.match(matrix, /candidate worker record exceeds bounded JSON size/);
  assert.match(matrix, /candidate worker record is malformed/);
  assert.match(matrix, /candidate worker artifact identity mismatch/);
  assert.match(matrix, /MIN_SIZE_AMONG_ORIGINAL_D3_NATIVE_PARITY_PASSING_CANDIDATES/);
  assert.match(matrix, /"text_encoder": "exact_fp16_storage"/);
  assert.match(matrix, /"unet": "exact_fp16_storage"/);
  assert.match(matrix, /"vae_decoder": "exact_fp16_storage"/);
  assert.match(matrix, /"text_encoder": "EXACT_FP16_STORAGE_FP32_COMPUTE"/);
  assert.match(matrix, /"unet": "EXACT_FP16_STORAGE_FP32_COMPUTE"/);
  assert.match(matrix, /"vae_decoder": "EXACT_FP16_STORAGE_FP32_COMPUTE"/);
});

test('D4 selected-only reproduction remains independent from D3 research worker orchestration', () => {
  assert.match(d4Selected, /matrix\._candidate_record\(/);
  assert.doesNotMatch(d4Selected, /--candidate-worker|_run_candidate_isolated/);
  assert.match(d4Selected, /PINNED_ACCEPTED_SCHEME_REPRODUCTION_NO_RESELECTION/);
});

test('dedicated hosted policy workflow is read-only and tests the exact PR head', () => {
  assert.match(workflow, /tests\/tiny-sd-d3-candidate-isolation-policy\.test\.mjs/);
  assert.match(workflow, /python -m py_compile scripts\/prepare-tiny-sd-d3-wasm-strategy-matrix\.py/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}"/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|actions: write/);
});
