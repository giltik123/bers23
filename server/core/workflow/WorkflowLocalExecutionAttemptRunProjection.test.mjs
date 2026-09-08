import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstAttemptIdempotencyKey,
  projectWorkflowLocalExecutionAttempt,
  retryAttemptIdempotencyKey,
} from './WorkflowLocalExecutionAttemptRunProjection.ts';

const scope = Object.freeze({ tenantId: 'tenant-attempt', userId: 'user-attempt', projectId: '11111111-1111-4111-8111-111111111111' });
const steps = Object.freeze(['orthogonal-transform', 'resize']);

class FakeRuns {
  constructor() { this.runs = []; this.events = []; this.next = 1; }
  async issue(input) {
    const existing = this.runs.find(run => sameScope(run.scope, input.scope) && run.capability === input.capability && run.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.authorityKind !== input.authorityKind || existing.authorityRef !== input.authorityRef || existing.parentRunId !== input.parentRunId) throw Object.assign(new Error('idempotency conflict'), { code: 'execution_run_idempotency_conflict' });
      this.events.push(['issue', existing.runId, false]);
      return { run: existing, created: false };
    }
    if (this.runs.some(run => run.authorityKind === input.authorityKind && run.authorityRef === input.authorityRef)) throw Object.assign(new Error('authority conflict'), { code: 'execution_run_authority_already_bound' });
    const run = Object.freeze({
      runId: `22222222-2222-4222-8222-${String(this.next++).padStart(12, '0')}`,
      scope: input.scope, capability: input.capability, idempotencyKey: input.idempotencyKey,
      authorityKind: input.authorityKind, authorityRef: input.authorityRef,
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}), status: 'QUEUED', revision: 1,
      createdAt: '2026-09-08T07:00:00.000Z', updatedAt: '2026-09-08T07:00:00.000Z',
    });
    this.runs.push(run); this.events.push(['issue', run.runId, true]); return { run, created: true };
  }
  async get(receivedScope, runId) { return this.runs.find(run => sameScope(run.scope, receivedScope) && run.runId === runId); }
  async getByAuthority(receivedScope, kind, ref) { return this.runs.find(run => sameScope(run.scope, receivedScope) && run.authorityKind === kind && run.authorityRef === ref); }
  async list(receivedScope, limit = 100) { return this.runs.filter(run => sameScope(run.scope, receivedScope)).slice(0, limit); }
  async listRoots(receivedScope, limit = 100) { return this.runs.filter(run => sameScope(run.scope, receivedScope) && !run.parentRunId).slice(0, limit); }
  async listChildren(receivedScope, parentRunId, limit = 100) { return this.runs.filter(run => sameScope(run.scope, receivedScope) && run.parentRunId === parentRunId).slice(0, limit); }
  async start(receivedScope, runId) { return this.transition(receivedScope, runId, 'RUNNING'); }
  async succeed(receivedScope, runId) { return this.transition(receivedScope, runId, 'SUCCEEDED'); }
  async fail(receivedScope, runId, reason) { return this.transition(receivedScope, runId, 'FAILED', reason); }
  async cancel(receivedScope, runId, reason) { return this.transition(receivedScope, runId, 'CANCELLED', reason); }
  async markUnknown(receivedScope, runId, reason) { return this.transition(receivedScope, runId, 'UNKNOWN', reason); }
  async transition(receivedScope, runId, target, reason) {
    const index = this.runs.findIndex(run => run.runId === runId && sameScope(run.scope, receivedScope));
    if (index < 0) throw new Error('run unavailable');
    const current = this.runs[index]; this.events.push(['transition', runId, target, reason]);
    if (current.status === target) {
      if (['FAILED','CANCELLED','UNKNOWN'].includes(target) && current.statusReasonCode !== reason) throw new Error('terminal reason conflict');
      return current;
    }
    const allowed = current.status === 'QUEUED' ? target === 'RUNNING' || target === 'CANCELLED'
      : current.status === 'RUNNING' ? ['SUCCEEDED','FAILED','CANCELLED','UNKNOWN'].includes(target) : false;
    if (!allowed) throw new Error(`invalid transition ${current.status} -> ${target}`);
    const next = Object.freeze({ ...current, status: target, revision: current.revision + 1,
      ...(target === 'RUNNING' ? { startedAt: '2026-09-08T07:00:01.000Z' } : {}),
      ...(['FAILED','CANCELLED','UNKNOWN'].includes(target) ? { statusReasonCode: reason } : {}),
      ...(['SUCCEEDED','FAILED','CANCELLED','UNKNOWN'].includes(target) ? { finishedAt: '2026-09-08T07:00:02.000Z' } : {}),
      updatedAt: '2026-09-08T07:00:02.000Z' });
    this.runs[index] = next; return next;
  }
}

function sameScope(a, b) { return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId; }
async function workflowParent(runs) {
  const issued = await runs.issue({ scope, capability: 'WORKFLOW_CONTINUATION', idempotencyKey: 'agent-request-1', authorityKind: 'WORKFLOW_CONTINUATION', authorityRef: 'agent-workflow-1' });
  return runs.start(scope, issued.run.runId);
}

