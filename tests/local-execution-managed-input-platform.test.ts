import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type CreativePlan,
  type CreativeRequest,
  type LocalExecutionManagedGarmentInputBinding,
} from '../src/platform/creative/canonical/index.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-platform-managed', userId: 'user-platform-managed', projectId: 'project-platform-managed' });
const source: CreativeArtifact = Object.freeze({
  id: 'project-source-image',
  kind: 'image',
  value: Object.freeze({ width: 48, height: 64, data: new Uint8ClampedArray(48 * 64 * 4) }),
  producerOperationId: 'seed',
  scope,
  state: 'AVAILABLE',
  role: 'ORIGINAL',
  image: Object.freeze({ width: 48, height: 64, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: 'c'.repeat(64) }),
});
const viewBinding = Object.freeze({
  authority: 'MANAGED_GARMENT',
  kind: 'GARMENT_VIEW',
  garmentId: 'a1111111-1111-4111-8111-111111111111',
  viewId: 'b2222222-2222-4222-8222-222222222222',
  contentSha256: 'a'.repeat(64),
  contentType: 'image/png',
  encoding: 'PNG_RGBA8_LOSSLESS',
  width: 24,
  height: 32,
}) satisfies LocalExecutionManagedGarmentInputBinding;
const representationBinding = Object.freeze({
  authority: 'MANAGED_GARMENT',
  kind: 'GARMENT_REPRESENTATION',
  garmentId: viewBinding.garmentId,
  representationId: 'c3333333-3333-4333-8333-333333333333',
  tier: 'PARAMETRIC',
  format: 'BERS_PARAMETRIC_V1',
  contentType: 'application/vnd.bers.garment-parametric+json',
  contentSha256: 'b'.repeat(64),
  basisViewId: viewBinding.viewId,
  generatorId: 'bers.mesh-fit',
  generatorVersion: '1',
  validatorId: 'bers.parametric-topology-validator',
  validatorVersion: '1',
}) satisfies LocalExecutionManagedGarmentInputBinding;

function request(id: string): CreativeRequest {
  return Object.freeze({
    id,
    intent: 'deterministically warp the admitted garment layer to the canonical project image',
    scope,
    inputArtifacts: Object.freeze([source]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({ operationIntent: GARMENT_MESH_WARP_OPERATION, idempotencyKey: id }),
  });
}

function plan(input: CreativeRequest): CreativePlan {
  return Object.freeze({
    requestId: input.id,
    status: 'READY',
    operations: Object.freeze([Object.freeze({
      id: GARMENT_MESH_WARP_STEP_ID,
      type: GARMENT_MESH_WARP_OPERATION,
      requiredArtifacts: Object.freeze([source.id]),
      produces: Object.freeze(['image']),
      input: Object.freeze({ deterministicTool: `${GARMENT_MESH_WARP_TOOL_ID}@${GARMENT_MESH_WARP_TOOL_VERSION}` }),
    })]),
    planningConstraints: Object.freeze({
      preserveMode: 'STRICT', mustPreserve: Object.freeze([]), mustChange: Object.freeze([]), forbiddenTargets: Object.freeze(['CLOUD']), forbiddenRegions: Object.freeze([]),
      executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0,
    }),
  });
}

function platform(id: string): CreativeExecutionPlatform {
  const admission = new LocalExecutionAdmissionRegistry();
  let sequence = 0;
  const tickets = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000,
    id: () => `managed-platform-ticket-${id}-${++sequence}`,
    nonce: () => `managed-platform-nonce-${id}-${sequence}`,
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: Object.freeze({
      [GARMENT_MESH_WARP_CAPABILITY]: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION })]),
    }),
  });
  const dependencies: CreativeExecutionPlatformRuntimeDependencies = {
    decision: { decide: async input => Object.freeze({ requestId: input.id, goal: input.intent, constraints: Object.freeze([]) }) },
    planning: { plan: async input => plan(input) },
    routeSelector: { select: operation => operation.type === GARMENT_MESH_WARP_OPERATION ? 'ON_DEVICE' : (() => { throw new Error('unexpected operation'); })() },
    targetSelector: { select: operation => operation.type === GARMENT_MESH_WARP_OPERATION ? 'LOCAL' : 'BLOCKED' },
    providerSelector: { select: () => { throw new Error('provider selection must not run for managed local execution'); } },
    capabilityAdmission: { admit: ({ operation, route, target }) => operation.type === GARMENT_MESH_WARP_OPERATION && route === 'ON_DEVICE' && target === 'LOCAL'
      ? Object.freeze({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: GARMENT_MESH_WARP_CAPABILITY })
      : Object.freeze({ allowed: false, reasonCode: 'UNSUPPORTED_OPERATION' }) },
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('provider/server runtime must not execute the local candidate'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: { verify: async operation => Object.freeze({ stepId: operation.id, valid: true, checks: Object.freeze([]), errors: Object.freeze([]) }) },
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must not run for zero-credit local execution'); },
      commit: async () => { throw new Error('external billing commit must not run for zero-credit local execution'); },
      release: async () => { throw new Error('external billing release must not run for zero-credit local execution'); },
    },
    localExecutionV2: tickets,
    now: () => 1_000,
    id: () => `managed-platform-authority-${id}`,
  };
  const instance = new CreativeExecutionPlatform(dependencies);
  instance.createExecution(request(id));
  return instance;
}

