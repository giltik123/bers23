import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExecutionRunBoundLocalCompositeContinuationService,
  projectWorkflowContinuationRun,
} from './ExecutionRunBoundLocalCompositeContinuationService.ts';

const scope = Object.freeze({
  tenantId: 'tenant-d1',
  userId: 'user-d1',
  projectId: '11111111-1111-4111-8111-111111111111',
});
const executionId = 'local-composite-execution-d1';
const clientRequestId = 'local-composite-request-d1';

function snapshot(state, overrides = {}) {
  return Object.freeze({
    executionId,
    clientRequestId,
    scope,
    plan: Object.freeze({ planId: 'local-background-isolation-composite', planRevision: '1', planDigest: 'a'.repeat(64) }),
    inputArtifacts: Object.freeze([Object.freeze({ artifactId: 'original-d1', kind: 'image', role: 'ORIGINAL', sha256: 'b'.repeat(64), parentArtifactIds: Object.freeze([]) })]),
    state,
    completedSteps: Object.freeze([]),
    revision: 1,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  });
}

class FakeRunRegistry {
  constructor() {
    this.events = [];
    this.run = undefined;
    this.nextRevision = 1;
  }

  async issue(input) {
    this.events.push(['issue', input]);
    if (!this.run) {
      this.run = Object.freeze({
        runId: '22222222-2222-4222-8222-222222222222',
        scope: input.scope,
        capability: input.capability,
        idempotencyKey: input.idempotencyKey,
        authorityKind: input.authorityKind,
        authorityRef: input.authorityRef,
        status: 'QUEUED',
        revision: this.nextRevision,
        createdAt: '2026-09-06T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
      });
      return Object.freeze({ run: this.run, created: true });
    }
    assert.equal(input.capability, this.run.capability);
    assert.equal(input.authorityKind, this.run.authorityKind);
    assert.equal(input.authorityRef, this.run.authorityRef);
    assert.equal(input.idempotencyKey, this.run.idempotencyKey);
    assert.deepEqual(input.scope, this.run.scope);
    return Object.freeze({ run: this.run, created: false });
  }

  async get() { return this.run; }
  async list() { return this.run ? Object.freeze([this.run]) : Object.freeze([]); }
  async start(_scope, runId) { return this.transition(runId, 'RUNNING'); }
  async succeed(_scope, runId) { return this.transition(runId, 'SUCCEEDED'); }
  async fail(_scope, runId, reason) { return this.transition(runId, 'FAILED', reason); }
  async cancel(_scope, runId, reason) { return this.transition(runId, 'CANCELLED', reason); }
  async markUnknown(_scope, runId, reason) { return this.transition(runId, 'UNKNOWN', reason); }

