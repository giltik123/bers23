import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionPlatform, type CreativeExecutionPlatformRuntimeDependencies, type CreativeRequest } from '../src/platform/creative/canonical/index.ts';

const scope = Object.freeze({ tenantId: 'tenant-pre-cancel', projectId: 'project-pre-cancel', userId: 'user-pre-cancel' });
const request: CreativeRequest = Object.freeze({
  id: 'creative-pre-cancel',
  intent: 'edit image',
  scope,
  budget: Object.freeze({ credits: 1, aiCalls: 1, latencyMs: 60_000, ramMb: 1024, gpuMs: 60_000, retries: 0 }),
  metadata: Object.freeze({ idempotencyKey: 'pre-cancel-idempotency', estimatedCredits: 1 }),
});

function dependencies(options: { releaseFails?: boolean } = {}) {
  const calls = { reserve: 0, release: 0, commit: 0, runtime: 0 };
  const deps: CreativeExecutionPlatformRuntimeDependencies = {
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: { plan: async value => ({ requestId: value.id, operations: [{ id: 'image-edit', type: 'image-edit', produces: ['image'], cost: { credits: 1 } }] }) },
    routeSelector: { select: () => 'PROVIDER' },
    targetSelector: { select: () => 'CLOUD' },
    providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'pre-cancel:fal' }) },
    capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'pre-cancel-provider' }) },
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { calls.runtime += 1; return { artifacts: [] }; } },
    providers: { isAvailable: () => true, fallback: () => undefined },
    verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: [], errors: [] }) },
    recovery: { decide: () => 'MARK_UNKNOWN' },
    billing: {
      reserve: async () => { calls.reserve += 1; return { reservationId: 'pre-cancel-reservation', status: 'RESERVED' as const }; },
      commit: async id => { calls.commit += 1; return { reservationId: id, status: 'COMMITTED' as const }; },
      release: async id => {
        calls.release += 1;
        if (options.releaseFails) throw new Error('synthetic Billing release failure');
        return { reservationId: id, status: 'RELEASED' as const };
      },
    },
    now: (() => { let value = 1; return () => ++value; })(),
    id: (() => { let value = 0; return () => `pre-cancel-${++value}`; })(),
  };
  return Object.freeze({ deps, calls });
}

test('prepared Creative cancellation releases Billing exactly once before exposing SKIPPED and never dispatches provider work', async () => {
  const f = dependencies();
  const platform = new CreativeExecutionPlatform(f.deps);
  platform.createExecution(request);
  await platform.compile(request.id);
  assert.equal(platform.status(request.id), 'READY');
  assert.deepEqual(f.calls, { reserve: 1, release: 0, commit: 0, runtime: 0 });

  await platform.cancelPreparedExecution(request.id);
  assert.equal(platform.status(request.id), 'SKIPPED');
  assert.deepEqual(f.calls, { reserve: 1, release: 1, commit: 0, runtime: 0 });

  await platform.cancelPreparedExecution(request.id);
  assert.deepEqual(f.calls, { reserve: 1, release: 1, commit: 0, runtime: 0 }, 'prepared cancel replay must not release Billing twice');
  await assert.rejects(() => platform.execute(request.id), /cancelled/i);
  assert.equal(f.calls.runtime, 0);
});

test('Billing release failure fails closed and never exposes false SKIPPED truth', async () => {
  const f = dependencies({ releaseFails: true });
  const platform = new CreativeExecutionPlatform(f.deps);
  platform.createExecution({ ...request, id: 'creative-pre-cancel-release-failure', metadata: { ...request.metadata, idempotencyKey: 'pre-cancel-release-failure' } });
  await platform.compile('creative-pre-cancel-release-failure');
  await assert.rejects(() => platform.cancelPreparedExecution('creative-pre-cancel-release-failure'), /synthetic Billing release failure/);
  assert.equal(platform.status('creative-pre-cancel-release-failure'), 'READY');
  assert.deepEqual(f.calls, { reserve: 1, release: 1, commit: 0, runtime: 0 });
});
