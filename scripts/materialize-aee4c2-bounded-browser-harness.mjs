import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KINDS = Object.freeze({
  r3k: Object.freeze({
    source: 'scripts/test-release-r3k-browser-e2e.mjs',
    replacements: Object.freeze([
      Object.freeze([
        `import {\n  BOUNDED_AGENT_PLAN_ID,\n  BOUNDED_AGENT_VERIFY_STEP_ID,\n} from '../server/core/workflow/BoundedAgentDeterministicWorkflowService.ts';\nimport { ORTHOGONAL_TRANSFORM_STEP_ID } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';\nimport { RESIZE_STEP_ID } from '../src/platform/creative/deterministic/Resize.ts';`,
        `import {\n  BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID,\n  BOUNDED_AGENT_AEE_RESIZE_NODE_ID,\n} from '../server/core/agentic/BoundedAgentAeeCompatibilityCompilerV1.ts';\nimport {\n  AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID,\n  AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION,\n} from '../server/core/agentic/AeeSerialAdmittedGraphDriverV1.ts';`,
      ]),
      Object.freeze([
        `  assert.equal(afterDropContinuation.plan_id, BOUNDED_AGENT_PLAN_ID);`,
        `  assert.equal(afterDropContinuation.plan_id, AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID);\n  assert.equal(afterDropContinuation.plan_revision, AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION);`,
      ]),
      Object.freeze([
        `  assert.equal(afterDropContinuation.current_step_id, RESIZE_STEP_ID);`,
        `  assert.equal(afterDropContinuation.current_step_id, BOUNDED_AGENT_AEE_RESIZE_NODE_ID);`,
      ]),
      Object.freeze([
        `  assert.deepEqual(completedStepIds(afterDropContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID]);`,
        `  assert.deepEqual(completedStepIds(afterDropContinuation), [BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID]);`,
      ]),
      Object.freeze([
        `  assert.deepEqual(completedStepIds(successfulContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID, BOUNDED_AGENT_VERIFY_STEP_ID]);`,
        `  assert.equal(successfulContinuation.plan_id, AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID);\n  assert.equal(successfulContinuation.plan_revision, AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION);\n  assert.deepEqual(completedStepIds(successfulContinuation), [BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID, BOUNDED_AGENT_AEE_RESIZE_NODE_ID]);`,
      ]),
      Object.freeze([
        `  assert.equal(successfulChildren.length, 3);\n  assert.deepEqual(successfulChildren.map(run => [run.capability, run.status]).sort(), [\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n    ['WORKFLOW_STEP', 'SUCCEEDED'],\n  ].sort());`,
        `  assert.equal(successfulChildren.length, 2);\n  assert.deepEqual(successfulChildren.map(run => [run.capability, run.status]).sort(), [\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n  ].sort());`,
      ]),
      Object.freeze([
        `  const internalRunLabel = serverExecutions.getByText('Internal workflow step', { exact: true });\n  await internalRunLabel.waitFor({ state: 'visible', timeout: 15_000 });\n  assert.equal(await localRunLabels.count(), 2);\n  assert.equal(await internalRunLabel.count(), 1);`,
        `  const internalRunLabels = serverExecutions.getByText('Internal workflow step', { exact: true });\n  assert.equal(await localRunLabels.count(), 2);\n  assert.equal(await internalRunLabels.count(), 0, 'AEE bounded graph must not synthesize the legacy internal verify child run');`,
      ]),
      Object.freeze([
        `  assert.equal(childrenOf(finalRuns, finalRoot.run_id).length, 3);`,
        `  assert.equal(childrenOf(finalRuns, finalRoot.run_id).length, 2);`,
      ]),
    ]),
    forbiddenAfter: Object.freeze(['BOUNDED_AGENT_PLAN_ID', 'BOUNDED_AGENT_VERIFY_STEP_ID', 'ORTHOGONAL_TRANSFORM_STEP_ID', 'RESIZE_STEP_ID']),
  }),
  automation: Object.freeze({
    source: 'scripts/test-automation-c3b-browser-e2e.mjs',
    replacements: Object.freeze([
      Object.freeze([
        `import {\n  BOUNDED_AGENT_PLAN_ID,\n  BOUNDED_AGENT_VERIFY_STEP_ID,\n} from '../server/core/workflow/BoundedAgentDeterministicWorkflowService.ts';`,
        `import {\n  BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID,\n  BOUNDED_AGENT_AEE_RESIZE_NODE_ID,\n} from '../server/core/agentic/BoundedAgentAeeCompatibilityCompilerV1.ts';\nimport {\n  AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID,\n  AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION,\n} from '../server/core/agentic/AeeSerialAdmittedGraphDriverV1.ts';`,
      ]),
      Object.freeze([
        `import { ORTHOGONAL_TRANSFORM_STEP_ID } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';\nimport { RESIZE_STEP_ID } from '../src/platform/creative/deterministic/Resize.ts';\n`,
        ``,
      ]),
      Object.freeze([
        `  assert.equal(afterStartContinuation.plan_id, BOUNDED_AGENT_PLAN_ID);`,
        `  assert.equal(afterStartContinuation.plan_id, AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID);\n  assert.equal(afterStartContinuation.plan_revision, AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION);`,
      ]),
      Object.freeze([
        `  assert.equal(afterStartContinuation.current_step_id, ORTHOGONAL_TRANSFORM_STEP_ID);`,
        `  assert.equal(afterStartContinuation.current_step_id, BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID);`,
      ]),
      Object.freeze([
        `  assert.equal(afterDropContinuation.current_step_id, RESIZE_STEP_ID);\n  assert.deepEqual(completedStepIds(afterDropContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID]);`,
        `  assert.equal(afterDropContinuation.current_step_id, BOUNDED_AGENT_AEE_RESIZE_NODE_ID);\n  assert.deepEqual(completedStepIds(afterDropContinuation), [BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID]);`,
      ]),
      Object.freeze([
        `  assert.deepEqual(completedStepIds(successfulContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID, BOUNDED_AGENT_VERIFY_STEP_ID]);`,
        `  assert.equal(successfulContinuation.plan_id, AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID);\n  assert.equal(successfulContinuation.plan_revision, AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION);\n  assert.deepEqual(completedStepIds(successfulContinuation), [BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID, BOUNDED_AGENT_AEE_RESIZE_NODE_ID]);`,
      ]),
      Object.freeze([
        `  assert.deepEqual(successfulRuns.filter(run => run.parent_run_id === root.run_id).map(run => [run.capability, run.status]).sort(), [\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n    ['WORKFLOW_STEP', 'SUCCEEDED'],\n  ].sort());`,
        `  assert.deepEqual(successfulRuns.filter(run => run.parent_run_id === root.run_id).map(run => [run.capability, run.status]).sort(), [\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n    ['LOCAL_EXECUTION', 'SUCCEEDED'],\n  ].sort());`,
      ]),
      Object.freeze([
        `  assert.equal(childrenResponse.body.runs.length, 3);`,
        `  assert.equal(childrenResponse.body.runs.length, 2);`,
      ]),
    ]),
    forbiddenAfter: Object.freeze(['BOUNDED_AGENT_PLAN_ID', 'BOUNDED_AGENT_VERIFY_STEP_ID', 'ORTHOGONAL_TRANSFORM_STEP_ID', 'RESIZE_STEP_ID', "['WORKFLOW_STEP', 'SUCCEEDED']"]),
  }),
  'automation-retry-cancel': Object.freeze({
    source: 'scripts/test-automation-c3b-retry-cancel-browser-e2e.mjs',
    replacements: Object.freeze([
      Object.freeze([
        `import { ORTHOGONAL_TRANSFORM_STEP_ID } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';`,
        `import { BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID } from '../server/core/agentic/BoundedAgentAeeCompatibilityCompilerV1.ts';`,
      ]),
      Object.freeze([
        `  assert.equal(afterRetry.current_step_id, ORTHOGONAL_TRANSFORM_STEP_ID);`,
        `  assert.equal(afterRetry.current_step_id, BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID);`,
      ]),
    ]),
    forbiddenAfter: Object.freeze(['ORTHOGONAL_TRANSFORM_STEP_ID']),
  }),
});

