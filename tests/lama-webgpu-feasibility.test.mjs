import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('./lama-browser-webgpu-feasibility.html', import.meta.url), 'utf8');
const harness = await readFile(new URL('../scripts/test-lama-browser-webgpu-feasibility.mjs', import.meta.url), 'utf8');

test('WebGPU page uses webgpu-only ORT 1.27 with no WASM fallback', () => {
  assert.match(page, /import \* as ort from 'onnxruntime-web\/webgpu'/);
  assert.match(page, /ORT_WEBGPU_VERSION = '1\.27\.0'/);
  assert.match(page, /executionProviders: \['webgpu'\]/);
  assert.match(page, /providerFallbackAllowed: false/);
  assert.match(page, /hostedSoftwareFeasibilityOnly: true/);
  assert.match(page, /productionDeviceApproval: false/);
  assert.match(page, /browserExecutionIsProductionApproval: false/);
  assert.match(page, /productionPromotionAllowed: false/);
  assert.doesNotMatch(page, /onnxruntime-web\/wasm/);
  assert.doesNotMatch(page, /executionProviders:\s*\[[^\]]*wasm/);
  assert.doesNotMatch(page, /https?:\/\//);
});

test('WebGPU page classifies API, adapter, session, inference and parity separately', () => {
  for (const result of [
    'WEBGPU_API_UNAVAILABLE',
    'WEBGPU_ADAPTER_REQUEST_FAILED',
    'WEBGPU_ADAPTER_UNAVAILABLE',
    'WEBGPU_SESSION_BLOCKED',
    'WEBGPU_INFERENCE_BLOCKED',
    'WEBGPU_PARITY_FAILED',
  ]) assert.match(page, new RegExp(result));
  assert.match(page, /softwareAdapterLikely/);
  assert.match(page, /swiftshader\|software\|llvmpipe/);
  assert.match(page, /PINNED_PYTORCH_GENERATOR_FLOAT32/);
  assert.match(page, /maxAbs <= 2e-4/);
  assert.match(page, /rmse <= 5e-5/);
});

test('hosted WebGPU harness reuses exact CPU/WASM-proven model and never grants real-device approval', () => {
  assert.match(harness, /cpuEvidence\.export\.result, 'EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS'/);
  assert.match(harness, /wasmEvidence\.result, 'PASS'/);
  assert.match(harness, /modelSha, cpuEvidence\.export\.sha256/);
  assert.match(harness, /--enable-unsafe-webgpu/);
  assert.match(harness, /--use-angle=swiftshader/);
  assert.match(harness, /externalHttpRequests/);
  assert.match(harness, /providerFallbackAllowed, false/);
  assert.match(harness, /executionProviders, \['webgpu'\]/);
  assert.match(harness, /hostedRunner: true/);
  assert.match(harness, /realDeviceEvidence: false/);
  assert.match(harness, /browserExecutionIsProductionApproval: false/);
  assert.match(harness, /productionPromotionAllowed: false/);
  assert.doesNotMatch(harness, /executionProviders:\s*\[[^\]]*wasm/);
});
