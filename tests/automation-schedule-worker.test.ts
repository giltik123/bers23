import assert from 'node:assert/strict';
import test from 'node:test';
import { AutomationScheduleWorker } from '../server/core/automation/AutomationScheduleWorker.ts';

const claim = Object.freeze({
  schedule: Object.freeze({
    scheduleId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-c3d',
    userId: 'user-c3d',
    automationId: '22222222-2222-4222-8222-222222222222',
    definitionRevision: 7,
    projectId: '33333333-3333-4333-8333-333333333333',
    intervalSeconds: 60,
    nextFireAt: '2026-09-09T05:01:00.000Z',
    status: 'ACTIVE',
    revision: 3,
    overlapPolicy: 'SKIP_WHILE_ACTIVE',
    missedRunPolicy: 'ONE_CATCH_UP',
    createdAt: '2026-09-09T05:00:00.000Z',
    updatedAt: '2026-09-09T05:00:00.000Z',
  }),
  scheduleRevision: 3,
  scheduledFor: '2026-09-09T05:01:00.000Z',
  leaseToken: '44444444-4444-4444-8444-444444444444',
  leaseExpiresAt: '2026-09-09T05:02:00.000Z',
  clientRequestId: `automation-schedule-v1-${'a'.repeat(64)}`,
});

const executeOccurrence = Object.freeze({
  occurrenceId: '55555555-5555-4555-8555-555555555555',
  tenantId: claim.schedule.tenantId,
  userId: claim.schedule.userId,
  scheduleId: claim.schedule.scheduleId,
  scheduleRevision: claim.scheduleRevision,
  automationId: claim.schedule.automationId,
  definitionRevision: claim.schedule.definitionRevision,
  projectId: claim.schedule.projectId,
  scheduledFor: claim.scheduledFor,
  decision: 'EXECUTE',
  clientRequestId: claim.clientRequestId,
  invocationId: '66666666-6666-4666-8666-666666666666',
  createdAt: '2026-09-09T05:01:01.000Z',
});

const skippedOccurrence = Object.freeze({ ...executeOccurrence, decision: 'SKIPPED_ACTIVE', invocationId: undefined });
const executionView = Object.freeze({
  invocationId: executeOccurrence.invocationId,
  automationId: claim.schedule.automationId,
  definitionRevision: claim.schedule.definitionRevision,
  projectId: claim.schedule.projectId,
  executionId: 'execution-c3d',
  revision: 2,
  state: 'SUCCESS',
});

function schedules(overrides: Record<string, unknown> = {}) {
  return {
    claimDue: async () => claim,
    latestExecuteBefore: async () => undefined,
    commitOccurrence: async () => executeOccurrence,
    listLatestExecuteOccurrences: async () => Object.freeze({ occurrences: Object.freeze([]) }),
    ...overrides,
  } as any;
}

function invocations(overrides: Record<string, unknown> = {}) {
  return {
    bind: async () => Object.freeze({ invocationId: executeOccurrence.invocationId }),
    ...overrides,
  } as any;
}

function execution(overrides: Record<string, unknown> = {}) {
  return {
    resume: async () => executionView,
    ...overrides,
  } as any;
}

test('worker returns NO_DUE without touching invocation or execution authorities', async () => {
  let binds = 0;
  let resumes = 0;
  const worker = new AutomationScheduleWorker({
    schedules: schedules({ claimDue: async () => undefined }),
    invocations: invocations({ bind: async () => { binds += 1; throw new Error('unexpected'); } }),
    execution: execution({ resume: async () => { resumes += 1; throw new Error('unexpected'); } }),
  });
  assert.deepEqual(await worker.runOnce(), { status: 'NO_DUE' });
  assert.equal(binds, 0);
  assert.equal(resumes, 0);
});

