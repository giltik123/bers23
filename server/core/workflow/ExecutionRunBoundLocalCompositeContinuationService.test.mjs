import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExecutionRunBoundLocalCompositeContinuationService,
  projectWorkflowContinuationRun,
} from './ExecutionRunBoundLocalCompositeContinuationService.ts';
import { LOCAL_COMPOSITE_CONTINUATION_STEPS } from './LocalCompositeContinuationService.ts';

const SEGMENT = LOCAL_COMPOSITE_CONTINUATION_STEPS.segment;
const BACKGROUND = LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation;
const VERIFY = LOCAL_COMPOSITE_CONTINUATION_STEPS.verify;
const scope = Object.freeze({
  tenantId: 'tenant-d2',
  userId: 'user-d2',
  projectId: '11111111-1111-4111-8111-111111111111',
});
const executionId = 'local-composite-execution-d2';
const clientRequestId = 'local-composite-request-d2';
const RUN_IDS = Object.freeze([
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]);

function ticket(stepId, ticketId) {
  return Object.freeze({
    stepId,
    ticketId,
    ticketVersion: stepId === SEGMENT ? '1' : '2',
    nonce: `nonce-${ticketId}`,
    expiresAt: '2026-09-06T01:00:00.000Z',
  });
}

function completed(stepId, ticketId, artifactId) {
  return Object.freeze({ stepId, ticketId, artifactIds: Object.freeze([artifactId]) });
}

function internalCompleted(artifactId) {
  return Object.freeze({ stepId: VERIFY, artifactIds: Object.freeze([artifactId]) });
}

function snapshot(state, overrides = {}) {
  return Object.freeze({
    executionId,
    clientRequestId,
    scope,
    plan: Object.freeze({ planId: 'local-background-isolation-composite', planRevision: '1', planDigest: 'a'.repeat(64) }),
    inputArtifacts: Object.freeze([Object.freeze({ artifactId: 'original-d2', kind: 'image', role: 'ORIGINAL', sha256: 'b'.repeat(64), parentArtifactIds: Object.freeze([]) })]),
    state,
    completedSteps: Object.freeze([]),
    revision: 1,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  });
}

function waiting(stepId, ticketId, completedSteps = Object.freeze([]), revision = 1) {
  return snapshot('WAITING_FOR_LOCAL_RESULT', {
    currentStepId: stepId,
    outstandingLocal: ticket(stepId, ticketId),
    completedSteps,
    revision,
  });
}

class FakeRunRegistry {
  constructor() {
    this.events = [];
    this.runs = [];
  }

  async issue(input) {
    const byIdempotency = this.runs.find(run => sameScope(run.scope, input.scope)
      && run.capability === input.capability && run.idempotencyKey === input.idempotencyKey);
    if (byIdempotency) {
      if (byIdempotency.authorityKind !== input.authorityKind || byIdempotency.authorityRef !== input.authorityRef
        || byIdempotency.parentRunId !== input.parentRunId) {
        throw Object.assign(new Error('idempotency conflict'), { code: 'execution_run_idempotency_conflict' });
      }
      this.events.push(['issue', byIdempotency.runId, false]);
      return Object.freeze({ run: byIdempotency, created: false });
    }
    const byAuthority = this.runs.find(run => run.authorityKind === input.authorityKind && run.authorityRef === input.authorityRef);
    if (byAuthority) throw Object.assign(new Error('authority conflict'), { code: 'execution_run_authority_already_bound' });
    if (input.parentRunId) {
      const parent = this.runs.find(run => run.runId === input.parentRunId && sameScope(run.scope, input.scope));
      if (!parent) throw Object.assign(new Error('parent unavailable'), { code: 'execution_run_parent_unavailable' });
    }
    const run = Object.freeze({
      runId: RUN_IDS[this.runs.length],
      scope: input.scope,
      capability: input.capability,
      idempotencyKey: input.idempotencyKey,
      authorityKind: input.authorityKind,
      authorityRef: input.authorityRef,
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      status: 'QUEUED',
      revision: 1,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    });
    this.runs.push(run);
    this.events.push(['issue', run.runId, true]);
    return Object.freeze({ run, created: true });
  }

  async get(receivedScope, runId) {
    return this.runs.find(run => run.runId === runId && sameScope(run.scope, receivedScope));
  }

  async list(receivedScope, limit = 100) {
    return Object.freeze(this.runs.filter(run => sameScope(run.scope, receivedScope)).slice(0, limit));
  }

