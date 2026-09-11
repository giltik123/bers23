import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import {
  AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1,
  AeeCapabilityExecutionAdapterRegistryV1Error,
  requireAeeAdmittedNodeExecutionAdapterV1,
  requireAeeCapabilityExecutionAdapterV1,
} from './AeeCapabilityExecutionAdapterRegistryV1.ts';
import {
  AeeAdmittedPlanCodecV1Error,
  normalizeAeeAdmittedPlanGraphV1,
  serializeAeeAdmittedPlanGraphV1,
} from './AeeAdmittedPlanCodecV1.ts';
import { compileAeePlanV1 } from './AeePlanCompilerV1.ts';
import { AGENT_INTENT_V1_SCHEMA, agentIntentV1Digest, normalizeAgentIntentV1 } from './AgentIntentV1.ts';
import { PLAN_PROPOSAL_V1_SCHEMA } from './PlanProposalV1.ts';

const PROJECT_ID = 'project-ae4';
const PROJECT_REVISION = 17;
const SOURCE_REF = `eyJ2IjoxLCJsb2NhdGlvbiI6IlNUT1JFRF9PUklHSU5BTF9JRCJ9.${'a'.repeat(512)}`;

function intent() {
  return {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'ae4-test-parser/1',
    goal: { capability: 'RESIZE', instruction: 'Rotate and resize current image.' },
    source: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
    targets: [], mutable: [], preserve: [],
    constraints: { quality: 'BALANCED', styleTags: [] },
    execution: {
      policy: 'LOCAL_ONLY', cloudAllowed: false, maxNodes: 4, maxRetries: 1, maxReplans: 1,
      maxCandidates: 1, maxPaidCredits: 0, maxWallClockMs: 120_000, maxMemoryBytes: 64 * 1024 * 1024,
    },
    context: { modalities: ['TEXT'], uiReferences: [] },
    ambiguities: [], evidence: [], confidence: 0.99,
  };
}

function graph() {
  const rawIntent = intent();
  const proposal = {
    schemaVersion: PLAN_PROPOSAL_V1_SCHEMA,
    plannerVersion: 'ae4-planner-test/1',
    intentDigest: agentIntentV1Digest(normalizeAgentIntentV1(rawIntent)),
    nodes: [
      {
        nodeId: 'rotate', capabilityId: AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1, capabilityVersion: 1,
        dependsOn: [], inputs: [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }], parameters: { mode: 'ROTATE_90_CW' },
      },
      {
        nodeId: 'resize', capabilityId: AEE_CAPABILITY_RESIZE_V1, capabilityVersion: 1,
        dependsOn: ['rotate'], inputs: [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'rotate' } }], parameters: { width: 320, height: 240 },
      },
    ],
  };
  return compileAeePlanV1(rawIntent, proposal, {
    canonical: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
    sourceArtifact: { role: 'ORIGINAL', width: 640, height: 480 },
  });
}

function expectCodecCode(raw, code) {
  assert.throws(
    () => normalizeAeeAdmittedPlanGraphV1(raw),
    error => error instanceof AeeAdmittedPlanCodecV1Error && error.code === code,
  );
}

test('AE-4 codec exactly reproduces accepted AE-3 graph and stable canonical bytes with opaque source authority', () => {
  const admitted = graph();
  assert.ok(admitted.source.sourceRef.length > 200, 'test source must cross the retired generic token limit');
  const normalized = normalizeAeeAdmittedPlanGraphV1(JSON.parse(JSON.stringify(admitted)));
  assert.deepEqual(normalized, admitted);
  assert.equal(normalized.source.sourceRef, SOURCE_REF);
  const serialized = serializeAeeAdmittedPlanGraphV1(normalized);
  assert.equal(serialized, serializeAeeAdmittedPlanGraphV1(admitted));
  assert.equal(serialized, serializeAeeAdmittedPlanGraphV1(JSON.parse(serialized)));
  assert.deepEqual(JSON.parse(serialized), JSON.parse(JSON.stringify(admitted)));
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.nodes), true);
});

test('durable codec rejects sourceRef outside the bounded opaque-reference envelope', () => {
  const admitted = graph();
  expectCodecCode({ ...admitted, source: { ...admitted.source, sourceRef: 'x'.repeat(4097) } }, 'aee_admitted_plan_source_ref_invalid');
  expectCodecCode({ ...admitted, source: { ...admitted.source, sourceRef: ` ${SOURCE_REF}` } }, 'aee_admitted_plan_source_ref_invalid');
});

test('durable codec rejects digest/body, registry and execution widening', () => {
  const admitted = graph();
  expectCodecCode({ ...admitted, digest: '0'.repeat(64) }, 'aee_admitted_plan_digest_mismatch');
  expectCodecCode({ ...admitted, capabilityRegistry: { ...admitted.capabilityRegistry, digest: '0'.repeat(64) } }, 'aee_admitted_plan_registry_mismatch');
  expectCodecCode({ ...admitted, effectiveExecution: { ...admitted.effectiveExecution, cloudAllowed: true } }, 'aee_admitted_plan_execution_widened');
  expectCodecCode({ ...admitted, providerId: 'forbidden' }, 'aee_admitted_plan_exact_schema_violation');
});

test('durable codec rejects descriptor, topology and artifact-flow substitution', () => {
  const admitted = graph();
  const wrongOperation = structuredClone(admitted);
  wrongOperation.nodes[0].semanticOperation = 'RESIZE';
  expectCodecCode(wrongOperation, 'aee_admitted_plan_descriptor_mismatch');

  const reversed = structuredClone(admitted);
  reversed.nodes.reverse();
  expectCodecCode(reversed, 'aee_admitted_plan_topology_noncanonical');

  const wrongRole = structuredClone(admitted);
  wrongRole.nodes[1].inputs[0].artifactRole = 'ORIGINAL';
  expectCodecCode(wrongRole, 'aee_admitted_plan_artifact_role_mismatch');
});

test('AE-4 execution adapter registry is exactly bound to the AE-2 V1 surface', () => {
  assert.equal(AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1.adapters.length, 2);
  const rotate = requireAeeCapabilityExecutionAdapterV1(AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1, 1);
  const resize = requireAeeCapabilityExecutionAdapterV1(AEE_CAPABILITY_RESIZE_V1, 1);
  assert.equal(rotate.adapterKind, 'LOCAL_DETERMINISTIC_TOOL');
  assert.equal(resize.adapterKind, 'LOCAL_DETERMINISTIC_TOOL');
  assert.doesNotMatch(JSON.stringify(AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1), /providerId|modelId|runtimeId|billing|executionId|runId|ticketId/iu);

  const admitted = graph();
  assert.equal(requireAeeAdmittedNodeExecutionAdapterV1(admitted.nodes[0]), rotate);
  assert.equal(requireAeeAdmittedNodeExecutionAdapterV1(admitted.nodes[1]), resize);

  assert.throws(
    () => requireAeeCapabilityExecutionAdapterV1('bers:capability:crop:v1', 1),
    error => error instanceof AeeCapabilityExecutionAdapterRegistryV1Error && error.code === 'aee_execution_adapter_not_admitted',
  );
});
