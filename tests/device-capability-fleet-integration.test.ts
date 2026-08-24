import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceAnalyzer } from '../src/platform/creative/local-ai/device/DeviceAnalyzer';
import { DeviceCapabilitySnapshotBuilder } from '../src/platform/creative/local-ai/device/DeviceCapabilitySnapshot';
import type { RuntimeCapabilities } from '../src/platform/creative/local-ai/types';

const runtimes = (nnapi: boolean | 'UNKNOWN'): RuntimeCapabilities => Object.freeze({
  ONNX_RUNTIME: true,
  WEBGPU: false,
  WASM: true,
  NNAPI: nnapi,
  DIRECTML: false,
  CUDA: false,
  METAL: false,
  VULKAN: false,
});

test('6.42A NNAPI evidence participates in B1 tiering without defeating UNKNOWN fail-closed semantics', async () => {
  const unknownCompute = await new DeviceAnalyzer({
    signals: async () => ({ platform: 'ANDROID', deviceClass: 'MOBILE', nnapi: true, ramMb: 16_384 }),
  }).analyze();
  assert.equal(unknownCompute.nnapi, true);
  assert.equal(unknownCompute.tier, 'UNKNOWN', 'NNAPI alone must not fabricate missing CPU evidence');

  const accelerated = await new DeviceAnalyzer({
    signals: async () => ({
      platform: 'ANDROID', deviceClass: 'MOBILE', cpuCores: 8, ramMb: 16_384,
      nnapi: true, webgpu: false, webnn: false, cuda: false, directml: false, metal: false, vulkan: false,
      storageFreeBytes: 20_000_000_000,
    }),
  }).analyze();
  assert.equal(accelerated.nnapi, true);
  assert.equal(accelerated.tier, 'HIGH', 'NNAPI is valid accelerator evidence once CPU/RAM essentials are known');
});

test('fleet snapshot preserves NNAPI runtime evidence without carrying raw hardware fingerprint fields', async () => {
  const profile = await new DeviceAnalyzer({
    signals: async () => ({
      platform: 'ANDROID', deviceClass: 'MOBILE', cpuCores: 8, ramMb: 16_384, vramMb: 0,
      gpu: 'raw-gpu-name', npu: 'raw-npu-name', browser: 'raw-browser-version', architecture: 'arm64',
      nnapi: true, webgpu: false, webnn: false, wasm: true, storageFreeBytes: 20_000_000_000,
    }),
  }).analyze();
  const snapshot = new DeviceCapabilitySnapshotBuilder().build(profile, runtimes(true), 1_000);

  assert.equal(snapshot.runtimeCapabilities.NNAPI, true);
  assert.equal(snapshot.profile.tier, 'HIGH');
  assert.equal('gpu' in snapshot.profile, false);
  assert.equal('npu' in snapshot.profile, false);
  assert.equal('browser' in snapshot.profile, false);
  assert.equal('architecture' in snapshot.profile, false);
});
