import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionService } from '../server/core/application/creativeExecutionService.ts';
import type {
  ExecutionRun,
  ExecutionRunRegistry,
  ExecutionRunScope,
  IssueExecutionRunInput,
} from '../server/core/execution/executionRunRegistry.ts';
import type { BillingTransactionAuthority } from '../src/platform/creative/authority/contracts.ts';

const auth = Object.freeze({ tenantId: 'tenant-run-binding', userId: 'user-run-binding' });
const command = Object.freeze({
  projectId: 'project-run-binding',
  instruction: 'make the product blue',
  inputArtifactId: 'artifact-run-binding',
  clientRequestId: 'request-run-binding-1',
});

class FakeExecutionRuns implements ExecutionRunRegistry {
  readonly events: string[];
  readonly created: boolean;
  issueInput?: IssueExecutionRunInput;
  run: ExecutionRun;
  constructor(events: string[], created = true) {
    this.events = events;
    this.created = created;
    this.run = Object.freeze({
      runId: '11111111-1111-4111-8111-111111111111',
      scope: Object.freeze({ ...auth, projectId: command.projectId }),
      capability: 'CREATIVE_EXECUTION',
      idempotencyKey: command.clientRequestId,
      authorityKind: 'CREATIVE_EXECUTION',
      authorityRef: 'unset',
      status: 'QUEUED',
      revision: 1,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
  }
  async issue(input: IssueExecutionRunInput) {
    this.events.push('run:issue');
    this.issueInput = input;
    this.run = Object.freeze({ ...this.run, scope: input.scope, capability: input.capability, idempotencyKey: input.idempotencyKey, authorityKind: input.authorityKind, authorityRef: input.authorityRef });
    return Object.freeze({ run: this.run, created: this.created });
  }
  async get(_scope: ExecutionRunScope, _runId: string) { return this.run; }
  async list(_scope: ExecutionRunScope) { return Object.freeze([this.run]); }
  async listChildren(_scope: ExecutionRunScope, parentRunId: string) { return Object.freeze(this.run.parentRunId === parentRunId ? [this.run] : []); }
  async start() { this.events.push('run:start'); this.run = Object.freeze({ ...this.run, status: 'RUNNING', revision: 2, startedAt: '2026-09-03T00:00:01.000Z' }); return this.run; }
  async succeed() { this.events.push('run:succeed'); this.run = Object.freeze({ ...this.run, status: 'SUCCEEDED', revision: 3, finishedAt: '2026-09-03T00:00:02.000Z' }); return this.run; }
  async fail(_scope: ExecutionRunScope, _runId: string, reasonCode: string) { this.events.push(`run:fail:${reasonCode}`); this.run = Object.freeze({ ...this.run, status: 'FAILED', revision: 3, statusReasonCode: reasonCode, finishedAt: '2026-09-03T00:00:02.000Z' }); return this.run; }
  async cancel(_scope: ExecutionRunScope, _runId: string, reasonCode: string) { this.events.push(`run:cancel:${reasonCode}`); this.run = Object.freeze({ ...this.run, status: 'CANCELLED', revision: 3, statusReasonCode: reasonCode, finishedAt: '2026-09-03T00:00:02.000Z' }); return this.run; }
  async markUnknown(_scope: ExecutionRunScope, _runId: string, reasonCode: string) { this.events.push(`run:unknown:${reasonCode}`); this.run = Object.freeze({ ...this.run, status: 'UNKNOWN', revision: 3, statusReasonCode: reasonCode, finishedAt: '2026-09-03T00:00:02.000Z' }); return this.run; }
}

function fixture(options: { created?: boolean; runtime?: 'success' | 'failure' | 'unknown'; security?: boolean } = {}) {
  const events: string[] = [];
  const runs = new FakeExecutionRuns(events, options.created ?? true);
  let providerCalls = 0;
  let billingMutations = 0;
  const billing: BillingTransactionAuthority = {
    reserve: async () => { events.push('billing:reserve'); billingMutations++; return { reservationId: 'reservation-1', status: 'RESERVED' }; },
    commit: async id => { events.push('billing:commit'); billingMutations++; return { reservationId: id, status: 'COMMITTED' }; },
    release: async id => { events.push('billing:release'); billingMutations++; return { reservationId: id, status: 'RELEASED' }; },
    unknown: async id => { events.push('billing:unknown'); billingMutations++; return { reservationId: id, status: 'UNKNOWN' }; },
  };
  const service = new CreativeExecutionService({
    executionRuns: runs,
    creditsPerEdit: 1,
    hardBudgetCredits: 1,
    ownsArtifacts: async () => true,
    platform: {
      billing,
      decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
      planning: { plan: async request => { events.push('plan'); return { requestId: request.id, operations: [{ id: 'image-edit', type: 'image-edit', produces: ['image'], cost: { credits: 1 } }] }; } },
      routeSelector: { select: () => 'PROVIDER' },
      targetSelector: { select: () => 'CLOUD' },
      providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'run-binding:fal' }) },
      capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'run-binding-provider' }) },
      securityGate: { authorize: () => options.security !== false },
      runtime: { execute: async () => {
        events.push('provider:execute');
        providerCalls++;
        if (options.runtime === 'unknown') throw Object.assign(new Error('lost provider response'), { code: 'PROVIDER_RESULT_UNKNOWN', unknownOutcome: true });
        if (options.runtime === 'failure') throw new Error('definitive provider failure');
        return { artifacts: [{ id: 'result', kind: 'image', value: { url: 'https://assets.example.test/result.png' } }] };
      } },
      providers: { isAvailable: () => true, fallback: () => undefined },
      verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: ['image'], errors: [] }) },
      recovery: { decide: () => 'MARK_UNKNOWN' },
      now: (() => { let value = 1; return () => ++value; })(),
      id: (() => { let value = 0; return () => `run-binding-id-${++value}`; })(),
    },
  });
  return Object.freeze({ service, runs, events, counters: () => ({ providerCalls, billingMutations }) });
}

