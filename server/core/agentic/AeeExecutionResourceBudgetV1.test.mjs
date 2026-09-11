import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import {
  assertAeeAdmittedGraphMemoryBudgetV1,
  estimateAeeAdmittedGraphExecutionResourcesV1,
} from './AeeExecutionResourceBudgetV1.ts';
import { compileAeePlanV1 } from './AeePlanCompilerV1.ts';
import { AeeResourceBudgetedSerialDriverV1 } from './AeeResourceBudgetedSerialDriverV1.ts';
import { AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID } from './AeeSerialAdmittedGraphDriverV1.ts';
import { AGENT_INTENT_V1_SCHEMA, agentIntentV1Digest, normalizeAgentIntentV1 } from './AgentIntentV1.ts';
import { PLAN_PROPOSAL_V1_SCHEMA } from './PlanProposalV1.ts';

const auth = Object.freeze({ tenantId: 'resource-tenant', userId: 'resource-user' });
const projectId = 'resource-project';
const sourceRef = 'resource-source';

function graphWithBudget(maxMemoryBytes) {
  const rawIntent = {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'resource-budget-test/1',
    goal: { capability: 'RESIZE', instruction: 'Rotate then resize.' },
    source: { projectId, projectRevision: 11, sourceRef },
    targets: [], mutable: [], preserve: [],
    constraints: { quality: 'BALANCED', styleTags: [] },
    execution: {
      policy: 'LOCAL_ONLY', cloudAllowed: false, maxNodes: 2, maxRetries: 2, maxReplans: 0,
      maxCandidates: 1, maxPaidCredits: 0, maxWallClockMs: 60_000, maxMemoryBytes,
    },
    context: { modalities: ['TEXT'], uiReferences: [] }, ambiguities: [], evidence: [], confidence: 1,
  };
  const proposal = {
    schemaVersion: PLAN_PROPOSAL_V1_SCHEMA,
    plannerVersion: 'resource-budget-test/1',
    intentDigest: agentIntentV1Digest(normalizeAgentIntentV1(rawIntent)),
    nodes: [
      {
        nodeId: 'rotate', capabilityId: AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1, capabilityVersion: 1,
        dependsOn: [], inputs: [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }], parameters: { mode: 'ROTATE_90_CW' },
      },
      {
        nodeId: 'resize', capabilityId: AEE_CAPABILITY_RESIZE_V1, capabilityVersion: 1,
        dependsOn: ['rotate'], inputs: [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'rotate' } }], parameters: { width: 512, height: 512 },
      },
    ],
  };
  return compileAeePlanV1(rawIntent, proposal, {
    canonical: { projectId, projectRevision: 11, sourceRef },
    sourceArtifact: { role: 'ORIGINAL', width: 320, height: 240 },
  });
}

function fakeDelegate() {
  const calls = { start: 0, resume: 0, submit: 0, retry: 0, cancel: 0 };
  const view = Object.freeze({ executionId: 'execution-1', revision: 1, state: 'READY', graphDigest: '0'.repeat(64) });
  return {
    calls,
    driver: Object.freeze({
      async start() { calls.start += 1; return view; },
      async resume() { calls.resume += 1; return view; },
      async submitLocalResult() { calls.submit += 1; return view; },
      async retry() { calls.retry += 1; return view; },
      async cancel() { calls.cancel += 1; return view; },
    }),
  };
}

function guarded(graph, delegateState, state = 'READY') {
  const scope = Object.freeze({ ...auth, projectId });
  const plans = Object.freeze({
    async get(queryScope, digest) {
      return queryScope.tenantId === scope.tenantId && queryScope.userId === scope.userId && queryScope.projectId === scope.projectId && digest === graph.digest
        ? Object.freeze({ scope, graph, createdAt: new Date(0).toISOString() })
        : undefined;
    },
  });
  const continuations = Object.freeze({
    async get(executionId, queryScope) {
      if (executionId !== 'execution-1' || queryScope.projectId !== projectId) return undefined;
      return Object.freeze({
        executionId,
        scope,
        state,
        plan: Object.freeze({ planId: AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID, planRevision: '1', planDigest: graph.digest }),
      });
    },
  });
  return new AeeResourceBudgetedSerialDriverV1({ delegate: delegateState.driver, plans, continuations });
}

test('AEE resource authority derives exact node source geometry from immutable graph topology', () => {
  const graph = graphWithBudget(137_438_953_472);
  const estimates = estimateAeeAdmittedGraphExecutionResourcesV1(graph);
  assert.equal(estimates.length, 2);
  assert.equal(estimates[0].nodeId, 'rotate');
  assert.deepEqual(estimates[0].estimate.source, { width: 320, height: 240 });
  assert.deepEqual(estimates[0].estimate.output, { width: 240, height: 320 });
  assert.equal(estimates[1].nodeId, 'resize');
  assert.deepEqual(estimates[1].estimate.source, { width: 240, height: 320 });
  assert.deepEqual(estimates[1].estimate.output, { width: 512, height: 512 });
});

