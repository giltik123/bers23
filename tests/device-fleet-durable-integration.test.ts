import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalAIPlatform } from '../src/platform/creative/local-ai/LocalAIPlatform.ts';
import {
  InMemoryFleetBacking,
  InMemoryFleetBlobs,
  InMemoryFleetMetadata,
  InMemoryFleetMutationLocks,
  InMemoryFleetReservations,
} from '../src/platform/creative/local-ai/lifecycle/InMemoryFleetStorage.ts';
import type { LocalAIDependencies, ModelManifest } from '../src/platform/creative/local-ai/types.ts';

const MIB = 1024 * 1024;
const digest = 'a'.repeat(64);
const bytes = new Uint8Array([1, 2, 3, 4]);

const manifest = (version: string, overrides: Partial<ModelManifest> = {}): ModelManifest => ({
  modelId: 'versioned-segment',
  version,
  family: 'segmentation',
  capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX',
  runtime: 'ONNX_RUNTIME',
  sizeBytes: bytes.byteLength,
  requiredRam: 512,
  requiredVram: 0,
  supportedPlatforms: ['LINUX'],
  supportedAccelerators: ['ONNX_RUNTIME'],
  estimatedLatency: 50,
  qualityScore: 0.9,
  energyScore: 0.9,
  privacyLevel: 'PRIVATE',
  license: 'Apache-2.0',
  publisher: 'trusted-publisher',
  downloadUri: `https://models.example/versioned-segment-${version}.onnx`,
  sha256: digest,
  signature: `signature-${version}`,
  status: 'AVAILABLE',
  stabilityScore: 0.95,
  ...overrides,
});

const trustPolicy = {
  publishers: ['trusted-publisher'],
  formats: ['ONNX'] as const,
  runtimes: ['ONNX_RUNTIME'] as const,
  licenses: ['Apache-2.0'],
};

function setup(capacityBytes: number, catalog: readonly ModelManifest[]) {
  const backing = new InMemoryFleetBacking(capacityBytes);
  const lifecycle = {
    metadata: new InMemoryFleetMetadata(backing),
    blobs: new InMemoryFleetBlobs(backing),
    mutationLocks: new InMemoryFleetMutationLocks(backing),
    reservations: new InMemoryFleetReservations(backing),
    policy: { safetyReserveBytes: 1, maxHistory: 2 },
  };
  let fetchCalls = 0;
  let legacyWrites = 0;
  const legacy = new Map<string, Uint8Array>();
  const dependencies: LocalAIDependencies = {
    id: () => 'id',
    clock: () => 1_000,
    random: () => 0.5,
    deviceProvider: {
      signals: async () => ({
        platform: 'LINUX', deviceClass: 'DESKTOP', cpuCores: 12, ramMb: 16_384,
        vramMb: 8_192, cuda: true, wasm: true, storageFreeBytes: 10_000 * MIB,
        batteryPercent: 100, powerState: 'CHARGING', thermalState: 'NORMAL', network: 'ONLINE',
        ramPressure: 'NORMAL', backgroundRestricted: false,
      }),
    },
    runtimeProbe: { detect: async () => true },
    fetch: {
      fetch: async (_uri, offset, signal) => {
        if (signal.aborted) throw new Error('aborted');
        fetchCalls += 1;
        return bytes.slice(offset);
      },
    },
    storage: {
      freeBytes: async () => 10_000 * MIB,
      read: async (id) => legacy.get(id),
      write: async (id, value) => { legacyWrites += 1; legacy.set(id, value); },
      remove: async (id) => { legacy.delete(id); },
    },
    hash: { sha256: async () => digest },
    signatureVerifier: { verify: async (publisher) => publisher === 'trusted-publisher' },
    modelCatalog: catalog,
  };
  return {
    backing,
    lifecycle,
    platform: new LocalAIPlatform(dependencies, trustPolicy, lifecycle),
    calls: () => ({ fetchCalls, legacyWrites }),
  };
}

test('combined planner uses durable CAS capacity rather than permissive legacy storage evidence', async () => {
  const env = setup(200 * MIB, [manifest('1.0.0')]);
  const recommendation = await env.platform.recommendFleet();
  assert.equal(recommendation.freeBytes, 200 * MIB);
  assert.equal(recommendation.status, 'BLOCKED_STORAGE');
  assert.deepEqual(env.calls(), { fetchCalls: 0, legacyWrites: 0 });
});

test('exact-version recommendation installs through durable CAS without legacy storage writes', async () => {
  const v1 = manifest('1.0.0');
  const v2 = manifest('1.2.0');
  const env = setup(512 * MIB, [v1, v2]);

  const recommendation = await env.platform.recommendFleet({ bootstrapCapabilities: ['SEGMENTATION'] });
  assert.equal(recommendation.status, 'READY');
  assert.deepEqual(recommendation.modelBindings, [{ modelId: 'versioned-segment', version: '1.2.0' }]);

  const installed = await env.platform.installRecommendedBundle();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].version, '1.2.0');
  assert.deepEqual(env.calls(), { fetchCalls: 1, legacyWrites: 0 });

  const durable = await env.lifecycle.metadata.read();
  assert.equal(durable?.models['versioned-segment']?.activeVersion, '1.2.0');
  assert.equal(durable?.models['versioned-segment']?.versions['1.2.0']?.status, 'READY');
  assert.equal(env.backing.blobs.size, 1);
});

test('untrusted combined recommendation cannot trigger durable or legacy mutation', async () => {
  const attacker = manifest('2.0.0', { publisher: 'attacker' });
  const env = setup(512 * MIB, [attacker]);
  const recommendation = await env.platform.recommendFleet({ bootstrapCapabilities: ['SEGMENTATION'] });
  assert.equal(recommendation.modelIds.length, 0);
  assert.ok(recommendation.exclusions[0]?.reasons.includes('UNTRUSTED_MANIFEST'));
  assert.deepEqual(await env.platform.installRecommendedBundle(), []);
  assert.deepEqual(env.calls(), { fetchCalls: 0, legacyWrites: 0 });
  assert.equal((await env.lifecycle.metadata.read())?.models['versioned-segment'], undefined);
});
