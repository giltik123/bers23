import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { LocalAIPlatform, type LocalAIPlatformLifecycle } from '../src/platform/creative/local-ai/LocalAIPlatform.ts';
import { InMemoryFleetBacking, InMemoryFleetBlobs, InMemoryFleetMetadata, InMemoryFleetMutationLocks, InMemoryFleetReservations } from '../src/platform/creative/local-ai/lifecycle/InMemoryFleetStorage.ts';
import type { LocalAIDependencies, ModelManifest } from '../src/platform/creative/local-ai/types.ts';

const bytes = new Uint8Array([11, 22, 33, 44]);
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const model = (): ModelManifest => ({
  modelId: 'tiny-sd-d4-owned-platform',
  version: '1.0.0',
  family: 'Tiny-SD',
  capabilities: ['image-generation'],
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
  downloadUri: 'https://models.example/tiny-sd-d4-owned.onnx',
  sha256: digest(bytes),
  signature: 'valid',
  status: 'AVAILABLE',
  stabilityScore: 1,
});

class TrackingFleetBlobs extends InMemoryFleetBlobs {
  lastRead?: Uint8Array;
  override async read(hash: string): Promise<Uint8Array | undefined> {
    const value = await super.read(hash);
    this.lastRead = value;
    return value;
  }
}

function harness() {
  const backing = new InMemoryFleetBacking(10_000);
  const blobs = new TrackingFleetBlobs(backing);
  const sessionInputs: Uint8Array[] = [];
  let sessionCreates = 0;
  let tick = 0;
  const lifecycle: LocalAIPlatformLifecycle = {
    metadata: new InMemoryFleetMetadata(backing),
    blobs,
    mutationLocks: new InMemoryFleetMutationLocks(backing),
    reservations: new InMemoryFleetReservations(backing),
    policy: { safetyReserveBytes: 10, maxHistory: 2 },
  };
  const dependencies: LocalAIDependencies = {
    id: () => `d4-${++tick}`,
    clock: () => ++tick,
    random: () => .5,
    deviceProvider: { signals: async () => ({
      platform: 'BROWSER', deviceClass: 'BROWSER', cpuCores: 8, ramMb: 16_384, gpu: 'test', vramMb: 0,
      npu: 'UNKNOWN', architecture: 'x64', browser: 'test', webgpu: false, wasm: true, webnn: false,
      cuda: false, directml: false, metal: false, vulkan: false, storageFreeBytes: 10_000,
      batteryPercent: 100, powerState: 'FULL', thermalState: 'NORMAL', network: 'ONLINE', ramPressure: 'NORMAL', backgroundRestricted: false,
    }) },
    runtimeProbe: { detect: async (kind) => kind === 'WASM' || kind === 'ONNX_RUNTIME' },
    fetch: { fetch: async (uri, offset) => {
      if (uri !== model().downloadUri) throw new Error(`unexpected URI: ${uri}`);
      return bytes.slice(offset);
    } },
    storage: {
      freeBytes: async () => 10_000,
      read: async () => undefined,
      write: async () => undefined,
      remove: async () => undefined,
    },
    hash: { sha256: async (value) => digest(value) },
    signatureVerifier: { verify: async (_publisher, signature) => signature === 'valid' },
    onnxSessionFactory: { create: async (value) => {
      sessionCreates++;
      sessionInputs.push(value);
      return { run: async () => ({}), release: async () => undefined };
    } },
    modelCatalog: [model()],
  };
  const trustPolicy = { publishers: ['trusted'], formats: ['ONNX'] as const, runtimes: ['WASM'] as const, licenses: ['MIT'] };
  return {
    backing,
    blobs,
    sessionInputs,
    sessionCreates: () => sessionCreates,
    platform: () => new LocalAIPlatform(dependencies, trustPolicy, lifecycle),
  };
}

test('D4 durable READY load passes the freshly revalidated CAS buffer to the ONNX factory without a second clone', async () => {
  const env = harness();
  const platform = env.platform();
  await platform.installModel(model());
  const stored = env.backing.blobs.get(model().sha256);
  assert.ok(stored);

  await platform.loadModel(model().modelId);

  assert.equal(env.sessionCreates(), 1);
  assert.ok(env.blobs.lastRead, 'durable load must read the active content-addressed object');
  assert.notStrictEqual(env.blobs.lastRead, stored, 'FleetBlobPort read must return fresh caller-owned bytes');
  assert.strictEqual(env.sessionInputs[0], env.blobs.lastRead, 'durable revalidated bytes must reach the session factory with exact identity');
});

test('D4 durable owned path cannot bypass content trust revalidation', async () => {
  const env = harness();
  const platform = env.platform();
  await platform.installModel(model());
  env.backing.blobs.set(model().sha256, new Uint8Array([99, 98, 97, 96]));

  await assert.rejects(() => platform.loadModel(model().modelId), /integrity revalidation/);

  assert.equal(env.sessionCreates(), 0, 'untrusted durable bytes must be rejected before the session factory sees them');
  assert.equal(platform.inspect(model().modelId)?.status, 'QUARANTINED');
});
