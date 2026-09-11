import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_PREPARATION_EVIDENCE_V1_SCHEMA,
  HSME_PREPARATION_V1_SCHEMA,
  HsmePreparationPlannerV1,
  HsmePreparationV1Error,
  hsmePreparationPlanV1Digest,
  normalizeHsmePreparationEvidenceV1,
  normalizeHsmePreparationSelectionV1,
  normalizeHsmeResidencySnapshotV1,
} from '../src/platform/creative/local-ai/hsme/HsmePreparationV1.ts';
import { hsmePackDescriptorV1Digest } from '../src/platform/creative/local-ai/hsme/HsmePackV1.ts';

const MB = 1024 * 1024;
const BASE_SHA = 'a'.repeat(64);
const EXPERT_SHA = 'b'.repeat(64);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

const descriptor = {
  schemaVersion: 'BERS_HSME_PACK_V1', packId: 'bers-mobile-edit', packVersion: '1.0.0', capabilities: ['image-edit'],
  roots: [
    { role: 'BASE', modelId: 'bers-dense-core-webgpu', version: '1.0.0', sha256: BASE_SHA },
    { role: 'EXPERT', modelId: 'bers-fashion-adapter-webgpu', version: '1.0.0', sha256: EXPERT_SHA, expertId: 'fashion' },
  ],
  routing: { mode: 'ADAPTER_TOP1', maxActiveExperts: 1 },
  resources: { peakMemoryBytes: 512 * MB, maxResidentBytes: 420 * MB, maxPrefetchBytes: 96 * MB },
};

function manifest(modelId, sha256, status = 'READY') {
  return {
    modelId, version: '1.0.0', family: 'hsme-test', capabilities: ['image-edit'], modelFormat: 'ONNX', runtime: 'WEBGPU',
    sizeBytes: 128 * MB, requiredRam: 512, requiredVram: 0, supportedPlatforms: ['BROWSER'], supportedAccelerators: ['WEBGPU'],
    estimatedLatency: 1000, qualityScore: 0.9, energyScore: 0.8, privacyLevel: 'PRIVATE', license: 'TEST', publisher: 'bers',
    downloadUri: `https://models.invalid/${modelId}/1.0.0`, sha256, signature: 'signed-by-fleet-root', status, stabilityScore: 0.99,
  };
}

const manifests = new Map([
  ['bers-dense-core-webgpu@1.0.0', manifest('bers-dense-core-webgpu', BASE_SHA)],
  ['bers-fashion-adapter-webgpu@1.0.0', manifest('bers-fashion-adapter-webgpu', EXPERT_SHA)],
]);
const resolver = { resolve: (modelId, version) => manifests.get(`${modelId}@${version}`) };

const device = {
  platform: 'BROWSER', deviceClass: 'BROWSER', cpuCores: 8, ramMb: 4096, gpu: 'test-gpu', vramMb: 'UNKNOWN', npu: 'UNKNOWN', architecture: 'x64', browser: 'Chrome',
  webgpu: true, wasm: true, webnn: 'UNKNOWN', nnapi: false, cuda: false, directml: false, metal: false, vulkan: false,
  storageFreeBytes: 4 * 1024 * MB, batteryPercent: 80, powerState: 'CHARGING', thermalState: 'NORMAL', network: 'ONLINE', tier: 'HIGH', ramPressure: 'NORMAL', backgroundRestricted: false,
};
const runtimes = { ONNX_RUNTIME: true, WEBGPU: true, WASM: true, NNAPI: false, DIRECTML: false, CUDA: false, METAL: false, VULKAN: false };

function readiness(expertStatus = 'READY') {
  const status = expertStatus === 'READY' ? 'READY' : expertStatus === 'MISSING' || expertStatus === 'NOT_ACTIVE' || expertStatus === 'NOT_READY' ? 'PREPARE_REQUIRED' : 'BLOCKED';
  return {
    schemaVersion: 1, descriptorId: 'bers-mobile-edit@1.0.0', status, coreTarget: 'LOCAL', executionPolicy: 'LOCAL_ONLY', fleetRevision: 9,
    reasons: status === 'READY' ? [] : [`ROOT_${expertStatus}:bers-fashion-adapter-webgpu@1.0.0`],
    roots: [
      { role: 'BASE', identity: 'bers-dense-core-webgpu@1.0.0', sha256: BASE_SHA, status: 'READY', runtime: 'WEBGPU' },
      { role: 'EXPERT', identity: 'bers-fashion-adapter-webgpu@1.0.0', sha256: EXPERT_SHA, expertId: 'fashion', status: expertStatus, ...(expertStatus === 'MISSING' ? {} : { runtime: 'WEBGPU' }) },
    ],
    resourceEvidence: { requiredPeakMemoryBytes: 512 * MB, availableRamBytes: 4096 * MB },
  };
}

