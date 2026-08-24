import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { LocalAIPlatform, type LocalAIPlatformBenchmarking } from '../src/platform/creative/local-ai/LocalAIPlatform.ts';
import {
  InMemoryBenchmarkEvidenceBacking,
  InMemoryBenchmarkEvidencePort,
} from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidencePersistence.ts';
import type { ModelPromotionCriteria } from '../src/platform/creative/local-ai/selection/ModelFleetPromotionPolicy.ts';
import type { LocalAIDependencies, ModelFleetRecommendationPolicy, ModelManifest } from '../src/platform/creative/local-ai/types.ts';

const bytes = new Uint8Array([1, 2, 3, 4]);
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const recommendationPolicy: ModelFleetRecommendationPolicy = { bootstrapCapabilities: ['SEGMENTATION'] };
const model: ModelManifest = {
  modelId: 'benchmark-platform-model',
  version: '1.0.0',
  family: 'segmentation',
  capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX',
  runtime: 'WEBGPU',
  sizeBytes: bytes.byteLength,
  requiredRam: 1,
  requiredVram: 0,
  supportedPlatforms: ['BROWSER'],
  supportedAccelerators: ['WEBGPU'],
  estimatedLatency: 50,
  qualityScore: .95,
  energyScore: .9,
  privacyLevel: 'PRIVATE',
  license: 'MIT',
  publisher: 'trusted',
  downloadUri: 'https://models.example/benchmark-platform-model-1.0.0.onnx',
  sha256: sha256(bytes),
  signature: 'valid',
  status: 'AVAILABLE',
  stabilityScore: .99,
};
const trustPolicy = {
  publishers: ['trusted'],
  formats: ['ONNX'] as const,
  runtimes: ['WEBGPU'] as const,
  licenses: ['MIT'],
};
const promotionCriteria: ModelPromotionCriteria = {
  tier: 'HIGH',
  runtime: 'WEBGPU',
  provider: 'webgpu',
  maxAgeMs: 60_000,
  minSamples: 3,
  minSuccessRate: 1,
  maxLatencyMs: 1_000,
  maxColdStartMs: 1_000,
  maxRamBytes: 16 * 1024 * 1024,
  maxVramBytes: 1,
  maxEnergyEstimate: 1,
  minQualityScore: .9,
  minStabilityScore: .95,
};

function harness() {
  let now = 0;
  let fetches = 0;
  let writes = 0;
  const storage = new Map<string, Uint8Array>();
  const evidenceBacking = new InMemoryBenchmarkEvidenceBacking();
  const evidencePort = () => new InMemoryBenchmarkEvidencePort(evidenceBacking);
  const dependencies = (): LocalAIDependencies => ({
    id: () => `id-${++now}`,
    clock: () => { now += 10; return now; },
    random: () => .5,
    deviceProvider: {
      signals: async () => ({
        platform: 'BROWSER',
        deviceClass: 'BROWSER',
        cpuCores: 8,
        ramMb: 16_384,
        gpu: 'browser-gpu',
        vramMb: 0,
        npu: 'UNKNOWN',
        architecture: 'x64',
        browser: 'test',
        webgpu: true,
        wasm: true,
        webnn: false,
        cuda: false,
        directml: false,
        metal: false,
        vulkan: false,
        storageFreeBytes: 1_000_000_000,
        batteryPercent: 100,
        powerState: 'FULL',
        thermalState: 'NORMAL',
        network: 'ONLINE',
        ramPressure: 'NORMAL',
        backgroundRestricted: false,
      }),
    },
    runtimeProbe: { detect: async (kind) => kind === 'WEBGPU' || kind === 'WASM' || kind === 'ONNX_RUNTIME' },
    fetch: {
      fetch: async (uri, offset) => {
        fetches += 1;
        if (uri !== model.downloadUri) throw new Error(`unexpected uri ${uri}`);
        return bytes.slice(offset);
      },
    },
    storage: {
      freeBytes: async () => 1_000_000_000,
      read: async (id) => storage.get(id)?.slice(),
      write: async (id, value) => { writes += 1; storage.set(id, value.slice()); },
      remove: async (id) => { storage.delete(id); },
    },
    hash: { sha256: async (value) => sha256(value) },
    signatureVerifier: { verify: async (_publisher, signature, digest) => signature === 'valid' && digest === model.sha256 },
    onnxSessionFactory: {
      create: async () => ({
        run: async () => ({ mask: { data: new Float32Array([1, 1, 1, 1]), dims: [1, 2, 2] } }),
        release: async () => undefined,
      }),
    },
    modelCatalog: [model],
  });
  const benchmarking = (): LocalAIPlatformBenchmarking => ({
    evidence: evidencePort(),
    criteria: [promotionCriteria],
    ttlMs: 120_000,
  });
  return {
    dependencies,
    benchmarking,
    evidencePort,
    fetches: () => fetches,
    writes: () => writes,
  };
}

