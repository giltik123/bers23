import assert from 'node:assert/strict';
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
import { AGENT_INTENT_V1_SCHEMA, agentIntentV1Digest, normalizeAgentIntentV1 } from './AgentIntentV1.ts';
import { PLAN_PROPOSAL_V1_SCHEMA } from './PlanProposalV1.ts';

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

test('AEE maxMemoryBytes rejects one byte below required graph peak and accepts the exact bound', () => {
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

test('invalid admitted memory authority fails closed before any executor estimate is trusted', () => {
  const graph = graphWithBudget(137_438_953_472);
  const invalid = Object.freeze({ ...graph, effectiveExecution: Object.freeze({ ...graph.effectiveExecution, maxMemoryBytes: 0 }) });
  assert.throws(
    () => estimateAeeAdmittedGraphExecutionResourcesV1(invalid),
    error => error?.code === 'aee_resource_budget_invalid' && error?.status === 409,
  );
});
