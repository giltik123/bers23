import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_REGISTRY_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import {
  AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA,
  AeePlanCompilerV1Error,
  compileAeePlanV1,
} from './AeePlanCompilerV1.ts';
import {
  AGENT_INTENT_V1_SCHEMA,
  agentIntentV1Digest,
  normalizeAgentIntentV1,
} from './AgentIntentV1.ts';
import {
  PLAN_PROPOSAL_V1_SCHEMA,
  normalizePlanProposalV1,
  planProposalV1Digest,
} from './PlanProposalV1.ts';

const PROJECT_ID = 'project-ae3';
const PROJECT_REVISION = 11;
const SOURCE_REF = 'artifact-current-ae3';

function intent(overrides = {}) {
  const base = {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'ae3-test-parser/1',
    goal: { capability: 'RESIZE', instruction: 'Rotate and resize the current image.' },
    source: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
    targets: [],
    mutable: [],
    preserve: [],
    constraints: { quality: 'BALANCED', styleTags: [] },
    execution: {
      policy: 'LOCAL_ONLY', cloudAllowed: false, maxNodes: 4, maxRetries: 1, maxReplans: 1,
      maxCandidates: 1, maxPaidCredits: 0, maxWallClockMs: 120_000, maxMemoryBytes: 64 * 1024 * 1024,
    },
    context: { modalities: ['TEXT'], uiReferences: [] },
    ambiguities: [],
    evidence: [],
    confidence: 0.99,
  };
  return { ...base, ...overrides };
}

function referenceNodes() {
  return [
    {
      nodeId: 'rotate',
      capabilityId: AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
      capabilityVersion: 1,
      dependsOn: [],
      inputs: [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }],
      parameters: { mode: 'ROTATE_90_CW' },
    },
    {
      nodeId: 'resize',
      capabilityId: AEE_CAPABILITY_RESIZE_V1,
      capabilityVersion: 1,
      dependsOn: ['rotate'],
      inputs: [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'rotate' } }],
      parameters: { width: 320, height: 240 },
    },
  ];
}

function proposal(intentRaw, nodes = referenceNodes(), overrides = {}) {
  return {
    schemaVersion: PLAN_PROPOSAL_V1_SCHEMA,
    plannerVersion: 'planner-test/1',
    intentDigest: agentIntentV1Digest(normalizeAgentIntentV1(intentRaw)),
    nodes,
    ...overrides,
  };
}

function context(overrides = {}) {
  const base = {
    canonical: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
    sourceArtifact: { role: 'ORIGINAL', width: 640, height: 480 },
  };
  return { ...base, ...overrides };
}

function expectCompilerCode(fn, code) {
  assert.throws(fn, error => error instanceof AeePlanCompilerV1Error && error.code === code);
}