test('LocalAIPlatform persists benchmark evidence across restart and gates promoted recommendation without mutation', async () => {
  const env = harness();
  const first = new LocalAIPlatform(env.dependencies(), trustPolicy, undefined, env.benchmarking());
  assert.equal(first.durableBenchmarkEvidenceEnabled(), true);

  const beforeEvidence = await first.recommendFleet(recommendationPolicy, { requirePromotion: true });
  assert.equal(beforeEvidence.status, 'NO_COMPATIBLE_MODELS');
  assert.ok(beforeEvidence.exclusions[0]?.reasons.includes('BENCHMARK_REQUIRED'));

  const bootstrap = await first.recommendFleet(recommendationPolicy);
  assert.equal(bootstrap.status, 'READY');
  assert.deepEqual(bootstrap.modelBindings, [{ modelId: model.modelId, version: model.version }]);

  await first.installModel(model);
  const measured = await first.benchmarkModel(model.modelId, { requestId: 'benchmark', inputs: {} });
  assert.equal(measured.sampleCount, 3);
  assert.equal(measured.provider, 'webgpu');
  assert.equal((await env.evidencePort().list()).length, 1);

  const restarted = new LocalAIPlatform(env.dependencies(), trustPolicy, undefined, env.benchmarking());
  const fetchesBeforeRecommendation = env.fetches();
  const writesBeforeRecommendation = env.writes();
  const promoted = await restarted.recommendFleet(recommendationPolicy, { requirePromotion: true });
  assert.equal(promoted.status, 'READY');
  assert.deepEqual(promoted.modelBindings, [{ modelId: model.modelId, version: model.version }]);
  assert.equal(env.fetches(), fetchesBeforeRecommendation, 'recommendation must not download model bytes');
  assert.equal(env.writes(), writesBeforeRecommendation, 'recommendation must not mutate model storage');

  await first.removeModel(model.modelId);
  assert.equal((await env.evidencePort().list()).length, 0, 'full uninstall must clear benchmark evidence for the model');

  const afterRemoval = new LocalAIPlatform(env.dependencies(), trustPolicy, undefined, env.benchmarking());
  const blockedAgain = await afterRemoval.recommendFleet(recommendationPolicy, { requirePromotion: true });
  assert.equal(blockedAgain.status, 'NO_COMPATIBLE_MODELS');
  assert.ok(blockedAgain.exclusions[0]?.reasons.includes('BENCHMARK_REQUIRED'));
});

test('promotion-required recommendation fails closed when B3 evidence composition is absent', async () => {
  const env = harness();
  const platform = new LocalAIPlatform(env.dependencies(), trustPolicy);
  const bootstrap = await platform.recommendFleet(recommendationPolicy);
  assert.equal(bootstrap.status, 'READY');

  const promoted = await platform.recommendFleet(recommendationPolicy, { requirePromotion: true });
  assert.equal(promoted.status, 'NO_COMPATIBLE_MODELS');
  assert.ok(promoted.exclusions[0]?.reasons.includes('BENCHMARK_REQUIRED'));
});
