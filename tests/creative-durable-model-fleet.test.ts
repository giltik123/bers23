import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DurableModelFleet, type FleetLifecycleStatus, type FleetVersion } from '../src/platform/creative/local-ai/lifecycle/DurableModelFleet.ts';
import {
  InMemoryFleetBacking,
  InMemoryFleetBlobs,
  InMemoryFleetMetadata,
  InMemoryFleetMutationLocks,
  InMemoryFleetReservations,
} from '../src/platform/creative/local-ai/lifecycle/InMemoryFleetStorage.ts';
import { ModelManifestVerifier, ModelSignatureVerifier, ModelTrustRegistry } from '../src/platform/creative/local-ai/trust/ModelTrust.ts';
import type { ModelManifest } from '../src/platform/creative/local-ai/types.ts';

const bytesA = new Uint8Array([1, 2, 3]);
const bytesB = new Uint8Array([4, 5, 6, 7]);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const manifest = (version = '1.0.0', bytes = bytesA, values: Partial<ModelManifest> = {}): ModelManifest => ({
  modelId: 'fleet-model',
  version,
  family: 'test',
  capabilities: ['analysis'],
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
  downloadUri: `https://models.example/${version}`,
  sha256: sha(bytes),
  signature: 'valid',
  status: 'AVAILABLE',
  stabilityScore: 1,
  ...values,
});
const verifier = () => new ModelManifestVerifier(
  new ModelTrustRegistry({ publishers: ['trusted'], formats: ['ONNX'], runtimes: ['WASM'], licenses: ['MIT'] }),
  new ModelSignatureVerifier({ verify: async (_publisher, signature) => signature === 'valid' }),
  { sha256: async (bytes) => sha(bytes) },
);
const setup = (
  capacity = 1_000,
  payloads = new Map([[manifest().downloadUri, bytesA], [manifest('2.0.0', bytesB).downloadUri, bytesB]]),
) => {
  const backing = new InMemoryFleetBacking(capacity);
  let calls = 0;
  const fetcher = {
    fetch: async (uri: string, offset: number) => {
      calls++;
      const value = payloads.get(uri);
      if (!value) throw new Error('missing payload');
      return value.slice(offset);
    },
  };
  const make = () => new DurableModelFleet(
    new InMemoryFleetMetadata(backing),
    new InMemoryFleetBlobs(backing),
    fetcher,
    verifier(),
    new InMemoryFleetMutationLocks(backing),
    new InMemoryFleetReservations(backing),
    () => 100 + calls,
    { safetyReserveBytes: 10, maxHistory: 3 },
  );
  return { backing, blobs: new InMemoryFleetBlobs(backing), make, calls: () => calls };
};

test('install survives restart only with matching trusted bytes', async () => {
  const env = setup();
  await env.make().install(manifest());
  const state = await env.make().reconcile();
  assert.equal(state.models['fleet-model'].activeVersion, '1.0.0');
  assert.equal(state.models['fleet-model'].versions['1.0.0'].status, 'READY');
});

test('persisted READY with missing or corrupt bytes is quarantined', async () => {
  for (const corrupt of [false, true]) {
    const env = setup();
    await env.make().install(manifest());
    corrupt ? env.backing.blobs.set(sha(bytesA), new Uint8Array([9])) : env.backing.blobs.delete(sha(bytesA));
    const state = await env.make().reconcile();
    assert.equal(state.models['fleet-model'].versions['1.0.0'].status, 'QUARANTINED');
  }
});

test('update atomically retains A until B activation and rollback restores exact A', async () => {
  const env = setup();
  const fleet = env.make();
  await fleet.install(manifest());
  await fleet.install(manifest('2.0.0', bytesB));
  assert.equal((await fleet.state()).models['fleet-model'].activeVersion, '2.0.0');
  const rolled = await fleet.rollback('fleet-model');
  assert.equal(rolled.version, '1.0.0');
  assert.deepEqual(await env.blobs.read(rolled.contentHash!), bytesA);
});

test('rollback fails closed for missing and corrupt prior bytes', async () => {
  for (const corrupt of [false, true]) {
    const env = setup();
    const fleet = env.make();
    await fleet.install(manifest());
    await fleet.install(manifest('2.0.0', bytesB));
    corrupt ? env.backing.blobs.set(sha(bytesA), new Uint8Array([8])) : env.backing.blobs.delete(sha(bytesA));
    await assert.rejects(() => fleet.rollback('fleet-model'), /missing, corrupt, or untrusted/);
    assert.equal((await fleet.state()).models['fleet-model'].activeVersion, '2.0.0');
  }
});

test('wrong SHA is quarantined and never activated', async () => {
  const env = setup();
  const wrong = manifest('1.0.0', bytesA, { sha256: sha(bytesB) });
  await assert.rejects(() => env.make().install(wrong));
  const record = (await env.make().state()).models['fleet-model'].versions['1.0.0'];
  assert.equal(record.status, 'QUARANTINED');
  assert.equal((await env.make().state()).models['fleet-model'].activeVersion, undefined);
  assert.equal(env.backing.partials.size, 0);
});

