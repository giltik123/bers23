import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DurableModelFleet } from '../src/platform/creative/local-ai/lifecycle/DurableModelFleet.ts';
import {
  InMemoryFleetBacking,
  InMemoryFleetBlobs,
  InMemoryFleetMetadata,
  InMemoryFleetMutationLocks,
  InMemoryFleetReservations,
} from '../src/platform/creative/local-ai/lifecycle/InMemoryFleetStorage.ts';
import { ModelManifestVerifier, ModelSignatureVerifier, ModelTrustRegistry } from '../src/platform/creative/local-ai/trust/ModelTrust.ts';
import type { ModelManifest } from '../src/platform/creative/local-ai/types.ts';

const bytes = new Uint8Array([1, 2, 3, 4]);
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const model = (overrides: Partial<ModelManifest> = {}): ModelManifest => ({
  modelId: 'authority-model',
  version: '1.0.0',
  family: 'test',
  capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX',
  runtime: 'WASM',
  sizeBytes: bytes.byteLength,
  requiredRam: 1,
  requiredVram: 0,
  supportedPlatforms: ['BROWSER'],
  supportedAccelerators: ['WASM'],
  estimatedLatency: 1,
  qualityScore: 1,
  energyScore: 1,
  privacyLevel: 'PRIVATE',
  license: 'MIT',
  publisher: 'trusted',
  downloadUri: 'https://models.example/authority-model-1.0.0.onnx',
  sha256: sha(bytes),
  signature: 'valid',
  status: 'AVAILABLE',
  stabilityScore: 1,
  ...overrides,
});

function setup() {
  const backing = new InMemoryFleetBacking(1_000_000);
  const metadata = new InMemoryFleetMetadata(backing);
  const blobs = new InMemoryFleetBlobs(backing);
  let trusted = true;
  let fetchCalls = 0;
  const verifier = new ModelManifestVerifier(
    new ModelTrustRegistry({ publishers: ['trusted'], formats: ['ONNX'], runtimes: ['WASM'], licenses: ['MIT'] }),
    new ModelSignatureVerifier({ verify: async () => trusted }),
    { sha256: async (value) => sha(value) },
  );
  const fleet = new DurableModelFleet(
    metadata,
    blobs,
    { fetch: async (_uri, offset) => { fetchCalls += 1; return bytes.slice(offset); } },
    verifier,
    new InMemoryFleetMutationLocks(backing),
    new InMemoryFleetReservations(backing),
    () => 100 + fetchCalls,
    { safetyReserveBytes: 1, maxHistory: 2 },
  );
  return { backing, blobs, fleet, metadata, setTrusted: (value: boolean) => { trusted = value; }, fetchCalls: () => fetchCalls };
}

test('modelId@version is immutable and cannot be rebound to another manifest identity', async () => {
  const env = setup();
  const original = model();
  await env.fleet.install(original);
  const before = await env.fleet.state();

  const rebound = model({ downloadUri: 'https://models.example/rebound.onnx', signature: 'valid' });
  await assert.rejects(() => env.fleet.install(rebound), /manifest binding is immutable/);

  const after = await env.fleet.state();
  assert.equal(env.fetchCalls(), 1, 'rebound manifest must be rejected before network mutation');
  assert.equal(after.models['authority-model'].activeVersion, '1.0.0');
  assert.equal(after.models['authority-model'].versions['1.0.0'].status, 'READY');
  assert.equal(after.models['authority-model'].versions['1.0.0'].manifest.downloadUri, original.downloadUri);
  assert.deepEqual(after, before, 'immutable-version rejection must not mutate durable authority state');
});

test('ordinary install cannot clear runtime quarantine; explicit restore is required', async () => {
  const env = setup();
  const manifest = model();
  await env.fleet.install(manifest);
  await env.fleet.reportFailure(manifest.modelId, 'runtime');
  await env.fleet.reportFailure(manifest.modelId, 'runtime');
  await env.fleet.reportFailure(manifest.modelId, 'runtime');
  assert.equal((await env.fleet.state()).models[manifest.modelId].versions[manifest.version].status, 'QUARANTINED');

  await assert.rejects(() => env.fleet.install(manifest), /explicit recovery/);
  await assert.rejects(() => env.fleet.restoreQuarantined(manifest.modelId, false), /Explicit recovery policy/);
  assert.equal(env.fetchCalls(), 1, 'quarantined retry must not redownload or silently repair');

  const restored = await env.fleet.restoreQuarantined(manifest.modelId, true);
  assert.equal(restored.status, 'READY');
  assert.equal(restored.failureCount, 0);
  assert.equal(env.fetchCalls(), 1);
});

test('trust-policy quarantine preserves existing CAS bytes for explicit revalidation', async () => {
  const env = setup();
  const manifest = model();
  const installed = await env.fleet.install(manifest);
  const contentHash = installed.contentHash!;
  const installedBytes = installed.installedBytes;

  env.setTrusted(false);
  await assert.rejects(() => env.fleet.install(manifest));
  const quarantined = (await env.fleet.state()).models[manifest.modelId].versions[manifest.version];
  assert.equal(quarantined.status, 'QUARANTINED');
  assert.equal(quarantined.contentHash, contentHash);
  assert.equal(quarantined.installedBytes, installedBytes);
  assert.deepEqual(await env.blobs.read(contentHash), bytes);

  env.setTrusted(true);
  await assert.rejects(() => env.fleet.install(manifest), /explicit recovery/);
  const restored = await env.fleet.restoreQuarantined(manifest.modelId, true);
  assert.equal(restored.status, 'READY');
  assert.equal(env.fetchCalls(), 1, 'explicit recovery revalidates existing CAS without network fetch');
});