test('AEE maxMemoryBytes rejects one byte below required peak and accepts the exact bound', () => {
  const reference = graphWithBudget(137_438_953_472);
  const required = Math.max(...estimateAeeAdmittedGraphExecutionResourcesV1(reference).map(binding => binding.estimate.requiredPeakMemoryBytes));
  assert.ok(required > 1_048_576);

  const insufficient = graphWithBudget(required - 1);
  assert.throws(
    () => assertAeeAdmittedGraphMemoryBudgetV1(insufficient),
    error => error?.code === 'aee_execution_memory_budget_exceeded'
      && error?.status === 422
      && error?.requiredBytes === required
      && error?.admittedBytes === required - 1,
  );

  const exact = graphWithBudget(required);
  const accepted = assertAeeAdmittedGraphMemoryBudgetV1(exact);
  assert.equal(Math.max(...accepted.map(binding => binding.estimate.requiredPeakMemoryBytes)), required);
});

test('resource-guarded driver fails before start/resume/submit/retry delegate calls and never blocks cancel', async () => {
  const reference = graphWithBudget(137_438_953_472);
  const required = Math.max(...estimateAeeAdmittedGraphExecutionResourcesV1(reference).map(binding => binding.estimate.requiredPeakMemoryBytes));
  const insufficient = graphWithBudget(required - 1);
  const delegate = fakeDelegate();
  const driver = guarded(insufficient, delegate);

  await assert.rejects(
    driver.start({ clientRequestId: 'request-1', projectId, graphDigest: insufficient.digest }, auth),
    error => error?.code === 'aee_execution_memory_budget_exceeded',
  );
  await assert.rejects(driver.resume('execution-1', projectId, auth), error => error?.code === 'aee_execution_memory_budget_exceeded');
  await assert.rejects(driver.submitLocalResult('execution-1', projectId, auth, { ticketId: 'ticket-1' }), error => error?.code === 'aee_execution_memory_budget_exceeded');
  await assert.rejects(driver.retry('execution-1', projectId, auth), error => error?.code === 'aee_execution_memory_budget_exceeded');
  assert.deepEqual(delegate.calls, { start: 0, resume: 0, submit: 0, retry: 0, cancel: 0 });

  await driver.cancel('execution-1', projectId, auth);
  assert.equal(delegate.calls.cancel, 1);
});

test('terminal durable replay is not retroactively denied by a stricter resource profile', async () => {
  const reference = graphWithBudget(137_438_953_472);
  const required = Math.max(...estimateAeeAdmittedGraphExecutionResourcesV1(reference).map(binding => binding.estimate.requiredPeakMemoryBytes));
  const insufficient = graphWithBudget(required - 1);
  const delegate = fakeDelegate();
  const driver = guarded(insufficient, delegate, 'SUCCESS');

  await driver.resume('execution-1', projectId, auth);
  await driver.submitLocalResult('execution-1', projectId, auth, { ticketId: 'already-completed-ticket' });
  assert.equal(delegate.calls.resume, 1);
  assert.equal(delegate.calls.submit, 1);
});

test('resource-guarded driver delegates unchanged when the immutable graph budget is sufficient', async () => {
  const graph = graphWithBudget(137_438_953_472);
  const delegate = fakeDelegate();
  const driver = guarded(graph, delegate);

  await driver.start({ clientRequestId: 'request-1', projectId, graphDigest: graph.digest }, auth);
  await driver.resume('execution-1', projectId, auth);
  await driver.submitLocalResult('execution-1', projectId, auth, { ticketId: 'ticket-1' });
  await driver.retry('execution-1', projectId, auth);
  await driver.cancel('execution-1', projectId, auth);
  assert.deepEqual(delegate.calls, { start: 1, resume: 1, submit: 1, retry: 1, cancel: 1 });
});

test('production composition cannot pass raw serial driver into the bounded compatibility facade', () => {
  const source = readFileSync(new URL('../composition/createProductionBoundedAgentCompatibility.ts', import.meta.url), 'utf8');
  assert.match(source, /const serial = new AeeSerialAdmittedGraphDriverV1/);
  assert.match(source, /const aee = new AeeResourceBudgetedSerialDriverV1/);
  assert.match(source, /delegate: serial/);
  assert.match(source, /new BoundedAgentAeeCompatibilityFacade\(\{[\s\S]*\baee,/);
  assert.doesNotMatch(source, /new BoundedAgentAeeCompatibilityFacade\(\{[\s\S]*aee:\s*serial/);
});
