import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HARNESS = 'scripts/test-release-r3k-browser-e2e.mjs';
const WORKFLOW = '.github/workflows/release-r3k-bounded-agent-browser-e2e.yml';

test('R3k proves bounded Agent durable recovery through the real release stack', async () => {
  const [harness, workflow] = await Promise.all([readFile(HARNESS, 'utf8'), readFile(WORKFLOW, 'utf8')]);

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
  ]) assert.equal(harness.includes(required), true, `R3k harness must contain ${required}`);

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

  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run server:typecheck/);
  assert.match(workflow, /npm run server:build/);
  assert.match(workflow, /node dist-server\/migrate\.mjs migrate/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /test-release-r3k-browser-e2e\.mjs/);
  assert.match(workflow, /R3K_BROWSER_BOUNDED_AGENT_RECOVERY_ACCEPTED/);
});

test('R3k fixed journey remains Agent-only and cannot widen browser tool authority', async () => {
  const harness = await readFile(HARNESS, 'utf8');
  assert.match(harness, /ROTATE_90_CW/);
  assert.match(harness, /BOUNDED_AGENT_PLAN_ID/);
  assert.match(harness, /ORTHOGONAL_TRANSFORM_STEP_ID/);
  assert.match(harness, /RESIZE_STEP_ID/);
  assert.match(harness, /BOUNDED_AGENT_VERIFY_STEP_ID/);
  assert.doesNotMatch(harness, /aiPlanner|recipeEngine|editingEngine|executionQueue|providerSelector|generic tool/i);
});
