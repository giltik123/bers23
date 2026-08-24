import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { BenchmarkEvidenceStore } from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import { InMemoryBenchmarkEvidenceBacking, InMemoryBenchmarkEvidencePort } from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidencePersistence.ts';
import { ModelFleetPromotionPolicy, type ModelPromotionCriteria } from '../src/platform/creative/local-ai/selection/ModelFleetPromotionPolicy.ts';
import type { DeviceCapabilitySnapshot, LocalModelBenchmark, ModelManifest, RuntimeCapabilities } from '../src/platform/creative/local-ai/types.ts';

const hash = { sha256: async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex') };
const runtimeCapabilities: RuntimeCapabilities = {
  ONNX_RUNTIME: true, WEBGPU: false, WASM: true, NNAPI: false,
  DIRECTML: false, CUDA: true, METAL: false, VULKAN: false,
};
const snapshot: DeviceCapabilitySnapshot = {
  schemaVersion: 1,
  capturedAt: 10,
  profile: { platform: 'LINUX', deviceClass: 'DESKTOP', tier: 'HIGH', ramMb: 16_384, vramMb: 8_192, storageFreeBytes: 1_000_000_000 },
  runtimeCapabilities,
  evidence: { observedSignals: [], unknownSignals: [], observedRuntimes: [], unknownRuntimes: [] },
};
const manifest: ModelManifest = {
  modelId: 'corruption-test', version: '1.0.0', family: 'segmentation', capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX', runtime: 'ONNX_RUNTIME', sizeBytes: 4, requiredRam: 1, requiredVram: 1,
  supportedPlatforms: ['LINUX'], supportedAccelerators: ['CUDA'], estimatedLatency: 20, qualityScore: .95,
  energyScore: .9, privacyLevel: 'PRIVATE', license: 'MIT', publisher: 'trusted', downloadUri: 'https://models.example/corruption-test.onnx',
  sha256: 'a'.repeat(64), signature: 'valid', status: 'AVAILABLE', stabilityScore: .99,
};
const benchmark: LocalModelBenchmark = {
  modelId: manifest.modelId, sampleCount: 3, coldStartMs: 30, warmStartMs: 10, latencyMs: 12,
  ramBytes: 1024, vramBytes: 1024, energyEstimate: .1, successRate: 1, outputDimensions: [1, 2, 2], provider: 'cuda',
};
const criteria: ModelPromotionCriteria = {
  tier: 'HIGH', runtime: 'ONNX_RUNTIME', provider: 'cuda', maxAgeMs: 10_000, minSamples: 3,
  minSuccessRate: .9, maxLatencyMs: 100, minQualityScore: .9, minStabilityScore: .9,
};

test('corrupted persisted benchmark evidence is discarded and cannot promote', async () => {
  const backing = new InMemoryBenchmarkEvidenceBacking();
  const port = new InMemoryBenchmarkEvidencePort(backing);
  const store = new BenchmarkEvidenceStore(port, hash, () => 100, 20_000);
  const recorded = await store.record(snapshot, manifest, benchmark);
  backing.evidence.set(recorded.evidenceKey, { ...recorded, latencyMs: Number.NaN });

  const restarted = new BenchmarkEvidenceStore(new InMemoryBenchmarkEvidencePort(backing), hash, () => 200, 20_000);
  const evidence = await restarted.all();
  assert.deepEqual(evidence, []);

  const decision = new ModelFleetPromotionPolicy().evaluate({
    snapshot,
    deviceCapabilityKey: await restarted.deviceCapabilityKey(snapshot),
    manifest,
    evidence,
    criteria: [criteria],
    now: 200,
  });
  assert.equal(decision.status, 'BENCHMARK_REQUIRED');
  assert.deepEqual(decision.reasons, ['BENCHMARK_MISSING']);
});

test('persisted benchmark evidence with a forged storage key is discarded', async () => {
  const backing = new InMemoryBenchmarkEvidenceBacking();
  const port = new InMemoryBenchmarkEvidencePort(backing);
  const store = new BenchmarkEvidenceStore(port, hash, () => 100, 20_000);
  const recorded = await store.record(snapshot, manifest, benchmark);
  backing.evidence.clear();
  backing.evidence.set('forged-key', { ...recorded, evidenceKey: 'forged-key' });

  const restarted = new BenchmarkEvidenceStore(new InMemoryBenchmarkEvidencePort(backing), hash, () => 200, 20_000);
  assert.deepEqual(await restarted.all(), []);
});
