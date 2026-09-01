import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const selected = await readFile(new URL('../scripts/reproduce-tiny-sd-d3-selected-wasm.py', import.meta.url), 'utf8');
const matrix = await readFile(new URL('../scripts/prepare-tiny-sd-d3-wasm-strategy-matrix.py', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml', import.meta.url), 'utf8');

test('D4 reproduces the accepted D3 selected representation without rerunning strategy selection', () => {
  assert.match(selected, /prepare-tiny-sd-d3-wasm-strategy-matrix\.py/);
  assert.match(selected, /matrix\._candidate_record\(/);
  assert.match(selected, /matrix\.exact_fp16_storage_fp32_compute/);
  assert.match(selected, /baseline\.require_d2_report\(/);
  assert.match(selected, /baseline\.browser_fixture\(/);
  assert.match(selected, /SELECTED_SCHEME = "EXACT_FP16_STORAGE_FP32_COMPUTE"/);
  assert.match(selected, /PINNED_ACCEPTED_SCHEME_REPRODUCTION_NO_RESELECTION/);
  assert.match(selected, /"fullStrategyMatrixExecuted": False/);
  assert.match(selected, /"reselectionPerformed": False/);
  assert.match(selected, /artifact\.get\("graph", \{\}\)\.get\("domains"\) != \["ai\.onnx"\]/);
  assert.match(selected, /artifact\.get\("graph", \{\}\)\.get\("functionCount"\) != 0/);
  assert.match(selected, /parity\.get\("passed"\) is not True/);
  assert.match(selected, /artifact\.get\("sizeRatio", 1\.0\) >= 0\.80/);
  assert.doesNotMatch(selected, /subprocess|quantize_dynamic|quantize_static|_strategy_definitions\(/);

  assert.match(matrix, /def exact_fp16_storage_fp32_compute\(/);
  assert.match(matrix, /\("exact_fp16_storage", exact_fp16_storage_fp32_compute\)/);

  const start = workflow.indexOf('- name: Reproduce accepted D3 selected WASM candidates');
  const end = workflow.indexOf('- name: Convert D3 candidates to one ORT artifact per component and prove native parity');
  assert.ok(start >= 0 && end > start, 'D4 selected-reproduction workflow step missing');
  const step = workflow.slice(start, end);
  assert.match(step, /scripts\/reproduce-tiny-sd-d3-selected-wasm\.py/);
  assert.doesNotMatch(step, /scripts\/prepare-tiny-sd-d3-wasm-quantized\.py/);
});

test('selected reproduction remains advisory and binary-local', () => {
  assert.match(selected, /runtimeAuthorityGranted": False/);
  assert.match(selected, /productionApproval": False/);
  assert.match(selected, /releaseIdentityPinned": False/);
  assert.match(selected, /realDeviceApproval": False/);
  assert.match(selected, /binaryArtifactsRunnerLocalOnly": True/);
  assert.doesNotMatch(selected, /PRIVATE KEY/);
});