test('SKIP_WHILE_ACTIVE observes the prior canonical invocation and never creates a new binding', async () => {
  let binds = 0;
  let decision = '';
  const prior = Object.freeze({ ...executeOccurrence, scheduledFor: '2026-09-09T05:00:00.000Z' });
  const worker = new AutomationScheduleWorker({
    schedules: schedules({
      latestExecuteBefore: async () => prior,
      commitOccurrence: async (_claim: unknown, value: string) => { decision = value; return skippedOccurrence; },
    }),
    invocations: invocations({ bind: async () => { binds += 1; throw new Error('must not bind while prior execution is active'); } }),
    execution: execution({ resume: async (invocationId: string, scope: any) => {
      assert.equal(invocationId, prior.invocationId);
      assert.deepEqual(scope, { tenantId: claim.schedule.tenantId, userId: claim.schedule.userId });
      return Object.freeze({ ...executionView, state: 'WAITING_FOR_LOCAL_RESULT' });
    } }),
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'SKIPPED_ACTIVE');
  assert.equal((result as any).priorInvocationId, prior.invocationId);
  assert.equal(decision, 'SKIPPED_ACTIVE');
  assert.equal(binds, 0);
});

test('worker binds immutable C3b invocation before occurrence persistence and delegates only through resume', async () => {
  const calls: string[] = [];
  const worker = new AutomationScheduleWorker({
    schedules: schedules({
      claimDue: async () => { calls.push('claim'); return claim; },
      latestExecuteBefore: async () => { calls.push('observe-prior'); return undefined; },
      commitOccurrence: async (_claim: unknown, decision: string, invocationId: string) => {
        calls.push('commit-occurrence');
        assert.equal(decision, 'EXECUTE');
        assert.equal(invocationId, executeOccurrence.invocationId);
        return executeOccurrence;
      },
    }),
    invocations: invocations({
      bind: async (scope: any, command: any) => {
        calls.push('bind-invocation');
        assert.deepEqual(scope, { tenantId: claim.schedule.tenantId, userId: claim.schedule.userId });
        assert.deepEqual(command, {
          automationId: claim.schedule.automationId,
          definitionRevision: claim.schedule.definitionRevision,
          projectId: claim.schedule.projectId,
          clientRequestId: claim.clientRequestId,
        });
        assert.equal(Object.hasOwn(command, 'provider'), false);
        assert.equal(Object.hasOwn(command, 'billing'), false);
        assert.equal(Object.hasOwn(command, 'executionId'), false);
        return Object.freeze({ invocationId: executeOccurrence.invocationId });
      },
    }),
    execution: execution({ resume: async (invocationId: string, scope: any) => {
      calls.push('resume-canonical-execution');
      assert.equal(invocationId, executeOccurrence.invocationId);
      assert.deepEqual(scope, { tenantId: claim.schedule.tenantId, userId: claim.schedule.userId });
      return executionView;
    } }),
  });

  const result = await worker.runOnce();
  assert.equal(result.status, 'DELEGATED');
  assert.deepEqual(calls, ['claim', 'observe-prior', 'bind-invocation', 'commit-occurrence', 'resume-canonical-execution']);
});

test('stale definition/project failures become immutable SKIPPED_CONFIGURATION without execution delegation', async () => {
  for (const failureCode of [
    'automation_not_found',
    'automation_revision_conflict',
    'automation_not_active',
    'project_not_found',
    'automation_project_source_invalid',
    'automation_project_source_geometry_conflict',
  ]) {
    let resumes = 0;
    let committed = '';
    const worker = new AutomationScheduleWorker({
      schedules: schedules({ commitOccurrence: async (_claim: unknown, decision: string) => {
        committed = decision;
        return Object.freeze({ ...skippedOccurrence, decision: 'SKIPPED_CONFIGURATION' });
      } }),
      invocations: invocations({ bind: async () => { throw Object.assign(new Error(failureCode), { code: failureCode }); } }),
      execution: execution({ resume: async () => { resumes += 1; throw new Error('must not execute stale configuration'); } }),
    });
    const result = await worker.runOnce();
    assert.equal(result.status, 'SKIPPED_CONFIGURATION');
    assert.equal((result as any).failureCode, failureCode);
    assert.equal(committed, 'SKIPPED_CONFIGURATION');
    assert.equal(resumes, 0);
  }
});

test('unexpected failure before occurrence persistence preserves lease for crash-equivalent bounded retry', async () => {
  let releases = 0;
  const worker = new AutomationScheduleWorker({
    schedules: schedules({ releaseClaim: async () => { releases += 1; } }),
    invocations: invocations({ bind: async () => { throw Object.assign(new Error('database unavailable'), { code: 'ECONNRESET' }); } }),
    execution: execution(),
  });
  await assert.rejects(() => worker.runOnce(), /database unavailable/);
  assert.equal(releases, 0, 'unexpected pre-occurrence failure must leave the claim lease to expire naturally');
});

test('lost response after immutable EXECUTE occurrence returns RECOVERY_REQUIRED without rewriting scheduler state', async () => {
  let releases = 0;
  let commits = 0;
  const worker = new AutomationScheduleWorker({
    schedules: schedules({
      commitOccurrence: async () => { commits += 1; return executeOccurrence; },
      releaseClaim: async () => { releases += 1; },
    }),
    invocations: invocations(),
    execution: execution({ resume: async () => { throw Object.assign(new Error('lost response'), { code: 'upstream_response_lost' }); } }),
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal((result as any).occurrence, executeOccurrence);
  assert.equal((result as any).failureCode, 'upstream_response_lost');
  assert.equal(commits, 1);
  assert.equal(releases, 0, 'committed occurrence already advanced and cleared its lease');
});

test('bounded recovery page re-enters only canonical execution and preserves store keyset cursor', async () => {
  const other = Object.freeze({
    ...executeOccurrence,
    occurrenceId: '77777777-7777-4777-8777-777777777777',
    tenantId: 'tenant-other',
    userId: 'user-other',
    invocationId: '88888888-8888-4888-8888-888888888888',
  });
  const cursor = Object.freeze({
    scheduledFor: '2026-09-09T04:59:00.000Z',
    occurrenceId: '99999999-9999-4999-8999-999999999999',
  });
  const nextCursor = Object.freeze({
    scheduledFor: other.scheduledFor,
    occurrenceId: other.occurrenceId,
  });
  const seen: unknown[] = [];
  const worker = new AutomationScheduleWorker({
    schedules: schedules({ listLatestExecuteOccurrences: async (limit: number, receivedCursor: unknown) => {
      assert.equal(limit, 2);
      assert.equal(receivedCursor, cursor);
      return Object.freeze({ occurrences: Object.freeze([executeOccurrence, other]), nextCursor });
    } }),
    invocations: invocations({ bind: async () => { throw new Error('recovery must never create a new binding'); } }),
    execution: execution({ resume: async (invocationId: string, scope: any) => {
      seen.push({ invocationId, scope });
      if (invocationId === other.invocationId) throw Object.assign(new Error('temporary'), { code: 'temporary_failure' });
      return executionView;
    } }),
  });
  const result = await worker.recoverPage(2, cursor);
  assert.deepEqual(seen, [
    { invocationId: executeOccurrence.invocationId, scope: { tenantId: executeOccurrence.tenantId, userId: executeOccurrence.userId } },
    { invocationId: other.invocationId, scope: { tenantId: other.tenantId, userId: other.userId } },
  ]);
  assert.equal(result.attempts[0]?.state, 'SUCCESS');
  assert.equal(result.attempts[1]?.failureCode, 'temporary_failure');
  assert.equal(result.failureCount, 1);
  assert.equal(result.nextCursor, nextCursor);
});
