import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { LocalAIPlatform, type LocalAIPlatformLifecycle } from '../src/platform/creative/local-ai/LocalAIPlatform.ts';
import { InMemoryFleetBacking, InMemoryFleetBlobs, InMemoryFleetMetadata, InMemoryFleetMutationLocks, InMemoryFleetReservations } from '../src/platform/creative/local-ai/lifecycle/InMemoryFleetStorage.ts';
import type { InferenceRequest, LocalAIDependencies, ModelManifest } from '../src/platform/creative/local-ai/types.ts';
import { CreativeModelDistribution, DEFAULT_DISTRIBUTION_POLICY } from '../src/platform/creative/model-distribution/CreativeModelDistribution.ts';
import type { ModelBundle } from '../src/platform/creative/model-distribution/types.ts';

const bytesA = new Uint8Array([1, 2, 3, 4]);
const bytesB = new Uint8Array([5, 6, 7, 8, 9]);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const manifest = (version: string, bytes: Uint8Array): ModelManifest => ({
  modelId: 'platform-model',
  version,
  family: 'test',
  capabilities: ['segmentation'],
  modelFormat: 'ONNX',
  runtime: 'WEBGPU',
  sizeBytes: bytes.byteLength,
  requiredRam: 1,
  requiredVram: 0,
  supportedPlatforms: ['BROWSER'],
  supportedAccelerators: ['WEBGPU'],
  estimatedLatency: 1,
  qualityScore: .95,
  energyScore: .9,
  privacyLevel: 'PRIVATE',
  license: 'MIT',
  publisher: 'trusted',
  downloadUri: `https://models.example/platform-model-${version}.onnx`,
  sha256: sha(bytes),
  signature: 'valid',
  status: 'AVAILABLE',
  stabilityScore: .99,
});
const trustPolicy = { publishers: ['trusted'], formats: ['ONNX'] as const, runtimes: ['WEBGPU'] as const, licenses: ['MIT'] };

type Harness = ReturnType<typeof harness>;
function harness(backing = new InMemoryFleetBacking(10_000), payloads = new Map([[manifest('1.0.0', bytesA).downloadUri, bytesA], [manifest('2.0.0', bytesB).downloadUri, bytesB]])) {
  let tick = 0;
  let legacyWrites = 0;
  let runtimeRuns = 0;
  const runtimeLoads: Uint8Array[] = [];
  const legacy = new Map<string, Uint8Array>();
  const lifecycle = (): LocalAIPlatformLifecycle => ({
    metadata: new InMemoryFleetMetadata(backing),
    blobs: new InMemoryFleetBlobs(backing),
    mutationLocks: new InMemoryFleetMutationLocks(backing),
    reservations: new InMemoryFleetReservations(backing),
    policy: { safetyReserveBytes: 10, maxHistory: 3 },
  });
  const dependencies = (): LocalAIDependencies => ({
    id: () => `id-${++tick}`,
    clock: () => ++tick,
    random: () => .5,
    deviceProvider: { signals: async () => ({
      platform: 'BROWSER', deviceClass: 'BROWSER', cpuCores: 8, ramMb: 16_384, gpu: 'test', vramMb: 4096,
      npu: 'UNKNOWN', architecture: 'x64', browser: 'test', webgpu: true, wasm: true, webnn: false,
      cuda: false, directml: false, metal: false, vulkan: false, storageFreeBytes: 10_000,
      batteryPercent: 100, powerState: 'FULL', thermalState: 'NORMAL', network: 'ONLINE', ramPressure: 'NORMAL', backgroundRestricted: false,
    }) },
    runtimeProbe: { detect: async (kind) => kind === 'WEBGPU' || kind === 'WASM' || kind === 'ONNX_RUNTIME' },
    fetch: { fetch: async (uri, offset) => {
      const value = payloads.get(uri);
      if (!value) throw new Error(`missing payload: ${uri}`);
      return value.slice(offset);
    } },
    storage: {
      freeBytes: async () => 10_000,
      read: async (id) => legacy.get(id),
      write: async (id, value) => { legacyWrites++; legacy.set(id, value.slice()); },
      remove: async (id) => { legacy.delete(id); },
    },
    hash: { sha256: async (bytes) => sha(bytes) },
    signatureVerifier: { verify: async (_publisher, signature) => signature === 'valid' },
    onnxSessionFactory: { create: async (bytes) => {
      runtimeLoads.push(bytes.slice());
      return {
        run: async () => { runtimeRuns++; return {}; },
        release: async () => undefined,
      };
    } },
    modelCatalog: [manifest('1.0.0', bytesA), manifest('2.0.0', bytesB)],
  });
  return {
    backing,
    lifecycle,
    dependencies,
    platform: () => new LocalAIPlatform(dependencies(), trustPolicy, lifecycle()),
    legacyWrites: () => legacyWrites,
    runtimeLoads,
    runtimeRuns: () => runtimeRuns,
  };
}

