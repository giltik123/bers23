import assert from 'node:assert/strict';
import test from 'node:test';
import { OnnxLocalRuntime } from '../src/platform/creative/local-ai/runtimes/OnnxLocalRuntime.ts';
import type { ModelManifest, OnnxSessionFactory } from '../src/platform/creative/local-ai/types.ts';

const manifest = (): ModelManifest => ({
  modelId: 'tiny-sd-d4-test',
  version: '1.0.0',
  family: 'Tiny-SD',
  capabilities: ['image-generation'],
  modelFormat: 'ONNX',
  runtime: 'WASM',
  sizeBytes: 4,
  requiredRam: 1,
  requiredVram: 0,
  supportedPlatforms: ['BROWSER'],
  supportedAccelerators: ['WASM'],
  estimatedLatency: 1,
  qualityScore: 1,
  energyScore: 1,
  privacyLevel: 'PRIVATE',
  license: 'creativeml-openrail-m',
  publisher: 'trusted',
  downloadUri: 'https://models.example/tiny-sd.onnx',
  sha256: 'a'.repeat(64),
  signature: 'valid',
  status: 'READY',
  stabilityScore: 1,
});

const capturingFactory = (seen: Uint8Array[], released: { value: boolean }): OnnxSessionFactory => ({
  create: async (bytes) => {
    seen.push(bytes);
    return {
      run: async () => ({}),
      release: async () => { released.value = true; },
    };
  },
});

test('D4 borrowed ONNX load preserves the defensive model-byte clone boundary', async () => {
  const seen: Uint8Array[] = [];
  const released = { value: false };
  const runtime = new OnnxLocalRuntime(capturingFactory(seen, released), ['wasm']);
  const source = new Uint8Array([1, 2, 3, 4]);

  await runtime.load(manifest(), source);

  assert.equal(seen.length, 1);
  assert.notStrictEqual(seen[0], source, 'borrowed/default load must not expose the caller buffer to the session factory');
  assert.deepEqual(seen[0], source);
  assert.equal(runtime.debug().modelBytesOwnership, 'BORROWED_CLONED');
  assert.equal(runtime.debug().ownedModelBytesRetained, false);
  await runtime.unload();
  assert.equal(released.value, true);
});

test('D4 verified-owned ONNX load passes exact buffer identity and retains it until release', async () => {
  const seen: Uint8Array[] = [];
  const released = { value: false };
  const runtime = new OnnxLocalRuntime(capturingFactory(seen, released), ['wasm']);
  const owned = new Uint8Array([5, 6, 7, 8]);

  await runtime.loadOwnedVerifiedArtifact(manifest(), owned);

  assert.equal(seen.length, 1);
  assert.strictEqual(seen[0], owned, 'verified-owned load must not allocate a second model-sized Uint8Array');
  assert.equal(runtime.debug().modelBytesOwnership, 'OWNED_VERIFIED');
  assert.equal(runtime.debug().ownedModelBytesRetained, true);
  await runtime.unload();
  assert.equal(released.value, true);
  assert.equal(runtime.debug().ownedModelBytesRetained, false);
  assert.equal(runtime.debug().modelBytesOwnership, undefined);
});

test('D4 verified-owned load fails closed and drops ownership state when session creation rejects', async () => {
  const runtime = new OnnxLocalRuntime({
    create: async () => { throw new Error('session rejected'); },
  }, ['wasm']);
  const owned = new Uint8Array([9, 10, 11, 12]);

  await assert.rejects(() => runtime.loadOwnedVerifiedArtifact(manifest(), owned), /session rejected/);

  assert.equal(runtime.health().status, 'UNLOADED');
  assert.equal(runtime.debug().ownedModelBytesRetained, false);
  assert.equal(runtime.debug().modelBytesOwnership, undefined);
});
