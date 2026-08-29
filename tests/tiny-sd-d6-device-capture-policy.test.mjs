import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./tiny-sd-d6-browser-webgpu-device.html', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../scripts/capture-tiny-sd-d6-webgpu-device.mjs', import.meta.url), 'utf8');

test('D6 device capture is an isolated WebGPU research surface, never production factory wiring', () => {
  assert.match(html, /onnxruntime-web\/webgpu/);
  assert.doesNotMatch(html, /BrowserOnnxSessionFactory/);
  assert.doesNotMatch(html, /onnxruntime-web\/wasm/);
  assert.match(html, /executionProviders: \['webgpu'\]/);
  assert.match(html, /UNATTESTED_DEVICE_CAPTURE_NOT_ADMISSION/);
  assert.match(html, /realDeviceEvidence: false/);
  assert.match(html, /realDeviceAdmission: false/);
  assert.match(html, /productionApproval: false/);
});

test('capture rejects software adapters and requires shader-f16 before sessions', () => {
  assert.match(html, /shader-f16/);
  assert.match(html, /softwareAdapterLikely/);
  assert.match(html, /SOFTWARE_ADAPTER_REJECTED/);
  assert.match(html, /sessionAttempted: false/);
  assert.match(html, /missingRequiredFeatures/);
});

test('desktop runner never forces SwiftShader or unsafe WebGPU and cannot impersonate mobile evidence', () => {
  assert.doesNotMatch(runner, /--use-angle=swiftshader/);
  assert.doesNotMatch(runner, /--enable-unsafe-webgpu/);
  assert.match(runner, /\['WINDOWS', 'MACOS', 'LINUX'\]/);
  assert.match(runner, /deviceClass !== 'DESKTOP'/);
  assert.match(runner, /attestationStatus: 'UNVERIFIED_REQUIRES_EXTERNAL_TRUST_BOUNDARY'/);
  assert.match(runner, /realDeviceEvidence/);
  assert.doesNotMatch(runner, /assessTinySdD6RealDeviceEvidence/);
});

test('capture benchmark is repeated and records numerical parity without demanding GPU bit-exactness', () => {
  assert.match(runner, /const WARMUP_COUNT = 1/);
  assert.match(runner, /const SAMPLE_COUNT = 5/);
  assert.match(html, /paritySamples/);
  assert.match(html, /outputHashes/);
  assert.match(html, /bitExactAcrossMeasuredRuns/);
  assert.match(html, /allParitySamplesPassed/);
});