async function residency(digest, roots = [], budgets = {}) {
  return {
    schemaVersion: 1, descriptorDigest: digest, fleetRevision: 9,
    budgets: { ramBytes: 512 * MB, acceleratorBytes: 512 * MB, storageFreeBytes: 4 * 1024 * MB, ...budgets }, roots,
  };
}

async function packDigest() {
  return hsmePackDescriptorV1Digest(descriptor, hashPort);
}

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof HsmePreparationV1Error && error.code === code);
}
async function expectCodeAsync(fn, code) {
  await assert.rejects(fn, error => error instanceof HsmePreparationV1Error && error.code === code);
}

async function plan({ expertStatus = 'READY', roots = [], budgets = {}, runtimeOverrides = {}, resolverOverride = resolver } = {}) {
  const digest = await packDigest();
  return new HsmePreparationPlannerV1(resolverOverride, hashPort).plan({
    descriptor, readiness: readiness(expertStatus), device, runtimes: { ...runtimes, ...runtimeOverrides },
    residency: await residency(digest, roots, budgets), selection: { activeExpertIds: ['fashion'] },
  });
}

test('fully accelerator-resident verified pack is READY with zero network or movement', async () => {
  const result = await plan({ roots: [
    { modelId: 'bers-dense-core-webgpu', version: '1.0.0', sha256: BASE_SHA, ramResidentBytes: 0, acceleratorResidentBytes: 128 * MB },
    { modelId: 'bers-fashion-adapter-webgpu', version: '1.0.0', sha256: EXPERT_SHA, ramResidentBytes: 0, acceleratorResidentBytes: 128 * MB },
  ] });
  assert.equal(result.schemaVersion, HSME_PREPARATION_V1_SCHEMA);
  assert.equal(result.status, 'READY');
  assert.equal(result.totals.networkAcquisitionBytes, 0);
  assert.equal(result.totals.flashToRamBytes, 0);
  assert.equal(result.totals.ramToAcceleratorBytes, 0);
  assert.equal(result.totals.networkBytesDuringExecution, 0);
  assert.deepEqual(result.roots.map(root => root.cache), ['ACCELERATOR_HIT', 'ACCELERATOR_HIT']);
});

test('installed verified roots plan deterministic flash-to-RAM-to-accelerator movement without network', async () => {
  const first = await plan();
  const second = await plan();
  assert.equal(first.status, 'PREPARE_REQUIRED');
  assert.equal(first.totals.networkAcquisitionBytes, 0);
  assert.equal(first.totals.flashToRamBytes, 256 * MB);
  assert.equal(first.totals.ramToAcceleratorBytes, 256 * MB);
  assert.equal(first.totals.ramWorkingBytes, 128 * MB);
  assert.equal(first.totals.acceleratorResidentBytes, 256 * MB);
  assert.equal(first.totals.prefetchBytes, 0);
  assert.equal(await hsmePreparationPlanV1Digest(first, hashPort), await hsmePreparationPlanV1Digest(second, hashPort));
  assert.deepEqual(first, second);
});

test('missing root becomes bounded fleet preparation requirement, never direct HSME download authority', async () => {
  const result = await plan({ expertStatus: 'MISSING', roots: [
    { modelId: 'bers-dense-core-webgpu', version: '1.0.0', sha256: BASE_SHA, ramResidentBytes: 0, acceleratorResidentBytes: 128 * MB },
  ] });
  const expert = result.roots.find(root => root.expertId === 'fashion');
  assert.equal(result.status, 'PREPARE_REQUIRED');
  assert.equal(expert.lifecycleRequirement, 'ENSURE_READY_ACTIVE');
  assert.equal(expert.networkAcquisitionBytes, 128 * MB);
  assert.equal(expert.storageReservationBytes, 256 * MB);
  assert.equal(result.totals.networkBytesDuringExecution, 0);
  assert.equal(JSON.stringify(result).includes('downloadUri'), false);
  assert.equal(JSON.stringify(result).includes('provider'), false);
});