  async listChildren(receivedScope, parentRunId, limit = 100) {
    return Object.freeze(this.runs.filter(run => sameScope(run.scope, receivedScope) && run.parentRunId === parentRunId).slice(0, limit));
  }

  async start(receivedScope, runId) { return this.transition(receivedScope, runId, 'RUNNING'); }
  async succeed(receivedScope, runId) { return this.transition(receivedScope, runId, 'SUCCEEDED'); }
  async fail(receivedScope, runId, reason) { return this.transition(receivedScope, runId, 'FAILED', reason); }
  async cancel(receivedScope, runId, reason) { return this.transition(receivedScope, runId, 'CANCELLED', reason); }
  async markUnknown(receivedScope, runId, reason) { return this.transition(receivedScope, runId, 'UNKNOWN', reason); }

  async transition(receivedScope, runId, target, reason) {
    const index = this.runs.findIndex(run => run.runId === runId && sameScope(run.scope, receivedScope));
    if (index < 0) throw Object.assign(new Error('run unavailable'), { code: 'execution_run_unavailable' });
    const current = this.runs[index];
    this.events.push(['transition', runId, target, reason]);
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
    const next = Object.freeze({
      ...current,
      status: target,
      revision: current.revision + 1,
      updatedAt: `2026-09-06T00:00:0${current.revision + 1}.000Z`,
      ...(target === 'RUNNING' ? { startedAt: current.startedAt ?? '2026-09-06T00:00:02.000Z' } : {}),
      ...(['FAILED', 'CANCELLED', 'UNKNOWN'].includes(target) ? { statusReasonCode: reason } : {}),
      ...(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(target) ? { finishedAt: '2026-09-06T00:00:03.000Z' } : {}),
    });
    this.runs[index] = next;
    return next;
  }
}

function sameScope(a, b) {
  return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId;
}

function parentRun(runs) {
  return runs.runs.find(run => run.capability === 'WORKFLOW_CONTINUATION');
}

function children(runs) {
  const parent = parentRun(runs);
  return parent ? runs.runs.filter(run => run.parentRunId === parent.runId) : [];
}

function childForStep(runs, stepId) {
  const parent = parentRun(runs);
  return children(runs).find(run => run.idempotencyKey === `workflow-child:${parent.runId}:${stepId}`);
}

test('D1 parent mapping remains strict: READY is QUEUED and contradictory READY after RUNNING fails closed', async () => {
  const runs = new FakeRunRegistry();
  const ready = await projectWorkflowContinuationRun(runs, snapshot('READY'));
  assert.equal(ready.status, 'QUEUED');
  await projectWorkflowContinuationRun(runs, waiting(SEGMENT, 'ticket-segment'));
  await assert.rejects(
    () => projectWorkflowContinuationRun(runs, snapshot('READY', { revision: 3 })),
    error => error?.code === 'workflow_execution_run_state_conflict',
  );
});

test('outstanding segment creates one exact RUNNING child and replay never redispatches it', async () => {
  const runs = new FakeRunRegistry();
  const state = waiting(SEGMENT, 'ticket-segment');
  const parent = await projectWorkflowContinuationRun(runs, state);
  const child = childForStep(runs, SEGMENT);

  assert.equal(parent.status, 'RUNNING');
  assert.equal(child.status, 'RUNNING');
  assert.equal(child.capability, 'LOCAL_EXECUTION');
  assert.equal(child.authorityKind, 'LOCAL_EXECUTION_TICKET');
  assert.equal(child.authorityRef, 'ticket-segment');
  assert.equal(child.parentRunId, parent.runId);
  assert.equal(child.idempotencyKey, `workflow-child:${parent.runId}:${SEGMENT}`);

  const before = runs.events.filter(event => event[0] === 'transition' && event[2] === 'RUNNING').length;
  await projectWorkflowContinuationRun(runs, state);
  const after = runs.events.filter(event => event[0] === 'transition' && event[2] === 'RUNNING').length;
  assert.equal(children(runs).length, 1);
  assert.equal(after, before, 'idempotent replay must not restart parent or child');
});

