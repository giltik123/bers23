import assert from 'node:assert/strict';
import test from 'node:test';
import { requireDeterministicToolByCapability } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import { requireAeeAdmittedNodeExecutionAdapterV1 } from './AeeCapabilityExecutionAdapterRegistryV1.ts';
import { estimateAeeAdmittedGraphExecutionResourcesV1 } from './AeeExecutionResourceBudgetV1.ts';
import { compileAeePlanV1 } from './AeePlanCompilerV1.ts';
import { AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID } from './AeeSerialAdmittedGraphDriverV1.ts';
import { AeeWorkflowTicketResourceAdmissionV1 } from './AeeWorkflowTicketResourceAdmissionV1.ts';
import { AGENT_INTENT_V1_SCHEMA, agentIntentV1Digest, normalizeAgentIntentV1 } from './AgentIntentV1.ts';
import { PLAN_PROPOSAL_V1_SCHEMA } from './PlanProposalV1.ts';

const scope = Object.freeze({ tenantId: 'resource-tenant', userId: 'resource-user', projectId: 'resource-project' });
const executionId = 'resource-execution';
const sourceRef = 'resource-source';
const firstArtifactId = 'resource-rotate-final';

function graphWithBudget(maxMemoryBytes) {
  const rawIntent = {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'resource-ticket-test/1',
    goal: { capability: 'RESIZE', instruction: 'Rotate then resize.' },
    source: { projectId: scope.projectId, projectRevision: 11, sourceRef },
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
    plannerVersion: 'resource-ticket-test/1',
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
    canonical: { projectId: scope.projectId, projectRevision: 11, sourceRef },
    sourceArtifact: { role: 'ORIGINAL', width: 320, height: 240 },
  });
}

function snapshotFor(graph, overrides = {}) {
  return Object.freeze({
    executionId,
    clientRequestId: 'resource-client-request',
    scope,
    plan: Object.freeze({ planId: AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID, planRevision: '1', planDigest: graph.digest }),
    inputArtifacts: Object.freeze([]),
    state: 'READY',
    completedSteps: Object.freeze([]),
    revision: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  });
}

function admissionFor(graph, snapshot) {
  return new AeeWorkflowTicketResourceAdmissionV1({
    continuations: Object.freeze({
      async get(candidateExecutionId, candidateScope) {
        return candidateExecutionId === executionId
          && candidateScope.tenantId === scope.tenantId
          && candidateScope.userId === scope.userId
          && candidateScope.projectId === scope.projectId
          ? snapshot
          : undefined;
      },
    }),
    plans: Object.freeze({
      async get(candidateScope, digest) {
        return candidateScope.tenantId === scope.tenantId
          && candidateScope.userId === scope.userId
          && candidateScope.projectId === scope.projectId
          && digest === graph.digest
          ? Object.freeze({ scope, graph, createdAt: new Date(0).toISOString() })
          : undefined;
      },
    }),
  });
}

