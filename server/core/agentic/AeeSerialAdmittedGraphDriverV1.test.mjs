import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_STEP_ID,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_CAPABILITY, RESIZE_STEP_ID } from '../../../src/platform/creative/deterministic/Resize.ts';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import { compileAeePlanV1 } from './AeePlanCompilerV1.ts';
import { AGENT_INTENT_V1_SCHEMA, agentIntentV1Digest, normalizeAgentIntentV1 } from './AgentIntentV1.ts';
import { PLAN_PROPOSAL_V1_SCHEMA } from './PlanProposalV1.ts';
import { AeeSerialAdmittedGraphDriverV1 } from './AeeSerialAdmittedGraphDriverV1.ts';

const NOW = Date.parse('2026-09-10T01:00:00.000Z');
const auth = Object.freeze({ tenantId: 'aee-tenant', userId: 'aee-user' });
const projectId = 'aee-project';
const scope = Object.freeze({ ...auth, projectId });
const root = image('root', 'storage-root', 'ORIGINAL', 'a', [], 4, 3);
const rotated = image('rotated', 'storage-rotated', 'COMPOSITE', 'b', [root.artifactId], 3, 4);
const resizeOne = image('resize-one-artifact', 'storage-resize-one', 'COMPOSITE', 'c', [rotated.artifactId], 6, 8);
const resizeTwo = image('resize-two-artifact', 'storage-resize-two', 'COMPOSITE', 'd', [resizeOne.artifactId], 2, 2);

function image(artifactId, storageId, role, hashChar, parents, width, height) {
  return Object.freeze({ artifactId, storageId, kind: 'image', role, sha256: hashChar.repeat(64), parentArtifactIds: Object.freeze(parents), width, height });
}

function admittedGraph(maxRetries = 1, maxWallClockMs = 120_000) {
  const rawIntent = {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'ae4b-test-parser/1',
    goal: { capability: 'RESIZE', instruction: 'Rotate then resize twice.' },
    source: { projectId, projectRevision: 7, sourceRef: root.artifactId },
    targets: [], mutable: [], preserve: [],
    constraints: { quality: 'BALANCED', styleTags: [] },
    execution: {
      policy: 'LOCAL_ONLY', cloudAllowed: false, maxNodes: 4, maxRetries, maxReplans: 0,
      maxCandidates: 1, maxPaidCredits: 0, maxWallClockMs, maxMemoryBytes: 64 * 1024 * 1024,
    },
    context: { modalities: ['TEXT'], uiReferences: [] }, ambiguities: [], evidence: [], confidence: 0.99,
  };
  const proposal = {
    schemaVersion: PLAN_PROPOSAL_V1_SCHEMA,
    plannerVersion: 'ae4b-test-planner/1',
    intentDigest: agentIntentV1Digest(normalizeAgentIntentV1(rawIntent)),
    nodes: [
      {
        nodeId: 'rotate', capabilityId: AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1, capabilityVersion: 1,
        dependsOn: [], inputs: [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }], parameters: { mode: 'ROTATE_90_CW' },
      },
      {
        nodeId: 'resize-one', capabilityId: AEE_CAPABILITY_RESIZE_V1, capabilityVersion: 1,
        dependsOn: ['rotate'], inputs: [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'rotate' } }], parameters: { width: 6, height: 8 },
      },
      {
        nodeId: 'resize-two', capabilityId: AEE_CAPABILITY_RESIZE_V1, capabilityVersion: 1,
        dependsOn: ['resize-one'], inputs: [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'resize-one' } }], parameters: { width: 2, height: 2 },
      },
    ],
  };
  return compileAeePlanV1(rawIntent, proposal, {
    canonical: { projectId, projectRevision: 7, sourceRef: root.artifactId },
    sourceArtifact: { role: 'ORIGINAL', width: root.width, height: root.height },
  });
}

