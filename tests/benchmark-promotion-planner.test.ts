import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFleetPlanner, modelFleetKey } from '../src/platform/creative/local-ai/selection/ModelFleetPlanner.ts';
import type { ModelPromotionDecision } from '../src/platform/creative/local-ai/selection/ModelFleetPromotionPolicy.ts';
import type { DeviceCapabilitySnapshot, ModelManifest, RuntimeCapabilities } from '../src/platform/creative/local-ai/types.ts';

const runtimes: RuntimeCapabilities = {
  ONNX_RUNTIME: true, WEBGPU: true, WASM: true, NNAPI: false,
  DIRECTML: false, CUDA: false, METAL: false, VULKAN: false,
};
const snapshot: DeviceCapabilitySnapshot = {
  schemaVersion: 1,
  capturedAt: 100,
  profile: { platform: 'BROWSER', deviceClass: 'BROWSER', tier: 'HIGH', ramMb: 16_384, vramMb: 0, storageFreeBytes: 1_000_000_000 },
  runtimeCapabilities: runtimes,
  evidence: { observedSignals: [], unknownSignals: [], observedRuntimes: [], unknownRuntimes: [] },
};
const model = (modelId: string, estimatedLatency: number): ModelManifest => ({
  modelId,
  version: '1.0.0',
  family: 'segmentation',
  capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX',
  runtime: 'WEBGPU',
  sizeBytes: 10_000,
  requiredRam: 1,
  requiredVram: 0,
  supportedPlatforms: ['BROWSER'],
  supportedAccelerators: ['WEBGPU'],
  estimatedLatency,
  qualityScore: .95,
  energyScore: .9,
  privacyLevel: 'PRIVATE',
  license: 'MIT',
  publisher: 'trusted',
  downloadUri: `https://models.example/${modelId}.onnx`,
  sha256: modelId === 'alpha' ? 'a'.repeat(64) : 'b'.repeat(64),
  signature: 'valid',
  status: 'AVAILABLE',
  stabilityScore: .99,
});
const alpha = model('alpha', 10);
const beta = model('beta', 100);
const promoted = (modelKey: string, measuredLatencyMs: number): ModelPromotionDecision => ({
  modelKey,
  status: 'PROMOTED',
  reasons: [],
  evidenceKey: `${modelKey}:evidence`,
  provider: 'webgpu',
  measuredLatencyMs,
  measuredSuccessRate: 1,
  capturedAt: 90,
});
const input = {
  snapshot,
  catalog: [alpha, beta],
  trustedModelKeys: [modelFleetKey(alpha), modelFleetKey(beta)],
  storageFreeBytes: 1_000_000_000,
  policy: { bootstrapCapabilities: ['SEGMENTATION'] },
};

test('planner keeps manifest latency behavior when promotion policy is disabled', () => {
  const result = new ModelFleetPlanner().recommend(input);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.modelBindings, [{ modelId: 'alpha', version: '1.0.0' }]);
});

test('planner prefers lower measured per-device latency after both models are promoted', () => {
  const result = new ModelFleetPlanner().recommend({
    ...input,
    promotionDecisions: {
      [modelFleetKey(alpha)]: promoted(modelFleetKey(alpha), 120),
      [modelFleetKey(beta)]: promoted(modelFleetKey(beta), 20),
    },
  });
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.modelBindings, [{ modelId: 'beta', version: '1.0.0' }]);
});

test('non-finite measured latency is never trusted by planner ranking', () => {
  const result = new ModelFleetPlanner().recommend({
    ...input,
    promotionDecisions: {
      [modelFleetKey(alpha)]: promoted(modelFleetKey(alpha), Number.NaN),
      [modelFleetKey(beta)]: promoted(modelFleetKey(beta), 100),
    },
  });
  assert.deepEqual(result.modelBindings, [{ modelId: 'alpha', version: '1.0.0' }], 'invalid measured latency must fall back to manifest estimate');
});