test('completed segment and outstanding background reconstruct exact two-child topology', async () => {
  const runs = new FakeRunRegistry();
  const completedSteps = Object.freeze([completed(SEGMENT, 'ticket-segment', 'mask-1')]);
  const parent = await projectWorkflowContinuationRun(runs, waiting(BACKGROUND, 'ticket-background', completedSteps, 4));
  const segment = childForStep(runs, SEGMENT);
  const background = childForStep(runs, BACKGROUND);

  assert.equal(parent.status, 'RUNNING');
  assert.equal(segment.status, 'SUCCEEDED');
  assert.equal(segment.authorityRef, 'ticket-segment');
  assert.equal(background.status, 'RUNNING');
  assert.equal(background.authorityRef, 'ticket-background');
  assert.equal(children(runs).length, 2);
});

test('same logical workflow step cannot bind a second local ticket', async () => {
  const runs = new FakeRunRegistry();
  await projectWorkflowContinuationRun(runs, waiting(SEGMENT, 'ticket-segment-a'));
  await assert.rejects(
    () => projectWorkflowContinuationRun(runs, waiting(SEGMENT, 'ticket-segment-b', Object.freeze([]), 2)),
    error => error?.code === 'execution_run_idempotency_conflict',
  );
  assert.equal(children(runs).length, 1);
});

test('local FAILED terminalizes the one active child before preserving parent terminal truth', async () => {
  const runs = new FakeRunRegistry();
  await projectWorkflowContinuationRun(runs, waiting(SEGMENT, 'ticket-segment'));
  const failed = snapshot('FAILED', { failureCode: 'LOCAL_SEGMENTATION_FAILED', revision: 3 });
  const parent = await projectWorkflowContinuationRun(runs, failed);
  const child = childForStep(runs, SEGMENT);

  assert.equal(child.status, 'FAILED');
  assert.equal(child.statusReasonCode, 'LOCAL_SEGMENTATION_FAILED');
  assert.equal(parent.status, 'FAILED');
  assert.equal(parent.statusReasonCode, 'LOCAL_SEGMENTATION_FAILED');
  const childRevision = child.revision;
  const parentRevision = parent.revision;
  await projectWorkflowContinuationRun(runs, failed);
  assert.equal(childForStep(runs, SEGMENT).revision, childRevision);
  assert.equal(parentRun(runs).revision, parentRevision);
});

test('background UNKNOWN remains distinct and completed segment remains SUCCEEDED', async () => {
  const runs = new FakeRunRegistry();
  const completedSteps = Object.freeze([completed(SEGMENT, 'ticket-segment', 'mask-1')]);
  await projectWorkflowContinuationRun(runs, waiting(BACKGROUND, 'ticket-background', completedSteps, 4));
  const unknown = snapshot('UNKNOWN', {
    completedSteps,
    failureCode: 'LOCAL_BACKGROUND_ISOLATION_UNKNOWN',
    revision: 5,
  });
  const parent = await projectWorkflowContinuationRun(runs, unknown);

  assert.equal(childForStep(runs, SEGMENT).status, 'SUCCEEDED');
  assert.equal(childForStep(runs, BACKGROUND).status, 'UNKNOWN');
  assert.equal(childForStep(runs, BACKGROUND).statusReasonCode, 'LOCAL_BACKGROUND_ISOLATION_UNKNOWN');
  assert.equal(parent.status, 'UNKNOWN');
  assert.equal(parent.statusReasonCode, 'LOCAL_BACKGROUND_ISOLATION_UNKNOWN');
});

test('workflow cancellation cancels an active child without claiming device execution telemetry', async () => {
  const runs = new FakeRunRegistry();
  await projectWorkflowContinuationRun(runs, waiting(SEGMENT, 'ticket-segment'));
  const parent = await projectWorkflowContinuationRun(runs, snapshot('CANCELLED', { failureCode: 'WORKFLOW_CANCELLED', revision: 2 }));
  assert.equal(childForStep(runs, SEGMENT).status, 'CANCELLED');
  assert.equal(childForStep(runs, SEGMENT).statusReasonCode, 'WORKFLOW_CANCELLED');
  assert.equal(parent.status, 'CANCELLED');
});

test('historical terminal continuation with no D2 children is not backfilled with invented run history', async () => {
  const runs = new FakeRunRegistry();
  const parent = await projectWorkflowContinuationRun(runs, snapshot('FAILED', {
    completedSteps: Object.freeze([completed(SEGMENT, 'historical-ticket', 'mask-old')]),
    failureCode: 'LOCAL_BACKGROUND_ISOLATION_FAILED',
    revision: 8,
  }));
  assert.equal(parent.status, 'FAILED');
  assert.equal(children(runs).length, 0);
});

