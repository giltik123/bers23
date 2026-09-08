import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import sharp from 'sharp';

import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';
import {
  BOUNDED_AGENT_PLAN_ID,
  BOUNDED_AGENT_VERIFY_STEP_ID,
} from '../server/core/workflow/BoundedAgentDeterministicWorkflowService.ts';
import { ORTHOGONAL_TRANSFORM_STEP_ID } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_STEP_ID } from '../src/platform/creative/deterministic/Resize.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3k browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4187;
const corePort = 4188;
const providerPort = 4189;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');
const tenantId = 'release-r3k-tenant';
const userId = 'release-r3k-user';
const email = 'release-r3k@example.test';
const password = `release-r3k-browser-password-${'x'.repeat(32)}`;
const target = Object.freeze({ width: 6, height: 5 });
const HINT_PREFIX = 'bers:bounded-agent:v1:';

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);
assert.equal(
  process.env.VITE_CORE_API_URL,
  `${coreOrigin}/api/core`,
  'R3k harness Core origin must exactly match the Core API origin baked into the release SPA',
);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3k-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3k Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 41, g: 91, b: 137, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3K_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
});
await listen(providerTrap, providerPort);

const coreLogs = [];
const frontendLogs = [];
const core = spawn(process.execPath, [coreEntry], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(corePort),
    DATABASE_URL: databaseUrl,
    CREATIVE_PROVIDER: 'FAL',
    FAL_BASE_URL: providerOrigin,
    JWT_ISSUER: 'release-r3k-core',
    JWT_AUDIENCE: 'release-r3k-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3k <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3k-google-unused',
    ALLOWED_WEB_ORIGINS: frontendOrigin,
    TRUSTED_PROXY_HEADER_MODE: 'NONE',
    HARD_BUDGET_CREDITS: '1',
    CREDITS_PER_EDIT: '1',
    REQUEST_BODY_LIMIT_BYTES: '262144',
    MASK_UPLOAD_LIMIT_BYTES: '1048576',
    MASK_MAX_DIMENSION: '1024',
    IMAGE_UPLOAD_LIMIT_BYTES: '2097152',
    IMAGE_MAX_DIMENSION: '1024',
    IMAGE_MAX_PIXELS: '1048576',
    REQUEST_TIMEOUT_MS: '15000',
    PROVIDER_TIMEOUT_MS: '2000',
    SHUTDOWN_TIMEOUT_MS: '3000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
core.stdout.on('data', chunk => coreLogs.push(String(chunk)));
core.stderr.on('data', chunk => coreLogs.push(String(chunk)));

let frontend;
let browser;
const diagnostics = {
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  agentRequests: [],
  localExecutionRequests: [],
  executionRunRequests: [],
  terminalDeliveryRequests: [],
  creativeRequests: [],
  financialRequests: [],
  projectMutations: [],
  externalBrowserRequests: [],
};

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = spawn(process.execPath, [viteEntry, 'preview', '--host', host, '--port', String(frontendPort), '--strictPort'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  frontend.stdout.on('data', chunk => frontendLogs.push(String(chunk)));
  frontend.stderr.on('data', chunk => frontendLogs.push(String(chunk)));
  await waitForHttp(frontendOrigin, 15_000, frontend);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const browserContext = await browser.newContext();
  await browserContext.addInitScript(({ expectedCoreOrigin }) => {
    const originalFetch = window.fetch.bind(window);
    window.__r3kDropFirstAgentResult = false;
    window.__r3kAgentResponses = [];
    window.__r3kDrops = [];
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      let url;
      try { url = new URL(response.url); } catch { return response; }
      const agentPath = url.origin === expectedCoreOrigin && url.pathname.startsWith('/api/core/agent/bounded-deterministic/');
      if (!agentPath) return response;
      const payload = await response.clone().json().catch(() => null);
      window.__r3kAgentResponses.push({
        method: String(args?.[1]?.method || 'GET').toUpperCase(),
        path: url.pathname,
        status: response.status,
        executionId: payload?.executionId ?? null,
        state: payload?.state ?? null,
        revision: payload?.revision ?? null,
        operation: payload?.nextAction?.operation ?? null,
        terminalArtifactId: payload?.terminalArtifactId ?? null,
        terminalImageUrl: payload?.terminalImageUrl ?? null,
      });
      if (window.__r3kDropFirstAgentResult
        && /^\/api\/core\/agent\/bounded-deterministic\/[^/]+\/result$/.test(url.pathname)
        && response.ok) {
        window.__r3kDropFirstAgentResult = false;
        window.__r3kDrops.push({
          status: response.status,
          path: url.pathname,
          executionId: payload?.executionId ?? null,
          state: payload?.state ?? null,
          revision: payload?.revision ?? null,
          operation: payload?.nextAction?.operation ?? null,
        });
        await response.clone().arrayBuffer();
        throw new TypeError('R3k injected transport ambiguity after first committed Agent result');
      }
      return response;
    };
  }, { expectedCoreOrigin: coreOrigin });

  const page = await browserContext.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3k`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'release-r3k-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');
  const hintKey = `${HINT_PREFIX}${projectId}`;

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  await waitImage(page, 'Project', 12, 8);
  const baseline = await readProjectState(projectId);
  assert.equal(baseline.project.width, 12);
  assert.equal(baseline.project.height, 8);
  assert.equal(baseline.cursor.ordinal, 0);
  assert.equal(baseline.cursor.kind, 'ORIGINAL');
  assert.equal(baseline.history.length, 1);

  resetJourneyDiagnostics();
  await page.getByRole('button', { name: 'AI Agent', exact: true }).click();
  await page.getByText('AI Agent · Bounded deterministic v1', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByLabel('Transform').selectOption('ROTATE_90_CW');
  await page.getByLabel('Final width').fill(String(target.width));
  await page.getByLabel('Final height').fill(String(target.height));
  await page.evaluate(() => { window.__r3kDropFirstAgentResult = true; });

  await page.getByRole('button', { name: 'Run bounded workflow', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'R3k injected transport ambiguity after first committed Agent result' })
    .waitFor({ state: 'visible', timeout: 20_000 });

  const drops = await page.evaluate(() => window.__r3kDrops);
  assert.equal(drops.length, 1, 'R3k must inject exactly one post-commit transport ambiguity');
  const dropped = drops[0];
  assert.equal(dropped.status, 202);
  assert.equal(dropped.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(dropped.operation, 'RESIZE', 'first committed Agent result must advance durable workflow to Resize');
  assert.equal(typeof dropped.executionId, 'string');
  assert.ok(dropped.executionId.length > 0);
  const executionId = dropped.executionId;

  const durableHint = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), hintKey);
  assert.equal(durableHint?.executionId, executionId, 'browser recovery hint must retain the exact durable execution id');
  assert.deepEqual(await readProjectState(projectId), baseline, 'transport ambiguity after Orthogonal must not mutate Project');

  const afterDropContinuation = await readContinuation(executionId, projectId);
  assert.equal(afterDropContinuation.plan_id, BOUNDED_AGENT_PLAN_ID);
  assert.equal(afterDropContinuation.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(afterDropContinuation.current_step_id, RESIZE_STEP_ID);
  assert.equal(afterDropContinuation.terminal_artifact_id, null);
  assert.deepEqual(completedStepIds(afterDropContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID]);

  const afterDropRuns = await readExecutionRuns(projectId);
  const afterDropRoot = workflowRoot(afterDropRuns, executionId);
  assert.equal(afterDropRoot.status, 'RUNNING');
  assert.deepEqual(
    childrenOf(afterDropRuns, afterDropRoot.run_id).map(run => [run.capability, run.status]).sort(),
    [['LOCAL_EXECUTION', 'RUNNING'], ['LOCAL_EXECUTION', 'SUCCEEDED']].sort(),
    'durable root must retain completed Orthogonal plus outstanding Resize local attempt',
  );

  // Reload after losing the committed Orthogonal result response. The hook must resume
  // the same workflow, execute only the Core-issued Resize action and reach SUCCESS.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'visible', timeout: 25_000 });
  await waitImage(page, 'after', target.width, target.height);
  assert.deepEqual(await readProjectState(projectId), baseline, 'recovered terminal Preview must still be non-mutating');

  const firstTerminalResponses = await page.evaluate(() => window.__r3kAgentResponses.filter(item => item.state === 'SUCCESS'));
  assert.equal(firstTerminalResponses.length, 1, 'first recovery must reach one terminal Agent SUCCESS');
  const terminal = firstTerminalResponses[0];
  assert.equal(terminal.executionId, executionId);
  assert.equal(typeof terminal.terminalArtifactId, 'string');
  assert.ok(terminal.terminalArtifactId.length > 0);
  assert.equal(typeof terminal.terminalImageUrl, 'string');
  assert.ok(terminal.terminalImageUrl.startsWith('/api/core/artifacts/results/'));

  const successfulContinuation = await readContinuation(executionId, projectId);
  assert.equal(successfulContinuation.state, 'SUCCESS');
  assert.equal(successfulContinuation.terminal_artifact_id, terminal.terminalArtifactId);
  assert.deepEqual(completedStepIds(successfulContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID, BOUNDED_AGENT_VERIFY_STEP_ID]);

  const successfulRuns = await readExecutionRuns(projectId);
  const successfulRoot = workflowRoot(successfulRuns, executionId);
  assert.equal(successfulRoot.run_id, afterDropRoot.run_id, 'recovery must keep one canonical root ExecutionRun');
  assert.equal(successfulRoot.status, 'SUCCEEDED');
  const successfulChildren = childrenOf(successfulRuns, successfulRoot.run_id);
  assert.equal(successfulChildren.length, 3);
  assert.deepEqual(successfulChildren.map(run => [run.capability, run.status]).sort(), [
    ['LOCAL_EXECUTION', 'SUCCEEDED'],
    ['LOCAL_EXECUTION', 'SUCCEEDED'],
    ['WORKFLOW_STEP', 'SUCCEEDED'],
  ].sort());

  const serverExecutions = page.locator('[data-job-center-canonical-executions]');
  await serverExecutions.waitFor({ state: 'visible', timeout: 15_000 });
  await serverExecutions.getByRole('button', { name: 'Refresh', exact: true }).click();
  await serverExecutions.getByText('Workflow execution', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  const localRunLabels = serverExecutions.getByText('Local execution', { exact: true });
  await localRunLabels.nth(1).waitFor({ state: 'visible', timeout: 15_000 });
  const internalRunLabel = serverExecutions.getByText('Internal workflow step', { exact: true });
  await internalRunLabel.waitFor({ state: 'visible', timeout: 15_000 });
  assert.equal(await localRunLabels.count(), 2);
  assert.equal(await internalRunLabel.count(), 1);

  // Reload a second time while ResultCompare is visible. Because terminal recovery
  // remains armed until Accept/Discard, this reload must re-publish the same FINAL
  // from a newly minted signed Core delivery capability without re-running pixels.
  const localBeforeTerminalReload = diagnostics.localExecutionRequests.length;
  const resultPostsBeforeTerminalReload = diagnostics.agentRequests.filter(entry => entry.method === 'POST' && /\/result$/.test(entry.path)).length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  const recoveredImage = await waitImage(page, 'after', target.width, target.height);
  const recoveredImageSrc = await recoveredImage.evaluate(element => element.src);
  const recoveredImageUrl = new URL(recoveredImageSrc);
  assert.equal(recoveredImageUrl.origin, coreOrigin, 'recovered terminal Preview must be delivered by Core');
  assert.ok(recoveredImageUrl.pathname.startsWith('/api/core/artifacts/results/'), 'recovered terminal Preview must use signed result delivery capability');
  assert.equal(diagnostics.localExecutionRequests.length, localBeforeTerminalReload, 'terminal reload must not read/upload deterministic pixels again');
  assert.equal(
    diagnostics.agentRequests.filter(entry => entry.method === 'POST' && /\/result$/.test(entry.path)).length,
    resultPostsBeforeTerminalReload,
    'terminal reload must not submit another local result',
  );
  assert.deepEqual(await readProjectState(projectId), baseline, 'terminal recovery reload must remain non-mutating before Accept');

  const allAgentResponses = await page.evaluate(() => window.__r3kAgentResponses);
  const recoveredTerminal = [...allAgentResponses].reverse().find(item => item.state === 'SUCCESS');
  assert.equal(recoveredTerminal.executionId, executionId);
  assert.equal(recoveredTerminal.terminalArtifactId, terminal.terminalArtifactId);
  assert.ok(recoveredTerminal.terminalImageUrl.startsWith('/api/core/artifacts/results/'));

  const acceptWait = waitForCoreResponse(page, 'POST', pathname => pathname === `/api/core/projects/${projectId}/accept-final`);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  const acceptResponse = await acceptWait;
  assert.equal(acceptResponse.status(), 200);
  const acceptIntent = JSON.parse(acceptResponse.request().postData() ?? '{}');
  assert.equal(acceptIntent.finalArtifactId, terminal.terminalArtifactId, 'Editor Accept must submit the durable Agent terminal Artifact id');
  assert.match(acceptIntent.instruction, /^Bounded Agent · ROTATE_90_CW → Resize 6×5$/);
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  await waitImage(page, 'Project', target.width, target.height);

  const accepted = await readProjectState(projectId);
  assert.equal(accepted.project.width, target.width);
  assert.equal(accepted.project.height, target.height);
  assert.equal(accepted.cursor.ordinal, 1);
  assert.equal(accepted.cursor.kind, 'ACCEPTED_FINAL');
  assert.equal(accepted.history.length, 2);
  assert.equal(accepted.history[1].source_image_storage_id, baseline.project.current_image_storage_id);
  assert.equal(accepted.history[1].instruction, acceptIntent.instruction);
  assert.notEqual(accepted.project.current_image_storage_id, baseline.project.current_image_storage_id);
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), hintKey), null, 'explicit Accept must dismiss terminal recovery hint');

  const finalRuns = await readExecutionRuns(projectId);
  const finalRoot = workflowRoot(finalRuns, executionId);
  assert.equal(finalRoot.run_id, successfulRoot.run_id);
  assert.equal(finalRoot.status, 'SUCCEEDED');
  assert.equal(childrenOf(finalRuns, finalRoot.run_id).length, 3);

  assert.equal(diagnostics.localExecutionRequests.length, 4, 'bounded Agent must use exactly input+upload for Orthogonal and Resize');
  assert.equal(diagnostics.localExecutionRequests.some(entry => /\/prepare$|\/result$/.test(entry.path)), false, 'workflow steps must never use standalone local prepare/result endpoints');
  assert.deepEqual(diagnostics.agentRequests.map(entry => [entry.method, routeKind(entry.path)]), [
    ['POST', 'start'],
    ['POST', 'result'],
    ['GET', 'resume'],
    ['POST', 'result'],
    ['GET', 'resume'],
  ]);
  assert.equal(diagnostics.terminalDeliveryRequests.length >= 1, true, 'terminal reload must fetch a signed Core result');
  assert.equal(providerCalls, 0, 'bounded deterministic Agent must never reach provider boundary');
  assert.deepEqual(diagnostics.creativeRequests, [], 'bounded Agent must not route through generic Creative/provider authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'bounded Agent must not reach Billing/credits authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'browser must not call external origins during bounded Agent journey');
  assert.deepEqual(diagnostics.projectMutations, [`POST /api/core/projects/${projectId}/accept-final`], 'explicit Accept must be the only Project mutation in Agent journey');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.consoleErrors.length, 0, `unexpected browser console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3K_BROWSER_BOUNDED_AGENT_RECOVERY_ACCEPTED', JSON.stringify({
    projectId,
    executionId,
    rootRunId: finalRoot.run_id,
    terminalArtifactId: terminal.terminalArtifactId,
    continuationRevision: successfulContinuation.revision,
    agentRequests: diagnostics.agentRequests,
    localExecutionRequests: diagnostics.localExecutionRequests,
    terminalDeliveryRequests: diagnostics.terminalDeliveryRequests,
    projectMutations: diagnostics.projectMutations,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `R3k browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`,
    `providerCalls=${providerCalls}`,
    `coreLogs=${coreLogs.join('').slice(-18000)}`,
    `frontendLogs=${frontendLogs.join('').slice(-8000)}`,
  ].join('\n');
  throw new Error(detail);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (frontend) await stopChild(frontend);
  await stopChild(core);
  await closeServer(providerTrap);
  await pool.end();
}