test('hard storage and accelerator budgets block before materialization', async () => {
  const storageBlocked = await plan({ expertStatus: 'MISSING', budgets: { storageFreeBytes: 128 * MB } });
  assert.equal(storageBlocked.status, 'BLOCKED');
  assert.ok(storageBlocked.reasons.includes('RUNTIME_STORAGE_BUDGET_EXCEEDED'));

  const acceleratorBlocked = await plan({ budgets: { acceleratorBytes: 128 * MB } });
  assert.equal(acceleratorBlocked.status, 'BLOCKED');
  assert.ok(acceleratorBlocked.reasons.includes('RUNTIME_ACCELERATOR_BUDGET_EXCEEDED'));
});

test('runtime/platform incompatibility blocks missing-pack preparation rather than downloading unusable bytes', async () => {
  const result = await plan({ expertStatus: 'MISSING', runtimeOverrides: { WEBGPU: false } });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasons.some(reason => reason.startsWith('RUNTIME_UNAVAILABLE:')));
});

test('selection and residency schemas reject widening, unknown experts and prototype pollution', async () => {
  expectCode(() => normalizeHsmePreparationSelectionV1({ activeExpertIds: ['fashion'], provider: 'cloud' }, descriptor), 'hsme_preparation_exact_schema_violation');
  expectCode(() => normalizeHsmePreparationSelectionV1({ activeExpertIds: ['other'] }, descriptor), 'hsme_preparation_selection_invalid');
  const polluted = JSON.parse(`{"schemaVersion":1,"descriptorDigest":"${'a'.repeat(64)}","fleetRevision":9,"budgets":{"ramBytes":1,"acceleratorBytes":1,"storageFreeBytes":1},"roots":[],"__proto__":{"admin":true}}`);
  expectCode(() => normalizeHsmeResidencySnapshotV1(polluted), 'hsme_preparation_exact_schema_violation');
});

test('residency cannot claim budgets larger than known physical device evidence', async () => {
  const digest = await packDigest();
  await expectCodeAsync(() => new HsmePreparationPlannerV1(resolver, hashPort).plan({
    descriptor, readiness: readiness(), device: { ...device, vramMb: 256 }, runtimes,
    residency: { schemaVersion: 1, descriptorDigest: digest, fleetRevision: 9, budgets: { ramBytes: 512 * MB, acceleratorBytes: 512 * MB, storageFreeBytes: 4 * 1024 * MB }, roots: [] },
    selection: { activeExpertIds: ['fashion'] },
  }), 'hsme_preparation_residency_budget_invalid');
});

test('evidence is exact, plan-bound, bounded by planned movement, and forbids model network during execution', async () => {
  const result = await plan();
  const planDigest = await hsmePreparationPlanV1Digest(result, hashPort);
  const evidence = await normalizeHsmePreparationEvidenceV1({
    schemaVersion: HSME_PREPARATION_EVIDENCE_V1_SCHEMA, descriptorDigest: result.descriptorDigest, fleetRevision: result.fleetRevision, planDigest,
    measured: { networkAcquisitionBytes: 0, flashToRamBytes: result.totals.flashToRamBytes, ramToAcceleratorBytes: result.totals.ramToAcceleratorBytes, prefetchBytes: 0, networkBytesDuringExecution: 0 },
  }, result, hashPort);
  assert.equal(evidence.measured.networkBytesDuringExecution, 0);
  await expectCodeAsync(() => normalizeHsmePreparationEvidenceV1({
    schemaVersion: HSME_PREPARATION_EVIDENCE_V1_SCHEMA, descriptorDigest: result.descriptorDigest, fleetRevision: result.fleetRevision, planDigest,
    measured: { networkAcquisitionBytes: 0, flashToRamBytes: result.totals.flashToRamBytes, ramToAcceleratorBytes: result.totals.ramToAcceleratorBytes, prefetchBytes: 0, networkBytesDuringExecution: 1 },
  }, result, hashPort), 'hsme_preparation_value_invalid');
});

test('planner dependency is read-only canonical manifest resolution', async () => {
  let resolves = 0;
  let mutations = 0;
  const readOnly = {
    resolve(modelId, version) { resolves += 1; return resolver.resolve(modelId, version); },
    install() { mutations += 1; throw new Error('must not be called'); },
  };
  await plan({ resolverOverride: readOnly });
  assert.equal(resolves, 2);
  assert.equal(mutations, 0);
});