function attempts(runs, parent, stepId) { return runs.runs.filter(run => run.parentRunId === parent.runId && run.capability === 'LOCAL_EXECUTION' && (run.idempotencyKey.includes(`:${stepId}`))); }

test('fixed multi-step workflow keeps one parent while retry creates a new immutable LOCAL child attempt', async () => {
  const runs = new FakeRuns(); const parent = await workflowParent(runs);
  const orthogonal = await projectWorkflowLocalExecutionAttempt({ runs, parent, acceptedStepIds: steps, stepId: 'orthogonal-transform', ticketId: 'ticket-orthogonal-1', target: 'RUNNING' });
  assert.equal(orthogonal.idempotencyKey, firstAttemptIdempotencyKey(parent.runId, 'orthogonal-transform'));
  const orthogonalDone = await projectWorkflowLocalExecutionAttempt({ runs, parent, acceptedStepIds: steps, stepId: 'orthogonal-transform', ticketId: 'ticket-orthogonal-1', target: 'SUCCEEDED' });
  assert.equal(orthogonalDone.status, 'SUCCEEDED');

  const resizeFirst = await projectWorkflowLocalExecutionAttempt({ runs, parent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-resize-1', target: 'RUNNING' });
  assert.equal(resizeFirst.idempotencyKey, firstAttemptIdempotencyKey(parent.runId, 'resize'));
  const resizeRetry = await projectWorkflowLocalExecutionAttempt({ runs, parent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-resize-2', target: 'RUNNING' });
  assert.equal(resizeRetry.idempotencyKey, retryAttemptIdempotencyKey(parent.runId, 'resize', 'ticket-resize-2'));
  const resizeHistory = attempts(runs, parent, 'resize');
  assert.equal(resizeHistory.length, 2);
  assert.equal(resizeHistory.find(run => run.authorityRef === 'ticket-resize-1').status, 'FAILED');
  assert.equal(resizeHistory.find(run => run.authorityRef === 'ticket-resize-1').statusReasonCode, 'LOCAL_EXECUTION_RETRIED');
  assert.equal(resizeHistory.find(run => run.authorityRef === 'ticket-resize-2').status, 'RUNNING');
  assert.equal((await runs.listRoots(scope)).length, 1, 'retry must never invent a second workflow root');
  assert.equal((await runs.listRoots(scope))[0].runId, parent.runId);
  assert.equal((await runs.get(scope, parent.runId)).status, 'RUNNING');
});

test('exact retry projection replay is idempotent and does not restart the current attempt', async () => {
  const runs = new FakeRuns(); const parent = await workflowParent(runs);
  await projectWorkflowLocalExecutionAttempt({ runs, parent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-resize-1', target: 'RUNNING' });
  const second = await projectWorkflowLocalExecutionAttempt({ runs, parent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-resize-2', target: 'RUNNING' });
  const startsBefore = runs.events.filter(event => event[0] === 'transition' && event[2] === 'RUNNING').length;
  const replay = await projectWorkflowLocalExecutionAttempt({ runs, parent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-resize-2', target: 'RUNNING' });
  assert.equal(replay.runId, second.runId);
  assert.equal(runs.events.filter(event => event[0] === 'transition' && event[2] === 'RUNNING').length, startsBefore);
  assert.equal(attempts(runs, parent, 'resize').length, 2);
});

test('SUCCEEDED or UNKNOWN old attempt cannot be superseded and unadmitted steps fail closed', async () => {
  const successRuns = new FakeRuns(); const successParent = await workflowParent(successRuns);
  await projectWorkflowLocalExecutionAttempt({ runs: successRuns, parent: successParent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-success', target: 'SUCCEEDED' });
  await assert.rejects(() => projectWorkflowLocalExecutionAttempt({ runs: successRuns, parent: successParent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-after-success', target: 'RUNNING' }), error => error?.code === 'workflow_local_attempt_retry_conflict');

  const unknownRuns = new FakeRuns(); const unknownParent = await workflowParent(unknownRuns);
  const first = await projectWorkflowLocalExecutionAttempt({ runs: unknownRuns, parent: unknownParent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-unknown', target: 'RUNNING' });
  await unknownRuns.markUnknown(scope, first.runId, 'LOCAL_EXECUTION_UNCERTAIN');
  await assert.rejects(() => projectWorkflowLocalExecutionAttempt({ runs: unknownRuns, parent: unknownParent, acceptedStepIds: steps, stepId: 'resize', ticketId: 'ticket-after-unknown', target: 'RUNNING' }), error => error?.code === 'workflow_local_attempt_retry_conflict');

  await assert.rejects(() => projectWorkflowLocalExecutionAttempt({ runs: unknownRuns, parent: unknownParent, acceptedStepIds: steps, stepId: 'segment', ticketId: 'ticket-segment', target: 'RUNNING' }), error => error?.code === 'workflow_local_attempt_step_invalid');
});