function resetJourneyDiagnostics() {
  for (const key of ['pageErrors', 'consoleErrors', 'requestFailures', 'agentRequests', 'localExecutionRequests', 'executionRunRequests', 'terminalDeliveryRequests', 'creativeRequests', 'financialRequests', 'projectMutations', 'externalBrowserRequests']) diagnostics[key].length = 0;
}

function attachDiagnostics(page) {
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText }));
  page.on('request', request => {
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.origin !== frontendOrigin && url.origin !== coreOrigin) diagnostics.externalBrowserRequests.push(request.url());
    if (url.origin !== coreOrigin) return;
    const pathName = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return;
    const entry = Object.freeze({ method, path: pathName });
    if (pathName.startsWith('/api/core/agent/bounded-deterministic/')) diagnostics.agentRequests.push(entry);
    if (pathName.startsWith('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (pathName.startsWith('/api/core/execution-runs')) diagnostics.executionRunRequests.push(entry);
    if (pathName.startsWith('/api/core/artifacts/results/')) diagnostics.terminalDeliveryRequests.push(entry);
    if (pathName.startsWith('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (!['GET', 'HEAD'].includes(method) && pathName.startsWith('/api/core/projects/')) diagnostics.projectMutations.push(`${method} ${pathName}`);
  });
}

async function readContinuation(executionId, projectId) {
  const result = await pool.query(
    `SELECT execution_id,client_request_id,project_id,plan_id,plan_revision,state,current_step_id,
            completed_steps_json,terminal_artifact_id,failure_code,revision
       FROM workflow_continuations
      WHERE execution_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`,
    [executionId, projectId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'bounded Agent continuation must exist in exact authenticated project scope');
  return result.rows[0];
}

function completedStepIds(row) {
  const value = Array.isArray(row.completed_steps_json) ? row.completed_steps_json : JSON.parse(String(row.completed_steps_json ?? '[]'));
  return value.map(step => step.stepId);
}

async function readExecutionRuns(projectId) {
  const result = await pool.query(
    `SELECT run_id::text,capability,authority_kind,authority_ref,parent_run_id::text,status,revision,status_reason_code
       FROM canonical_execution_runs
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3
      ORDER BY created_at ASC,run_id ASC`,
    [projectId, tenantId, userId],
  );
  return result.rows;
}

function workflowRoot(runs, executionId) {
  const roots = runs.filter(run => run.parent_run_id === null && run.capability === 'WORKFLOW_CONTINUATION' && run.authority_kind === 'WORKFLOW_CONTINUATION' && run.authority_ref === executionId);
  assert.equal(roots.length, 1, 'bounded Agent must own exactly one canonical workflow root run');
  return roots[0];
}
function childrenOf(runs, runId) { return runs.filter(run => run.parent_run_id === runId); }

async function readProjectState(projectId) {
  const projectResult = await pool.query(
    `SELECT p.project_id,p.original_image_storage_id,p.current_image_storage_id,p.width,p.height,p.history_cursor_id,
            c.ordinal AS cursor_ordinal,c.kind AS cursor_kind
       FROM canonical_projects p
       JOIN canonical_project_history c ON c.history_id=p.history_cursor_id
      WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`,
    [projectId, tenantId, userId],
  );
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for R3k browser user');
  const row = projectResult.rows[0];
  const historyResult = await pool.query(
    `SELECT h.history_id,h.ordinal,h.image_storage_id,h.source_image_storage_id,h.kind,h.instruction,a.width,a.height
       FROM canonical_project_history h
       JOIN canonical_image_artifacts a ON a.storage_id=h.image_storage_id
      WHERE h.project_id=$1 AND h.tenant_id=$2 AND h.user_id=$3 AND h.retired_at IS NULL
      ORDER BY h.ordinal ASC`,
    [projectId, tenantId, userId],
  );
  return Object.freeze({
    project: Object.freeze({
      project_id: row.project_id,
      original_image_storage_id: row.original_image_storage_id,
      current_image_storage_id: row.current_image_storage_id,
      width: row.width,
      height: row.height,
      history_cursor_id: row.history_cursor_id,
    }),
    cursor: Object.freeze({ ordinal: row.cursor_ordinal, kind: row.cursor_kind }),
    history: Object.freeze(historyResult.rows.map(history => Object.freeze({ ...history }))),
  });
}

function routeKind(pathName) {
  if (pathName.endsWith('/start')) return 'start';
  if (pathName.endsWith('/result')) return 'result';
  if (/\/bounded-deterministic\/[^/]+$/.test(pathName)) return 'resume';
  if (pathName.endsWith('/retry')) return 'retry';
  if (pathName.endsWith('/cancel')) return 'cancel';
  return 'unknown';
}

async function waitImage(page, accessibleName, width, height, timeout = 20_000) {
  const image = page.getByRole('img', { name: accessibleName, exact: true });
  await image.waitFor({ state: 'visible', timeout });
  await page.waitForFunction(
    ({ name, expectedWidth, expectedHeight }) => {
      const candidates = [...document.querySelectorAll('img')];
      const element = candidates.find(candidate => candidate.getAttribute('alt') === name);
      return Boolean(element?.complete && element.naturalWidth === expectedWidth && element.naturalHeight === expectedHeight);
    },
    { name: accessibleName, expectedWidth: width, expectedHeight: height },
    { timeout },
  );
  return image;
}

function waitForCoreResponse(page, method, pathPredicate) {
  return page.waitForResponse(response => {
    let url;
    try { url = new URL(response.url()); } catch { return false; }
    return url.origin === coreOrigin && response.request().method() === method && pathPredicate(url.pathname);
  }, { timeout: 20_000 });
}

async function waitForHttp(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited before ${url} became ready with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}
async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  assert(stat?.isFile(), `required built file missing: ${file}`);
}
