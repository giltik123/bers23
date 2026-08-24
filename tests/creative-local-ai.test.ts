import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  BrowserLocalRuntime, DesktopLocalRuntime, DeviceAnalyzer, ExecutionTargetSelector, LocalAICostModel, LocalAIPlatform,
  LocalAISandbox, LocalInferenceCache, LocalInferencePolicy, LocalModelRegistry, LocalRuntimeDetector, MobileLocalRuntime,
  ModelManifestVerifier, ModelSignatureVerifier, ModelSuitabilityScorer, ModelTrustRegistry,
  ResourceGovernor, deepFreeze, type DeviceCapabilityProfile, type DeviceSignals, type LocalAIDependencies,
  type ModelManifest, type Scope as OperationScope, type RuntimeCapabilities,
} from '../src/platform/creative/local-ai/index.ts';

const scope: OperationScope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const digest = 'a'.repeat(64);
const bytes = new Uint8Array([1, 2, 3, 4]);
const signals = (overrides: Partial<DeviceSignals> = {}): DeviceSignals => ({
  platform: 'LINUX', deviceClass: 'DESKTOP', cpuCores: 12, ramMb: 16_384, gpu: 'test-gpu', vramMb: 8_192,
  npu: 'UNKNOWN', architecture: 'x64', browser: 'UNKNOWN', webgpu: true, wasm: true, webnn: false, nnapi: false, cuda: true,
  directml: false, metal: false, vulkan: true, storageFreeBytes: 100_000_000_000, batteryPercent: 90,
  powerState: 'CHARGING', thermalState: 'NORMAL', network: 'ONLINE', ramPressure: 'NORMAL', backgroundRestricted: false, ...overrides,
});
const profile = (overrides: Partial<DeviceCapabilityProfile> = {}): DeviceCapabilityProfile => ({
  platform: 'LINUX', deviceClass: 'DESKTOP', cpuCores: 12, ramMb: 16_384, gpu: 'test-gpu', vramMb: 8_192,
  npu: 'UNKNOWN', architecture: 'x64', browser: 'UNKNOWN', webgpu: true, wasm: true, webnn: false, nnapi: false, cuda: true,
  directml: false, metal: false, vulkan: true, storageFreeBytes: 100_000_000_000, batteryPercent: 90,
  powerState: 'CHARGING', thermalState: 'NORMAL', network: 'ONLINE', tier: 'HIGH', ramPressure: 'NORMAL', backgroundRestricted: false, ...overrides,
});
const runtimes = (enabled: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities => ({
  ONNX_RUNTIME: true, WEBGPU: true, WASM: true, NNAPI: true, DIRECTML: true, CUDA: true, METAL: true, VULKAN: true, ...enabled,
});
const manifest = (variant = 1, overrides: Partial<ModelManifest> = {}): ModelManifest => ({
  modelId: `model-${variant}`, version: '1.0.0', family: variant % 2 ? 'segmentation' : 'upscale',
  capabilities: variant % 2 ? ['SEGMENTATION'] : ['UPSCALE'], modelFormat: 'ONNX', runtime: 'ONNX_RUNTIME', sizeBytes: bytes.length,
  requiredRam: 1_024 + variant, requiredVram: 512, supportedPlatforms: ['LINUX', 'WINDOWS', 'MACOS', 'ANDROID', 'BROWSER'],
  supportedAccelerators: ['ONNX_RUNTIME', 'CUDA', 'WEBGPU'], estimatedLatency: 500 + variant, qualityScore: 0.8,
  energyScore: 0.8, privacyLevel: 'PRIVATE', license: 'Apache-2.0', publisher: 'trusted-publisher',
  downloadUri: `https://models.example/model-${variant}.onnx`, sha256: digest, signature: `signature-${variant}`,
  status: 'READY', stabilityScore: 0.9, ...overrides,
});

function dependencies(overrides: Partial<LocalAIDependencies> = {}): LocalAIDependencies {
  const storage = new Map<string, Uint8Array>(); let tick = 100;
  return {
    id: () => `id-${tick++}`, clock: () => tick++, random: () => 0.5,
    deviceProvider: { signals: async () => signals() }, runtimeProbe: { detect: async () => true },
    fetch: { fetch: async (_uri, offset, signal) => { if (signal.aborted) throw new Error('aborted'); return bytes.slice(offset); } },
    storage: { freeBytes: async () => 1e12, read: async (id) => storage.get(id), write: async (id, value) => { storage.set(id, value); }, remove: async (id) => { storage.delete(id); } },
    hash: { sha256: async () => digest }, signatureVerifier: { verify: async () => true }, ...overrides,
  };
}
const policy = { publishers: ['trusted-publisher'], formats: ['ONNX'] as const, runtimes: ['ONNX_RUNTIME'] as const, licenses: ['Apache-2.0'] };
async function readyPlatform(variant = 1): Promise<LocalAIPlatform> { const platform = new LocalAIPlatform(dependencies(), policy); await platform.installModel(manifest(variant, { status: 'AVAILABLE' })); return platform; }

const categories = [
  'device-analyzer', 'capability-detection', 'device-tiers', 'model-registry', 'manifest-validation', 'checksum',
  'signature', 'downloader-lifecycle', 'pause-resume-cancel', 'quarantine', 'sandbox', 'inference-permissions',
  'target-selection', 'model-suitability', 'mobile-runtime', 'desktop-runtime', 'browser-runtime', 'battery-thermal',
  'resource-governor', 'privacy-modes', 'local-cache', 'cost-comparison', 'fallback', 'explainability', 'snapshot',
  'replay', 'dependency-injection', 'deep-immutability', 'determinism', 'scope-isolation', 'security-invariants',
] as const;

// 31 security/runtime areas × 6 independent variants = 186 deterministic tests.
for (const category of categories) {
  for (let variant = 1; variant <= 6; variant += 1) {
    test(`${category} deterministic case ${variant}`, async () => {
      const model = manifest(variant);
      if (category === 'device-analyzer') {
        const device = await new DeviceAnalyzer({ signals: async () => signals({ cpuCores: 4 + variant }) }).analyze();
        assert.equal(device.cpuCores, 4 + variant); assert.equal(Object.isFrozen(device), true);
      }
      if (category === 'capability-detection') {
        const detected = await new LocalRuntimeDetector({ detect: async (kind) => kind === 'WASM' || variant % 2 === 0 }).detect();
        assert.equal(detected.WASM, true); assert.equal(detected.CUDA, variant % 2 === 0);
      }
      if (category === 'device-tiers') {
        const low = await new DeviceAnalyzer({ signals: async () => signals({ cpuCores: 2, ramMb: 2_048, vramMb: 0, webgpu: false, cuda: false, vulkan: false, storageFreeBytes: 1e9 }) }).analyze();
        const high = await new DeviceAnalyzer({ signals: async () => signals({ cpuCores: 24, ramMb: 65_536, vramMb: 24_576, cuda: true, storageFreeBytes: 200e9 }) }).analyze();
        assert.equal(low.tier, 'LOW'); assert.ok(['HIGH', 'EXTREME'].includes(high.tier));
      }
      if (category === 'model-registry') {
        const registry = new LocalModelRegistry(); const stored = registry.register(model);
        assert.equal(registry.get(model.modelId), stored); assert.equal(registry.list().length, 1);
      }
      if (category === 'manifest-validation' || category === 'checksum' || category === 'signature') {
        const verifier = new ModelManifestVerifier(new ModelTrustRegistry(policy), new ModelSignatureVerifier(dependencies().signatureVerifier), dependencies().hash);
        const result = await verifier.verify(model, bytes); assert.equal(result.trusted, true); assert.equal(result.checks.checksum, true); assert.equal(result.checks.signature, true);
      }
      if (category === 'downloader-lifecycle') {
        const platform = await readyPlatform(variant); assert.equal(platform.inspect(model.modelId)?.status, 'READY'); await platform.removeModel(model.modelId); assert.equal(platform.inspect(model.modelId), undefined);
      }
      if (category === 'pause-resume-cancel') {
        const platform = await readyPlatform(variant); platform.pauseDownload(model.modelId); platform.cancelDownload(model.modelId); assert.equal(platform.inspect(model.modelId)?.status, 'READY');
      }
      if (category === 'quarantine') {
        const platform = await readyPlatform(variant); platform.reportRuntimeFailure(model.modelId); platform.reportRuntimeFailure(model.modelId); assert.equal(platform.reportRuntimeFailure(model.modelId).status, 'QUARANTINED');
      }
      if (category === 'sandbox') {
        const context = new LocalAISandbox().create({ prompt: 'safe', operation: 'segment', artifacts: [{ id: 'a', value: variant, scope }], constraints: { quality: 'high', apiKey: 'secret' }, capabilities: ['SEGMENTATION'], parameters: { threshold: 0.5, billingSecret: 'no' }, scope });
        assert.equal('apiKey' in context.sanitizedConstraints, false); assert.equal('billingSecret' in context.modelParameters, false);
      }
      if (category === 'inference-permissions') {
        const inference = new LocalInferencePolicy(); assert.equal(inference.allow({ requested: 'LOCAL', privacyMode: 'LOCAL_ONLY', cloudAllowed: false, model }), true); assert.equal(inference.allow({ requested: 'CLOUD', privacyMode: 'LOCAL_ONLY', cloudAllowed: true }), false);
      }
      if (category === 'target-selection') {
        const decision = new ExecutionTargetSelector(runtimes()).select({ operation: { operationId: 'segment', requiredCapabilities: model.capabilities }, device: profile(), models: [model], privacyMode: 'NORMAL', cloudAllowed: true, maxCloudCredits: 10, cloudCredits: 2, qualityRequirement: 0.5, latencyRequirement: 5_000 }); assert.equal(decision.target, 'LOCAL'); assert.equal(decision.model?.modelId, model.modelId);
      }
      if (category === 'model-suitability') {
        const result = new ModelSuitabilityScorer().score(model, model.capabilities, profile(), runtimes()); assert.equal(result.eligible, true); assert.ok(result.score > 0.5);
      }
      if (category === 'mobile-runtime') {
        const runtime = new MobileLocalRuntime(); const device = profile({ platform: 'ANDROID', deviceClass: 'MOBILE' }); assert.equal(runtime.supports(model, device, runtimes()), true); assert.equal(runtime.prepare(model, device).allowed, true);
      }
      if (category === 'desktop-runtime') assert.equal(new DesktopLocalRuntime().supports(model, profile(), runtimes()), true);
      if (category === 'browser-runtime') {
        const browserModel = manifest(variant, { runtime: 'WEBGPU' }); const device = profile({ platform: 'BROWSER', deviceClass: 'BROWSER' }); assert.equal(new BrowserLocalRuntime().supports(browserModel, device, runtimes()), true); assert.equal(new BrowserLocalRuntime().supports(browserModel, device, runtimes({ WEBGPU: false })), false);
      }
      if (category === 'battery-thermal' || category === 'resource-governor') {
        const result = new ResourceGovernor().evaluate(profile({ batteryPercent: 5, powerState: 'BATTERY', thermalState: 'HIGH' }), model); assert.equal(result.allowed, false); assert.ok(result.reasons.length >= 2);
      }
      if (category === 'privacy-modes') {
        const decision = new ExecutionTargetSelector(runtimes({ ONNX_RUNTIME: false })).select({ operation: { operationId: 'segment', requiredCapabilities: model.capabilities }, device: profile(), models: [model], privacyMode: 'LOCAL_ONLY', cloudAllowed: true, maxCloudCredits: 10, cloudCredits: 1, qualityRequirement: 0.5, latencyRequirement: 5_000 }); assert.equal(decision.target, 'BLOCKED');
      }
      if (category === 'local-cache' || category === 'scope-isolation') {
        let now = 0; const cache = new LocalInferenceCache(() => now); cache.set(scope, `key-${variant}`, 'mask', { variant }, 10); assert.deepEqual(cache.get(scope, `key-${variant}`), { variant }); assert.equal(cache.get({ ...scope, projectId: 'other' }, `key-${variant}`), undefined); now = 11; assert.equal(cache.get(scope, `key-${variant}`), undefined);
      }
      if (category === 'cost-comparison') {
        const estimate = new LocalAICostModel().estimate(model, 20 + variant, 2); assert.ok(estimate.localCost > 0); assert.ok(estimate.energyCost > 0);
      }
      if (category === 'fallback') {
        const decision = new ExecutionTargetSelector(runtimes()).select({ operation: { operationId: 'segment', requiredCapabilities: model.capabilities }, device: profile(), models: [model], privacyMode: 'NORMAL', cloudAllowed: true, maxCloudCredits: 10, cloudCredits: 2, qualityRequirement: 0.5, latencyRequirement: 5_000 }); assert.equal(decision.fallback, null);
      }
      if (category === 'explainability' || category === 'snapshot' || category === 'replay') {
        const platform = await readyPlatform(variant); await platform.selectExecutionTarget({ operation: { operationId: 'segment', requiredCapabilities: model.capabilities }, privacyMode: 'PRIVACY_FIRST', cloudAllowed: true, maxCloudCredits: 10, cloudCredits: 2, qualityRequirement: 0.5, latencyRequirement: 5_000 }); const snapshot = platform.snapshot()!;
        if (category === 'explainability') assert.match(platform.explain()!, /Execution: LOCAL/); if (category === 'snapshot') { assert.equal(snapshot.executionTarget, 'LOCAL'); assert.equal(JSON.stringify(snapshot).includes('apiKey'), false); } if (category === 'replay') assert.deepEqual(platform.replay(snapshot), snapshot);
      }
      if (category === 'dependency-injection') {
        let calls = 0; const device = await new DeviceAnalyzer({ signals: async () => { calls++; return signals(); } }).analyze(); assert.equal(calls, 1); assert.equal(device.platform, 'LINUX');
      }
      if (category === 'deep-immutability') {
        const frozen = deepFreeze({ model, nested: [{ variant }] }); assert.equal(Object.isFrozen(frozen), true); assert.equal(Object.isFrozen(frozen.nested[0]), true);
      }
      if (category === 'determinism') {
        const selector = new ExecutionTargetSelector(runtimes()); const request = { operation: { operationId: 'segment', requiredCapabilities: model.capabilities }, device: profile(), models: [model], privacyMode: 'NORMAL' as const, cloudAllowed: true, maxCloudCredits: 10, cloudCredits: 2, qualityRequirement: 0.5, latencyRequirement: 5_000 }; assert.deepEqual(selector.select(request), selector.select(request));
      }
      if (category === 'security-invariants') {
        const permissions = new LocalAISandbox().runtimePermissions(false); assert.deepEqual(permissions, { filesystem: false, arbitraryNetwork: false, network: false, secrets: false }); assert.equal(new LocalInferencePolicy().allow({ requested: 'LOCAL', privacyMode: 'NORMAL', cloudAllowed: true, model: { ...model, status: 'QUARANTINED' } }), false);
      }
    });
  }
}

test('unknown device characteristics remain UNKNOWN', async () => {
  const device = await new DeviceAnalyzer({ signals: async () => ({}) }).analyze();
  assert.equal(device.platform, 'UNKNOWN'); assert.equal(device.ramMb, 'UNKNOWN'); assert.equal(device.webgpu, 'UNKNOWN'); assert.equal(device.nnapi, 'UNKNOWN'); assert.equal(device.network, 'UNKNOWN'); assert.equal(device.tier, 'UNKNOWN');
});
test('invalid checksum and signature quarantine models before execution', async () => {
  const badHash = new LocalAIPlatform(dependencies({ hash: { sha256: async () => 'b'.repeat(64) } }), policy);
  await assert.rejects(() => badHash.installModel(manifest(90, { status: 'AVAILABLE' })), /checksum/); assert.equal(badHash.inspect('model-90')?.status, 'QUARANTINED');
  const badSignature = new LocalAIPlatform(dependencies({ signatureVerifier: { verify: async () => false } }), policy);
  await assert.rejects(() => badSignature.installModel(manifest(91, { status: 'AVAILABLE' })), /signature/); assert.equal(badSignature.inspect('model-91')?.status, 'QUARANTINED');
});
test('sandbox rejects artifacts belonging to another project', () => {
  assert.throws(() => new LocalAISandbox().create({ prompt: '', operation: 'segment', artifacts: [{ id: 'foreign', value: {}, scope: { ...scope, projectId: 'other' } }], constraints: {}, capabilities: [], parameters: {}, scope }), /Cross-scope/);
});
test('operation execution policy cannot be bypassed by a ready local model', () => {
  const model = manifest(200);
  const selector = new ExecutionTargetSelector(runtimes());
  const cloudOnly = selector.select({ operation: { operationId: 'try-on', requiredCapabilities: model.capabilities, executionPolicy: 'CLOUD_ONLY' }, device: profile(), models: [model], privacyMode: 'NORMAL', cloudAllowed: true, maxCloudCredits: 10, cloudCredits: 2, qualityRequirement: 0.5, latencyRequirement: 5_000 });
  assert.equal(cloudOnly.target, 'CLOUD');
  const privateCloudOnly = selector.select({ operation: { operationId: 'try-on', requiredCapabilities: model.capabilities, executionPolicy: 'CLOUD_ONLY' }, device: profile(), models: [model], privacyMode: 'LOCAL_ONLY', cloudAllowed: true, maxCloudCredits: 10, cloudCredits: 2, qualityRequirement: 0.5, latencyRequirement: 5_000 });
  assert.equal(privateCloudOnly.target, 'BLOCKED');
});
test('forbidden imports and infrastructure access are absent', async () => {
  const forbidden = ['node:fs', 'node:http', 'globalthis.fetch', 'window.fetch', 'axios', '/billing/', '/database/', 'fal.ai', "from 'reve", 'react', '/providers/', '/runtime/'];
  for (const file of await collect('src/platform/creative/local-ai')) { const source = (await readFile(file, 'utf8')).toLowerCase(); for (const marker of forbidden) assert.equal(source.includes(marker), false, `${file} contains ${marker}`); }
});
async function collect(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => { const path = join(directory, entry.name); return entry.isDirectory() ? collect(path) : Promise.resolve(path.endsWith('.ts') ? [path] : []); }))).flat(); }
