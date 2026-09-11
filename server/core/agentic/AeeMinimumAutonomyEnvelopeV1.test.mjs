import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BOUNDED_AGENT_AEE_EXECUTION,
  assertBoundedAgentAeeCompatibilityReplayV1,
  compileBoundedAgentAeeCompatibilityV1,
} from './BoundedAgentAeeCompatibilityCompilerV1.ts';

const projectId = 'ae7-project';
const source = Object.freeze({
  artifactId: 'ae7-source-artifact',
  storageId: 'ae7-source-storage',
  kind: 'image',
  role: 'ORIGINAL',
  sha256: 'a'.repeat(64),
  parentArtifactIds: Object.freeze([]),
  width: 640,
  height: 480,
});
const project = Object.freeze({
  projectId,
  revision: 17,
  currentImageStorageId: source.storageId,
  width: source.width,
  height: source.height,
});
const command = Object.freeze({
  clientRequestId: 'ae7-request',
  projectId,
  sourceArtifactId: source.artifactId,
  mode: 'ROTATE_90_CW',
  width: 320,
  height: 240,
});

function graphFor(input = command) {
  return compileBoundedAgentAeeCompatibilityV1(input, project, source);
}

function importDeclarations(sourceText) {
  return [...sourceText.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gmu)].map(match => match[0]).join('\n');
}

test('AE-7 minimum production envelope is server-owned, immutable and digest-bound', () => {
  const graph = graphFor();
  assert.deepEqual(BOUNDED_AGENT_AEE_EXECUTION, {
    policy: 'LOCAL_ONLY',
    cloudAllowed: false,
    maxNodes: 2,
    maxRetries: 8,
    maxReplans: 0,
    maxCandidates: 1,
    maxPaidCredits: 0,
    maxWallClockMs: 86_400_000,
    maxMemoryBytes: 137_438_953_472,
  });
  assert.deepEqual(graph.effectiveExecution, BOUNDED_AGENT_AEE_EXECUTION);
  assert.equal(graph.nodes.length, 2);
  assert.equal(Object.isFrozen(BOUNDED_AGENT_AEE_EXECUTION), true);
  assert.equal(Object.isFrozen(graph.effectiveExecution), true);
  assert.equal(assertBoundedAgentAeeCompatibilityReplayV1(graph, command).digest, graph.digest);
});

test('browser/advisory budget injection cannot widen the compatibility graph', () => {
  const baseline = graphFor();
  const injected = graphFor({
    ...command,
    autonomyLevel: 'L3_CREATIVE_AUTONOMY',
    policy: 'AUTO',
    cloudAllowed: true,
    maxNodes: 32,
    maxRetries: 999,
    maxReplans: 8,
    maxCandidates: 16,
    maxPaidCredits: 1_000_000,
    maxWallClockMs: 999_999_999,
    maxMemoryBytes: Number.MAX_SAFE_INTEGER,
    providerId: 'planner-provider',
    modelId: 'planner-model',
  });
  assert.equal(injected.digest, baseline.digest);
  assert.deepEqual(injected.effectiveExecution, baseline.effectiveExecution);
  assert.doesNotMatch(JSON.stringify(injected), /planner-provider|planner-model|L3_CREATIVE_AUTONOMY/u);
});

test('bounded Agent transport exposes no autonomy, budget, provider or Billing authority', async () => {
  const executionPort = await readFile(new URL('../workflow/BoundedAgentExecutionPort.ts', import.meta.url), 'utf8');
  const httpAdapter = await readFile(new URL('../http/boundedAgentHttpAdapter.ts', import.meta.url), 'utf8');

  for (const forbidden of [
    'maxNodes', 'maxRetries', 'maxReplans', 'maxCandidates', 'maxPaidCredits', 'maxWallClockMs',
    'maxMemoryBytes', 'cloudAllowed', 'autonomyLevel', 'providerId', 'modelId', 'billing', 'credits',
  ]) {
    assert.doesNotMatch(executionPort, new RegExp(forbidden, 'u'), `BoundedAgentExecutionPort must not expose ${forbidden}`);
  }

  assert.match(
    httpAdapter,
    /const START_FIELDS = new Set\(\['clientRequestId', 'projectId', 'sourceArtifactId', 'mode', 'width', 'height'\]\);/u,
  );
  assert.doesNotMatch(httpAdapter, /maxNodes|maxRetries|maxReplans|maxCandidates|maxPaidCredits|maxWallClockMs|maxMemoryBytes|cloudAllowed|autonomyLevel|providerId|modelId/iu);
});

test('AE-4b retains conservative retry/wall-clock gates and has no repair, cloud, Billing or Project-Accept path', async () => {
  const driver = await readFile(new URL('./AeeSerialAdmittedGraphDriverV1.ts', import.meta.url), 'utf8');
  const imports = importDeclarations(driver);

  assert.match(imports, /AeeCapabilityExecutionAdapterRegistryV1/u);
  assert.match(imports, /WorkflowContinuationStore/u);
  assert.match(imports, /executionRunRegistry/u);
  assert.match(driver, /countWorkflowLocalExecutionRetries/u);
  assert.match(driver, /retries < graph\.effectiveExecution\.maxRetries/u);
  assert.match(driver, /maxWallClockMs/u);
  assert.match(driver, /AEE_WALL_CLOCK_BUDGET_EXCEEDED/u);
  assert.doesNotMatch(driver, /effectiveExecution\.(maxReplans|maxCandidates)/u);
  assert.doesNotMatch(driver, /(?:async\s+|\.)(?:repair|replan)\s*\(/iu);
  assert.doesNotMatch(imports, /\/(providers|billing)\//iu);
  assert.doesNotMatch(driver, /acceptFinal|createVersion|restoreVersion|reserveCredits|spendCredits|providerSelector|modelSelector/iu);
});
