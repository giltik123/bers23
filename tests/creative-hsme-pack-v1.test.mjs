import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_PACK_V1_SCHEMA,
  HsmePackReadinessPlannerV1,
  HsmePackV1Error,
  evaluateHsmePackReadinessV1,
  hsmePackDescriptorV1Digest,
  normalizeHsmeCoreAdmissionV1,
  normalizeHsmePackDescriptorV1,
  serializeHsmePackDescriptorV1,
} from '../src/platform/creative/local-ai/hsme/HsmePackV1.ts';

const BASE_SHA = 'a'.repeat(64);
const EXPERT_SHA = 'b'.repeat(64);

const descriptor = (overrides = {}) => ({
  schemaVersion: HSME_PACK_V1_SCHEMA,
  packId: 'bers-mobile-edit',
  packVersion: '1.0.0',
  capabilities: ['image-edit', 'fashion', 'image-edit'],
  roots: [
    { role: 'EXPERT', modelId: 'bers-fashion-adapter-webgpu', version: '1.0.0', sha256: EXPERT_SHA, expertId: 'fashion' },
    { role: 'BASE', modelId: 'bers-dense-core-webgpu', version: '1.0.0', sha256: BASE_SHA },
  ],
  routing: { mode: 'ADAPTER_TOP1', maxActiveExperts: 1 },
  resources: { peakMemoryBytes: 512 * 1024 * 1024, maxResidentBytes: 420 * 1024 * 1024, maxPrefetchBytes: 96 * 1024 * 1024 },
  ...overrides,
});

function manifest(modelId, sha256, overrides = {}) {
  return {
    modelId,
    version: '1.0.0',
    family: 'hsme-test',
    capabilities: ['image-edit'],
    modelFormat: 'ONNX',
    runtime: 'WEBGPU',
    sizeBytes: 128 * 1024 * 1024,
    requiredRam: 512,
    requiredVram: 0,
    supportedPlatforms: ['BROWSER'],
    supportedAccelerators: ['WEBGPU'],
    estimatedLatency: 1000,
    qualityScore: 0.9,
    energyScore: 0.8,
    privacyLevel: 'PRIVATE',
    license: 'TEST',
    publisher: 'bers',
    downloadUri: `https://models.invalid/${modelId}/1.0.0`,
    sha256,
    signature: 'signed-by-existing-fleet-root',
    status: 'READY',
    stabilityScore: 0.99,
    ...overrides,
  };
}

function fleetVersion(modelId, sha256, overrides = {}) {
  const item = manifest(modelId, sha256, overrides.manifest ?? {});
  return {
    modelId,
    version: '1.0.0',
    manifest: item,
    manifestId: `bers/${modelId}@1.0.0`,
    manifestBinding: 'opaque-existing-fleet-binding',
    expectedSha256: sha256,
    contentHash: sha256,
    installedBytes: item.sizeBytes,
    status: 'READY',
    failureCount: 0,
    createdAt: 1,
    updatedAt: 2,
    activatedAt: 2,
    ...overrides,
    manifest: item,
  };
}

function fleet(overrides = {}) {
  const base = fleetVersion('bers-dense-core-webgpu', BASE_SHA);
  const expert = fleetVersion('bers-fashion-adapter-webgpu', EXPERT_SHA);
  return {
    schemaVersion: 1,
    revision: 9,
    models: {
      'bers-dense-core-webgpu': { modelId: 'bers-dense-core-webgpu', activeVersion: '1.0.0', versions: { '1.0.0': base }, history: [] },
      'bers-fashion-adapter-webgpu': { modelId: 'bers-fashion-adapter-webgpu', activeVersion: '1.0.0', versions: { '1.0.0': expert }, history: [] },
      ...(overrides.models ?? {}),
    },
    ...overrides,
  };
}

function device(overrides = {}) {
  return {
    platform: 'BROWSER', deviceClass: 'BROWSER', cpuCores: 8, ramMb: 4096,
    gpu: 'test-gpu', vramMb: 'UNKNOWN', npu: 'UNKNOWN', architecture: 'x64', browser: 'Chrome',
    webgpu: true, wasm: true, webnn: 'UNKNOWN', nnapi: 'UNKNOWN', cuda: false, directml: false,
    metal: false, vulkan: false, storageFreeBytes: 4 * 1024 * 1024 * 1024,
    batteryPercent: 80, powerState: 'CHARGING', thermalState: 'NORMAL', network: 'ONLINE', tier: 'HIGH',
    ramPressure: 'NORMAL', backgroundRestricted: false,
    ...overrides,
  };
}

function runtimes(overrides = {}) {
  return {
    ONNX_RUNTIME: true, WEBGPU: true, WASM: true, NNAPI: false,
    DIRECTML: false, CUDA: false, METAL: false, VULKAN: false,
    ...overrides,
  };
}