function bundle(model: ModelManifest): ModelBundle {
  return {
    bundleId: `bundle-${model.version}`,
    version: model.version,
    profile: 'MINIMAL',
    models: [{ manifest: model, priority: 1, score: .9, reasons: ['test'], status: 'QUEUED' }],
    capabilities: ['segmentation'],
    sizeBytes: model.sizeBytes,
    requiredStorage: model.sizeBytes * 2,
    requiredRam: model.requiredRam,
    requiredVram: model.requiredVram,
    estimatedPerformance: .9,
    estimatedEnergy: .1,
    expectedCloudSavings: .5,
    compatibility: 1,
    priority: 1,
  };
}

function distribution(env: Harness): CreativeModelDistribution {
  return new CreativeModelDistribution(
    { localAI: env.dependencies(), bandwidthBytesPerSecond: () => 1_000_000 },
    {
      policy: { ...DEFAULT_DISTRIBUTION_POLICY, maximumAutomaticBytes: 100_000_000 },
      scope: { tenantId: 't', projectId: 'p', userId: 'u' },
      lifecycle: env.lifecycle(),
    },
  );
}

test('LocalAIPlatform durable install survives restart and runtime loads CAS bytes, not legacy storage', async () => {
  const env = harness();
  const first = env.platform();
  const installed = await first.installModel(manifest('1.0.0', bytesA));
  assert.equal(installed.status, 'READY');
  assert.equal(env.legacyWrites(), 0, 'durable install must not write the legacy model store');

  const restarted = env.platform();
  await restarted.initializeModelFleet();
  assert.equal(restarted.inspect('platform-model')?.version, '1.0.0');
  assert.equal(restarted.inspect('platform-model')?.status, 'READY');
  await restarted.loadModel('platform-model');
  assert.deepEqual(env.runtimeLoads.at(-1), bytesA);
  assert.equal(env.legacyWrites(), 0);
});

test('CreativeModelDistribution rollback switches durable active bytes before updating cache', async () => {
  const env = harness();
  const app = distribution(env);
  await app.analyzeDevice();
  await app.installBundle(bundle(manifest('1.0.0', bytesA)));
  await app.updateBundle(bundle(manifest('2.0.0', bytesB)));
  assert.equal(app.inspect('platform-model')?.version, '2.0.0');

  const restored = await app.rollback('platform-model');
  assert.equal(restored.version, '1.0.0');

  const independent = env.platform();
  await independent.initializeModelFleet();
  assert.equal(independent.inspect('platform-model')?.version, '1.0.0', 'cache rollback must match durable activeVersion');
  await independent.loadModel('platform-model');
  assert.deepEqual(env.runtimeLoads.at(-1), bytesA, 'runtime must load exact rollback bytes');
});

test('cross-context durable active-version change invalidates an already loaded runtime before inference', async () => {
  const env = harness();
  const first = env.platform();
  await first.installModel(manifest('1.0.0', bytesA));
  await first.loadModel('platform-model');

  const second = env.platform();
  await second.installModel(manifest('2.0.0', bytesB));

  const request: InferenceRequest = { requestId: 'request-1', inputs: {} };
  await assert.rejects(() => first.infer('platform-model', request), /authority changed/);
  assert.equal(env.runtimeRuns(), 0, 'stale runtime must be rejected before session.run');
});

test('durable failure/quarantine survives restart and corrupt bytes cannot be restored', async () => {
  const env = harness();
  const first = env.platform();
  await first.installModel(manifest('1.0.0', bytesA));
  await first.reportRuntimeFailureAsync('platform-model', 'runtime');
  await first.reportRuntimeFailureAsync('platform-model', 'runtime');
  const quarantined = await first.reportRuntimeFailureAsync('platform-model', 'runtime');
  assert.equal(quarantined.status, 'QUARANTINED');

  const restarted = env.platform();
  await restarted.initializeModelFleet();
  assert.equal(restarted.inspect('platform-model')?.status, 'QUARANTINED');
  env.backing.blobs.set(sha(bytesA), new Uint8Array([99]));
  await assert.rejects(() => restarted.restoreQuarantinedAsync('platform-model', true), /revalidation/);
  assert.equal(restarted.inspect('platform-model')?.status, 'QUARANTINED');
});

test('LocalAIPlatform durable removeModel uninstalls active and rollback-history versions', async () => {
  const env = harness();
  const platform = env.platform();
  await platform.installModel(manifest('1.0.0', bytesA));
  await platform.installModel(manifest('2.0.0', bytesB));
  assert.equal(env.backing.blobs.size, 2, 'both rollback-capable versions must exist before uninstall');
  assert.equal((await env.lifecycle().metadata.read())?.models['platform-model']?.activeVersion, '2.0.0');

  await platform.removeModel('platform-model');

  assert.equal(platform.inspect('platform-model'), undefined, 'public registry must not resurrect a retained history version');
  assert.equal((await env.lifecycle().metadata.read())?.models['platform-model'], undefined, 'public removeModel means full durable uninstall');
  assert.equal(env.backing.blobs.size, 0, 'unreferenced active and history CAS bytes must be reclaimed');
  assert.equal(env.legacyWrites(), 0);

  const restarted = env.platform();
  await restarted.initializeModelFleet();
  assert.equal(restarted.inspect('platform-model'), undefined, 'uninstalled model must stay absent after restart');
});
