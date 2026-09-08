import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  BOUNDED_AGENT_VERIFY_STEP_ID,
  BoundedAgentDeterministicWorkflowService,
} from './BoundedAgentDeterministicWorkflowService.ts';
import { ORTHOGONAL_TRANSFORM_STEP_ID } from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_STEP_ID } from '../../../src/platform/creative/deterministic/Resize.ts';

const NOW = Date.parse('2026-09-08T08:00:00.000Z');
const auth = Object.freeze({ tenantId: 'agent-tenant', userId: 'agent-user' });
const projectId = 'agent-project';
const scope = Object.freeze({ ...auth, projectId });
const root = Object.freeze({ artifactId: 'artifact-root', storageId: 'storage-root', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64), parentArtifactIds: Object.freeze([]), width: 4, height: 3 });
const orthogonal = Object.freeze({ artifactId: 'artifact-orthogonal', storageId: 'storage-orthogonal', kind: 'image', role: 'COMPOSITE', sha256: 'b'.repeat(64), parentArtifactIds: Object.freeze([root.artifactId]), width: 3, height: 4 });
const resized = Object.freeze({ artifactId: 'artifact-resized', storageId: 'storage-resized', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), parentArtifactIds: Object.freeze([orthogonal.artifactId]), width: 6, height: 8 });

function startCommand(overrides = {}) {
  return Object.freeze({ clientRequestId: 'agent-request', projectId, sourceArtifactId: root.artifactId, mode: 'ROTATE_90_CW', width: 6, height: 8, ...overrides });
}

