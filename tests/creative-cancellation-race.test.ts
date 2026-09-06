import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionService } from '../server/core/application/creativeExecutionService.ts';
import type { ExecutionRun, ExecutionRunRegistry, ExecutionRunScope, IssueExecutionRunInput } from '../server/core/execution/executionRunRegistry.ts';
import type { BillingTransactionAuthority } from '../src/platform/creative/authority/contracts.ts';

const auth = Object.freeze({ tenantId: 'tenant-cancel-race', userId: 'user-cancel-race' });
const command = Object.freeze({ projectId: 'project-cancel-race', instruction: 'edit', inputArtifactId: 'artifact-cancel-race', clientRequestId: 'request-cancel-race' });

class RaceRuns implements ExecutionRunRegistry {
  run: ExecutionRun = Object.freeze({ runId: '22222222-2222-4222-8222-222222222222', scope: Object.freeze({ ...auth, projectId: command.projectId }), capability: 'CREATIVE_EXECUTION', idempotencyKey: command.clientRequestId, authorityKind: 'CREATIVE_EXECUTION', authorityRef: 'unset', status: 'QUEUED', revision: 1, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' });
  readonly events: string[] = [];
  async issue(input: IssueExecutionRunInput) { this.run = Object.freeze({ ...this.run, scope: input.scope, capability: input.capability, idempotencyKey: input.idempotencyKey, authorityKind: input.authorityKind, authorityRef: input.authorityRef }); return Object.freeze({ run: this.run, created: true }); }
  async get() { return this.run; }
  async list() { return Object.freeze([this.run]); }
  async listRoots() { return Object.freeze([this.run]); }
  async listChildren() { return Object.freeze([]); }
  async start() { this.run = Object.freeze({ ...this.run, status: 'RUNNING', revision: 2, startedAt: '2026-09-06T00:00:01.000Z' }); return this.run; }
  async succeed() { throw new Error('unexpected success'); }
  async fail(_scope: ExecutionRunScope, _runId: string, reason: string) { this.events.push(`run:fail:${reason}`); this.run = Object.freeze({ ...this.run, status: 'FAILED', revision: 3, statusReasonCode: reason, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run; }
  async cancel(_scope: ExecutionRunScope, _runId: string, reason: string) { this.events.push(`run:cancel:${reason}`); this.run = Object.freeze({ ...this.run, status: 'CANCELLED', revision: 3, statusReasonCode: reason, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run; }
  async markUnknown() { throw new Error('unexpected unknown'); }
}

function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }

test('provider failure winning a cancellation race remains FAILED and never exposes false SKIPPED/CANCELLED truth', async () => {
  const runs = new RaceRuns();
  const events: string[] = [];
  const providerEntered = deferred();
  let rejectProvider!: (reason?: unknown) => void;
  const billing: BillingTransactionAuthority = {
    reserve: async () => { events.push('billing:reserve'); return { reservationId: 'race-reservation', status: 'RESERVED' }; },
    commit: async () => { throw new Error('unexpected commit'); },
    release: async id => { events.push('billing:release'); return { reservationId: id, status: 'RELEASED' }; },
    unknown: async () => { throw new Error('unexpected unknown'); },
  };
  const service = new CreativeExecutionService({
    executionRuns: runs,
    creditsPerEdit: 1,
    hardBudgetCredits: 1,
    ownsArtifacts: async () => true,
    platform: {
      billing,
      decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
      planning: { plan: async request => ({ requestId: request.id, operations: [{ id: 'image-edit', type: 'image-edit', produces: ['image'], cost: { credits: 1 } }] }) },
      routeSelector: { select: () => 'PROVIDER' },
      targetSelector: { select: () => 'CLOUD' },
      providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'race:fal' }) },
      capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'race-provider' }) },
      securityGate: { authorize: () => true },
      runtime: {
        execute: async () => { providerEntered.resolve(); return await new Promise((_, reject) => { rejectProvider = reject; }); },
        cancel: () => { events.push('provider:cancel'); rejectProvider(new Error('definitive provider failure won cancellation race')); return true; },
      },
      providers: { isAvailable: () => true, fallback: () => undefined },
      verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: [], errors: [] }) },
      recovery: { decide: () => 'MARK_UNKNOWN' },
      now: (() => { let n = 1; return () => ++n; })(),
      id: (() => { let n = 0; return () => `race-${++n}`; })(),
    },
  });

  const execution = service.execute(command, auth);
  await providerEntered.promise;
  const executionId = runs.run.authorityRef;
  const cancelRejected = assert.rejects(service.cancel(executionId, auth), (error: any) => error?.code === 'creative_cancel_reconciliation_required' && error?.status === 409 && error?.retryable === true);
  const outcome = await execution;
  await cancelRejected;

  assert.equal(outcome.status, 'FAILED');
  assert.equal(service.status(executionId, auth), 'FAILED');
  assert.equal(service.result(executionId, auth)?.status, 'FAILED');
  assert.equal(runs.run.status, 'FAILED');
  assert.equal(runs.run.statusReasonCode, 'CREATIVE_OUTCOME_FAILED');
  assert.equal(runs.events.includes('run:cancel:CREATIVE_EXECUTION_CANCELLED'), false);
  assert.deepEqual(events, ['billing:reserve', 'provider:cancel', 'billing:release']);
});
