import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionService } from '../server/core/application/creativeExecutionService.ts';
import type { ExecutionRun, ExecutionRunRegistry, ExecutionRunScope, IssueExecutionRunInput } from '../server/core/execution/executionRunRegistry.ts';

const auth = Object.freeze({ tenantId: 'tenant-reserve-cancel', userId: 'user-reserve-cancel' });
const command = Object.freeze({ projectId: 'project-reserve-cancel', instruction: 'edit image', inputArtifactId: 'artifact-reserve-cancel', clientRequestId: 'request-reserve-cancel' });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

class ReserveRuns implements ExecutionRunRegistry {
  run: ExecutionRun = Object.freeze({ runId: '33333333-3333-4333-8333-333333333333', scope: Object.freeze({ ...auth, projectId: command.projectId }), capability: 'CREATIVE_EXECUTION', idempotencyKey: command.clientRequestId, authorityKind: 'CREATIVE_EXECUTION', authorityRef: 'unset', status: 'QUEUED', revision: 1, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' });
  readonly events: string[] = [];
  async issue(input: IssueExecutionRunInput) { this.events.push('run:issue'); this.run = Object.freeze({ ...this.run, scope: input.scope, capability: input.capability, idempotencyKey: input.idempotencyKey, authorityKind: input.authorityKind, authorityRef: input.authorityRef }); return Object.freeze({ run: this.run, created: true }); }
  async get() { return this.run; }
  async list() { return Object.freeze([this.run]); }
  async listRoots() { return Object.freeze([this.run]); }
  async listChildren() { return Object.freeze([]); }
  async start() { this.events.push('run:start'); this.run = Object.freeze({ ...this.run, status: 'RUNNING', revision: 2, startedAt: '2026-09-06T00:00:01.000Z' }); return this.run; }
  async succeed() { throw new Error('unexpected success'); }
  async fail(_scope: ExecutionRunScope, _runId: string, reason: string) { this.events.push(`run:fail:${reason}`); this.run = Object.freeze({ ...this.run, status: 'FAILED', revision: 3, statusReasonCode: reason, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run; }
  async cancel(_scope: ExecutionRunScope, _runId: string, reason: string) {
    this.events.push(`run:cancel:${reason}`);
    if (this.run.status === 'CANCELLED') return this.run;
    this.run = Object.freeze({ ...this.run, status: 'CANCELLED', revision: 3, statusReasonCode: reason, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run;
  }
  async markUnknown() { throw new Error('unexpected unknown'); }
}

test('cancel during Billing reserve waits for atomic reserve, releases exactly once, skips provider dispatch and then terminalizes durable run', async () => {
  const runs = new ReserveRuns();
  const reserveEntered = deferred();
  const allowReserve = deferred();
  const events: string[] = [];
  let providerCalls = 0;
  let runtimeCancelCalls = 0;
  let releaseCalls = 0;

  const service = new CreativeExecutionService({
    executionRuns: runs,
    creditsPerEdit: 1,
    hardBudgetCredits: 1,
    ownsArtifacts: async () => true,
    platform: {
      billing: {
        reserve: async () => { events.push('billing:reserve:start'); reserveEntered.resolve(); await allowReserve.promise; events.push('billing:reserve:done'); return { reservationId: 'reserve-cancel-reservation', status: 'RESERVED' as const }; },
        commit: async () => { throw new Error('unexpected commit'); },
        release: async id => { releaseCalls += 1; events.push('billing:release'); return { reservationId: id, status: 'RELEASED' as const }; },
      },
      decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
      planning: { plan: async request => ({ requestId: request.id, operations: [{ id: 'image-edit', type: 'image-edit', produces: ['image'], cost: { credits: 1 } }] }) },
      routeSelector: { select: () => 'PROVIDER' },
      targetSelector: { select: () => 'CLOUD' },
      providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'reserve-cancel:fal' }) },
      capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'reserve-cancel-provider' }) },
      securityGate: { authorize: () => true },
      runtime: {
        execute: async () => { providerCalls += 1; return { artifacts: [{ id: 'unexpected', kind: 'image', value: {} }] }; },
        cancel: () => { runtimeCancelCalls += 1; return false; },
      },
      providers: { isAvailable: () => true, fallback: () => undefined },
      verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: [], errors: [] }) },
      recovery: { decide: () => 'MARK_UNKNOWN' },
      now: (() => { let value = 1; return () => ++value; })(),
      id: (() => { let value = 0; return () => `reserve-cancel-${++value}`; })(),
    },
  });

  const execution = service.execute(command, auth);
  const executionRejected = assert.rejects(execution, (error: any) => error?.code === 'creative_execution_cancelled' && error?.status === 409 && error?.retryable === false);
  await reserveEntered.promise;
  const executionId = runs.run.authorityRef;
  assert.notEqual(executionId, 'unset');

  let cancelSettled = false;
  const cancellation = service.cancel(executionId, auth).then(() => { cancelSettled = true; });
  await Promise.resolve();
  assert.equal(cancelSettled, false, 'cancel must wait for reserve/release reconciliation');
  assert.equal(runtimeCancelCalls, 1);
  assert.equal(providerCalls, 0);

  allowReserve.resolve();
  await Promise.all([executionRejected, cancellation]);

  assert.equal(cancelSettled, true);
  assert.equal(service.status(executionId, auth), 'SKIPPED');
  assert.equal(providerCalls, 0, 'pre-provider cancellation must not dispatch provider work');
  assert.equal(releaseCalls, 1);
  assert.equal(runs.run.status, 'CANCELLED');
  assert.equal(runs.run.statusReasonCode, 'CREATIVE_EXECUTION_CANCELLED');
  assert.equal(runs.events.some(event => event.startsWith('run:fail:')), false);
  assert.deepEqual(events, ['billing:reserve:start', 'billing:reserve:done', 'billing:release']);

  const revision = runs.run.revision;
  await service.cancel(executionId, auth);
  assert.equal(runs.run.revision, revision);
  assert.equal(releaseCalls, 1, 'cancel replay must not release Billing twice');
});