const admission = (overrides = {}) => ({ target: 'LOCAL', policy: 'LOCAL_ONLY', localSubgraphAdmitted: true, ...overrides });
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof HsmePackV1Error && error.code === code);
}

async function expectCodeAsync(fn, code) {
  await assert.rejects(fn, error => error instanceof HsmePackV1Error && error.code === code);
}

test('descriptor normalizes set-like fields and root order into stable bytes and digest', async () => {
  const first = normalizeHsmePackDescriptorV1(descriptor());
  const raw = descriptor();
  const second = normalizeHsmePackDescriptorV1({
    resources: raw.resources,
    routing: raw.routing,
    roots: [...raw.roots].reverse(),
    capabilities: ['fashion', 'image-edit'],
    packVersion: raw.packVersion,
    packId: raw.packId,
    schemaVersion: raw.schemaVersion,
  });
  assert.deepEqual(first.capabilities, ['fashion', 'image-edit']);
  assert.equal(first.roots[0].role, 'BASE');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.roots[0]), true);
  assert.equal(serializeHsmePackDescriptorV1(first), serializeHsmePackDescriptorV1(second));
  assert.equal(await hsmePackDescriptorV1Digest(first, hashPort), await hsmePackDescriptorV1Digest(second, hashPort));
});

test('descriptor rejects a second model trust/provenance vocabulary', () => {
  expectCode(() => normalizeHsmePackDescriptorV1({ ...descriptor(), provider: 'fal' }), 'hsme_pack_exact_schema_violation');
  expectCode(() => normalizeHsmePackDescriptorV1({
    ...descriptor(),
    roots: [{ ...descriptor().roots[0], downloadUri: 'https://evil.invalid/model' }, descriptor().roots[1]],
  }), 'hsme_pack_exact_schema_violation');
  expectCode(() => normalizeHsmePackDescriptorV1({
    ...descriptor(),
    roots: [{ ...descriptor().roots[0], signature: 'forged' }, descriptor().roots[1]],
  }), 'hsme_pack_exact_schema_violation');
});

test('descriptor rejects prototype pollution, duplicate roots/experts and invalid routing capacity', () => {
  const polluted = JSON.parse(JSON.stringify(descriptor()));
  polluted.routing = JSON.parse('{"mode":"ADAPTER_TOP1","maxActiveExperts":1,"__proto__":{"admin":true}}');
  expectCode(() => normalizeHsmePackDescriptorV1(polluted), 'hsme_pack_exact_schema_violation');
  expectCode(() => normalizeHsmePackDescriptorV1({ ...descriptor(), roots: [descriptor().roots[1], descriptor().roots[1]] }), 'hsme_pack_root_duplicate');
  expectCode(() => normalizeHsmePackDescriptorV1({ ...descriptor(), routing: { mode: 'ADAPTER_TOP2', maxActiveExperts: 2 } }), 'hsme_pack_routing_invalid');
  expectCode(() => normalizeHsmePackDescriptorV1({ ...descriptor(), routing: { mode: 'ADAPTER_TOP1', maxActiveExperts: 2 } }), 'hsme_pack_routing_invalid');
});

test('exact active verified fleet roots yield READY without any cloud fallback proposal', () => {
  const result = evaluateHsmePackReadinessV1(descriptor(), fleet(), admission(), device(), runtimes());
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.roots.map(root => root.status), ['READY', 'READY']);
  assert.equal(result.coreTarget, 'LOCAL');
  assert.equal(result.executionPolicy, 'LOCAL_ONLY');
  assert.equal(Object.hasOwn(result, 'suggestedTarget'), false);
  assert.equal(JSON.stringify(result).includes('CLOUD_ALLOWED'), false);
});

test('missing or inactive roots require preparation but cannot silently execute or fall back', () => {
  const missingFleet = fleet();
  delete missingFleet.models['bers-fashion-adapter-webgpu'];
  const missing = evaluateHsmePackReadinessV1(descriptor(), missingFleet, admission(), device(), runtimes());
  assert.equal(missing.status, 'PREPARE_REQUIRED');
  assert.ok(missing.reasons.some(reason => reason.startsWith('ROOT_MISSING:')));

  const inactiveFleet = fleet();
  inactiveFleet.models['bers-fashion-adapter-webgpu'].activeVersion = undefined;
  const inactive = evaluateHsmePackReadinessV1(descriptor(), inactiveFleet, admission(), device(), runtimes());
  assert.equal(inactive.status, 'PREPARE_REQUIRED');
  assert.ok(inactive.reasons.some(reason => reason.startsWith('ROOT_NOT_ACTIVE:')));
});