function childExecutionId(clientRequestId, stepId) {
  const prefix = stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'local-orthogonal-transform-' : 'local-resize-';
  return `${prefix}${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}

class MemoryContinuationStore {
  constructor() { this.byExecution = new Map(); this.byClient = new Map(); }
  async create(input) {
    const existing = this.byClient.get(input.clientRequestId);
    if (existing) {
      assert.equal(existing.executionId, input.executionId);
      assert.deepEqual(existing.scope, input.scope);
      assert.deepEqual(existing.plan, input.plan);
      assert.deepEqual(existing.inputArtifacts, input.inputArtifacts);
      return existing;
    }
    const snapshot = this.#write(Object.freeze({
      executionId: input.executionId, clientRequestId: input.clientRequestId, scope: input.scope, plan: input.plan,
      inputArtifacts: input.inputArtifacts, state: 'READY', completedSteps: Object.freeze([]), revision: 0,
      createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
    }));
    return snapshot;
  }
  async get(executionId, queryScope) { const value = this.byExecution.get(executionId); return value && sameScope(value.scope, queryScope) ? value : undefined; }
  async getByClientRequestId(queryScope, clientRequestId) { const value = this.byClient.get(clientRequestId); return value && sameScope(value.scope, queryScope) ? value : undefined; }
  async waitForLocalResult({ executionId, scope: queryScope, expectedRevision, ticket }) {
    const current = this.#require(executionId, queryScope); assert.equal(current.state, 'READY'); assert.equal(current.revision, expectedRevision);
    return this.#next(current, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: ticket.stepId, outstandingLocal: ticket, completedSteps: current.completedSteps });
  }
  async retryLocalResult({ executionId, scope: queryScope, expectedRevision, previousTicketId, ticket }) {
    const current = this.#require(executionId, queryScope); assert.equal(current.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(current.revision, expectedRevision); assert.equal(current.outstandingLocal.ticketId, previousTicketId); assert.equal(current.currentStepId, ticket.stepId); assert.notEqual(ticket.ticketId, previousTicketId);
    return this.#next(current, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: ticket.stepId, outstandingLocal: ticket, completedSteps: current.completedSteps });
  }
  async completeLocalStep({ executionId, scope: queryScope, expectedRevision, stepId, ticketId, artifactIds }) {
    const current = this.#require(executionId, queryScope); assert.equal(current.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(current.revision, expectedRevision); assert.equal(current.currentStepId, stepId); assert.equal(current.outstandingLocal.ticketId, ticketId);
    return this.#next(current, { state: 'READY', completedSteps: Object.freeze([...current.completedSteps, Object.freeze({ stepId, ticketId, artifactIds })]) });
  }
  async runInternalStep({ executionId, scope: queryScope, expectedRevision, stepId }) {
    const current = this.#require(executionId, queryScope); assert.equal(current.state, 'READY'); assert.equal(current.revision, expectedRevision);
    return this.#next(current, { state: 'RUNNING_INTERNAL', currentStepId: stepId, completedSteps: current.completedSteps });
  }
  async completeInternalStep({ executionId, scope: queryScope, expectedRevision, stepId, artifactIds }) {
    const current = this.#require(executionId, queryScope); assert.equal(current.state, 'RUNNING_INTERNAL'); assert.equal(current.revision, expectedRevision); assert.equal(current.currentStepId, stepId);
    return this.#next(current, { state: 'READY', completedSteps: Object.freeze([...current.completedSteps, Object.freeze({ stepId, artifactIds })]) });
  }
  async succeed({ executionId, scope: queryScope, expectedRevision, terminalArtifactId }) {
    const current = this.#require(executionId, queryScope); assert.equal(current.state, 'READY'); assert.equal(current.revision, expectedRevision);
    return this.#next(current, { state: 'SUCCESS', completedSteps: current.completedSteps, terminalArtifactId });
  }
  async fail({ executionId, scope: queryScope, expectedRevision, failureCode }) { return this.#terminal(executionId, queryScope, expectedRevision, 'FAILED', failureCode); }
  async cancel({ executionId, scope: queryScope, expectedRevision }) { return this.#terminal(executionId, queryScope, expectedRevision, 'CANCELLED', 'WORKFLOW_CANCELLED'); }
  async markUnknown({ executionId, scope: queryScope, expectedRevision, failureCode }) { return this.#terminal(executionId, queryScope, expectedRevision, 'UNKNOWN', failureCode); }
  #terminal(executionId, queryScope, expectedRevision, state, failureCode) { const current = this.#require(executionId, queryScope); assert.equal(current.revision, expectedRevision); return this.#next(current, { state, completedSteps: current.completedSteps, failureCode }); }
  #require(executionId, queryScope) { const value = this.byExecution.get(executionId); assert.ok(value); assert.ok(sameScope(value.scope, queryScope)); return value; }
  #next(current, patch) {
    const snapshot = Object.freeze({ executionId: current.executionId, clientRequestId: current.clientRequestId, scope: current.scope, plan: current.plan, inputArtifacts: current.inputArtifacts, ...patch, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: new Date(NOW + (current.revision + 1) * 1000).toISOString() });
    return this.#write(snapshot);
  }
  #write(snapshot) { this.byExecution.set(snapshot.executionId, snapshot); this.byClient.set(snapshot.clientRequestId, snapshot); return snapshot; }
}

class MemoryRunRegistry {
  constructor() { this.runs = new Map(); this.sequence = 0; }
  async issue(input) {
    const existing = [...this.runs.values()].find(run => sameScope(run.scope, input.scope) && run.capability === input.capability && run.idempotencyKey === input.idempotencyKey);
    if (existing) {
      assert.equal(existing.authorityKind, input.authorityKind); assert.equal(existing.authorityRef, input.authorityRef); assert.equal(existing.parentRunId, input.parentRunId);
      return { run: existing, created: false };
    }
    const run = Object.freeze({ runId: `run-${++this.sequence}`, scope: input.scope, capability: input.capability, idempotencyKey: input.idempotencyKey, authorityKind: input.authorityKind, authorityRef: input.authorityRef, parentRunId: input.parentRunId, status: 'QUEUED', revision: 0, createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() });
    this.runs.set(run.runId, run); return { run, created: true };
  }
  async get(scopeValue, runId) { const run = this.runs.get(runId); return run && sameScope(run.scope, scopeValue) ? run : undefined; }
  async getByAuthority(scopeValue, authorityKind, authorityRef) { return [...this.runs.values()].find(run => sameScope(run.scope, scopeValue) && run.authorityKind === authorityKind && run.authorityRef === authorityRef); }
  async list(scopeValue, limit = 100) { return [...this.runs.values()].filter(run => sameScope(run.scope, scopeValue)).slice(0, limit); }
  async listRoots(scopeValue, limit = 100) { return (await this.list(scopeValue, limit)).filter(run => !run.parentRunId); }
  async listChildren(scopeValue, parentRunId, limit = 100) { return (await this.list(scopeValue, 1000)).filter(run => run.parentRunId === parentRunId).slice(0, limit); }
  async start(scopeValue, runId) { return this.#transition(scopeValue, runId, 'RUNNING'); }
  async succeed(scopeValue, runId) { return this.#transition(scopeValue, runId, 'SUCCEEDED'); }
  async fail(scopeValue, runId, reason) { return this.#transition(scopeValue, runId, 'FAILED', reason); }
  async cancel(scopeValue, runId, reason) { return this.#transition(scopeValue, runId, 'CANCELLED', reason); }
  async markUnknown(scopeValue, runId, reason) { return this.#transition(scopeValue, runId, 'UNKNOWN', reason); }
  #transition(scopeValue, runId, status, reason) {
    const current = this.runs.get(runId); assert.ok(current); assert.ok(sameScope(current.scope, scopeValue));
    if (current.status === status) return current;
    const next = Object.freeze({ ...current, status, revision: current.revision + 1, statusReasonCode: reason, updatedAt: new Date(NOW + current.revision + 1).toISOString(), ...(status === 'RUNNING' ? { startedAt: new Date(NOW).toISOString() } : status === 'QUEUED' ? {} : { finishedAt: new Date(NOW + 1).toISOString() }) });
    this.runs.set(runId, next); return next;
  }
}

function runtime() {
  const continuations = new MemoryContinuationStore();
  const runs = new MemoryRunRegistry();
  const ticketsById = new Map();
  const ticketsByKey = new Map();
  const recovery = new Map();
  const artifacts = new Map([[root.artifactId, root], [orthogonal.artifactId, orthogonal], [resized.artifactId, resized]]);
  let activeWorkflow;
  let ticketSeq = 0;
  let orthogonalSubmit = 'SUCCESS';
  let resizeSubmit = 'SUCCESS';

  const workflowTickets = Object.freeze({
    async withWorkflowBinding(binding, work) { assert.equal(activeWorkflow, undefined); activeWorkflow = binding; try { return await work(); } finally { activeWorkflow = undefined; } },
  });
  function issueTicket(stepId, command) {
    assert.ok(activeWorkflow, 'deterministic prepare must run inside server-owned workflow binding');
    assert.ok(activeWorkflow.allowedStepIds.includes(stepId));
    const requestId = childExecutionId(command.clientRequestId, stepId);
    const key = `${command.clientRequestId}:${stepId}:local-v2`;
    const ticket = Object.freeze({
      version: '2', issuer: 'CORE', ticketId: `ticket-${++ticketSeq}`, requestId, workflowId: activeWorkflow.workflowId, stepId,
      operation: Object.freeze({ id: stepId, version: '1', type: stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'ORTHOGONAL_TRANSFORM' : 'RESIZE', capability: stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'local:deterministic:orthogonal-transform:v1' : 'local:deterministic:resize:v1' }),
      scope, inputs: Object.freeze([]), expectedOutputs: Object.freeze([]), allowedExecutors: Object.freeze([]), policy: 'LOCAL_ONLY', cost: Object.freeze({ providerCalls: 0, paidCloudCredits: 0 }), idempotencyKey: key,
      nonce: `nonce-${ticketSeq}`, expiresAt: NOW + 60_000,
    });
    ticketsById.set(ticket.ticketId, ticket); ticketsByKey.set(key, ticket); recovery.set(ticket.ticketId, { status: 'PENDING', executionId: requestId });
    return { executionId: requestId, ticket };
  }
  const orthogonalPort = Object.freeze({
    async prepare(command) { return issueTicket(ORTHOGONAL_TRANSFORM_STEP_ID, command); },
    async submit({ ticketId }) { const ticket = ticketsById.get(ticketId); assert.ok(ticket); if (orthogonalSubmit === 'FAILED') { recovery.set(ticketId, { status: 'FAILED', executionId: ticket.requestId }); return { executionId: ticket.requestId, status: 'FAILED', outcome: { status: 'FAILED' } }; } recovery.set(ticketId, { status: 'SUCCESS', executionId: ticket.requestId, artifactId: orthogonal.artifactId }); return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: orthogonal.artifactId, outcome: { status: 'SUCCESS' } }; },
  });
  const resizePort = Object.freeze({
    async prepare(command) { return issueTicket(RESIZE_STEP_ID, command); },
    async submit({ ticketId }) { const ticket = ticketsById.get(ticketId); assert.ok(ticket); if (resizeSubmit === 'FAILED') { recovery.set(ticketId, { status: 'FAILED', executionId: ticket.requestId }); return { executionId: ticket.requestId, status: 'FAILED', outcome: { status: 'FAILED' } }; } recovery.set(ticketId, { status: 'SUCCESS', executionId: ticket.requestId, artifactId: resized.artifactId }); return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: resized.artifactId, outcome: { status: 'SUCCESS' } }; },
  });

  const service = new BoundedAgentDeterministicWorkflowService({
    continuations,
    tickets: Object.freeze({ async getV2(id) { return ticketsById.get(id); }, async getByIdempotencyKeyV2(_scope, key) { return ticketsByKey.get(key); }, async getFinalization(id) { const value = recovery.get(id); return value?.status === 'PENDING' ? undefined : value ? { status: value.status } : undefined; } }),
    workflowTickets,
    orthogonal: orthogonalPort,
    resize: resizePort,
    finalRecovery: Object.freeze({ async recover(binding) { const value = recovery.get(binding.ticket.ticketId); assert.ok(value); return value; } }),
    artifacts: Object.freeze({ async resolve(queryScope, id) { assert.ok(sameScope(queryScope, scope)); const value = artifacts.get(id); if (!value) throw new Error('artifact missing'); return value; } }),
    projects: Object.freeze({ async get(queryAuth, id) { assert.deepEqual(queryAuth, auth); return id === projectId ? { current_image_storage_id: root.storageId, width: root.width, height: root.height } : undefined; } }),
    runs,
    now: () => NOW,
  });
  return { service, continuations, runs, ticketsById, recovery, setOrthogonalSubmit(value) { orthogonalSubmit = value; }, setResizeSubmit(value) { resizeSubmit = value; } };
}

test('fixed Agent plan executes Orthogonal -> Resize -> internal verify and returns candidate without Project mutation', async () => {
  const r = runtime();
  let view = await r.service.start(startCommand(), auth);
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(view.nextAction.operation, 'ORTHOGONAL_TRANSFORM');
  const orthTicket = view.nextAction.ticket;
  view = await r.service.submitLocalResult(view.executionId, projectId, auth, { ticketId: orthTicket.ticketId });
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(view.nextAction.operation, 'RESIZE');
  assert.equal(view.nextAction.ticket.workflowId, view.executionId);
  const resizeTicket = view.nextAction.ticket;
  view = await r.service.submitLocalResult(view.executionId, projectId, auth, { ticketId: resizeTicket.ticketId });
  assert.equal(view.state, 'SUCCESS'); assert.equal(view.terminalArtifactId, resized.artifactId);

  const snapshot = await r.continuations.get(view.executionId, scope);
  assert.deepEqual(snapshot.completedSteps.map(step => step.stepId), [ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID, BOUNDED_AGENT_VERIFY_STEP_ID]);
  assert.deepEqual(snapshot.plan.parameters, { height: 8, mode: 'ROTATE_90_CW', width: 6 });
  const roots = await r.runs.listRoots(scope); assert.equal(roots.length, 1); assert.equal(roots[0].status, 'SUCCEEDED');
  const children = await r.runs.listChildren(scope, roots[0].runId, 20);
  assert.equal(children.filter(child => child.capability === 'LOCAL_EXECUTION' && child.status === 'SUCCEEDED').length, 2);
  assert.equal(children.filter(child => child.capability === 'WORKFLOW_STEP' && child.status === 'SUCCEEDED').length, 1);
});

test('resume reconciles a committed local FINAL without resubmitting pixel execution', async () => {
  const r = runtime();
  const first = await r.service.start(startCommand(), auth);
  const ticket = first.nextAction.ticket;
  r.recovery.set(ticket.ticketId, { status: 'SUCCESS', executionId: ticket.requestId, artifactId: orthogonal.artifactId });
  const resumed = await r.service.resume(first.executionId, projectId, auth);
  assert.equal(resumed.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(resumed.nextAction.operation, 'RESIZE');
  const snapshot = await r.continuations.get(first.executionId, scope);
  assert.equal(snapshot.completedSteps[0].artifactIds[0], orthogonal.artifactId);
});

test('FAILED local attempt retries inside the same workflow with a new immutable child attempt', async () => {
  const r = runtime(); r.setOrthogonalSubmit('FAILED');
  let view = await r.service.start(startCommand(), auth); const firstTicket = view.nextAction.ticket;
  view = await r.service.submitLocalResult(view.executionId, projectId, auth, { ticketId: firstTicket.ticketId });
  assert.equal(view.retryAvailable, true); assert.equal(view.attemptStatus, 'FAILED');
  r.setOrthogonalSubmit('SUCCESS');
  view = await r.service.retry(view.executionId, projectId, auth);
  assert.equal(view.nextAction.operation, 'ORTHOGONAL_TRANSFORM'); assert.notEqual(view.nextAction.ticket.ticketId, firstTicket.ticketId); assert.equal(view.nextAction.ticket.workflowId, view.executionId);
  const parent = (await r.runs.listRoots(scope))[0]; const attempts = (await r.runs.listChildren(scope, parent.runId, 20)).filter(child => child.capability === 'LOCAL_EXECUTION');
  assert.equal(attempts.length, 2); assert.ok(attempts.some(child => child.authorityRef === firstTicket.ticketId && child.status === 'FAILED' && child.statusReasonCode === 'LOCAL_EXECUTION_RETRIED')); assert.ok(attempts.some(child => child.authorityRef === view.nextAction.ticket.ticketId && child.status === 'RUNNING'));
});

test('UNKNOWN recovery and explicit cancel terminalize durable workflow and child projections fail closed', async () => {
  const unknown = runtime(); const first = await unknown.service.start(startCommand(), auth); unknown.recovery.set(first.nextAction.ticket.ticketId, { status: 'UNKNOWN', executionId: first.nextAction.ticket.requestId });
  const unknownView = await unknown.service.resume(first.executionId, projectId, auth); assert.equal(unknownView.state, 'UNKNOWN'); assert.match(unknownView.failureCode, /LOCAL_ORTHOGONAL_TRANSFORM_UNKNOWN/);
  const unknownRoot = (await unknown.runs.listRoots(scope))[0]; assert.equal(unknownRoot.status, 'UNKNOWN');

  const cancelled = runtime(); const active = await cancelled.service.start(startCommand({ clientRequestId: 'cancel-request' }), auth); const cancelledView = await cancelled.service.cancel(active.executionId, projectId, auth); assert.equal(cancelledView.state, 'CANCELLED'); const cancelRoot = (await cancelled.runs.listRoots(scope))[0]; assert.equal(cancelRoot.status, 'CANCELLED'); const children = await cancelled.runs.listChildren(scope, cancelRoot.runId, 20); assert.ok(children.every(child => child.status === 'CANCELLED' || child.status === 'SUCCEEDED'));
});

test('same client request cannot rebind immutable Agent plan parameters or source', async () => {
  const r = runtime(); await r.service.start(startCommand(), auth);
  await assert.rejects(() => r.service.start(startCommand({ width: 7 }), auth));
  const foreign = Object.freeze({ ...root, artifactId: 'foreign-root', storageId: 'foreign-storage' });
  await assert.rejects(() => r.service.start(startCommand({ sourceArtifactId: foreign.artifactId }), auth));
});

function sameScope(a, b) { return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId; }