  async transition(runId, target, reason) {
    assert.equal(runId, this.run?.runId);
    this.events.push([target, reason]);
    const current = this.run;
    if (!current) throw new Error('run missing');
    if (current.status === target) {
      if (['FAILED', 'CANCELLED', 'UNKNOWN'].includes(target) && current.statusReasonCode !== reason) {
        throw Object.assign(new Error('terminal reason conflict'), { code: 'execution_run_terminal_conflict' });
      }
      return current;
    }
    const allowed = current.status === 'QUEUED'
      ? target === 'RUNNING' || target === 'CANCELLED'
      : current.status === 'RUNNING'
        ? ['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(target)
        : false;
    if (!allowed) throw Object.assign(new Error(`cannot transition ${current.status} -> ${target}`), { code: 'execution_run_transition_conflict' });
    this.nextRevision += 1;
    this.run = Object.freeze({
      ...current,
      status: target,
      revision: this.nextRevision,
      updatedAt: `2026-09-06T00:00:0${this.nextRevision}.000Z`,
      ...(target === 'RUNNING' ? { startedAt: '2026-09-06T00:00:02.000Z' } : {}),
      ...(['FAILED', 'CANCELLED', 'UNKNOWN'].includes(target) ? { statusReasonCode: reason } : {}),
      ...(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(target) ? { finishedAt: '2026-09-06T00:00:03.000Z' } : {}),
    });
    return this.run;
  }
}

test('projects exact workflow-continuation identity and never treats created as redispatch authority', async () => {
  const runs = new FakeRunRegistry();
  const waiting = snapshot('WAITING_FOR_LOCAL_RESULT', { currentStepId: 'segment' });

  const first = await projectWorkflowContinuationRun(runs, waiting);
  assert.equal(first.status, 'RUNNING');
  assert.equal(first.revision, 2);
  assert.deepEqual(runs.events[0], ['issue', {
    scope,
    capability: 'WORKFLOW_CONTINUATION',
    idempotencyKey: clientRequestId,
    authorityKind: 'WORKFLOW_CONTINUATION',
    authorityRef: executionId,
  }]);
  assert.deepEqual(runs.events[1], ['RUNNING', undefined]);

  const replay = await projectWorkflowContinuationRun(runs, waiting);
  assert.equal(replay.runId, first.runId);
  assert.equal(replay.revision, 2);
  assert.equal(runs.events.filter(([event]) => event === 'RUNNING').length, 1, 'replay must not redispatch or restart an already-running run');
});

test('READY maps only to QUEUED and rejects a contradictory RUNNING projection', async () => {
  const runs = new FakeRunRegistry();
  const ready = await projectWorkflowContinuationRun(runs, snapshot('READY'));
  assert.equal(ready.status, 'QUEUED');
  assert.equal(ready.revision, 1);
  await projectWorkflowContinuationRun(runs, snapshot('WAITING_FOR_LOCAL_RESULT', { revision: 2 }));
  await assert.rejects(
    () => projectWorkflowContinuationRun(runs, snapshot('READY', { revision: 3 })),
    (error) => error?.code === 'workflow_execution_run_state_conflict',
  );
});

test('SUCCESS is projected monotonically and terminal replay is idempotent', async () => {
  const runs = new FakeRunRegistry();
  const succeeded = snapshot('SUCCESS', { terminalArtifactId: 'final-d1', revision: 5 });
  const first = await projectWorkflowContinuationRun(runs, succeeded);
  assert.equal(first.status, 'SUCCEEDED');
  assert.equal(first.revision, 3);
  const replay = await projectWorkflowContinuationRun(runs, succeeded);
  assert.equal(replay.status, 'SUCCEEDED');
  assert.equal(replay.revision, 3);
  assert.equal(runs.events.filter(([event]) => event === 'SUCCEEDED').length, 1, 'terminal replay must not revise or re-complete the run');
});

test('FAILED preserves the exact durable failure code and rejects alternate terminal truth', async () => {
  const runs = new FakeRunRegistry();
  const failed = snapshot('FAILED', { failureCode: 'LOCAL_COMPOSITE_SEGMENT_FAILED', revision: 4 });
  const first = await projectWorkflowContinuationRun(runs, failed);
  assert.equal(first.status, 'FAILED');
  assert.equal(first.statusReasonCode, 'LOCAL_COMPOSITE_SEGMENT_FAILED');
  assert.equal((await projectWorkflowContinuationRun(runs, failed)).revision, first.revision);
  await assert.rejects(
    () => projectWorkflowContinuationRun(runs, snapshot('FAILED', { failureCode: 'OTHER_FAILURE', revision: 5 })),
    (error) => error?.code === 'execution_run_terminal_conflict',
  );
  await assert.rejects(
    () => projectWorkflowContinuationRun(runs, snapshot('SUCCESS', { terminalArtifactId: 'late-final', revision: 6 })),
    (error) => error?.code === 'workflow_execution_run_state_conflict',
  );
});

test('UNKNOWN is a distinct terminal recovery outcome and is never collapsed to FAILED', async () => {
  const runs = new FakeRunRegistry();
  const unknown = snapshot('UNKNOWN', { failureCode: 'LOCAL_COMPOSITE_BACKGROUND_UNKNOWN', revision: 7 });
  const first = await projectWorkflowContinuationRun(runs, unknown);
  assert.equal(first.status, 'UNKNOWN');
  assert.equal(first.statusReasonCode, 'LOCAL_COMPOSITE_BACKGROUND_UNKNOWN');
  assert.equal(runs.events.some(([event]) => event === 'FAILED'), false);
  assert.equal((await projectWorkflowContinuationRun(runs, unknown)).revision, first.revision);
  await assert.rejects(
    () => projectWorkflowContinuationRun(runs, snapshot('SUCCESS', { terminalArtifactId: 'late-final', revision: 8 })),
    (error) => error?.code === 'workflow_execution_run_state_conflict',
  );
});

test('CANCELLED can terminate a never-started READY projection without inventing RUNNING work', async () => {
  const runs = new FakeRunRegistry();
  const cancelled = snapshot('CANCELLED', { failureCode: 'WORKFLOW_CANCELLED', revision: 2 });
  const run = await projectWorkflowContinuationRun(runs, cancelled);
  assert.equal(run.status, 'CANCELLED');
  assert.equal(run.startedAt, undefined);
  assert.equal(runs.events.some(([event]) => event === 'RUNNING'), false);
});

test('service wrapper reconciles after delegate calls and does not expose run authority to the delegate', async () => {
  const calls = [];
  let current = snapshot('WAITING_FOR_LOCAL_RESULT');
  const delegate = {
    async start(command, receivedScope) {
      calls.push(['delegate:start', command, receivedScope]);
      return Object.freeze({ executionId, revision: current.revision, state: current.state });
    },
    async resume(receivedExecutionId, receivedScope) {
      calls.push(['delegate:resume', receivedExecutionId, receivedScope]);
      return Object.freeze({ executionId, revision: current.revision, state: current.state });
    },
    async submitLocalResult(receivedExecutionId, receivedScope, result) {
      calls.push(['delegate:result', receivedExecutionId, receivedScope, result]);
      current = snapshot('SUCCESS', { revision: 9, terminalArtifactId: 'final-d1' });
      return Object.freeze({ executionId, revision: current.revision, state: current.state, terminalArtifactId: 'final-d1' });
    },
  };
  const reader = { async get(receivedExecutionId, receivedScope) {
    calls.push(['reader:get', receivedExecutionId, receivedScope]);
    return current;
  } };
  const runs = new FakeRunRegistry();
  const service = new ExecutionRunBoundLocalCompositeContinuationService({ delegate, continuations: reader, runs });

  await service.start({ clientRequestId, inputArtifactId: 'original-d1', analysis: {}, points: [] }, scope);
  await service.resume(executionId, scope);
  await service.submitLocalResult(executionId, scope, { ticketId: 'ticket-d1' });

  assert.deepEqual(calls.map(([name]) => name), [
    'delegate:start', 'reader:get',
    'delegate:resume', 'reader:get',
    'delegate:result', 'reader:get',
  ]);
  assert.equal(runs.run.status, 'SUCCEEDED');
  assert.equal(runs.events.filter(([event]) => event === 'RUNNING').length, 1);
});
