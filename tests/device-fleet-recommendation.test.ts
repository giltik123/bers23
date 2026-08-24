import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DeviceAnalyzer,
  DeviceCapabilitySnapshotBuilder,
  LocalAIPlatform,
  ModelBundleBuilder,
  ModelFleetPlanner,
  modelFleetKey,
  type DeviceCapabilityProfile,
  type DeviceSignals,
  type LocalAIDependencies,
  type ModelManifest,
  type RuntimeCapabilities,
} from '../src/platform/creative/local-ai/index.ts';

const MIB = 1024 * 1024;
const digest = 'a'.repeat(64);

const signals = (overrides: Partial<DeviceSignals> = {}): DeviceSignals => ({
  platform: 'LINUX', deviceClass: 'DESKTOP', cpuCores: 12, ramMb: 16_384, gpu: 'test-gpu', vramMb: 8_192,
  npu: 'test-npu', architecture: 'x64', browser: 'test-browser', webgpu: true, wasm: true, webnn: false, cuda: true,
  directml: false, metal: false, vulkan: true, storageFreeBytes: 512 * MIB, batteryPercent: 80, powerState: 'CHARGING',
  thermalState: 'NORMAL', network: 'ONLINE', ramPressure: 'NORMAL', backgroundRestricted: false, ...overrides,
});

const profile = (overrides: Partial<DeviceCapabilityProfile> = {}): DeviceCapabilityProfile => ({
  platform: 'LINUX', deviceClass: 'DESKTOP', cpuCores: 12, ramMb: 16_384, gpu: 'test-gpu', vramMb: 8_192,
  npu: 'test-npu', architecture: 'x64', browser: 'test-browser', webgpu: true, wasm: true, webnn: false, cuda: true,
  directml: false, metal: false, vulkan: true, storageFreeBytes: 512 * MIB, batteryPercent: 80, powerState: 'CHARGING',
  thermalState: 'NORMAL', network: 'ONLINE', tier: 'HIGH', ramPressure: 'NORMAL', backgroundRestricted: false, ...overrides,
});

