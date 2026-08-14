import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DesktopLocalRuntime, LocalResultVerifier, MobileLocalRuntime, ModelBundleBuilder, OnnxLocalRuntime, WebLocalRuntime, compareLocalCloud, deepFreeze, type DeviceCapabilityProfile, type ModelManifest, type RuntimeCapabilities } from '../src/platform/creative/local-ai/index.ts';

const capabilities = (enabled: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities => ({ ONNX_RUNTIME: false, WEBGPU: false, WASM: false, NNAPI: false, DIRECTML: false, CUDA: false, METAL: false, VULKAN: false, ...enabled });
const device = (values: Partial<DeviceCapabilityProfile> = {}): DeviceCapabilityProfile => ({ platform: 'BROWSER', deviceClass: 'BROWSER', cpuCores: 8, ramMb: 8192, gpu: 'test', vramMb: 2048, npu: 'UNKNOWN', architecture: 'arm64', browser: 'test', webgpu: true, wasm: true, webnn: false, cuda: false, directml: false, metal: false, vulkan: false, storageFreeBytes: 1e9, batteryPercent: 100, powerState: 'FULL', thermalState: 'NORMAL', network: 'ONLINE', tier: 'HIGH', ramPressure: 'NORMAL', backgroundRestricted: false, ...values });
const manifest = (values: Partial<ModelManifest> = {}): ModelManifest => ({ modelId: 'analysis-tiny', version: '1.0.0', family: 'MobileNet', capabilities: ['image-analysis'], modelFormat: 'ONNX', runtime: 'WEBGPU', sizeBytes: 4, requiredRam: 64, requiredVram: 0, supportedPlatforms: ['BROWSER'], supportedAccelerators: ['WEBGPU', 'WASM'], estimatedLatency: 10, qualityScore: .9, energyScore: .9, privacyLevel: 'PRIVATE', license: 'Apache-2.0', publisher: 'trusted', downloadUri: 'https://models.example/a.onnx', sha256: 'a'.repeat(64), signature: 'signature', status: 'READY', stabilityScore: .99, ...values });
const result = (quality = 1) => ({ requestId: 'r', modelId: 'm', outputs: { output: { data: new Float32Array([1, 2, 3, 4]), dims: [1, 1, 2, 2] } }, provider: 'wasm' as const, latencyMs: 1, memoryBytes: 16, artifact: { id: 'a', kind: 'TENSOR' as const, mimeType: 'application/x-local-ai-tensor', width: 2, height: 2, data: { value: 1 }, metadata: { quality, maskQuality: quality } } });

const categories = ['webgpu', 'wasm-fallback', 'web-blocked', 'desktop-cuda', 'desktop-dml', 'desktop-metal', 'desktop-cpu', 'mobile-nnapi', 'mobile-metal', 'mobile-policy', 'bundles', 'comparison-local', 'comparison-cloud', 'verification-valid', 'verification-quality', 'verification-shape', 'immutability', 'runtime-health', 'runtime-inference', 'runtime-unload'] as const;
for (const category of categories) for (let variant = 1; variant <= 9; variant += 1) test(`${category} deterministic case ${variant}`, async () => {
  if (category === 'webgpu') assert.equal(new WebLocalRuntime().selectProvider(capabilities({ WEBGPU: true, WASM: true })), 'webgpu');
  if (category === 'wasm-fallback') assert.equal(new WebLocalRuntime().selectProvider(capabilities({ WASM: true })), 'wasm');
  if (category === 'web-blocked') assert.equal(new WebLocalRuntime().selectProvider(capabilities()), 'BLOCKED');
  if (category === 'desktop-cuda') assert.equal(new DesktopLocalRuntime().selectProvider(device({ platform: 'LINUX', deviceClass: 'DESKTOP' }), capabilities({ CUDA: true })), 'cuda');
  if (category === 'desktop-dml') assert.equal(new DesktopLocalRuntime().selectProvider(device({ platform: 'WINDOWS', deviceClass: 'DESKTOP' }), capabilities({ DIRECTML: true })), 'dml');
  if (category === 'desktop-metal') assert.equal(new DesktopLocalRuntime().selectProvider(device({ platform: 'MACOS', deviceClass: 'DESKTOP' }), capabilities({ METAL: true })), 'coreml');
  if (category === 'desktop-cpu') assert.equal(new DesktopLocalRuntime().selectProvider(device({ platform: 'LINUX', deviceClass: 'DESKTOP' }), capabilities({ ONNX_RUNTIME: true })), 'cpu');
  if (category === 'mobile-nnapi') assert.equal(new MobileLocalRuntime().selectProvider(device({ platform: 'ANDROID', deviceClass: 'MOBILE' }), capabilities({ NNAPI: true })), 'nnapi');
  if (category === 'mobile-metal') assert.equal(new MobileLocalRuntime().selectProvider(device({ platform: 'IOS', deviceClass: 'MOBILE' }), capabilities({ METAL: true })), 'coreml');
  if (category === 'mobile-policy') assert.equal(new MobileLocalRuntime().prepare(manifest({ energyScore: .1 }), device({ platform: 'ANDROID', deviceClass: 'MOBILE', powerState: 'BATTERY', batteryPercent: 10 })).allowed, false);
  if (category === 'bundles') assert.equal(new ModelBundleBuilder().recommend(device(), capabilities({ WEBGPU: true }), [manifest({ modelId: `m-${variant}` })]).modelIds.length, 1);
  if (category === 'comparison-local') assert.equal(compareLocalCloud({ latencyMs: 10, quality: .9, cost: 0 }, { latencyMs: 20, quality: .9, cost: 4 }).target, 'LOCAL');
  if (category === 'comparison-cloud') assert.equal(compareLocalCloud({ latencyMs: 10, quality: .2, cost: 0 }, { latencyMs: 20, quality: .9, cost: 4 }, .8).target, 'CLOUD');
  if (category === 'verification-valid') assert.equal(new LocalResultVerifier().verify(result()).valid, true);
  if (category === 'verification-quality') assert.equal(new LocalResultVerifier().verify(result(.2), { qualityThreshold: .8 }).valid, false);
  if (category === 'verification-shape') assert.equal(new LocalResultVerifier().verify({ ...result(), outputs: { bad: { data: [], dims: [0] } } }).valid, false);
  if (category === 'immutability') { const value = deepFreeze({ nested: [variant] }); assert.ok(Object.isFrozen(value.nested)); }
  if (category.startsWith('runtime-')) {
    let released = false; const runtime = new OnnxLocalRuntime({ create: async () => ({ run: async (inputs) => inputs, release: () => { released = true; } }) }, ['wasm'], (() => { let time = 0; return () => ++time; })());
    await runtime.load(manifest(), new Uint8Array([1]));
    if (category === 'runtime-health') assert.equal(runtime.health().status, 'READY');
    if (category === 'runtime-inference') assert.equal((await runtime.infer({ requestId: `r-${variant}`, inputs: { image: { data: [variant], dims: [1] } } })).modelId, 'analysis-tiny');
    if (category === 'runtime-unload') { await runtime.unload(); assert.equal(runtime.health().status, 'UNLOADED'); assert.equal(released, true); }
  }
});

test('local-ai scope has no forbidden imports or direct network/filesystem access', async () => { for (const file of await collect('src/platform/creative/local-ai')) { const source = (await readFile(file, 'utf8')).toLowerCase(); for (const marker of ["from 'react", "from '../decision", "from '../providers", 'node:fs', 'node:http', 'axios']) assert.equal(source.includes(marker), false, `${file} contains ${marker}`); } });
async function collect(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? collect(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])))).flat(); }
