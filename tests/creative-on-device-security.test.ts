import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type CreativeRequest } from '../src/platform/creative/canonical/index.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const original: CreativeArtifact = Object.freeze({
  id: 'original-1',
  kind: 'image',
  value: Object.freeze({ pixels: true }),
  producerOperationId: 'seed',
  scope,
  state: 'AVAILABLE',
  role: 'ORIGINAL',
  image: Object.freeze({ width: 4, height: 4, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: 'a'.repeat(64) }),
});
const request: CreativeRequest = Object.freeze({
  id: 'security-denied-local',
  intent: 'interactive segmentation',
  scope,
  inputArtifacts: Object.freeze([original]),
  budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
});

test('Core security denial stops ON_DEVICE before ticket, local runtime, provider selection and external billing', async () => {
  const calls = { security: 0, provider: 0, localRuntime: 0, ticket: 0, reserve: 0, commit: 0, release: 0 };
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
    providerSelector: { select: () => { calls.provider += 1; return { allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'must-not-run', selectionId: 'must-not-run' }; } },
    capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'local:mobilesam:segment:v1' }) },
    securityGate: { authorize: () => { calls.security += 1; return false; } },
    runtime: { execute: async () => { calls.localRuntime += 1; throw new Error('server runtime must not execute ON_DEVICE work'); } },
    providers: { isAvailable: () => true, fallback: () => undefined },
    verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: [], errors: [] }) },
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { calls.reserve += 1; return { reservationId: 'forbidden', status: 'RESERVED' as const }; },
      commit: async reservationId => { calls.commit += 1; return { reservationId, status: 'COMMITTED' as const }; },
      release: async reservationId => { calls.release += 1; return { reservationId, status: 'RELEASED' as const }; },
    },
    localExecution: {
      issue: () => { calls.ticket += 1; throw new Error('ticket must not be issued after security denial'); },
    },
    now: () => 1_000,
    id: () => 'authority-id',
  };

  const platform = new CreativeExecutionPlatform(dependencies);
  platform.createExecution(request);
  await assert.rejects(() => platform.prepareLocalExecution(request.id), /Security or target policy blocked operation interactive-segmentation/);
  assert.deepEqual(calls, { security: 1, provider: 0, localRuntime: 0, ticket: 0, reserve: 0, commit: 0, release: 0 });
});
