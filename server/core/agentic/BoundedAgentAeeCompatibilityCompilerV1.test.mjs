import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOUNDED_AGENT_AEE_EXECUTION,
  BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID,
  BOUNDED_AGENT_AEE_RESIZE_NODE_ID,
  assertBoundedAgentAeeCompatibilityReplayV1,
  compileBoundedAgentAeeCompatibilityV1,
} from './BoundedAgentAeeCompatibilityCompilerV1.ts';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';

const command = Object.freeze({
  clientRequestId: 'bounded-compat-request',
  projectId: 'project-ae4c2',
  sourceArtifactId: `eyJ2IjoxLCJsb2NhdGlvbiI6IlNUT1JFRF9PUklHSU5BTF9JRCJ9.${'a'.repeat(512)}`,
  mode: 'ROTATE_90_CW',
  width: 320,
  height: 240,
});
const project = Object.freeze({
  projectId: command.projectId,
  revision: 17,
  currentImageStorageId: 'storage-current-ae4c2',
  width: 640,
  height: 480,
});
const source = Object.freeze({
  artifactId: command.sourceArtifactId,
  storageId: project.currentImageStorageId,
  kind: 'image',
  role: 'ORIGINAL',
  sha256: 'a'.repeat(64),
  parentArtifactIds: Object.freeze([]),
  width: project.width,
  height: project.height,
});

test('bounded compatibility compiler emits the exact two-node local-only AEE graph', () => {
  assert.ok(command.sourceArtifactId.length > 256, 'fixture must cross the retired generic identifier limit');
  const graph = compileBoundedAgentAeeCompatibilityV1(command, project, source);
  assert.equal(graph.source.projectId, command.projectId);
  assert.equal(graph.source.projectRevision, project.revision);
  assert.equal(graph.source.sourceRef, command.sourceArtifactId);
  assert.deepEqual(graph.effectiveExecution, BOUNDED_AGENT_AEE_EXECUTION);
  assert.deepEqual(graph.nodes.map(node => node.nodeId), [BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID, BOUNDED_AGENT_AEE_RESIZE_NODE_ID]);
  assert.equal(graph.nodes[0].capabilityId, AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1);
  assert.equal(graph.nodes[0].semanticOperation, 'ORTHOGONAL_TRANSFORM');
  assert.deepEqual(graph.nodes[0].parameters, { mode: command.mode });
  assert.deepEqual(graph.nodes[0].output, { artifactRole: 'COMPOSITE', width: 480, height: 640 });
  assert.equal(graph.nodes[1].capabilityId, AEE_CAPABILITY_RESIZE_V1);
  assert.equal(graph.nodes[1].semanticOperation, 'RESIZE');
  assert.deepEqual(graph.nodes[1].dependsOn, [BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID]);
  assert.deepEqual(graph.nodes[1].parameters, { height: command.height, width: command.width });
  assert.deepEqual(graph.nodes[1].output, { artifactRole: 'COMPOSITE', width: command.width, height: command.height });
  assert.equal(graph.terminal.nodeId, BOUNDED_AGENT_AEE_RESIZE_NODE_ID);

  const serialized = JSON.stringify(graph);
  for (const forbidden of ['providerId', 'modelId', 'runtimeId', 'executorId', 'billing']) {
    assert.equal(serialized.includes(forbidden), false, `compatibility graph must not carry ${forbidden} authority`);
  }
  assert.equal(graph.effectiveExecution.maxPaidCredits, 0);
  assert.match(graph.digest, /^[0-9a-f]{64}$/u);
});

test('replay reconstructs the exact graph from immutable admitted source authority, not current Project state', () => {
  const graph = compileBoundedAgentAeeCompatibilityV1(command, project, source);
  assert.equal(assertBoundedAgentAeeCompatibilityReplayV1(graph, command), graph);

  // A later Project revision/current source is intentionally irrelevant here.
  const changedProject = { ...project, revision: 999, currentImageStorageId: 'other-storage' };
  assert.equal(changedProject.revision, 999);
  assert.equal(assertBoundedAgentAeeCompatibilityReplayV1(graph, command).digest, graph.digest);
});

test('changed bounded replay command fails closed instead of creating a shadow graph', () => {
  const graph = compileBoundedAgentAeeCompatibilityV1(command, project, source);
  for (const changed of [
    { ...command, sourceArtifactId: 'other-artifact' },
    { ...command, mode: 'FLIP_HORIZONTAL' },
    { ...command, width: command.width + 1 },
    { ...command, height: command.height + 1 },
  ]) {
    assert.throws(
      () => assertBoundedAgentAeeCompatibilityReplayV1(graph, changed),
      error => error?.code === 'bounded_aee_replay_mismatch' || error?.code === 'bounded_aee_source_binding_mismatch',
    );
  }
});

test('new admission rejects a source that is not the exact Project cursor', () => {
  assert.throws(
    () => compileBoundedAgentAeeCompatibilityV1(command, { ...project, revision: project.revision + 1, currentImageStorageId: 'different-storage' }, source),
    error => error?.code === 'bounded_aee_project_source_conflict',
  );
});

test('compatibility memory ceiling remains explicitly non-narrowing pending runtime enforcement issue 548', () => {
  assert.equal(BOUNDED_AGENT_AEE_EXECUTION.maxMemoryBytes, 137_438_953_472);
  assert.equal(BOUNDED_AGENT_AEE_EXECUTION.maxRetries, 8);
  assert.equal(BOUNDED_AGENT_AEE_EXECUTION.maxWallClockMs, 86_400_000);
  assert.equal(BOUNDED_AGENT_AEE_EXECUTION.maxReplans, 0);
});