test('RUNNING_INTERNAL projects completed local children only and never creates an INTERNAL verify child', async () => {
  const runs = new FakeRunRegistry();
  const completedSteps = Object.freeze([
    completed(SEGMENT, 'ticket-segment', 'mask-1'),
    completed(BACKGROUND, 'ticket-background', 'composite-1'),
  ]);
  const parent = await projectWorkflowContinuationRun(runs, snapshot('RUNNING_INTERNAL', {
    currentStepId: VERIFY,
    completedSteps,
    revision: 6,
  }));
  assert.equal(parent.status, 'RUNNING');
  assert.equal(childForStep(runs, SEGMENT).status, 'SUCCEEDED');
  assert.equal(childForStep(runs, BACKGROUND).status, 'SUCCEEDED');
  assert.equal(children(runs).length, 2);
  assert.equal(children(runs).some(run => run.authorityRef === VERIFY), false);
});

test('resume pre-reconciles outstanding ticket before delegate can clear it into FAILED terminal state', async () => {
  const calls = [];
  let current = waiting(SEGMENT, 'ticket-segment');
  const reader = {
    async get(receivedExecutionId, receivedScope) {
      calls.push(['reader:get', receivedExecutionId, receivedScope]);
      return current;
    },
    async getByClientRequestId(receivedScope, receivedClientRequestId) {
      calls.push(['reader:getByClientRequestId', receivedClientRequestId, receivedScope]);
      return current;
    },
  };
  const delegate = {
    async start() { throw new Error('not used'); },
    async resume(receivedExecutionId, receivedScope) {
      calls.push(['delegate:resume', receivedExecutionId, receivedScope]);
      current = snapshot('FAILED', { failureCode: 'LOCAL_SEGMENTATION_FAILED', revision: 2 });
      return Object.freeze({ executionId, revision: 2, state: 'FAILED', failureCode: 'LOCAL_SEGMENTATION_FAILED' });
    },
    async submitLocalResult() { throw new Error('not used'); },
  };
  const runs = new FakeRunRegistry();
  const service = new ExecutionRunBoundLocalCompositeContinuationService({ delegate, continuations: reader, runs });

  const view = await service.resume(executionId, scope);
  assert.equal(view.state, 'FAILED');
  assert.deepEqual(calls.map(([name]) => name), ['reader:get', 'delegate:resume', 'reader:get']);
  assert.equal(childForStep(runs, SEGMENT).status, 'FAILED');
  assert.equal(parentRun(runs).status, 'FAILED');
});

test('replayed start pre-reads by scoped clientRequestId before delegate advancement', async () => {
  const calls = [];
  let current = waiting(BACKGROUND, 'ticket-background', Object.freeze([completed(SEGMENT, 'ticket-segment', 'mask-1')]), 4);
  const reader = {
    async get(receivedExecutionId, receivedScope) {
      calls.push(['reader:get', receivedExecutionId, receivedScope]);
      return current;
    },
    async getByClientRequestId(receivedScope, receivedClientRequestId) {
      calls.push(['reader:getByClientRequestId', receivedClientRequestId, receivedScope]);
      return current;
    },
  };
  const delegate = {
    async start(command, receivedScope) {
      calls.push(['delegate:start', command.clientRequestId, receivedScope]);
      current = snapshot('UNKNOWN', {
        completedSteps: Object.freeze([completed(SEGMENT, 'ticket-segment', 'mask-1')]),
        failureCode: 'LOCAL_BACKGROUND_ISOLATION_UNKNOWN',
        revision: 5,
      });
      return Object.freeze({ executionId, revision: 5, state: 'UNKNOWN', failureCode: 'LOCAL_BACKGROUND_ISOLATION_UNKNOWN' });
    },
    async resume() { throw new Error('not used'); },
    async submitLocalResult() { throw new Error('not used'); },
  };
  const runs = new FakeRunRegistry();
  const service = new ExecutionRunBoundLocalCompositeContinuationService({ delegate, continuations: reader, runs });

  const view = await service.start({ clientRequestId, inputArtifactId: 'original-d2', analysis: {}, points: [] }, scope);
  assert.equal(view.state, 'UNKNOWN');
  assert.deepEqual(calls.map(([name]) => name), ['reader:getByClientRequestId', 'delegate:start', 'reader:get']);
  assert.equal(childForStep(runs, SEGMENT).status, 'SUCCEEDED');
  assert.equal(childForStep(runs, BACKGROUND).status, 'UNKNOWN');
  assert.equal(parentRun(runs).status, 'UNKNOWN');
});