function issueFor(graph, nodeIndex, sourceArtifactId) {
  const node = graph.nodes[nodeIndex];
  const adapter = requireAeeAdmittedNodeExecutionAdapterV1(node);
  const tool = requireDeterministicToolByCapability(adapter.toolCapability);
  const parameters = Object.freeze({
    ...tool.parameters.exact,
    sourceArtifactId,
    ...node.parameters,
  });
  return Object.freeze({
    ticketVersion: '2',
    requestId: `resource-child-${node.nodeId}`,
    workflowId: executionId,
    stepId: tool.operation.id,
    operation: Object.freeze({ ...tool.operation, capability: tool.capability, parameters }),
    scope,
    inputs: Object.freeze([Object.freeze({
      artifactId: sourceArtifactId,
      kind: tool.inputs[0].kind,
      role: node.inputs[0].artifactRole,
      sha256: 'a'.repeat(64),
    })]),
    expectedOutputs: Object.freeze([Object.freeze({
      kind: tool.output.kind,
      role: node.output.artifactRole,
      count: tool.output.count,
      mimeTypes: Object.freeze([...tool.output.mimeTypes]),
      width: node.output.width,
      height: node.output.height,
    })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: `resource-child-${node.nodeId}:${tool.operation.id}:local-v2`,
  });
}

test('READY AEE issuance accepts only the exact immutable root-node ticket contract', async () => {
  const graph = graphWithBudget(137_438_953_472);
  const snapshot = snapshotFor(graph);
  const admission = admissionFor(graph, snapshot);
  await admission.beforeIssue(issueFor(graph, 0, sourceRef));
});

test('AEE issuance fails closed one byte below the immutable graph peak budget', async () => {
  const reference = graphWithBudget(137_438_953_472);
  const required = Math.max(...estimateAeeAdmittedGraphExecutionResourcesV1(reference).map(binding => binding.estimate.requiredPeakMemoryBytes));
  const graph = graphWithBudget(required - 1);
  const admission = admissionFor(graph, snapshotFor(graph));

  await assert.rejects(
    () => admission.beforeIssue(issueFor(graph, 0, sourceRef)),
    error => error?.code === 'aee_execution_memory_budget_exceeded'
      && error?.status === 422
      && error?.requiredBytes === required
      && error?.admittedBytes === required - 1,
  );
});

test('resource admission rejects parameter drift and multi-output widening before ticket mint', async () => {
  const graph = graphWithBudget(137_438_953_472);
  const admission = admissionFor(graph, snapshotFor(graph));
  const exact = issueFor(graph, 0, sourceRef);

  const badParameters = Object.freeze({
    ...exact,
    operation: Object.freeze({
      ...exact.operation,
      parameters: Object.freeze({ ...exact.operation.parameters, mode: 'ROTATE_180' }),
    }),
  });
  await assert.rejects(
    () => admission.beforeIssue(badParameters),
    error => error?.code === 'aee_resource_ticket_parameter_mismatch',
  );

  const badOutputCount = Object.freeze({
    ...exact,
    expectedOutputs: Object.freeze([Object.freeze({ ...exact.expectedOutputs[0], count: 2 })]),
  });
  await assert.rejects(
    () => admission.beforeIssue(badOutputCount),
    error => error?.code === 'aee_resource_ticket_output_mismatch',
  );
});

test('second-node issuance is bound to the exact completed prior-node Artifact', async () => {
  const graph = graphWithBudget(137_438_953_472);
  const completedSteps = Object.freeze([Object.freeze({ stepId: 'rotate', ticketId: 'rotate-ticket', artifactIds: Object.freeze([firstArtifactId]) })]);
  const snapshot = snapshotFor(graph, {
    state: 'READY',
    completedSteps,
    revision: 3,
  });
  const admission = admissionFor(graph, snapshot);

  await admission.beforeIssue(issueFor(graph, 1, firstArtifactId));
  await assert.rejects(
    () => admission.beforeIssue(issueFor(graph, 1, 'substituted-artifact')),
    error => error?.code === 'aee_resource_ticket_input_mismatch' || error?.code === 'aee_resource_ticket_parameter_mismatch',
  );
});

test('WAITING retry issuance must remain on the current admitted node and non-AEE workflows stay isolated', async () => {
  const graph = graphWithBudget(137_438_953_472);
  const completedSteps = Object.freeze([Object.freeze({ stepId: 'rotate', ticketId: 'rotate-ticket', artifactIds: Object.freeze([firstArtifactId]) })]);
  const waiting = snapshotFor(graph, {
    state: 'WAITING_FOR_LOCAL_RESULT',
    currentStepId: 'resize',
    completedSteps,
    revision: 4,
  });
  await admissionFor(graph, waiting).beforeIssue(issueFor(graph, 1, firstArtifactId));

  const wrongNode = Object.freeze({ ...waiting, currentStepId: 'rotate' });
  await assert.rejects(
    () => admissionFor(graph, wrongNode).beforeIssue(issueFor(graph, 1, firstArtifactId)),
    error => error?.code === 'aee_resource_node_state_mismatch',
  );

  const legacy = Object.freeze({ ...snapshotFor(graph), plan: Object.freeze({ planId: 'legacy-plan', planRevision: '1', planDigest: graph.digest }) });
  const foreignRequest = Object.freeze({ ...issueFor(graph, 0, sourceRef), policy: 'LOCAL_SELECTED' });
  await admissionFor(graph, legacy).beforeIssue(foreignRequest);
});