const runtimes = (overrides: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities => ({
  ONNX_RUNTIME: true, WEBGPU: true, WASM: true, NNAPI: false, DIRECTML: false, CUDA: true, METAL: false, VULKAN: true, ...overrides,
});

const manifest = (modelId: string, capabilities: readonly string[], sizeMb: number, overrides: Partial<ModelManifest> = {}): ModelManifest => ({
  modelId, version: '1.0.0', family: modelId, capabilities, modelFormat: 'ONNX', runtime: 'ONNX_RUNTIME',
  sizeBytes: sizeMb * MIB, requiredRam: 1_024, requiredVram: 0, supportedPlatforms: ['LINUX', 'WINDOWS', 'MACOS', 'BROWSER', 'ANDROID'],
  supportedAccelerators: ['ONNX_RUNTIME', 'CUDA', 'WEBGPU', 'WASM'], estimatedLatency: 500, qualityScore: 0.8, energyScore: 0.8,
  privacyLevel: 'PRIVATE', license: 'Apache-2.0', publisher: 'trusted-publisher', downloadUri: `https://models.example/${modelId}.onnx`,
  sha256: digest, signature: `signature-${modelId}`, status: 'AVAILABLE', stabilityScore: 0.9, ...overrides,
});

const snapshot = (device = profile(), runtime = runtimes()) => new DeviceCapabilitySnapshotBuilder().build(device, runtime, 1_000);

function dependencies(input: Readonly<{ device?: DeviceSignals; catalog?: readonly ModelManifest[]; storageFreeBytes?: number; trustedPublisher?: string }> = {}) {
  let fetchCalls = 0; let writeCalls = 0;
  const storage = new Map<string, Uint8Array>();
  const deps: LocalAIDependencies = {
    id: () => 'id', clock: () => 1_000, random: () => 0.5,
    deviceProvider: { signals: async () => input.device ?? signals() },
    runtimeProbe: { detect: async () => true },
    fetch: { fetch: async () => { fetchCalls += 1; return new Uint8Array([1]); } },
    storage: {
      freeBytes: async () => input.storageFreeBytes ?? 512 * MIB,
      read: async (id) => storage.get(id),
      write: async (id, bytes) => { writeCalls += 1; storage.set(id, bytes); },
      remove: async (id) => { storage.delete(id); },
    },
    hash: { sha256: async () => digest },
    signatureVerifier: { verify: async (publisher) => publisher === (input.trustedPublisher ?? 'trusted-publisher') },
    modelCatalog: input.catalog ?? [],
  };
  return { deps, calls: () => ({ fetchCalls, writeCalls }) };
}

const trustPolicy = { publishers: ['trusted-publisher'], formats: ['ONNX'] as const, runtimes: ['ONNX_RUNTIME'] as const, licenses: ['Apache-2.0'] };

test('device tier preserves UNKNOWN when evidence is absent or insufficient', async () => {
  const empty = await new DeviceAnalyzer({ signals: async () => ({}) }).analyze();
  assert.equal(empty.tier, 'UNKNOWN');
  const oneSignal = await new DeviceAnalyzer({ signals: async () => ({ cpuCores: 16 }) }).analyze();
  assert.equal(oneSignal.tier, 'UNKNOWN');
  const low = await new DeviceAnalyzer({ signals: async () => ({ cpuCores: 2, ramMb: 2_048 }) }).analyze();
  assert.equal(low.tier, 'LOW');
  const high = await new DeviceAnalyzer({ signals: async () => ({ cpuCores: 24, ramMb: 65_536, vramMb: 24_576, cuda: true, storageFreeBytes: 200e9 }) }).analyze();
  assert.ok(high.tier === 'HIGH' || high.tier === 'EXTREME');
});

test('capability snapshot is tri-state, resource-bucketed and excludes raw hardware fingerprint fields', () => {
  const value = new DeviceCapabilitySnapshotBuilder().build(profile({ ramMb: 'UNKNOWN', vramMb: 3_000 }), runtimes({ NNAPI: 'UNKNOWN', METAL: 'UNKNOWN' }), 42);
  assert.equal(value.schemaVersion, 1); assert.equal(value.capturedAt, 42); assert.equal(Object.isFrozen(value), true);
  assert.equal(value.profile.ramMb, 'UNKNOWN'); assert.equal(value.profile.vramMb, 2_048, 'VRAM must round down to a conservative bucket');
  assert.ok(value.evidence.unknownSignals.includes('ramMb')); assert.ok(value.evidence.observedSignals.includes('storageFreeBytes'));
  assert.ok(value.evidence.unknownRuntimes.includes('NNAPI')); assert.ok(value.evidence.observedRuntimes.includes('CUDA'));
  const serialized = JSON.stringify(value);
  for (const forbidden of ['deviceId', 'fingerprint', 'tenantId', 'projectId', 'userId', 'billing', 'test-gpu', 'test-browser', 'test-npu', 'x64', 'architecture', 'browser', 'gpu', 'npu']) assert.equal(serialized.includes(forbidden), false, `snapshot leaked ${forbidden}`);
});

test('fleet recommendation fails closed for unknown device, tier, runtime evidence or storage', () => {
  const model = manifest('segment-small', ['SEGMENTATION'], 8);
  const planner = new ModelFleetPlanner(); const trustedModelKeys = [modelFleetKey(model)];
  const unknownDevice = snapshot(profile({ platform: 'UNKNOWN', deviceClass: 'UNKNOWN', tier: 'UNKNOWN', storageFreeBytes: 'UNKNOWN' }), runtimes());
  assert.equal(planner.recommend({ snapshot: unknownDevice, catalog: [model], trustedModelKeys, storageFreeBytes: 'UNKNOWN' }).status, 'BLOCKED_INSUFFICIENT_EVIDENCE');
  const unknownRuntimes = runtimes({ ONNX_RUNTIME: 'UNKNOWN', WEBGPU: 'UNKNOWN', WASM: 'UNKNOWN', NNAPI: 'UNKNOWN', DIRECTML: 'UNKNOWN', CUDA: 'UNKNOWN', METAL: 'UNKNOWN', VULKAN: 'UNKNOWN' });
  assert.equal(planner.recommend({ snapshot: snapshot(profile(), unknownRuntimes), catalog: [model], trustedModelKeys, storageFreeBytes: 512 * MIB }).status, 'BLOCKED_INSUFFICIENT_EVIDENCE');
  assert.equal(planner.recommend({ snapshot: snapshot(profile({ storageFreeBytes: 'UNKNOWN' })), catalog: [model], trustedModelKeys, storageFreeBytes: 'UNKNOWN' }).status, 'BLOCKED_INSUFFICIENT_EVIDENCE');
});

test('planner chooses a deterministic compact bootstrap fleet and does not install alternatives for already-covered capabilities', () => {
  const segSmall = manifest('seg-a-small', ['SEGMENTATION'], 8);
  const segLarge = manifest('seg-z-large', ['SEGMENTATION'], 18, { qualityScore: 0.95 });
  const upscale = manifest('upscale-small', ['UPSCALE'], 12);
  const generation = manifest('tiny-generation', ['TEXT_TO_IMAGE'], 4);
  const catalog = [segLarge, generation, upscale, segSmall];
  const trustedModelKeys = catalog.map(modelFleetKey);
  const planner = new ModelFleetPlanner();
  const input = { snapshot: snapshot(), catalog, trustedModelKeys, storageFreeBytes: 100 * MIB, policy: { bootstrapCapabilities: ['SEGMENTATION', 'UPSCALE'], maxAutoInstallBytes: 24 * MIB, minFreeBytesAfterInstall: 8 * MIB } } as const;
  const first = planner.recommend(input); const second = planner.recommend(input);
  assert.deepEqual(first, second); assert.equal(first.status, 'READY');
  assert.deepEqual(first.modelIds, ['seg-a-small', 'upscale-small']); assert.deepEqual(first.modelBindings, [{ modelId: 'seg-a-small', version: '1.0.0' }, { modelId: 'upscale-small', version: '1.0.0' }]); assert.equal(first.estimatedBytes, 20 * MIB);
  assert.ok(first.exclusions.find((item) => item.modelId === 'seg-z-large')?.reasons.includes('CAPABILITY_ALREADY_COVERED'));
  assert.ok(first.exclusions.find((item) => item.modelId === 'tiny-generation')?.reasons.includes('CAPABILITY_NOT_BOOTSTRAP'));
});

test('partial bootstrap remains installable while uncovered capabilities stay explicit', () => {
  const segment = manifest('segment-only', ['SEGMENTATION'], 8);
  const recommendation = new ModelFleetPlanner().recommend({ snapshot: snapshot(), catalog: [segment], trustedModelKeys: [modelFleetKey(segment)], storageFreeBytes: 100 * MIB, policy: { bootstrapCapabilities: ['SEGMENTATION', 'UPSCALE'], maxAutoInstallBytes: 24 * MIB, minFreeBytesAfterInstall: 8 * MIB } });
  assert.equal(recommendation.status, 'PARTIAL'); assert.deepEqual(recommendation.modelIds, ['segment-only']); assert.deepEqual(recommendation.uncoveredCapabilities, ['UPSCALE']);
});

test('recommendation and install are pinned to the selected exact semantic version', async () => {
  const v1 = manifest('versioned-segment', ['SEGMENTATION'], 1 / MIB, { version: '1.0.0' });
  const v2 = manifest('versioned-segment', ['SEGMENTATION'], 1 / MIB, { version: '1.2.0' });
  const catalog = [v1, v2];
  const planner = new ModelFleetPlanner();
  const recommendation = planner.recommend({ snapshot: snapshot(), catalog, trustedModelKeys: catalog.map(modelFleetKey), storageFreeBytes: 512 * MIB, policy: { bootstrapCapabilities: ['SEGMENTATION'], minFreeBytesAfterInstall: 1 } });
  assert.deepEqual(recommendation.modelBindings, [{ modelId: 'versioned-segment', version: '1.2.0' }]);
  assert.ok(recommendation.exclusions.find((item) => item.version === '1.0.0')?.reasons.includes('MODEL_VERSION_ALREADY_SELECTED'));

  const { deps } = dependencies({ catalog });
  const platform = new LocalAIPlatform(deps, trustPolicy);
  const installed = await platform.installRecommendedBundle();
  assert.equal(installed.length, 1); assert.equal(installed[0].modelId, 'versioned-segment'); assert.equal(installed[0].version, '1.2.0');
});

test('planner excludes untrusted, heavy, unknown-resource and oversized models before selection', () => {
  const untrusted = manifest('untrusted', ['SEGMENTATION'], 4);
  const heavy = manifest('heavy-inpaint', ['SEGMENTATION', 'INPAINT'], 4);
  const unknownVram = manifest('gpu-only', ['SEGMENTATION'], 4, { requiredVram: 2_048 });
  const oversized = manifest('oversized', ['UPSCALE'], 40);
  const catalog = [untrusted, heavy, unknownVram, oversized];
  const result = new ModelFleetPlanner().recommend({
    snapshot: snapshot(profile({ vramMb: 'UNKNOWN' })), catalog,
    trustedModelKeys: [modelFleetKey(heavy), modelFleetKey(unknownVram), modelFleetKey(oversized)], storageFreeBytes: 80 * MIB,
    policy: { bootstrapCapabilities: ['SEGMENTATION', 'UPSCALE'], maxAutoInstallBytes: 24 * MIB, minFreeBytesAfterInstall: 8 * MIB, maxModelBytes: 20 * MIB },
  });
  assert.equal(result.modelIds.length, 0);
  assert.ok(result.exclusions.find((item) => item.modelId === 'untrusted')?.reasons.includes('UNTRUSTED_MANIFEST'));
  assert.ok(result.exclusions.find((item) => item.modelId === 'heavy-inpaint')?.reasons.includes('HEAVY_CAPABILITY'));
  assert.ok(result.exclusions.find((item) => item.modelId === 'gpu-only')?.reasons.includes('UNKNOWN_VRAM'));
  assert.ok(result.exclusions.find((item) => item.modelId === 'oversized')?.reasons.includes('MODEL_TOO_LARGE'));
});

test('effective storage uses the more conservative device/storage-port evidence', async () => {
  const model = manifest('segment-20mb', ['SEGMENTATION'], 20);
  const { deps } = dependencies({ device: signals({ storageFreeBytes: 40 * MIB }), catalog: [model], storageFreeBytes: 500 * MIB });
  const platform = new LocalAIPlatform(deps, trustPolicy);
  const recommendation = await platform.recommendFleet({ bootstrapCapabilities: ['SEGMENTATION'], maxAutoInstallBytes: 64 * MIB, minFreeBytesAfterInstall: 24 * MIB });
  assert.equal(recommendation.freeBytes, 40 * MIB); assert.equal(recommendation.budgetBytes, 16 * MIB); assert.equal(recommendation.status, 'BLOCKED_STORAGE');
});

test('LocalAIPlatform recommendation verifies trust and blocked recommendation never downloads or writes', async () => {
  const trusted = manifest('trusted-segment', ['SEGMENTATION'], 8);
  const untrusted = manifest('untrusted-upscale', ['UPSCALE'], 8, { publisher: 'attacker' });
  const ready = dependencies({ catalog: [trusted, untrusted] });
  const platform = new LocalAIPlatform(ready.deps, trustPolicy);
  const recommendation = await platform.recommendFleet({ bootstrapCapabilities: ['SEGMENTATION', 'UPSCALE'], maxAutoInstallBytes: 32 * MIB, minFreeBytesAfterInstall: 8 * MIB });
  assert.equal(recommendation.status, 'PARTIAL'); assert.deepEqual(recommendation.modelIds, ['trusted-segment']); assert.deepEqual(recommendation.uncoveredCapabilities, ['UPSCALE']);
  assert.ok(recommendation.exclusions.find((item) => item.modelId === 'untrusted-upscale')?.reasons.includes('UNTRUSTED_MANIFEST'));

  const blocked = dependencies({ device: {}, catalog: [trusted] });
  const blockedPlatform = new LocalAIPlatform(blocked.deps, trustPolicy);
  assert.deepEqual(await blockedPlatform.installRecommendedBundle(), []);
  assert.deepEqual(blocked.calls(), { fetchCalls: 0, writeCalls: 0 });
});

test('legacy ModelBundleBuilder shares UNKNOWN, alias and budget semantics', () => {
  const model = manifest('analysis-small', ['image-analysis'], 8);
  const builder = new ModelBundleBuilder();
  const compatible = builder.recommend(profile(), runtimes(), [model]);
  assert.deepEqual(compatible.modelIds, ['analysis-small']);
  const unknown = builder.recommend(profile({ platform: 'UNKNOWN', deviceClass: 'UNKNOWN', tier: 'UNKNOWN', storageFreeBytes: 'UNKNOWN' }), runtimes(), [model]);
  assert.deepEqual(unknown.modelIds, []);
  const constrained = builder.recommend(profile({ storageFreeBytes: 40 * MIB }), runtimes(), [model], { bootstrapCapabilities: ['ANALYSIS'], maxAutoInstallBytes: 64 * MIB, minFreeBytesAfterInstall: 36 * MIB });
  assert.deepEqual(constrained.modelIds, []);
});

test('B1 capability/fleet policy owns no cloud, provider, billing, project or artifact authority', async () => {
  const sources = await Promise.all([
    readFile('src/platform/creative/local-ai/device/DeviceCapabilitySnapshot.ts', 'utf8'),
    readFile('src/platform/creative/local-ai/selection/ModelFleetPlanner.ts', 'utf8'),
  ]);
  const source = sources.join('\n');
  for (const marker of ['ExecutionTargetSelector', 'providerSelector', 'Billing', '/projects/', '/artifacts/', "target: 'CLOUD'", 'canonicalArtifactId']) assert.equal(source.includes(marker), false, `B1 advisory policy contains forbidden authority marker ${marker}`);
});