export async function materializeAee4c2BoundedBrowserHarness(kind, outputPath) {
  const definition = KINDS[kind];
  if (!definition) throw new Error(`Unsupported AE-4c.2 browser harness kind: ${kind}`);
  let source = await readFile(definition.source, 'utf8');
  for (const [before, after] of definition.replacements) source = replaceExactlyOnce(source, before, after, kind);
  for (const forbidden of definition.forbiddenAfter) {
    if (source.includes(forbidden)) throw new Error(`AE-4c.2 ${kind} materialization left forbidden legacy topology token: ${forbidden}`);
  }
  if (!source.includes('BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID')) throw new Error(`AE-4c.2 ${kind} materialization lost AEE node authority`);
  if (kind !== 'automation-retry-cancel' && !source.includes('AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID')) {
    throw new Error(`AE-4c.2 ${kind} materialization lost admitted-plan identity`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, 'utf8');
  return outputPath;
}

function replaceExactlyOnce(source, before, after, kind) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`AE-4c.2 ${kind} source drift: required legacy fragment not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`AE-4c.2 ${kind} source drift: legacy fragment is ambiguous`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

const invokedPath = process.argv[1] ? pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href : undefined;
if (invokedPath === import.meta.url) {
  const [, , kind, outputPath] = process.argv;
  if (!kind || !outputPath) throw new Error('Usage: node scripts/materialize-aee4c2-bounded-browser-harness.mjs <kind> <output-path>');
  await materializeAee4c2BoundedBrowserHarness(kind, outputPath);
}