const managed = Object.freeze([viewBinding, representationBinding]);

test('v2 platform preserves exact legacy ticket shape when server-managed bindings are absent', async () => {
  const instance = platform('legacy');
  const [ticket] = await instance.prepareLocalExecutionV2('legacy');
  assert.equal(Object.hasOwn(ticket, 'managedInputs'), false);
  assert.equal(JSON.stringify(ticket).includes('managedInputs'), false);
  assert.deepEqual(ticket.inputs, [{ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: 'c'.repeat(64) }]);
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'WORKING', count: 1, mimeTypes: ['image/png'], width: 48, height: 64 }]);
});

test('v2 platform binds server-managed Garment evidence without laundering it through Project inputs', async () => {
  const instance = platform('managed');
  const [ticket] = await instance.prepareLocalExecutionV2('managed', { managedInputsByStep: { [GARMENT_MESH_WARP_STEP_ID]: managed } });
  assert.deepEqual(ticket.managedInputs, managed);
  assert.deepEqual(ticket.inputs, [{ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: 'c'.repeat(64) }]);
  assert.equal(ticket.inputs.some(binding => binding.artifactId === viewBinding.viewId || binding.artifactId === representationBinding.representationId), false);
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'WORKING', count: 1, mimeTypes: ['image/png'], width: 48, height: 64 }]);
  assert.deepEqual(ticket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
});

test('v2 platform makes managed-input issuance replay exact and fail-closed', async () => {
  const instance = platform('replay');
  const first = await instance.prepareLocalExecutionV2('replay', { managedInputsByStep: { [GARMENT_MESH_WARP_STEP_ID]: managed } });
  const second = await instance.prepareLocalExecutionV2('replay', { managedInputsByStep: { [GARMENT_MESH_WARP_STEP_ID]: managed } });
  assert.equal(second[0].ticketId, first[0].ticketId);

  const changedView = Object.freeze({ ...viewBinding, contentSha256: 'd'.repeat(64) }) satisfies LocalExecutionManagedGarmentInputBinding;
  await assert.rejects(
    () => instance.prepareLocalExecutionV2('replay', { managedInputsByStep: { [GARMENT_MESH_WARP_STEP_ID]: Object.freeze([changedView, representationBinding]) } }),
    /managed local-execution input replay mismatch/i,
  );
  await assert.rejects(() => instance.prepareLocalExecutionV2('replay'), /managed local-execution input replay mismatch/i);
});

test('v2 platform rejects unknown step names and explicit empty managed namespaces before ticket issuance', async () => {
  const unknown = platform('unknown-step');
  await assert.rejects(
    () => unknown.prepareLocalExecutionV2('unknown-step', { managedInputsByStep: { forged: managed } }),
    /unknown ON_DEVICE step forged/i,
  );
  assert.equal(unknown.pendingLocalExecutionV2('unknown-step').length, 0);

  const empty = platform('empty-step');
  await assert.rejects(
    () => empty.prepareLocalExecutionV2('empty-step', { managedInputsByStep: { [GARMENT_MESH_WARP_STEP_ID]: Object.freeze([]) } }),
    /must be non-empty/i,
  );
  assert.equal(empty.pendingLocalExecutionV2('empty-step').length, 0);
});