test('fleet hash substitution and quarantine fail closed', () => {
  const substituted = fleet();
  substituted.models['bers-fashion-adapter-webgpu'].versions['1.0.0'].contentHash = 'c'.repeat(64);
  const mismatch = evaluateHsmePackReadinessV1(descriptor(), substituted, admission(), device(), runtimes());
  assert.equal(mismatch.status, 'BLOCKED');
  assert.ok(mismatch.reasons.some(reason => reason.startsWith('ROOT_INTEGRITY_MISMATCH:')));

  const quarantined = fleet();
  quarantined.models['bers-fashion-adapter-webgpu'].versions['1.0.0'].status = 'QUARANTINED';
  const blocked = evaluateHsmePackReadinessV1(descriptor(), quarantined, admission(), device(), runtimes());
  assert.equal(blocked.status, 'BLOCKED');
  assert.ok(blocked.reasons.some(reason => reason.startsWith('ROOT_QUARANTINED:')));
});

test('Core target/policy remains authoritative for local and hybrid execution', () => {
  for (const coreAdmission of [
    admission({ target: 'CLOUD', policy: 'CLOUD_ALLOWED', localSubgraphAdmitted: false }),
    admission({ target: 'HYBRID', policy: 'CLOUD_ALLOWED', localSubgraphAdmitted: false }),
    admission({ target: 'HYBRID', policy: 'LOCAL_ONLY', localSubgraphAdmitted: true }),
    admission({ target: 'BLOCKED', localSubgraphAdmitted: false }),
  ]) {
    assert.equal(evaluateHsmePackReadinessV1(descriptor(), fleet(), coreAdmission, device(), runtimes()).status, 'BLOCKED');
  }
  const admittedHybrid = evaluateHsmePackReadinessV1(
    descriptor(), fleet(), admission({ target: 'HYBRID', policy: 'CLOUD_ALLOWED', localSubgraphAdmitted: true }), device(), runtimes(),
  );
  assert.equal(admittedHybrid.status, 'READY');
  assert.equal(admittedHybrid.coreTarget, 'HYBRID');
});

test('Core admission is exact-schema and rejects provider, billing or model authority injection', () => {
  for (const injected of [
    admission({ provider: 'fal' }),
    admission({ billing: { credits: 100 } }),
    admission({ modelId: 'untrusted-model' }),
  ]) {
    expectCode(() => normalizeHsmeCoreAdmissionV1(injected), 'hsme_pack_exact_schema_violation');
    expectCode(() => evaluateHsmePackReadinessV1(descriptor(), fleet(), injected, device(), runtimes()), 'hsme_pack_exact_schema_violation');
  }
  assert.deepEqual(normalizeHsmeCoreAdmissionV1(admission()), admission());
});

test('unknown or unsupported device evidence and aggregate memory fail closed', () => {
  assert.equal(evaluateHsmePackReadinessV1(descriptor(), fleet(), admission(), device({ ramMb: 'UNKNOWN' }), runtimes()).status, 'BLOCKED');
  assert.equal(evaluateHsmePackReadinessV1(descriptor(), fleet(), admission(), device({ platform: 'UNKNOWN' }), runtimes()).status, 'BLOCKED');
  assert.equal(evaluateHsmePackReadinessV1(descriptor(), fleet(), admission(), device(), runtimes({ WEBGPU: 'UNKNOWN' })).status, 'BLOCKED');
  assert.equal(evaluateHsmePackReadinessV1(descriptor(), fleet(), admission(), device({ ramMb: 128 }), runtimes()).status, 'BLOCKED');
  assert.equal(evaluateHsmePackReadinessV1(descriptor(), fleet(), admission(), device({ thermalState: 'CRITICAL' }), runtimes()).status, 'BLOCKED');
  assert.equal(evaluateHsmePackReadinessV1(descriptor(), fleet(), admission(), device({ backgroundRestricted: true }), runtimes()).status, 'BLOCKED');
});

test('planner uses only the read-only fleet state port', async () => {
  let reads = 0;
  let mutations = 0;
  const fleetPort = {
    state: async () => { reads += 1; return fleet(); },
    install: async () => { mutations += 1; throw new Error('must not be called'); },
  };
  const planner = new HsmePackReadinessPlannerV1(fleetPort);
  const result = await planner.plan({ descriptor: descriptor(), admission: admission(), device: device(), runtimes: runtimes() });
  assert.equal(result.status, 'READY');
  assert.equal(reads, 1);
  assert.equal(mutations, 0);
});

test('digest rejects a malformed HashPort result', async () => {
  await expectCodeAsync(() => hsmePackDescriptorV1Digest(normalizeHsmePackDescriptorV1(descriptor()), { sha256: async () => 'not-a-sha' }), 'hsme_pack_hash_port_invalid');
});
