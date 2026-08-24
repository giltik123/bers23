import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type CreativeRequest } from '../src/platform/creative/canonical/index.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const original: CreativeArtifact = Object.freeze({
  id: 'original-1',
  kind: 'image',
  value: Object.freeze({ width: 4, height: 4 }),
  producerOperationId: 'seed',
  scope,
  state: 'AVAILABLE',
  role: 'ORIGINAL',
  image: Object.freeze({ width: 4, height: 4, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: 'a'.repeat(64) }),
});
const request: CreativeRequest = Object.freeze({
  id: 'local-success',
  intent: 'interactive segmentation',
  scope,
  inputArtifacts: Object.freeze([original]),
  budget: Object.freeze({ credits: 0, aiCalls: 0, latencyMs: 1000, ramMb: 64, gpuMs: 0, retries: 0 }),
  metadata: Object.freeze({ idempotencyKey: 'local-success' }),
});

test('successful ON_DEVICE result uses zero provider calls and zero external billing reserve/commit/release', async () => {
  const calls = { providerSelect: 0, providerRuntime: 0, fallback: 0, reserve: 0, commit: 0, release: 0, unknown: 0 };
  const admission = new LocalExecutionAdmissionRegistry();
  const localExecution = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000,
    id: () => 'ticket-success',
    nonce: () => 'nonce-success',
    ttlMs: 60_000,
    modelsByCapability: { 'local:mobilesam:segment:v1': [{ modelId: 'mobilesam-vit-t', version: 'approved-fixture' }] },
  });
  const dependencies: CreativeExecutionPlatformRuntimeDependencies = {
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: {
      plan: async value => ({
        requestId: value.id,
        status: 'READY',
        planningConstraints: { preserveMode: 'STRICT', mustPreserve: [], mustChange: [], forbiddenTargets: [], forbiddenRegions: [], executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK' },
        operations: [{ id: 'interactive-segmentation', type: 'segment', requiredArtifacts: ['original-1'], produces: ['mask'], input: { selectionRequestId: 'selection-1' } }],
      }),
    },
    routeSelector: { select: () => 'ON_DEVICE' },
    targetSelector: { select: () => 'LOCAL' },
    providerSelector: { select: () => { calls.providerSelect += 1; return { allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'must-not-run', selectionId: 'must-not-run' }; } },
    capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'local:mobilesam:segment:v1' }) },
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { calls.providerRuntime += 1; throw new Error('server/provider runtime must not run ON_DEVICE work'); } },
    providers: { isAvailable: () => true, fallback: () => { calls.fallback += 1; return undefined; } },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { calls.reserve += 1; return { reservationId: 'paid-reservation', status: 'RESERVED' as const }; },
      commit: async reservationId => { calls.commit += 1; return { reservationId, status: 'COMMITTED' as const }; },
      release: async reservationId => { calls.release += 1; return { reservationId, status: 'RELEASED' as const }; },
      unknown: async reservationId => { calls.unknown += 1; return { reservationId, status: 'UNKNOWN' as const }; },
    },
    localExecution,
    now: (() => { let value = 1_000; return () => ++value; })(),
    id: (() => { let value = 0; return () => `authority-${++value}`; })(),
  };

  const platform = new CreativeExecutionPlatform(dependencies);
  platform.createExecution(request);
  const [ticket] = await platform.prepareLocalExecution(request.id);
  assert.equal(ticket.cost.paidCloudCredits, 0);
  assert.equal(ticket.cost.providerCalls, 0);
  assert.equal(ticket.allowedModels[0].version, 'approved-fixture');

  const alpha = new Uint8Array(16).fill(255);
  const mask: CreativeArtifact = Object.freeze({
    id: 'server-owned-mask',
    kind: 'mask',
    value: Object.freeze({ width: 4, height: 4, alpha, source: 'SEGMENTATION', coordinateSpace: 'ORIGINAL' }),
    producerOperationId: ticket.stepId,
    scope,
    state: 'AVAILABLE',
    role: 'MASK',
    image: Object.freeze({ width: 4, height: 4, format: 'ALPHA8', orientation: 1, colorSpace: 'gray', alpha: true }),
    metadata: Object.freeze({ artifactRole: 'MASK', localExecutionAdmission: 'ADMITTED', parentArtifactIds: Object.freeze(['original-1']) }),
  });
  const outcome = await platform.completeLocalExecution(request.id, { ticketId: ticket.ticketId, stepId: ticket.stepId, artifact: mask, latencyMs: 5, memoryMb: 1 });

  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(outcome.artifacts.some(artifact => artifact.id === 'server-owned-mask'), true);
  assert.deepEqual(calls, { providerSelect: 0, providerRuntime: 0, fallback: 0, reserve: 0, commit: 0, release: 0, unknown: 0 });
});
