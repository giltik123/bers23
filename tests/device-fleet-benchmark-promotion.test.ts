import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { BenchmarkEvidenceStore, type BenchmarkEvidence } from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import {
  InMemoryBenchmarkEvidenceBacking,
  InMemoryBenchmarkEvidencePort,
  IndexedDbBenchmarkEvidencePort,
} from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidencePersistence.ts';
import {
  ModelFleetPromotionPolicy,
  type ModelPromotionCriteria,
} from '../src/platform/creative/local-ai/selection/ModelFleetPromotionPolicy.ts';
import type {
  DeviceCapabilitySnapshot,
  LocalModelBenchmark,
  ModelManifest,
  RuntimeCapabilities,
} from '../src/platform/creative/local-ai/types.ts';

const MIB = 1024 * 1024;
const hash = { sha256: async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex') };
const runtimes = (values: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities => ({
  ONNX_RUNTIME: true,
  WEBGPU: false,
  WASM: true,
  NNAPI: false,
  DIRECTML: false,
  CUDA: true,
  METAL: false,
  VULKAN: false,
  ...values,
});
const snapshot = (values: Partial<DeviceCapabilitySnapshot['profile']> = {}, runtime = runtimes(), capturedAt = 10): DeviceCapabilitySnapshot => ({
  schemaVersion: 1,
  capturedAt,
  profile: {
    platform: 'LINUX',
    deviceClass: 'DESKTOP',
    tier: 'HIGH',
    ramMb: 16_384,
    vramMb: 8_192,
    storageFreeBytes: 50_000_000_000,
    ...values,
  },
  runtimeCapabilities: runtime,
  evidence: { observedSignals: [], unknownSignals: [], observedRuntimes: [], unknownRuntimes: [] },
});
const manifest = (values: Partial<ModelManifest> = {}): ModelManifest => ({
  modelId: 'segment-bench',
  version: '1.2.0',
  family: 'segment',
  capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX',
  runtime: 'ONNX_RUNTIME',
  sizeBytes: 4,
  requiredRam: 512,
  requiredVram: 512,
  supportedPlatforms: ['LINUX'],
  supportedAccelerators: ['ONNX_RUNTIME', 'CUDA'],
  estimatedLatency: 80,
  qualityScore: .92,
  energyScore: .8,
  privacyLevel: 'PRIVATE',
  license: 'Apache-2.0',
  publisher: 'trusted',
  downloadUri: 'https://models.example/segment-bench-1.2.0.onnx',
  sha256: 'a'.repeat(64),
  signature: 'signed',
  status: 'AVAILABLE',
  stabilityScore: .96,
  ...values,
});
const benchmark = (values: Partial<LocalModelBenchmark> = {}): LocalModelBenchmark => ({
  modelId: 'segment-bench',
  sampleCount: 3,
  coldStartMs: 250,
  warmStartMs: 60,
  latencyMs: 70,
  ramBytes: 800 * MIB,
  vramBytes: 600 * MIB,
  energyEstimate: .4,
  successRate: 1,
  outputDimensions: [1, 256, 256],
  provider: 'cuda',
  ...values,
});
const criteria = (values: Partial<ModelPromotionCriteria> = {}): ModelPromotionCriteria => ({
  tier: 'HIGH',
  runtime: 'ONNX_RUNTIME',
  provider: 'cuda',
  maxAgeMs: 1_000,
  minSamples: 3,
  minSuccessRate: .95,
  maxLatencyMs: 100,
  maxColdStartMs: 500,
  maxRamBytes: 2_000 * MIB,
  maxVramBytes: 2_000 * MIB,
  maxEnergyEstimate: 1,
  minQualityScore: .9,
  minStabilityScore: .95,
  ...values,
});

async function recorded(now = 100, ttlMs = 5_000) {
  const backing = new InMemoryBenchmarkEvidenceBacking();
  const store = new BenchmarkEvidenceStore(new InMemoryBenchmarkEvidencePort(backing), hash, () => now, ttlMs);
  const device = snapshot();
  const model = manifest();
  const evidence = await store.record(device, model, benchmark());
  return { backing, store, device, model, evidence, deviceKey: await store.deviceCapabilityKey(device) };
}

test('benchmark evidence survives restart and remains exact-version/runtime/SHA bound', async () => {
  const env = await recorded();
  const restarted = new BenchmarkEvidenceStore(new InMemoryBenchmarkEvidencePort(env.backing), hash, () => 200, 5_000);
  const found = await restarted.forBinding(env.device, env.model);
  assert.equal(found.length, 1);
  assert.equal(found[0].modelVersion, '1.2.0');
  assert.equal(found[0].manifestSha256, env.model.sha256);
  assert.equal(found[0].runtime, 'ONNX_RUNTIME');
  assert.equal(found[0].provider, 'cuda');
  assert.equal(found[0].sampleCount, 3);
});

test('device capability key excludes capture time and storage volatility but changes with compute evidence', async () => {
  const store = new BenchmarkEvidenceStore(new InMemoryBenchmarkEvidencePort(), hash);
  const base = await store.deviceCapabilityKey(snapshot({}, runtimes(), 10));
  const laterMoreStorage = await store.deviceCapabilityKey(snapshot({ storageFreeBytes: 99_000_000_000 }, runtimes(), 99_999));
  assert.equal(base, laterMoreStorage, 'benchmark identity must not expire merely because disk free space changed');
  assert.notEqual(base, await store.deviceCapabilityKey(snapshot({ tier: 'MEDIUM' })));
  assert.notEqual(base, await store.deviceCapabilityKey(snapshot({}, runtimes({ CUDA: false }))));
});

test('good exact fresh evidence promotes only under explicit criteria', async () => {
  const env = await recorded();
  const policy = new ModelFleetPromotionPolicy();
  const promoted = policy.evaluate({
    snapshot: env.device,
    deviceCapabilityKey: env.deviceKey,
    manifest: env.model,
    evidence: [env.evidence],
    criteria: [criteria()],
    now: 200,
  });
  assert.equal(promoted.status, 'PROMOTED');
  assert.equal(promoted.evidenceKey, env.evidence.evidenceKey);
  assert.equal(promoted.provider, 'cuda');

  const noCriteria = policy.evaluate({
    snapshot: env.device,
    deviceCapabilityKey: env.deviceKey,
    manifest: env.model,
    evidence: [env.evidence],
    criteria: [],
    now: 200,
  });
  assert.equal(noCriteria.status, 'BENCHMARK_REQUIRED');
  assert.deepEqual(noCriteria.reasons, ['NO_PROMOTION_CRITERIA']);
});

test('version, SHA, runtime or device-key mismatch cannot promote', async () => {
  const env = await recorded();
  const policy = new ModelFleetPromotionPolicy();
  const cases: BenchmarkEvidence[] = [
    { ...env.evidence, modelVersion: '9.9.9' },
    { ...env.evidence, manifestSha256: 'b'.repeat(64) },
    { ...env.evidence, runtime: 'WASM' },
    { ...env.evidence, deviceCapabilityKey: 'other-device-key' },
  ];
  for (const evidence of cases) {
    const result = policy.evaluate({
      snapshot: env.device,
      deviceCapabilityKey: env.deviceKey,
      manifest: env.model,
      evidence: [evidence],
      criteria: [criteria()],
      now: 200,
    });
    assert.equal(result.status, 'BENCHMARK_REQUIRED');
    assert.deepEqual(result.reasons, ['BINDING_MISMATCH']);
  }
});

test('stale and future evidence stay non-authorizing', async () => {
  const env = await recorded(100, 500);
  const policy = new ModelFleetPromotionPolicy();
  const stale = policy.evaluate({ snapshot: env.device, deviceCapabilityKey: env.deviceKey, manifest: env.model, evidence: [env.evidence], criteria: [criteria({ maxAgeMs: 400 })], now: 1_000 });
  assert.equal(stale.status, 'STALE');
  assert.ok(stale.reasons.includes('BENCHMARK_STALE'));

  const future = policy.evaluate({ snapshot: env.device, deviceCapabilityKey: env.deviceKey, manifest: env.model, evidence: [{ ...env.evidence, capturedAt: 500, expiresAt: 1_500 }], criteria: [criteria()], now: 200 });
  assert.equal(future.status, 'STALE');
  assert.deepEqual(future.reasons, ['BENCHMARK_FROM_FUTURE']);
});

test('poor measured evidence and manifest quality/stability reject deterministically without fabricated quality measurements', async () => {
  const env = await recorded();
  const poor: BenchmarkEvidence = {
    ...env.evidence,
    sampleCount: 2,
    successRate: .5,
    latencyMs: 200,
    coldStartMs: 900,
    ramBytes: 3_000 * MIB,
    vramBytes: 3_000 * MIB,
    energyEstimate: 2,
  };
  const result = new ModelFleetPromotionPolicy().evaluate({
    snapshot: env.device,
    deviceCapabilityKey: env.deviceKey,
    manifest: manifest({ qualityScore: .7, stabilityScore: .8 }),
    evidence: [poor],
    criteria: [criteria()],
    now: 200,
  });
  assert.equal(result.status, 'REJECTED');
  for (const reason of [
    'INSUFFICIENT_SAMPLES',
    'SUCCESS_RATE_BELOW_CRITERIA',
    'LATENCY_ABOVE_CRITERIA',
    'COLD_START_ABOVE_CRITERIA',
    'RAM_ABOVE_CRITERIA',
    'VRAM_ABOVE_CRITERIA',
    'ENERGY_ABOVE_CRITERIA',
    'QUALITY_BELOW_CRITERIA',
    'STABILITY_BELOW_CRITERIA',
  ] as const) assert.ok(result.reasons.includes(reason), `missing ${reason}`);
});

test('unknown device evidence and unsafe lifecycle status cannot be rescued by a good benchmark', async () => {
  const env = await recorded();
  const policy = new ModelFleetPromotionPolicy();
  const unknown = policy.evaluate({ snapshot: snapshot({ tier: 'UNKNOWN' }), deviceCapabilityKey: env.deviceKey, manifest: env.model, evidence: [env.evidence], criteria: [criteria()], now: 200 });
  assert.equal(unknown.status, 'REJECTED');
  assert.deepEqual(unknown.reasons, ['UNKNOWN_DEVICE_EVIDENCE']);

  const quarantined = policy.evaluate({ snapshot: env.device, deviceCapabilityKey: env.deviceKey, manifest: manifest({ status: 'QUARANTINED' }), evidence: [env.evidence], criteria: [criteria()], now: 200 });
  assert.equal(quarantined.status, 'REJECTED');
  assert.deepEqual(quarantined.reasons, ['UNSAFE_MODEL_STATUS']);
});

test('evidence contains no raw fingerprint, scope, billing, credential or canonical artifact authority', async () => {
  const env = await recorded();
  const serialized = JSON.stringify(env.evidence).toLowerCase();
  for (const forbidden of ['tenantid', 'projectid', 'userid', 'billing', 'credential', 'artifactid', 'privatekey', 'gpu', 'browser', 'npu', 'architecture']) {
    assert.equal(serialized.includes(forbidden), false, `evidence leaked forbidden marker ${forbidden}`);
  }
});

test('IndexedDB benchmark evidence write resolves only after transaction commit', async () => {
  const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  let openRequest: any;
  let writeRequest: any;
  let transaction: any;
  const fakeDb = {
    transaction: () => {
      transaction = {
        error: null,
        oncomplete: null,
        onabort: null,
        onerror: null,
        abort() { this.onabort?.(); },
        objectStore: () => ({
          put: () => {
            writeRequest = { result: 'key', error: null, onsuccess: null, onerror: null };
            return writeRequest;
          },
        }),
      };
      return transaction;
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open: () => {
        openRequest = { result: fakeDb, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        return openRequest;
      },
    },
  });

  try {
    const env = await recorded();
    const port = new IndexedDbBenchmarkEvidencePort('benchmark-commit-test');
    let resolved = false;
    const pending = port.put(env.evidence).then(() => { resolved = true; });
    openRequest.onsuccess?.();
    for (let index = 0; index < 4 && !writeRequest; index += 1) await Promise.resolve();
    assert.ok(writeRequest);
    writeRequest.onsuccess?.();
    await Promise.resolve();
    assert.equal(resolved, false, 'IDBRequest success is not a durable commit boundary');
    transaction.oncomplete?.();
    await pending;
    assert.equal(resolved, true);
  } finally {
    if (originalIndexedDb) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