test('AE-3 compiles the accepted Orthogonal -> Resize semantic chain into immutable provider-independent authority', () => {
  const rawIntent = intent();
  const graph = compileAeePlanV1(rawIntent, proposal(rawIntent), context());

  assert.equal(graph.schemaVersion, AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA);
  assert.equal(graph.capabilityRegistry.version, AEE_CAPABILITY_REGISTRY_V1.registryVersion);
  assert.equal(graph.capabilityRegistry.digest, AEE_CAPABILITY_REGISTRY_V1.digest);
  assert.deepEqual(graph.nodes.map(node => node.nodeId), ['rotate', 'resize']);
  assert.equal(graph.nodes[0].semanticOperation, 'ORTHOGONAL_TRANSFORM');
  assert.deepEqual(graph.nodes[0].output, { artifactRole: 'COMPOSITE', width: 480, height: 640 });
  assert.equal(graph.nodes[1].semanticOperation, 'RESIZE');
  assert.deepEqual(graph.nodes[1].output, { artifactRole: 'COMPOSITE', width: 320, height: 240 });
  assert.equal(graph.terminal.nodeId, 'resize');
  assert.deepEqual(graph.terminal.evaluatorHooks, ['ARTIFACT_LINEAGE', 'BYTE_EXACT_VERIFICATION']);
  assert.deepEqual(graph.effectiveExecution, {
    policy: 'LOCAL_ONLY', cloudAllowed: false, maxPaidCredits: 0, maxNodes: 4,
    maxRetries: 1, maxReplans: 1, maxCandidates: 1, maxWallClockMs: 120_000, maxMemoryBytes: 64 * 1024 * 1024,
  });
  assert.match(graph.digest, /^[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(graph), true);
  assert.equal(Object.isFrozen(graph.nodes), true);
  assert.equal(Object.isFrozen(graph.nodes[0]), true);

  const serialized = JSON.stringify(graph);
  assert.doesNotMatch(serialized, /providerId|modelId|runtimeId|executorId|toolCapability|ticketId|executionId|runId|billing|creditsWallet/iu);
});

test('proposal and admitted graph digests are independent of non-semantic proposal node ordering', () => {
  const rawIntent = intent();
  const forwardRaw = proposal(rawIntent, referenceNodes());
  const reverseRaw = proposal(rawIntent, referenceNodes().reverse());
  const forward = normalizePlanProposalV1(forwardRaw);
  const reverse = normalizePlanProposalV1(reverseRaw);
  assert.deepEqual(forward.nodes, reverse.nodes);
  assert.equal(planProposalV1Digest(forward), planProposalV1Digest(reverse));
  assert.equal(compileAeePlanV1(rawIntent, forwardRaw, context()).digest, compileAeePlanV1(rawIntent, reverseRaw, context()).digest);
});

test('compiler binds proposal to exact AgentIntentV1 digest', () => {
  const rawIntent = intent();
  expectCompilerCode(
    () => compileAeePlanV1(rawIntent, proposal(rawIntent, referenceNodes(), { intentDigest: '0'.repeat(64) }), context()),
    'aee_plan_intent_digest_mismatch',
  );
});

test('stale canonical Project/source and unresolved ambiguity fail closed before admission', () => {
  const rawIntent = intent();
  expectCompilerCode(
    () => compileAeePlanV1(rawIntent, proposal(rawIntent), context({ canonical: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION + 1, sourceRef: SOURCE_REF } })),
    'aee_plan_agent_intent_stale_project',
  );
  expectCompilerCode(
    () => compileAeePlanV1(rawIntent, proposal(rawIntent), context({ canonical: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: 'other-artifact' } })),
    'aee_plan_agent_intent_stale_source',
  );

  const ambiguous = intent({ ambiguities: [{ code: 'target_ambiguous', fieldPath: 'targets[0]', candidateIds: ['a', 'b'], confidence: 0.5 }] });
  expectCompilerCode(() => compileAeePlanV1(ambiguous, proposal(ambiguous), context()), 'aee_plan_intent_requires_clarification');
});

test('unknown capability/version and node budget violations fail closed', () => {
  const rawIntent = intent();
  const unknown = referenceNodes();
  unknown[0].capabilityId = 'bers:capability:crop:v1';
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, unknown), context()), 'aee_plan_capability_unavailable');

  const wrongVersion = referenceNodes();
  wrongVersion[0].capabilityVersion = 2;
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, wrongVersion), context()), 'aee_plan_capability_unavailable');

  const constrained = intent({ execution: { ...intent().execution, maxNodes: 1 } });
  expectCompilerCode(() => compileAeePlanV1(constrained, proposal(constrained), context()), 'aee_plan_node_budget_exceeded');
});

test('DAG identity/dependency/cycle contracts fail closed', () => {
  const rawIntent = intent();
  const duplicate = referenceNodes();
  duplicate[1].nodeId = 'rotate';
  duplicate[1].dependsOn = [];
  duplicate[1].inputs = [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }];
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, duplicate), context()), 'aee_plan_plan_proposal_duplicate_node_id');

  const self = referenceNodes();
  self[1].dependsOn = ['resize'];
  self[1].inputs = [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'resize' } }];
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, self), context()), 'aee_plan_plan_proposal_self_dependency');

  const missing = referenceNodes();
  missing[1].dependsOn = ['missing'];
  missing[1].inputs = [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'missing' } }];
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, missing), context()), 'aee_plan_unknown_dependency');

  const mismatch = referenceNodes();
  mismatch[1].inputs = [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }];
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, mismatch), context()), 'aee_plan_dependency_input_mismatch');

  const cyclic = referenceNodes();
  cyclic[0].dependsOn = ['resize'];
  cyclic[0].inputs = [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'resize' } }];
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, cyclic), context()), 'aee_plan_cycle');
});

