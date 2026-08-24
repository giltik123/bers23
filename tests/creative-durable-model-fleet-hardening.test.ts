import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DurableModelFleet, type FleetState } from '../src/platform/creative/local-ai/lifecycle/DurableModelFleet.ts';
import { BrowserFleetMutationLocks, IndexedDbFleetBlobs } from '../src/platform/creative/local-ai/lifecycle/IndexedDbFleetStorage.ts';
import { InMemoryFleetBacking, InMemoryFleetBlobs, InMemoryFleetMetadata, InMemoryFleetMutationLocks, InMemoryFleetReservations } from '../src/platform/creative/local-ai/lifecycle/InMemoryFleetStorage.ts';
import { ModelManifestVerifier, ModelSignatureVerifier, ModelTrustRegistry } from '../src/platform/creative/local-ai/trust/ModelTrust.ts';
import type { ModelManifest } from '../src/platform/creative/local-ai/types.ts';

const bytes = new Uint8Array([7, 8, 9]);
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const manifest: ModelManifest = {
  modelId: 'legacy-model', version: '1.0.0', family: 'test', capabilities: ['analysis'], modelFormat: 'ONNX', runtime: 'WASM',
  sizeBytes: bytes.byteLength, requiredRam: 1, requiredVram: 0, supportedPlatforms: ['BROWSER'], supportedAccelerators: ['WASM'],
  estimatedLatency: 1, qualityScore: 1, energyScore: 1, privacyLevel: 'PRIVATE', license: 'MIT', publisher: 'trusted',
  downloadUri: 'https://models.example/legacy-model-1.0.0', sha256: sha256(bytes), signature: 'valid', status: 'AVAILABLE', stabilityScore: 1,
};
const verifier = () => new ModelManifestVerifier(
  new ModelTrustRegistry({ publishers: ['trusted'], formats: ['ONNX'], runtimes: ['WASM'], licenses: ['MIT'] }),
  new ModelSignatureVerifier({ verify: async (_publisher, signature) => signature === 'valid' }),
  { sha256: async (value) => sha256(value) },
);

test('prerelease READY metadata without hardened binding is quarantined, then recovers from trusted CAS without network', async () => {
  const backing = new InMemoryFleetBacking(1_000);
  backing.blobs.set(manifest.sha256, bytes.slice());
  // This intentionally models the exact pre-hardening PR #140 persisted shape: READY + CAS but no manifestBinding.
  backing.state = {
    schemaVersion: 1,
    revision: 1,
    models: {
      [manifest.modelId]: {
        modelId: manifest.modelId,
        activeVersion: manifest.version,
        history: [],
        versions: {
          [manifest.version]: {
            modelId: manifest.modelId,
            version: manifest.version,
            manifest,
            manifestId: `${manifest.publisher}/${manifest.modelId}@${manifest.version}`,
            expectedSha256: manifest.sha256,
            contentHash: manifest.sha256,
            installedBytes: bytes.byteLength,
            status: 'READY',
            failureCount: 0,
            createdAt: 1,
            updatedAt: 1,
            activatedAt: 1,
          },
        },
      },
    },
  } as unknown as FleetState;

  let fetchCalls = 0;
  const fleet = new DurableModelFleet(
    new InMemoryFleetMetadata(backing),
    new InMemoryFleetBlobs(backing),
    { fetch: async () => { fetchCalls++; return bytes.slice(); } },
    verifier(),
    new InMemoryFleetMutationLocks(backing),
    new InMemoryFleetReservations(backing),
    () => 100,
    { safetyReserveBytes: 10, maxHistory: 2 },
  );

  const reconciled = await fleet.reconcile();
  assert.equal(reconciled.models[manifest.modelId].versions[manifest.version].status, 'QUARANTINED');
  assert.equal(reconciled.models[manifest.modelId].activeVersion, manifest.version, 'quarantine keeps identity but removes execution eligibility');

  const recovered = await fleet.install(manifest);
  assert.equal(recovered.status, 'READY');
  assert.equal(fetchCalls, 0, 'trusted existing CAS bytes should be revalidated and reused without redownload');
});

test('browser durable mutation lock fails closed when cross-context Web Locks are unavailable', async () => {
  let ran = false;
  const locks = new BrowserFleetMutationLocks();
  await assert.rejects(
    () => locks.runExclusive('model:x', async () => { ran = true; }),
    /Web Locks are required/,
  );
  assert.equal(ran, false);
});

test('browser durable mutation lock delegates exact model key to the supplied cross-context lock manager', async () => {
  const names: string[] = [];
  const locks = new BrowserFleetMutationLocks({
    request: async (name, options, operation) => {
      names.push(`${name}:${options.mode}`);
      return operation();
    },
  });
  const value = await locks.runExclusive('model:alpha', async () => 42);
  assert.equal(value, 42);
  assert.deepEqual(names, ['bers:local-model-fleet:model:alpha:exclusive']);
});

test('IndexedDB fleet blob write resolves only after the transaction commits', async () => {
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
            writeRequest = { result: 'blob-key', error: null, onsuccess: null, onerror: null };
            return writeRequest;
          },
        }),
      };
      return transaction;
    },
  };
  const fakeIndexedDb = {
    open: () => {
      openRequest = { result: fakeDb, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      return openRequest;
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fakeIndexedDb });

  try {
    const blobs = new IndexedDbFleetBlobs('commit-barrier-test', async () => ({ quota: 1_000, usage: 0 }));
    let resolved = false;
    const pending = blobs.put('hash', new Uint8Array([1])).then(() => { resolved = true; });

    assert.ok(openRequest, 'IndexedDB open request must be created synchronously');
    openRequest.onsuccess?.();
    for (let index = 0; index < 4 && !writeRequest; index += 1) await Promise.resolve();
    assert.ok(writeRequest, 'blob write request must start after the database opens');

    writeRequest.onsuccess?.();
    await Promise.resolve();
    assert.equal(resolved, false, 'IDBRequest success is not a durable commit boundary');

    transaction.oncomplete?.();
    await pending;
    assert.equal(resolved, true, 'blob write may resolve only after transaction.oncomplete');
  } finally {
    if (originalIndexedDb) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