test('partial binding cannot cross version/hash and incomplete download is not READY', async () => {
  const one = new Uint8Array([1]);
  const env = setup(1_000, new Map([[manifest().downloadUri, one], [manifest('2.0.0', bytesB).downloadUri, bytesB]]));
  await assert.rejects(() => env.make().install(manifest()), /Incomplete/);
  const partialIds = [...env.backing.partials.keys()];
  assert.equal(partialIds.length, 1);
  await env.make().install(manifest('2.0.0', bytesB));
  assert.equal((await env.make().state()).models['fleet-model'].activeVersion, '2.0.0');
  assert.equal(partialIds[0].includes('1.0.0'), true);
});

test('peak storage reservation blocks before metadata, download, or blob mutation', async () => {
  // A three-byte model needs 3 bytes for the completed partial + 3 bytes for CAS before partial removal.
  // With a 10-byte safety reserve, capacity 15 is insufficient even though the old point-in-time check passed.
  const env = setup(15);
  await assert.rejects(() => env.make().install(manifest()), /safety reserve and concurrent reservations/);
  assert.deepEqual((await env.make().state()).models, {});
  assert.equal(env.calls(), 0);
  assert.equal(env.backing.blobs.size, 0);
  assert.equal(env.backing.partials.size, 0);
});

test('quarantine and failure count survive restart; restore fully revalidates', async () => {
  const env = setup();
  const fleet = env.make();
  await fleet.install(manifest());
  await fleet.reportFailure('fleet-model', 'runtime');
  await fleet.reportFailure('fleet-model', 'runtime');
  await fleet.reportFailure('fleet-model', 'runtime');
  assert.equal((await env.make().state()).models['fleet-model'].versions['1.0.0'].failureCount, 3);
  env.backing.blobs.set(sha(bytesA), new Uint8Array([0]));
  await assert.rejects(() => env.make().restoreQuarantined('fleet-model', true), /revalidation/);
  assert.equal((await env.make().state()).models['fleet-model'].versions['1.0.0'].status, 'QUARANTINED');
});

test('shared byte-identical blob is reused and remains until final reference removal', async () => {
  const shared = manifest('1.0.0', bytesA);
  const second = manifest('1.0.0', bytesA, { modelId: 'other-model', downloadUri: 'https://models.example/shared' });
  const env = setup(1_000, new Map([[shared.downloadUri, bytesA], [second.downloadUri, bytesA]]));
  const fleet = env.make();
  await fleet.install(shared);
  await fleet.install(second);
  assert.equal(env.backing.blobs.size, 1);
  assert.equal(env.calls(), 1, 'second manifest should reuse the already trusted CAS bytes');
  await fleet.remove('fleet-model');
  assert.equal(env.backing.blobs.size, 1);
  await fleet.remove('other-model');
  assert.equal(env.backing.blobs.size, 0);
});

test('same-model operations serialize across fleet instances while independent models progress', async () => {
  const second = manifest('1.0.0', bytesB, { modelId: 'other-model', downloadUri: 'https://models.example/other' });
  const env = setup(1_000, new Map([[manifest().downloadUri, bytesA], [second.downloadUri, bytesB]]));
  const [a, duplicate, other] = await Promise.all([
    env.make().install(manifest()),
    env.make().install(manifest()),
    env.make().install(second),
  ]);
  assert.equal(a.version, duplicate.version);
  assert.equal(other.modelId, 'other-model');
  assert.equal(env.calls(), 2, 'duplicate same-model install must not perform a second download');
  const state = await env.make().state();
  assert.equal(state.models['fleet-model'].activeVersion, '1.0.0');
  assert.equal(state.models['other-model'].activeVersion, '1.0.0');
});

test('reconcile fails closed for every interrupted lifecycle state and preserves prior active version', async () => {
  const transient: FleetLifecycleStatus[] = ['DOWNLOADING', 'UPDATING', 'VERIFYING', 'STAGED', 'ROLLING_BACK'];
  for (const status of transient) {
    const env = setup();
    const fleet = env.make();
    await fleet.install(manifest());
    const metadata = new InMemoryFleetMetadata(env.backing);
    await metadata.update((source) => {
      const next = structuredClone(source);
      const model = next.models['fleet-model'];
      const active = model.versions['1.0.0'];
      const pending: FleetVersion = {
        ...active,
        version: '2.0.0',
        manifest: manifest('2.0.0', bytesB),
        status,
        contentHash: status === 'STAGED' ? sha(bytesB) : undefined,
        installedBytes: status === 'STAGED' ? bytesB.byteLength : 0,
        transactionId: `interrupted:${status}`,
      };
      (model.versions as Record<string, FleetVersion>)['2.0.0'] = pending;
      return { ...next, revision: next.revision + 1 };
    });
    const recovered = await env.make().reconcile();
    assert.equal(recovered.models['fleet-model'].activeVersion, '1.0.0');
    assert.equal(recovered.models['fleet-model'].versions['1.0.0'].status, 'READY');
    assert.equal(recovered.models['fleet-model'].versions['2.0.0'].status, 'FAILED');
    assert.match(recovered.models['fleet-model'].versions['2.0.0'].lastFailureReason ?? '', /interrupted/);
  }
});

test('fleet state has no provider, billing, project, or artifact authority', async () => {
  const env = setup();
  await env.make().install(manifest());
  const serialized = JSON.stringify(await env.make().state()).toLowerCase();
  for (const forbidden of ['credential', 'billing', 'projectid', 'artifactid', 'privatekey']) assert.equal(serialized.includes(forbidden), false);
});