test('V1 rejects disconnected side-effect branches and terminal goal mismatch', () => {
  const rawIntent = intent();
  const disconnected = referenceNodes();
  disconnected[1].dependsOn = [];
  disconnected[1].inputs = [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }];
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, disconnected), context()), 'aee_plan_terminal_count_invalid');

  const differentGoal = intent({ goal: { capability: 'ORTHOGONAL_TRANSFORM', instruction: 'Only rotate.' } });
  expectCompilerCode(() => compileAeePlanV1(differentGoal, proposal(differentGoal), context()), 'aee_plan_goal_mismatch');
});

test('Artifact role flow is resolved from canonical source and AE-2 node outputs, never planner output claims', () => {
  const rawIntent = intent();
  expectCompilerCode(
    () => compileAeePlanV1(rawIntent, proposal(rawIntent), context({ sourceArtifact: { role: 'MASK', width: 640, height: 480 } })),
    'aee_plan_artifact_role_mismatch',
  );

  const injected = proposal(rawIntent);
  injected.nodes[0].outputArtifactId = 'planner-minted-artifact';
  expectCompilerCode(() => compileAeePlanV1(rawIntent, injected, context()), 'aee_plan_plan_proposal_exact_schema_violation');
});

test('exact semantic parameter contracts reject weakening, extras and invalid geometry', () => {
  const rawIntent = intent();
  const extra = referenceNodes();
  extra[0].parameters = { mode: 'ROTATE_90_CW', provider: 'forbidden' };
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, extra), context()), 'aee_plan_parameter_contract_mismatch');

  const wrongMode = referenceNodes();
  wrongMode[0].parameters = { mode: 'ROTATE_45' };
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, wrongMode), context()), 'aee_plan_orthogonal_parameters_invalid');

  const wrongResize = referenceNodes();
  wrongResize[1].parameters = { width: 0, height: 240 };
  expectCompilerCode(() => compileAeePlanV1(rawIntent, proposal(rawIntent, wrongResize), context()), 'aee_plan_resize_parameters_invalid');
});

test('compiler safely narrows AUTO intent to local-only zero-credit admitted authority', () => {
  const autoIntent = intent({
    execution: {
      ...intent().execution,
      policy: 'AUTO', cloudAllowed: true, maxPaidCredits: 100,
    },
  });
  const graph = compileAeePlanV1(autoIntent, proposal(autoIntent), context());
  assert.equal(graph.effectiveExecution.policy, 'LOCAL_ONLY');
  assert.equal(graph.effectiveExecution.cloudAllowed, false);
  assert.equal(graph.effectiveExecution.maxPaidCredits, 0);
});

test('minimum canonical RGBA output memory floor is enforced without pretending to estimate runtime peak', () => {
  const smallBudget = intent({ execution: { ...intent().execution, maxMemoryBytes: 1_048_576 } });
  expectCompilerCode(() => compileAeePlanV1(smallBudget, proposal(smallBudget), context()), 'aee_plan_memory_floor_exceeded');
});

test('PlanProposal exact schema cannot smuggle realization/execution/Billing authority', () => {
  const rawIntent = intent();
  for (const key of ['providerId', 'modelId', 'runtimeId', 'executorId', 'ticketId', 'executionId', 'billing', 'credits']) {
    const changed = proposal(rawIntent);
    changed.nodes[0][key] = 'forbidden';
    expectCompilerCode(() => compileAeePlanV1(rawIntent, changed, context()), 'aee_plan_plan_proposal_exact_schema_violation');
  }
});

test('AE-3 production compiler imports no provider/Billing/execution/workflow/Project/Artifact authority', async () => {
  const compiler = await readFile(new URL('./AeePlanCompilerV1.ts', import.meta.url), 'utf8');
  const proposalSource = await readFile(new URL('./PlanProposalV1.ts', import.meta.url), 'utf8');
  const imports = [...compiler.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)].map(match => match[1]);
  for (const specifier of imports) {
    assert.doesNotMatch(specifier, /\/(?:providers|billing|execution|workflow|localExecution|projects|artifacts)\//iu);
  }
  assert.deepEqual([...proposalSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)].map(match => match[1]), ['node:crypto']);
});
