import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFleetPromotionPolicy, type ModelPromotionCriteria } from '../src/platform/creative/local-ai/selection/ModelFleetPromotionPolicy.ts';
import type { BenchmarkEvidence } from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import type { DeviceCapabilitySnapshot, ModelManifest, RuntimeCapabilities } from '../src/platform/creative/local-ai/types.ts';

const runtimes: RuntimeCapabilities = {
  ONNX_RUNTIME: true, WEBGPU: false, WASM: true, NNAPI: false,
  DIRECTML: false, CUDA: true, METAL: false, VULKAN: false,
};
const snapshot: DeviceCapabilitySnapshot = {
  schemaVersion: 1,
  capturedAt: 10,
  profile: { platform: 'LINUX', deviceClass: 'DESKTOP', tier: 'HIGH', ramMb: 16_384, vramMb: 8_192, storageFreeBytes: 1_000_000_000 },
  runtimeCapabilities: runtimes,
  evidence: { observedSignals: [], unknownSignals: [], observedRuntimes: [], unknownRuntimes: [] },
};
const manifest: ModelManifest = {
  modelId: 'latest-evidence-model', version: '1.0.0', family: 'segment', capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX', runtime: 'ONNX_RUNTIME', sizeBytes: 4, requiredRam: 1, requiredVram: 1,
  supportedPlatforms: ['LINUX'], supportedAccelerators: ['CUDA'], estimatedLatency: 40, qualityScore: .95,
  energyScore: .9, privacyLevel: 'PRIVATE', license: 'MIT', publisher: 'trusted', downloadUri: 'https://models.example/latest.onnx',
  sha256: 'a'.repeat(64), signature: 'valid', status: 'AVAILABLE', stabilityScore: .99,
};
const criteria: ModelPromotionCriteria = {
  tier: 'HIGH', runtime: 'ONNX_RUNTIME', provider: 'cuda', maxAgeMs: 10_000, minSamples: 3,
  minSuccessRate: .95, maxLatencyMs: 100, minQualityScore: .9, minStabilityScore: .95,
};
const evidence = (capturedAt: number, latencyMs: number, successRate = 1): BenchmarkEvidence => ({
  schemaVersion: 1,
  evidenceKey: `evidence-${capturedAt}`,
  deviceCapabilityKey: 'device-key',
  modelId: manifest.modelId,
  modelVersion: manifest.version,
  manifestSha256: manifest.sha256,
  runtime: manifest.runtime,
  provider: 'cuda',
  capturedAt,
  expiresAt: capturedAt + 10_000,
  sampleCount: 3,
  coldStartMs: 50,
  warmStartMs: 20,
  latencyMs,
  ramBytes: 1024,
  vramBytes: 1024,
  energyEstimate: .1,
  successRate,
  outputDimensions: [1, 2, 2],
});

test('older passing evidence cannot mask a newer regression on the same provider', () => {
  const decision = new ModelFleetPromotionPolicy().evaluate({
    snapshot,
    deviceCapabilityKey: 'device-key',
    manifest,
    evidence: [evidence(100, 50), evidence(200, 250)],
    criteria: [criteria],
    now: 300,
  });
  assert.equal(decision.status, 'REJECTED');
  assert.ok(decision.reasons.includes('LATENCY_ABOVE_CRITERIA'));
});

test('newer passing evidence replaces an older provider regression', () => {
  const decision = new ModelFleetPromotionPolicy().evaluate({
    snapshot,
    deviceCapabilityKey: 'device-key',
    manifest,
    evidence: [evidence(100, 250), evidence(200, 50)],
    criteria: [criteria],
    now: 300,
  });
  assert.equal(decision.status, 'PROMOTED');
  assert.equal(decision.capturedAt, 200);
  assert.equal(decision.measuredLatencyMs, 50);
});