function assertOrdered(events: readonly string[], values: readonly string[]) {
  let cursor = -1;
  for (const value of values) {
    const index = events.indexOf(value);
    assert.ok(index > cursor, `${value} must occur after ${cursor < 0 ? 'start' : events[cursor]}; events=${events.join(',')}`);
    cursor = index;
  }
}

test('new Creative run becomes durable before Billing/provider side effects and succeeds only after owning outcome', async () => {
  const f = fixture();
  const outcome = await f.service.execute(command, auth);
  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(f.runs.issueInput?.capability, 'CREATIVE_EXECUTION');
  assert.equal(f.runs.issueInput?.authorityKind, 'CREATIVE_EXECUTION');
  assert.equal(f.runs.issueInput?.idempotencyKey, command.clientRequestId);
  assert.equal(f.runs.issueInput?.authorityRef, outcome.executionId);
  assertOrdered(f.events, ['plan', 'run:issue', 'run:start', 'billing:reserve', 'provider:execute', 'billing:commit', 'run:succeed']);
  assert.deepEqual(f.counters(), { providerCalls: 1, billingMutations: 2 });
  assert.equal(f.runs.run.status, 'SUCCEEDED');
});

test('durable replay never redispatches provider or Billing even when stored run is still QUEUED', async () => {
  const f = fixture({ created: false });
  await assert.rejects(
    () => f.service.execute(command, auth),
    (error: any) => error?.code === 'creative_reconciliation_required' && error?.status === 409 && error?.retryable === true,
  );
  assert.deepEqual(f.counters(), { providerCalls: 0, billingMutations: 0 });
  assert.deepEqual(f.events, ['plan', 'run:issue']);
  assert.equal(f.runs.run.status, 'QUEUED');
});

test('UNKNOWN Creative outcome stays non-terminal in durable registry for later owning reconciliation', async () => {
  const f = fixture({ runtime: 'unknown' });
  const outcome = await f.service.execute(command, auth);
  assert.equal(outcome.status, 'UNKNOWN');
  assert.equal(f.runs.run.status, 'RUNNING');
  assert.equal(f.events.includes('run:succeed'), false);
  assert.equal(f.events.some(value => value.startsWith('run:fail:')), false);
  assert.equal(f.events.some(value => value.startsWith('run:cancel:')), false);
  assert.equal(f.events.includes('billing:unknown'), true);
  assert.equal(f.counters().providerCalls, 1);
});

test('definitive owning FAILED outcome terminalizes the durable run without changing provider/Billing authority', async () => {
  const f = fixture({ runtime: 'failure' });
  const outcome = await f.service.execute(command, auth);
  assert.equal(outcome.status, 'FAILED');
  assert.equal(f.runs.run.status, 'FAILED');
  assert.equal(f.runs.run.statusReasonCode, 'CREATIVE_OUTCOME_FAILED');
  assert.equal(f.events.includes('billing:release'), true);
  assert.equal(f.events.includes('run:fail:CREATIVE_OUTCOME_FAILED'), true);
});

test('compile/admission exception after durable start records execution error and never reaches provider', async () => {
  const f = fixture({ security: false });
  await assert.rejects(() => f.service.execute(command, auth));
  assert.equal(f.runs.run.status, 'FAILED');
  assert.equal(f.runs.run.statusReasonCode, 'CREATIVE_EXECUTION_ERROR');
  assert.deepEqual(f.counters(), { providerCalls: 0, billingMutations: 0 });
  assertOrdered(f.events, ['plan', 'run:issue', 'run:start', 'run:fail:CREATIVE_EXECUTION_ERROR']);
});

test('current Creative cancel is not projected as durable terminal truth before cancellability/reconciliation hardening', async () => {
  const f = fixture();
  const outcome = await f.service.execute(command, auth);
  f.service.cancel(outcome.executionId, auth);
  assert.equal(f.events.some(value => value.startsWith('run:cancel:')), false);
  assert.equal(f.runs.run.status, 'SUCCEEDED');
});