class MemoryContinuationStore {
  constructor(now = () => NOW) {
    this.byExecution = new Map(); this.byClient = new Map(); this.now = now;
    this.sourceChecks = 0; this.failNextWait = false; this.failNextRetry = false;
  }
  async create(input) {
    const existing = this.byClient.get(input.clientRequestId);
    if (existing) {
      if (existing.executionId !== input.executionId || !sameScope(existing.scope, input.scope)
        || JSON.stringify(existing.plan) !== JSON.stringify(input.plan) || JSON.stringify(existing.inputArtifacts) !== JSON.stringify(input.inputArtifacts)) {
        throw Object.assign(new Error('Scoped client request id is already bound to another workflow continuation'), { code: 'WORKFLOW_CONTINUATION_CONFLICT' });
      }
      return existing;
    }
    return this.#write(Object.freeze({
      executionId: input.executionId, clientRequestId: input.clientRequestId, scope: input.scope, plan: input.plan,
      inputArtifacts: input.inputArtifacts, state: 'READY', completedSteps: Object.freeze([]), revision: 0,
      createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
    }));
  }
  async createWithCurrentProjectSource(input, source) {
    const existing = this.byClient.get(input.clientRequestId);
    if (existing) return this.create(input);
    this.sourceChecks += 1;
    assert.deepEqual(source, { storageId: root.storageId, width: root.width, height: root.height });
    return this.create(input);
  }
  async get(executionId, queryScope) { const value = this.byExecution.get(executionId); return value && sameScope(value.scope, queryScope) ? value : undefined; }
  async getByClientRequestId(queryScope, clientRequestId) { const value = this.byClient.get(clientRequestId); return value && sameScope(value.scope, queryScope) ? value : undefined; }
  async waitForLocalResult({ executionId, scope: queryScope, expectedRevision, continuationStepId, ticket }) {
    const current = this.#require(executionId, queryScope);
    const logical = continuationStepId ?? ticket.stepId;
    if (current.state === 'WAITING_FOR_LOCAL_RESULT' && current.outstandingLocal?.ticketId === ticket.ticketId && current.currentStepId === logical) return current;
    if (this.failNextWait) {
      this.failNextWait = false;
      throw Object.assign(new Error('simulated crash after durable ticket issuance'), { code: 'SIMULATED_CRASH' });
    }
    assert.equal(current.state, 'READY'); assert.equal(current.revision, expectedRevision);
    assert.ok(Date.parse(ticket.expiresAt) > this.now(), 'normal bind must reject an expired ticket');
    return this.#next(current, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: logical, outstandingLocal: Object.freeze({ ...ticket, stepId: logical }), completedSteps: current.completedSteps });
  }
  async bindExpiredLocalTicketForRecovery({ executionId, scope: queryScope, expectedRevision, continuationStepId, ticket }) {
    const current = this.#require(executionId, queryScope);
    const logical = continuationStepId ?? ticket.stepId;
    if (current.state === 'WAITING_FOR_LOCAL_RESULT' && current.outstandingLocal?.ticketId === ticket.ticketId && current.currentStepId === logical) return current;
    assert.equal(current.state, 'READY'); assert.equal(current.revision, expectedRevision);
    assert.ok(Date.parse(ticket.expiresAt) <= this.now(), 'recovery bind is only for an expired orphan ticket');
    return this.#next(current, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: logical, outstandingLocal: Object.freeze({ ...ticket, stepId: logical }), completedSteps: current.completedSteps });
  }
  async retryLocalResult({ executionId, scope: queryScope, expectedRevision, continuationStepId, previousTicketId, ticket }) {
    const current = this.#require(executionId, queryScope); const logical = continuationStepId ?? ticket.stepId;
    if (this.failNextRetry) {
      this.failNextRetry = false;
      throw Object.assign(new Error('simulated crash after durable retry ticket issuance'), { code: 'SIMULATED_RETRY_CRASH' });
    }
    assert.equal(current.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(current.revision, expectedRevision);
    assert.equal(current.currentStepId, logical); assert.equal(current.outstandingLocal.ticketId, previousTicketId); assert.notEqual(ticket.ticketId, previousTicketId);
    assert.ok(Date.parse(ticket.expiresAt) > this.now(), 'normal retry bind must reject an expired replacement');
    return this.#next(current, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: logical, outstandingLocal: Object.freeze({ ...ticket, stepId: logical }), completedSteps: current.completedSteps });
  }
  async bindExpiredRetryLocalTicketForRecovery({ executionId, scope: queryScope, expectedRevision, continuationStepId, previousTicketId, ticket }) {
    const current = this.#require(executionId, queryScope); const logical = continuationStepId ?? ticket.stepId;
    assert.equal(current.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(current.revision, expectedRevision);
    assert.equal(current.currentStepId, logical); assert.equal(current.outstandingLocal.ticketId, previousTicketId); assert.notEqual(ticket.ticketId, previousTicketId);
    assert.ok(Date.parse(ticket.expiresAt) <= this.now(), 'retry recovery bind is only for an expired replacement');
    return this.#next(current, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: logical, outstandingLocal: Object.freeze({ ...ticket, stepId: logical }), completedSteps: current.completedSteps });
  }
  async completeLocalStep({ executionId, scope: queryScope, expectedRevision, stepId, ticketId, artifactIds }) {
    const current = this.#require(executionId, queryScope);
    const replay = current.completedSteps.find(step => step.stepId === stepId);
    if (replay) { assert.equal(replay.ticketId, ticketId); assert.deepEqual(replay.artifactIds, artifactIds); return current; }
    assert.equal(current.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(current.revision, expectedRevision);
    assert.equal(current.currentStepId, stepId); assert.equal(current.outstandingLocal.ticketId, ticketId);
    return this.#next(current, { state: 'READY', completedSteps: Object.freeze([...current.completedSteps, Object.freeze({ stepId, ticketId, artifactIds })]) });
  }
  async runInternalStep() { throw new Error('AE-4b must not use RUNNING_INTERNAL'); }
  async completeInternalStep() { throw new Error('AE-4b must not use RUNNING_INTERNAL'); }
  async succeed({ executionId, scope: queryScope, expectedRevision, terminalArtifactId }) {
    const current = this.#require(executionId, queryScope);
    if (current.state === 'SUCCESS' && current.terminalArtifactId === terminalArtifactId) return current;
    assert.equal(current.state, 'READY'); assert.equal(current.revision, expectedRevision); assert.ok(current.completedSteps.at(-1).artifactIds.includes(terminalArtifactId));
    return this.#next(current, { state: 'SUCCESS', completedSteps: current.completedSteps, terminalArtifactId });
  }
  async fail({ executionId, scope: queryScope, expectedRevision, failureCode }) { return this.#terminal(executionId, queryScope, expectedRevision, 'FAILED', failureCode); }
  async cancel({ executionId, scope: queryScope, expectedRevision }) { return this.#terminal(executionId, queryScope, expectedRevision, 'CANCELLED', 'WORKFLOW_CANCELLED'); }
  async markUnknown({ executionId, scope: queryScope, expectedRevision, failureCode }) { return this.#terminal(executionId, queryScope, expectedRevision, 'UNKNOWN', failureCode); }
  #terminal(executionId, queryScope, expectedRevision, state, failureCode) {
    const current = this.#require(executionId, queryScope); assert.equal(current.revision, expectedRevision);
    if (current.state === state && current.failureCode === failureCode) return current;
    return this.#next(current, { state, completedSteps: current.completedSteps, failureCode });
  }
  #require(executionId, queryScope) { const value = this.byExecution.get(executionId); assert.ok(value); assert.ok(sameScope(value.scope, queryScope)); return value; }
  #next(current, patch) {
    const next = Object.freeze({
      executionId: current.executionId, clientRequestId: current.clientRequestId, scope: current.scope, plan: current.plan,
      inputArtifacts: current.inputArtifacts, ...patch, revision: current.revision + 1, createdAt: current.createdAt,
      updatedAt: new Date(NOW + (current.revision + 1) * 1000).toISOString(),
    });
    return this.#write(next);
  }
  #write(snapshot) { this.byExecution.set(snapshot.executionId, snapshot); this.byClient.set(snapshot.clientRequestId, snapshot); return snapshot; }
}

class MemoryRunRegistry {
  constructor() { this.runs = new Map(); this.sequence = 0; }
  async issue(input) {
    const existing = [...this.runs.values()].find(run => sameScope(run.scope, input.scope) && run.capability === input.capability && run.idempotencyKey === input.idempotencyKey);
    if (existing) { assert.equal(existing.authorityKind, input.authorityKind); assert.equal(existing.authorityRef, input.authorityRef); assert.equal(existing.parentRunId, input.parentRunId); return { run: existing, created: false }; }
    const run = Object.freeze({ runId: `run-${++this.sequence}`, scope: input.scope, capability: input.capability, idempotencyKey: input.idempotencyKey, authorityKind: input.authorityKind, authorityRef: input.authorityRef, parentRunId: input.parentRunId, status: 'QUEUED', revision: 0, createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() });
    this.runs.set(run.runId, run); return { run, created: true };
  }
  async get(queryScope, runId) { const run = this.runs.get(runId); return run && sameScope(run.scope, queryScope) ? run : undefined; }
  async getByAuthority(queryScope, kind, ref) { return [...this.runs.values()].find(run => sameScope(run.scope, queryScope) && run.authorityKind === kind && run.authorityRef === ref); }
  async list(queryScope, limit = 100) { return [...this.runs.values()].filter(run => sameScope(run.scope, queryScope)).slice(0, limit); }
  async listRoots(queryScope, limit = 100) { return (await this.list(queryScope, limit)).filter(run => !run.parentRunId); }
  async listChildren(queryScope, parentRunId, limit = 100) { return (await this.list(queryScope, 1000)).filter(run => run.parentRunId === parentRunId).slice(0, limit); }
  async start(queryScope, runId) { return this.#transition(queryScope, runId, 'RUNNING'); }
  async succeed(queryScope, runId) { return this.#transition(queryScope, runId, 'SUCCEEDED'); }
  async fail(queryScope, runId, reason) { return this.#transition(queryScope, runId, 'FAILED', reason); }
  async cancel(queryScope, runId, reason) { return this.#transition(queryScope, runId, 'CANCELLED', reason); }
  async markUnknown(queryScope, runId, reason) { return this.#transition(queryScope, runId, 'UNKNOWN', reason); }
  #transition(queryScope, runId, status, reason) {
    const current = this.runs.get(runId); assert.ok(current); assert.ok(sameScope(current.scope, queryScope));
    if (reason !== undefined) assert.match(reason, /^[A-Z0-9_]{1,128}$/, 'ExecutionRun reason must satisfy the production PostgreSQL contract');
    if (current.status === status) return current;
    const next = Object.freeze({ ...current, status, revision: current.revision + 1, statusReasonCode: reason, updatedAt: new Date(NOW + current.revision + 1).toISOString(), ...(status === 'RUNNING' ? { startedAt: new Date(NOW).toISOString() } : { finishedAt: new Date(NOW + 1).toISOString() }) });
    this.runs.set(runId, next); return next;
  }
}

function runtime(graph = admittedGraph()) {
  let now = NOW;
  let submitDelayMs = 0;
  const continuations = new MemoryContinuationStore(() => now);
  const runs = new MemoryRunRegistry();
  const artifacts = new Map([[root.artifactId, root], [rotated.artifactId, rotated], [resizeOne.artifactId, resizeOne], [resizeTwo.artifactId, resizeTwo]]);
  const tickets = new Map();
  const recovery = new Map();
  const failSources = new Set();
  const unknownSources = new Set();
  let activeWorkflow;
  let sequence = 0;

  const plans = Object.freeze({ async get(queryScope, digest) { return sameScope(queryScope, scope) && digest === graph.digest ? { scope, graph, createdAt: new Date(NOW).toISOString() } : undefined; } });
  const workflowTickets = Object.freeze({
    async withWorkflowBinding(binding, work) { assert.equal(activeWorkflow, undefined); activeWorkflow = binding; try { return await work(); } finally { activeWorkflow = undefined; } },
  });

  function issue(stepId, capability, command) {
    assert.ok(activeWorkflow); assert.ok(activeWorkflow.allowedStepIds.includes(stepId));
    const key = `${command.clientRequestId}:${stepId}:local-v2`;
    const prior = [...tickets.values()].find(value => value.idempotencyKey === key && sameScope(value.scope, scope));
    if (prior) {
      if (now >= prior.expiresAt) throw Object.assign(new Error('canonical prepare rejects expired durable ticket replay'), { code: 'local_ticket_expired' });
      return { executionId: prior.requestId, ticket: prior };
    }
    const source = artifacts.get(command.sourceArtifactId); assert.ok(source);
    const requestId = `local-${stepId}-${createHash('sha256').update(command.clientRequestId).digest('hex').slice(0, 16)}`;
    const ticket = Object.freeze({
      version: '2', issuer: 'CORE', ticketId: `ticket-${++sequence}`, requestId, workflowId: activeWorkflow.workflowId, stepId,
      operation: Object.freeze({ id: stepId, version: '1', type: stepId === RESIZE_STEP_ID ? 'RESIZE' : 'ORTHOGONAL_TRANSFORM', capability }),
      scope, inputs: Object.freeze([{ artifactId: source.artifactId, kind: source.kind, role: source.role, sha256: source.sha256 }]),
      expectedOutputs: Object.freeze([]), allowedExecutors: Object.freeze([]), policy: 'LOCAL_ONLY', cost: Object.freeze({ providerCalls: 0, paidCloudCredits: 0 }),
      idempotencyKey: key, nonce: `nonce-${sequence}`, expiresAt: now + 60_000,
    });
    tickets.set(ticket.ticketId, ticket); recovery.set(ticket.ticketId, { status: 'PENDING', executionId: requestId });
    return { executionId: requestId, ticket };
  }

  function outputFor(ticket) {
    const sourceId = ticket.inputs[0].artifactId;
    if (ticket.stepId === ORTHOGONAL_TRANSFORM_STEP_ID) { assert.equal(sourceId, root.artifactId); return rotated; }
    if (sourceId === rotated.artifactId) return resizeOne;
    if (sourceId === resizeOne.artifactId) return resizeTwo;
    throw new Error(`unexpected Resize source ${sourceId}`);
  }

  async function submit(ticketId) {
    const ticket = tickets.get(ticketId); assert.ok(ticket);
    now += submitDelayMs;
    const sourceId = ticket.inputs[0].artifactId;
    if (unknownSources.has(sourceId)) { recovery.set(ticketId, { status: 'UNKNOWN', executionId: ticket.requestId }); return { executionId: ticket.requestId, status: 'UNKNOWN', outcome: { status: 'UNKNOWN' } }; }
    if (failSources.has(sourceId)) { recovery.set(ticketId, { status: 'FAILED', executionId: ticket.requestId }); return { executionId: ticket.requestId, status: 'FAILED', outcome: { status: 'FAILED' } }; }
    const output = outputFor(ticket);
    recovery.set(ticketId, { status: 'SUCCESS', executionId: ticket.requestId, artifactId: output.artifactId });
    return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: output.artifactId, outcome: { status: 'SUCCESS' } };
  }

  const dependencies = {
    plans,
    continuations,
    tickets: Object.freeze({
      async getV2(id) { return tickets.get(id); },
      async getByIdempotencyKeyV2(queryScope, key) {
        return [...tickets.values()].find(value => value.idempotencyKey === key && sameScope(value.scope, queryScope));
      },
    }),
    workflowTickets,
    orthogonal: Object.freeze({ async prepare(command) { return issue(ORTHOGONAL_TRANSFORM_STEP_ID, ORTHOGONAL_TRANSFORM_CAPABILITY, command); }, async submit({ ticketId }) { return submit(ticketId); } }),
    resize: Object.freeze({ async prepare(command) { return issue(RESIZE_STEP_ID, RESIZE_CAPABILITY, command); }, async submit({ ticketId }) { return submit(ticketId); } }),
    finalRecovery: Object.freeze({ async recover(binding) { const value = recovery.get(binding.ticket.ticketId); assert.ok(value); return value; } }),
    artifacts: Object.freeze({ async resolve(queryScope, id) { assert.ok(sameScope(queryScope, scope)); const value = artifacts.get(id); if (!value) throw new Error('artifact unavailable'); return value; } }),
    runs,
    now: () => now,
  };
  return {
    graph, continuations, runs, tickets, recovery,
    driver: () => new AeeSerialAdmittedGraphDriverV1(dependencies),
    failSource(id) { failSources.add(id); }, clearFailSource(id) { failSources.delete(id); }, unknownSource(id) { unknownSources.add(id); },
    sourceChecks: () => continuations.sourceChecks,
    advanceTime(ms) { now += ms; },
    setSubmitDelay(ms) { submitDelayMs = ms; },
    crashAfterNextTicketIssue() { continuations.failNextWait = true; },
    crashAfterNextRetryTicketIssue() { continuations.failNextRetry = true; },
  };
}

function command(graph) { return Object.freeze({ clientRequestId: 'aee-request', projectId, graphDigest: graph.digest }); }
function result(ticket) { return { ticketId: ticket.ticketId }; }
function sameScope(a, b) { return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId; }

test('AE-4b serial driver executes repeated capability nodes with independent logical identities and restart recovery', async () => {
  const r = runtime();
  let view = await r.driver().start(command(r.graph), auth);
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(view.nextAction.nodeId, 'rotate'); assert.equal(view.nextAction.ticket.stepId, ORTHOGONAL_TRANSFORM_STEP_ID);
  const executionId = view.executionId;
  assert.equal(r.sourceChecks(), 1, 'new execution must atomically prove the admitted source at continuation creation');

  const resumed = await r.driver().resume(executionId, projectId, auth);
  assert.equal(resumed.nextAction.ticket.ticketId, view.nextAction.ticket.ticketId, 'restart must recover the same outstanding ticket');
  assert.equal(r.sourceChecks(), 1, 'resume must use immutable admitted source instead of re-authorizing against a later Project cursor');

  view = await r.driver().submitLocalResult(executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.nextAction.nodeId, 'resize-one'); assert.equal(view.nextAction.ticket.stepId, RESIZE_STEP_ID);
  const firstResizeTicket = view.nextAction.ticket.ticketId;
  view = await r.driver().submitLocalResult(executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.nextAction.nodeId, 'resize-two'); assert.equal(view.nextAction.ticket.stepId, RESIZE_STEP_ID);
  assert.notEqual(view.nextAction.ticket.ticketId, firstResizeTicket, 'repeated Resize node must own a distinct local attempt');

  const snapshot = await r.continuations.get(executionId, scope);
  assert.deepEqual(snapshot.completedSteps.map(step => step.stepId), ['rotate', 'resize-one']);
  assert.equal(snapshot.currentStepId, 'resize-two');
  assert.equal(snapshot.outstandingLocal.stepId, 'resize-two');

  view = await r.driver().submitLocalResult(executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.state, 'SUCCESS'); assert.equal(view.terminalArtifactId, resizeTwo.artifactId); assert.equal(view.graphDigest, r.graph.digest);
  const parent = await r.runs.getByAuthority(scope, 'WORKFLOW_CONTINUATION', executionId);
  assert.equal(parent.status, 'SUCCEEDED');
  const localChildren = (await r.runs.listChildren(scope, parent.runId, 20)).filter(run => run.capability === 'LOCAL_EXECUTION');
  assert.equal(localChildren.length, 3); assert.deepEqual(localChildren.map(run => run.status), ['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED']);
  assert.equal(r.sourceChecks(), 1, 'driver must never re-authorize Project after atomic continuation admission');
});

test('AE-4b spends the admitted retry budget globally across graph nodes from ExecutionRun history', async () => {
  const r = runtime(admittedGraph(1));
  let view = await r.driver().start(command(r.graph), auth);
  view = await r.driver().submitLocalResult(view.executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.nextAction.nodeId, 'resize-one');

  r.failSource(rotated.artifactId);
  view = await r.driver().submitLocalResult(view.executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(view.retryAvailable, true); assert.equal(view.attemptStatus, 'FAILED');
  const firstFailedTicket = (await r.continuations.get(view.executionId, scope)).outstandingLocal.ticketId;

  view = await r.driver().retry(view.executionId, projectId, auth);
  assert.equal(view.nextAction.nodeId, 'resize-one'); assert.notEqual(view.nextAction.ticket.ticketId, firstFailedTicket);
  r.clearFailSource(rotated.artifactId);
  view = await r.driver().submitLocalResult(view.executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.nextAction.nodeId, 'resize-two', 'successful retry must advance to the next admitted node');

  r.failSource(resizeOne.artifactId);
  view = await r.driver().submitLocalResult(view.executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.state, 'FAILED'); assert.equal(view.failureCode, 'AEE_RETRY_BUDGET_EXHAUSTED'); assert.equal(view.retryAvailable, undefined);

  const parent = await r.runs.getByAuthority(scope, 'WORKFLOW_CONTINUATION', view.executionId);
  assert.equal(parent.status, 'FAILED');
  const attempts = (await r.runs.listChildren(scope, parent.runId, 20)).filter(run => run.capability === 'LOCAL_EXECUTION');
  const retryAttempts = attempts.filter(run => run.idempotencyKey.startsWith('workflow-child-retry:'));
  assert.equal(retryAttempts.length, 1, 'the whole graph may consume only one admitted retry');
  assert.equal(attempts.filter(run => run.idempotencyKey.includes(':resize-one')).length, 2, 'resize-one owns first attempt plus the single global retry');
  assert.equal(attempts.filter(run => run.idempotencyKey.includes(':resize-two')).length, 1, 'resize-two must not receive a second graph-level retry');
});

test('AE-4b fails closed on graph substitution and terminalizes UNKNOWN recovery without another attempt', async () => {
  const r = runtime();
  await assert.rejects(
    () => r.driver().start({ ...command(r.graph), graphDigest: '0'.repeat(64) }, auth),
    error => error?.code === 'aee_serial_graph_not_found',
  );

  let view = await r.driver().start(command(r.graph), auth);
  r.unknownSource(root.artifactId);
  view = await r.driver().submitLocalResult(view.executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.state, 'UNKNOWN'); assert.equal(view.failureCode, 'AEE_NODE_rotate_UNKNOWN');
  const parent = await r.runs.getByAuthority(scope, 'WORKFLOW_CONTINUATION', view.executionId);
  assert.equal(parent.status, 'UNKNOWN');
  assert.equal(parent.statusReasonCode, 'AEE_NODE_ROTATE_UNKNOWN', 'lowercase logical node IDs must normalize to the ExecutionRun reason contract');
  const attempts = (await r.runs.listChildren(scope, parent.runId, 20)).filter(run => run.capability === 'LOCAL_EXECUTION');
  assert.equal(attempts.length, 1); assert.equal(attempts[0].status, 'UNKNOWN');
  assert.equal(attempts[0].statusReasonCode, 'AEE_NODE_ROTATE_UNKNOWN');
});

test('AE-4b preserves canonical local SUCCESS but fails wall-clock before advancing the completed node', async () => {
  const r = runtime(admittedGraph(1, 5_000));
  r.setSubmitDelay(6_000);
  let view = await r.driver().start(command(r.graph), auth);
  const firstTicketId = view.nextAction.ticket.ticketId;
  view = await r.driver().submitLocalResult(view.executionId, projectId, auth, result(view.nextAction.ticket));

  assert.equal(view.state, 'FAILED');
  assert.equal(view.failureCode, 'AEE_WALL_CLOCK_BUDGET_EXCEEDED');
  assert.equal(r.tickets.size, 1, 'budget failure must happen before the next node can mint a ticket');
  const snapshot = await r.continuations.get(view.executionId, scope);
  assert.deepEqual(snapshot.completedSteps.map(step => step.stepId), ['rotate'], 'the completed local SUCCESS remains canonical evidence');
  assert.equal(snapshot.completedSteps[0].ticketId, firstTicketId);
  const parent = await r.runs.getByAuthority(scope, 'WORKFLOW_CONTINUATION', view.executionId);
  const attempts = (await r.runs.listChildren(scope, parent.runId, 20)).filter(run => run.capability === 'LOCAL_EXECUTION');
  assert.equal(parent.status, 'FAILED');
  assert.equal(parent.statusReasonCode, 'AEE_WALL_CLOCK_BUDGET_EXCEEDED');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, 'SUCCEEDED', 'local evidence stays SUCCESS even though the parent budget is exceeded');
});

test('AE-4b recovers an exact orphan ticket after crash and can retry it after expiry without stranding the continuation', async () => {
  const r = runtime();
  r.crashAfterNextTicketIssue();
  await assert.rejects(() => r.driver().start(command(r.graph), auth), error => error?.code === 'SIMULATED_CRASH');
  assert.equal(r.tickets.size, 1, 'the simulated crash occurs only after the durable ticket exists');
  const orphan = [...r.tickets.values()][0];
  const executionId = [...r.continuations.byExecution.keys()][0];
  assert.ok(executionId, 'READY continuation must exist before local ticket preparation');

  r.advanceTime(61_000);
  let view = await r.driver().start(command(r.graph), auth);
  assert.equal(r.tickets.size, 1, 'replay must recover the exact deterministic orphan ticket rather than mint a replacement');
  const recovered = await r.continuations.get(executionId, scope);
  assert.equal(recovered.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(recovered.outstandingLocal.ticketId, orphan.ticketId);
  assert.equal(view.retryAvailable, true);
  assert.equal(view.attemptStatus, 'EXPIRED');

  view = await r.driver().retry(executionId, projectId, auth);
  assert.equal(r.tickets.size, 2, 'explicit retry may mint exactly one replacement after the expired orphan is durably bound');
  assert.equal(view.nextAction.nodeId, 'rotate');
  assert.notEqual(view.nextAction.ticket.ticketId, orphan.ticketId);
  assert.ok(view.nextAction.ticket.expiresAt > orphan.expiresAt);
});

test('AE-4b recovers an exact orphan retry ticket after crash and expiry without minting a third attempt', async () => {
  const r = runtime(admittedGraph(2));
  let view = await r.driver().start(command(r.graph), auth);
  const executionId = view.executionId;
  const firstTicket = view.nextAction.ticket;

  r.advanceTime(61_000);
  view = await r.driver().resume(executionId, projectId, auth);
  assert.equal(view.retryAvailable, true);
  assert.equal(view.attemptStatus, 'EXPIRED');

  r.crashAfterNextRetryTicketIssue();
  await assert.rejects(
    () => r.driver().retry(executionId, projectId, auth),
    error => error?.code === 'SIMULATED_RETRY_CRASH',
  );
  assert.equal(r.tickets.size, 2, 'retry crash must occur after exactly one durable replacement exists');
  const replacement = [...r.tickets.values()].find(ticket => ticket.ticketId !== firstTicket.ticketId);
  assert.ok(replacement);

  r.advanceTime(61_000);
  view = await r.driver().retry(executionId, projectId, auth);
  assert.equal(r.tickets.size, 2, 'replay must recover the exact expired replacement rather than mint a third attempt');
  const durable = await r.continuations.get(executionId, scope);
  assert.equal(durable.outstandingLocal.ticketId, replacement.ticketId);
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(view.retryAvailable, true);
  assert.equal(view.attemptStatus, 'EXPIRED');
});
