import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { materializeAee4c2BoundedBrowserHarness } from '../scripts/materialize-aee4c2-bounded-browser-harness.mjs';

const SOURCE_HARNESS = 'scripts/test-release-r3k-browser-e2e.mjs';
const MATERIALIZED_HARNESS = '.test-cache/release-r3k/static-test-release-r3k-browser-e2e.source.mjs';
const MATERIALIZER = 'scripts/materialize-aee4c2-bounded-browser-harness.mjs';
const WORKFLOW = '.github/workflows/release-r3k-bounded-agent-browser-e2e.yml';

await materializeAee4c2BoundedBrowserHarness('r3k', MATERIALIZED_HARNESS);

test('R3k proves bounded Agent durable recovery through the real release stack on AEE topology', async () => {
  const [sourceHarness, harness, materializer, workflow] = await Promise.all([
    readFile(SOURCE_HARNESS, 'utf8'),
    readFile(MATERIALIZED_HARNESS, 'utf8'),
    readFile(MATERIALIZER, 'utf8'),
    readFile(WORKFLOW, 'utf8'),
  ]);

  for (const required of [
    "path.resolve('dist')",
    "path.resolve('dist-server/server.mjs')",
    'PostgresAuthStore',
    "NODE_ENV: 'production'",
    'workflow_continuations',
    'canonical_execution_runs',
    'canonical_projects',
    'canonical_project_history',
    'browserContext.addInitScript',
    'response.clone().arrayBuffer()',
    '__r3kDropFirstAgentResult',
    "state, 'WAITING_FOR_LOCAL_RESULT'",
    "operation, 'RESIZE'",
    'page.reload',
    'terminalImageUrl',
    '/api/core/artifacts/results/',
    'sessionStorage.getItem',
    "name: 'Accept'",
    'ACCEPTED_FINAL',
    'R3K_BROWSER_BOUNDED_AGENT_RECOVERY_ACCEPTED',
  ]) assert.equal(harness.includes(required), true, `materialized R3k harness must contain ${required}`);

  assert.match(harness, /AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID/);
  assert.match(harness, /AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION/);
  assert.match(harness, /BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID/);
  assert.match(harness, /BOUNDED_AGENT_AEE_RESIZE_NODE_ID/);
  assert.doesNotMatch(harness, /BOUNDED_AGENT_PLAN_ID|BOUNDED_AGENT_VERIFY_STEP_ID|ORTHOGONAL_TRANSFORM_STEP_ID|RESIZE_STEP_ID/);
  assert.doesNotMatch(harness, /\['WORKFLOW_STEP', 'SUCCEEDED'\]/);
  assert.match(harness, /successfulChildren\.length, 2/);
  assert.match(harness, /childrenOf\(finalRuns, finalRoot\.run_id\)\.length, 2/);
  assert.match(harness, /internalRunLabels\.count\(\), 0/);
  assert.match(harness, /assert\.equal\(successfulRoot\.run_id, afterDropRoot\.run_id/);
  assert.match(harness, /assert\.equal\(finalRoot\.run_id, successfulRoot\.run_id/);
  assert.match(harness, /diagnostics\.localExecutionRequests\.length, 4/);
  assert.match(harness, /workflow steps must never use standalone local prepare\/result endpoints/);
  assert.match(harness, /providerCalls, 0/);
  assert.match(harness, /diagnostics\.creativeRequests, \[\]/);
  assert.match(harness, /diagnostics\.financialRequests, \[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests, \[\]/);
  assert.match(harness, /explicit Accept must be the only Project mutation in Agent journey/);

  for (const forbidden of [
    'page.route(',
    'browserContext.route(',
    'context.route(',
    'route.fulfill(',
    'route.abort(',
    'route.continue(',
    'route.fallback(',
    'financialAccount',
    'financialTrial',
    'credit_grants',
    'credit_wallets',
  ]) assert.equal(harness.includes(forbidden), false, `R3k must not contain fallback/test authority ${forbidden}`);

  assert.equal(sourceHarness.includes('BOUNDED_AGENT_VERIFY_STEP_ID'), true, 'accepted legacy source remains explicit recovery reference');
  assert.match(materializer, /replaceExactlyOnce/);
  assert.match(materializer, /forbidden legacy topology token/);
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run server:typecheck/);
  assert.match(workflow, /npm run server:build/);
  assert.match(workflow, /node dist-server\/migrate\.mjs migrate/);
  assert.match(workflow, /materialize-aee4c2-bounded-browser-harness\.mjs/);
  assert.match(workflow, /GENERATED=scripts\/\.test-release-r3k-browser-e2e\.aee4c2\.mjs/);
  assert.match(workflow, /R3K_BROWSER_BOUNDED_AGENT_RECOVERY_ACCEPTED/);
});

test('R3k materialized journey remains bounded and cannot widen browser tool authority', async () => {
  const harness = await readFile(MATERIALIZED_HARNESS, 'utf8');
  assert.match(harness, /ROTATE_90_CW/);
  assert.match(harness, /AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID/);
  assert.match(harness, /BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID/);
  assert.match(harness, /BOUNDED_AGENT_AEE_RESIZE_NODE_ID/);
  assert.doesNotMatch(harness, /aiPlanner|recipeEngine|editingEngine|executionQueue|providerSelector|generic tool/i);
});
