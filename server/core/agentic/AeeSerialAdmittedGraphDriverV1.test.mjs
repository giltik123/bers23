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

function admittedGraph(maxRetries = 1) {
  const rawIntent = {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'ae4b-test-parser/1',
    goal: { capability: 'RESIZE', instruction: 'Rotate then resize twice.' },
    source: { projectId, projectRevision: 7, sourceRef: root.artifactId },
    targets: [], mutable: [], preserve: [],
    constraints: { quality: 'BALANCED', styleTags: [] },
    execution: {
      policy: 'LOCAL_ONLY', cloudAllowed: false, maxNodes: 4, maxRetries, maxReplans: 0,
      maxCandidates: 1, maxPaidCredits: 0, maxWallClockMs: 120_000, maxMemoryBytes: 64 * 1024 * 1024,
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
  constructor() { this.byExecution = new Map(); this.byClient = new Map(); }
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
  async get(executionId, queryScope) { const value = this.byExecution.get(executionId); return value && sameScope(value.scope, queryScope) ? value : undefined; }
  async getByClientRequestId(queryScope, clientRequestId) { const value = this.byClient.get(clientRequestId); return value && sameScope(value.scope, queryScope) ? value : undefined; }
  async waitForLocalResult({ executionId, scope: queryScope, expectedRevision, continuationStepId, ticket }) {
    const current = this.#require(executionId, queryScope);
    const logical = continuationStepId ?? ticket.stepId;
    if (current.state === 'WAITING_FOR_LOCAL_RESULT' && current.outstandingLocal?.ticketId === ticket.ticketId && current.currentStepId === logical) return current;
    assert.equal(current.state, 'READY'); assert.equal(current.revision, expectedRevision);
    return this.#next(current, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: logical, outstandingLocal: Object.freeze({ ...ticket, stepId: logical }), completedSteps: current.completedSteps });
  }
  async retryLocalResult({ executionId, scope: queryScope, expectedRevision, continuationStepId, previousTicketId, ticket }) {
    const current = this.#require(executionId, queryScope); const logical = continuationStepId ?? ticket.stepId;
    assert.equal(current.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(current.revision, expectedRevision);
    assert.equal(current.currentStepId, logical); assert.equal(current.outstandingLocal.ticketId, previousTicketId); assert.notEqual(ticket.ticketId, previousTicketId);
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
    if (current.status === status) return current;
    const next = Object.freeze({ ...current, status, revision: current.revision + 1, statusReasonCode: reason, updatedAt: new Date(NOW + current.revision + 1).toISOString(), ...(status === 'RUNNING' ? { startedAt: new Date(NOW).toISOString() } : { finishedAt: new Date(NOW + 1).toISOString() }) });
    this.runs.set(runId, next); return next;
  }
}

function runtime(graph = admittedGraph()) {
  const continuations = new MemoryContinuationStore();
  const runs = new MemoryRunRegistry();
  const artifacts = new Map([[root.artifactId, root], [rotated.artifactId, rotated], [resizeOne.artifactId, resizeOne], [resizeTwo.artifactId, resizeTwo]]);
  const tickets = new Map();
  const recovery = new Map();
  const failSources = new Set();
  const unknownSources = new Set();
  let activeWorkflow;
  let sequence = 0;
  let projectReads = 0;

  const plans = Object.freeze({ async get(queryScope, digest) { return sameScope(queryScope, scope) && digest === graph.digest ? { scope, graph, createdAt: new Date(NOW).toISOString() } : undefined; } });
  const workflowTickets = Object.freeze({
    async withWorkflowBinding(binding, work) { assert.equal(activeWorkflow, undefined); activeWorkflow = binding; try { return await work(); } finally { activeWorkflow = undefined; } },
  });

  function issue(stepId, capability, command) {
    assert.ok(activeWorkflow); assert.ok(activeWorkflow.allowedStepIds.includes(stepId));
    const key = `${command.clientRequestId}:${stepId}:local-v2`;
    const prior = [...tickets.values()].find(value => value.idempotencyKey === key && sameScope(value.scope, scope));
    if (prior) return { executionId: prior.requestId, ticket: prior };
    const source = artifacts.get(command.sourceArtifactId); assert.ok(source);
    const requestId = `local-${stepId}-${createHash('sha256').update(command.clientRequestId).digest('hex').slice(0, 16)}`;
    const ticket = Object.freeze({
      version: '2', issuer: 'CORE', ticketId: `ticket-${++sequence}`, requestId, workflowId: activeWorkflow.workflowId, stepId,
      operation: Object.freeze({ id: stepId, version: '1', type: stepId === RESIZE_STEP_ID ? 'RESIZE' : 'ORTHOGONAL_TRANSFORM', capability }),
      scope, inputs: Object.freeze([{ artifactId: source.artifactId, kind: source.kind, role: source.role, sha256: source.sha256 }]),
      expectedOutputs: Object.freeze([]), allowedExecutors: Object.freeze([]), policy: 'LOCAL_ONLY', cost: Object.freeze({ providerCalls: 0, paidCloudCredits: 0 }),
      idempotencyKey: key, nonce: `nonce-${sequence}`, expiresAt: NOW + 60_000,
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
    tickets: Object.freeze({ async getV2(id) { return tickets.get(id); } }),
    workflowTickets,
    orthogonal: Object.freeze({ async prepare(command) { return issue(ORTHOGONAL_TRANSFORM_STEP_ID, ORTHOGONAL_TRANSFORM_CAPABILITY, command); }, async submit({ ticketId }) { return submit(ticketId); } }),
    resize: Object.freeze({ async prepare(command) { return issue(RESIZE_STEP_ID, RESIZE_CAPABILITY, command); }, async submit({ ticketId }) { return submit(ticketId); } }),
    finalRecovery: Object.freeze({ async recover(binding) { const value = recovery.get(binding.ticket.ticketId); assert.ok(value); return value; } }),
    artifacts: Object.freeze({ async resolve(queryScope, id) { assert.ok(sameScope(queryScope, scope)); const value = artifacts.get(id); if (!value) throw new Error('artifact unavailable'); return value; } }),
    projects: Object.freeze({ async get(queryAuth, id) { projectReads += 1; assert.deepEqual(queryAuth, auth); return id === projectId ? { current_image_storage_id: root.storageId, width: root.width, height: root.height } : undefined; } }),
    runs,
    now: () => NOW,
  };
  return {
    graph, continuations, runs, tickets, recovery,
    driver: () => new AeeSerialAdmittedGraphDriverV1(dependencies),
    failSource(id) { failSources.add(id); }, clearFailSource(id) { failSources.delete(id); }, unknownSource(id) { unknownSources.add(id); },
    projectReads: () => projectReads,
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
  assert.equal(r.projectReads(), 1, 'new execution must prove the admitted source is current exactly at admission/start');

  const resumed = await r.driver().resume(executionId, projectId, auth);
  assert.equal(resumed.nextAction.ticket.ticketId, view.nextAction.ticket.ticketId, 'restart must recover the same outstanding ticket');
  assert.equal(r.projectReads(), 1, 'resume must use immutable admitted source instead of re-authorizing against a later Project cursor');

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
  assert.equal(r.projectReads(), 1, 'driver must never mutate or re-authorize Project during serial execution');
});

test('AE-4b derives retry budget from ExecutionRun attempt history and terminalizes after the admitted retry is spent', async () => {
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
  view = await r.driver().submitLocalResult(view.executionId, projectId, auth, result(view.nextAction.ticket));
  assert.equal(view.state, 'FAILED'); assert.equal(view.failureCode, 'AEE_RETRY_BUDGET_EXHAUSTED'); assert.equal(view.retryAvailable, undefined);

  const parent = await r.runs.getByAuthority(scope, 'WORKFLOW_CONTINUATION', view.executionId);
  assert.equal(parent.status, 'FAILED');
  const attempts = (await r.runs.listChildren(scope, parent.runId, 20)).filter(run => run.capability === 'LOCAL_EXECUTION');
  const resizeAttempts = attempts.filter(run => run.idempotencyKey.includes(':resize-one'));
  assert.equal(resizeAttempts.length, 2, 'first attempt plus exactly one admitted retry must exist');
  assert.equal(resizeAttempts.every(run => run.status === 'FAILED'), true);
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
  const attempts = (await r.runs.listChildren(scope, parent.runId, 20)).filter(run => run.capability === 'LOCAL_EXECUTION');
  assert.equal(attempts.length, 1); assert.equal(attempts[0].status, 'UNKNOWN');
});
