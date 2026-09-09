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
import { CoreAuthorizedOrthogonalTransform } from '../src/application/local-execution/CoreAuthorizedOrthogonalTransform.ts';
import { CoreAuthorizedResize } from '../src/application/local-execution/CoreAuthorizedResize.ts';
import { ORTHOGONAL_TRANSFORM_STEP_ID } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_STEP_ID } from '../src/platform/creative/deterministic/Resize.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: C3b browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4197;
const corePort = 4198;
const providerPort = 4199;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');
const tenantId = 'automation-c3b-browser-tenant';
const userId = 'automation-c3b-browser-user';
const email = 'automation-c3b-browser@example.test';
const password = `automation-c3b-browser-password-${'x'.repeat(32)}`;
const target = Object.freeze({ width: 6, height: 5 });
const mode = 'ROTATE_90_CW';

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);
assert.equal(process.env.VITE_CORE_API_URL, `${coreOrigin}/api/core`, 'C3b harness Core origin must exactly match the release SPA');

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-c3b-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'C3b Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 31, g: 83, b: 149, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'C3B_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'automation-c3b-browser-core',
    JWT_AUDIENCE: 'automation-c3b-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS C3b <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'automation-c3b-google-unused',
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
  automationRequests: [],
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
    window.__c3bCsrf = null;
    window.__c3bDropNextAutomationResult = false;
    window.__c3bDrops = [];
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const csrf = response.headers.get('X-Bers-CSRF-Token');
      if (csrf) window.__c3bCsrf = csrf;
      let url;
      try { url = new URL(response.url); } catch { return response; }
      if (window.__c3bDropNextAutomationResult
        && url.origin === expectedCoreOrigin
        && /^\/api\/core\/automation-invocations\/[^/]+\/result$/.test(url.pathname)
        && response.ok) {
        window.__c3bDropNextAutomationResult = false;
        const payload = await response.clone().json().catch(() => null);
        window.__c3bDrops.push({
          status: response.status,
          path: url.pathname,
          invocationId: payload?.invocationId ?? null,
          executionId: payload?.executionId ?? null,
          state: payload?.state ?? null,
          revision: payload?.revision ?? null,
          operation: payload?.nextAction?.operation ?? null,
        });
        await response.clone().arrayBuffer();
        throw new TypeError('C3b injected transport ambiguity after committed Automation result');
      }
      return response;
    };
  }, { expectedCoreOrigin: coreOrigin });

  const page = await browserContext.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-c3b`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'automation-c3b-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');
  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });

  await ensureBrowserCsrf(page);
  const baseline = await readProjectState(projectId);
  assert.equal(baseline.project.width, 12);
  assert.equal(baseline.project.height, 8);
  assert.equal(baseline.cursor.ordinal, 0);
  assert.equal(baseline.cursor.kind, 'ORIGINAL');
  const financialBefore = await readFinancialState();
  resetJourneyDiagnostics();

  const definitionResponse = await browserJson(page, 'POST', '/automations', {
    name: 'C3b deterministic browser acceptance',
    trigger: 'MANUAL',
    plan: {
      kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1',
      orthogonal_mode: mode,
      target_width: target.width,
      target_height: target.height,
    },
  });
  assert.equal(definitionResponse.status, 201);
  const definition = definitionResponse.body;
  assert.match(definition.id, /^[0-9a-f-]{36}$/);
  assert.equal(definition.revision, 1);
  assert.equal(definitionResponse.headers['x-automation-revision'], '1');

  const startResponse = await browserJson(
    page,
    'POST',
    `/automations/${encodeURIComponent(definition.id)}/manual-runs`,
    { projectId, clientRequestId: 'c3b-browser-manual-1' },
    { 'X-Expected-Automation-Revision': '1' },
  );
  assert.equal(startResponse.status, 202);
  let view = startResponse.body;
  assert.equal(view.automationId, definition.id);
  assert.equal(view.definitionRevision, 1);
  assert.equal(view.projectId, projectId);
  assert.equal(Object.hasOwn(view, 'executionId'), false, 'Automation transport must not publish Agent executionId');
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(view.nextAction?.operation, 'ORTHOGONAL_TRANSFORM');
  assertTicket(view.nextAction?.ticket, projectId, 'ORTHOGONAL_TRANSFORM');
  const invocationId = view.invocationId;

  const binding = await readBinding(invocationId);
  assert.equal(binding.automation_id, definition.id);
  assert.equal(Number(binding.definition_revision), 1);
  assert.equal(binding.project_id, projectId);
  assert.equal(binding.source_image_storage_id, baseline.project.current_image_storage_id);
  assert.equal(binding.source_role, 'ORIGINAL');
  assert.equal(binding.plan_kind, 'BOUNDED_DETERMINISTIC_IMAGE_V1');
  assert.equal(binding.orthogonal_mode, mode);
  assert.equal(Number(binding.target_width), target.width);
  assert.equal(Number(binding.target_height), target.height);
  assert.match(binding.downstream_client_request_id, /^automation-agent-v1-[0-9a-f]{64}$/);

  const afterStartContinuation = await readContinuationByClientRequest(binding.downstream_client_request_id, projectId);
  const executionId = afterStartContinuation.execution_id;
  assert.equal(afterStartContinuation.plan_id, BOUNDED_AGENT_PLAN_ID);
  assert.equal(afterStartContinuation.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(afterStartContinuation.current_step_id, ORTHOGONAL_TRANSFORM_STEP_ID);
  assert.deepEqual(await readProjectState(projectId), baseline, 'Automation start must not mutate Project');

  const afterStartRuns = await readExecutionRuns(projectId);
  const root = workflowRoot(afterStartRuns, executionId);
  assert.equal(root.status, 'RUNNING');
  assert.equal(childrenOf(afterStartRuns, root.run_id).length, 1);

  const orthogonal = await executeOrthogonal(page, projectId, view.nextAction.ticket);
  await page.evaluate(() => { window.__c3bDropNextAutomationResult = true; });
  await assert.rejects(
    browserJson(page, 'POST', `/automation-invocations/${encodeURIComponent(invocationId)}/result`, { result: orthogonal.result }),
    /C3b injected transport ambiguity/,
  );

  const drops = await page.evaluate(() => window.__c3bDrops);
  assert.equal(drops.length, 1);
  assert.equal(drops[0].status, 202);
  assert.equal(drops[0].invocationId, invocationId);
  assert.equal(drops[0].executionId, null, 'lost Automation response must not leak Agent executionId');
  assert.equal(drops[0].state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(drops[0].operation, 'RESIZE');
  assert.deepEqual(await readProjectState(projectId), baseline, 'lost committed Orthogonal response must not mutate Project');

  const afterDropContinuation = await readContinuation(executionId, projectId);
  assert.equal(afterDropContinuation.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(afterDropContinuation.current_step_id, RESIZE_STEP_ID);
  assert.deepEqual(completedStepIds(afterDropContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID]);
  const afterDropRuns = await readExecutionRuns(projectId);
  const afterDropRoot = workflowRoot(afterDropRuns, executionId);
  assert.equal(afterDropRoot.run_id, root.run_id);
  assert.deepEqual(
    childrenOf(afterDropRuns, root.run_id).map(run => [run.capability, run.status]).sort(),
    [['LOCAL_EXECUTION', 'RUNNING'], ['LOCAL_EXECUTION', 'SUCCEEDED']].sort(),
  );

  const localBeforeReload = diagnostics.localExecutionRequests.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureBrowserCsrf(page);
  const resumedResponse = await browserJson(page, 'GET', `/automation-invocations/${encodeURIComponent(invocationId)}`);
  assert.equal(resumedResponse.status, 200);
  view = resumedResponse.body;
  assert.equal(view.invocationId, invocationId);
  assert.equal(Object.hasOwn(view, 'executionId'), false);
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(view.nextAction?.operation, 'RESIZE');
  assertTicket(view.nextAction?.ticket, projectId, 'RESIZE');
  assert.equal(diagnostics.localExecutionRequests.length, localBeforeReload, 'invocation reload must not rerun committed Orthogonal pixels');

  const resize = await executeResize(page, projectId, view.nextAction.ticket);
  const successResponse = await browserJson(page, 'POST', `/automation-invocations/${encodeURIComponent(invocationId)}/result`, { result: resize.result });
  assert.equal(successResponse.status, 200);
  const terminal = successResponse.body;
  assert.equal(terminal.invocationId, invocationId);
  assert.equal(terminal.state, 'SUCCESS');
  assert.equal(Object.hasOwn(terminal, 'executionId'), false);
  assert.equal(typeof terminal.terminalArtifactId, 'string');
  assert.ok(terminal.terminalArtifactId.length > 0);
  assert.equal(typeof terminal.terminalImageUrl, 'string');
  assert.ok(terminal.terminalImageUrl.startsWith('/api/core/artifacts/results/'));
  assert.deepEqual(await readProjectState(projectId), baseline, 'Automation terminal Preview must remain non-mutating before Accept');

  const successfulContinuation = await readContinuation(executionId, projectId);
  assert.equal(successfulContinuation.state, 'SUCCESS');
  assert.equal(successfulContinuation.terminal_artifact_id, terminal.terminalArtifactId);
  assert.deepEqual(completedStepIds(successfulContinuation), [ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID, BOUNDED_AGENT_VERIFY_STEP_ID]);
  const successfulRuns = await readExecutionRuns(projectId);
  const successfulRoot = workflowRoot(successfulRuns, executionId);
  assert.equal(successfulRoot.run_id, root.run_id);
  assert.equal(successfulRoot.status, 'SUCCEEDED');
  assert.deepEqual(successfulRuns.filter(run => run.parent_run_id === root.run_id).map(run => [run.capability, run.status]).sort(), [
    ['LOCAL_EXECUTION', 'SUCCEEDED'],
    ['LOCAL_EXECUTION', 'SUCCEEDED'],
    ['WORKFLOW_STEP', 'SUCCEEDED'],
  ].sort());

  const rootsResponse = await browserJson(page, 'GET', `/execution-runs?${new URLSearchParams({ projectId })}`);
  assert.equal(rootsResponse.status, 200);
  const publicRoot = rootsResponse.body.runs.find(run => run.authorityKind === 'WORKFLOW_CONTINUATION' && run.authorityRef === executionId);
  assert(publicRoot, 'Job Center projection must expose the Automation workflow root');
  assert.equal(publicRoot.runId, successfulRoot.run_id);
  assert.equal(publicRoot.status, 'SUCCEEDED');
  const childrenResponse = await browserJson(page, 'GET', `/execution-runs/${encodeURIComponent(publicRoot.runId)}/children?${new URLSearchParams({ projectId })}`);
  assert.equal(childrenResponse.status, 200);
  assert.equal(childrenResponse.body.runs.length, 3);

  const delivered = await browserBinary(page, terminal.terminalImageUrl);
  assert.equal(delivered.status, 200);
  assert.match(delivered.contentType, /^image\/png\b/);
  assert.ok(delivered.byteLength > 0);

  const localBeforeTerminalReload = diagnostics.localExecutionRequests.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureBrowserCsrf(page);
  const terminalReplayResponse = await browserJson(page, 'GET', `/automation-invocations/${encodeURIComponent(invocationId)}`);
  assert.equal(terminalReplayResponse.status, 200);
  assert.equal(terminalReplayResponse.body.state, 'SUCCESS');
  assert.equal(terminalReplayResponse.body.terminalArtifactId, terminal.terminalArtifactId);
  assert.equal(Object.hasOwn(terminalReplayResponse.body, 'executionId'), false);
  assert.equal(diagnostics.localExecutionRequests.length, localBeforeTerminalReload, 'terminal invocation reload must not execute pixels again');
  assert.deepEqual(await readProjectState(projectId), baseline, 'terminal reload must remain non-mutating before Accept');

  const acceptResponse = await browserJson(page, 'POST', `/projects/${encodeURIComponent(projectId)}/accept-final`, {
    finalArtifactId: terminal.terminalArtifactId,
    instruction: `Automation · ${mode} → Resize ${target.width}×${target.height}`,
  });
  assert.equal(acceptResponse.status, 200);
  const accepted = await readProjectState(projectId);
  assert.equal(accepted.project.width, target.width);
  assert.equal(accepted.project.height, target.height);
  assert.equal(accepted.cursor.ordinal, 1);
  assert.equal(accepted.cursor.kind, 'ACCEPTED_FINAL');
  assert.equal(accepted.history.length, 2);
  assert.equal(accepted.history[1].source_image_storage_id, baseline.project.current_image_storage_id);
  assert.notEqual(accepted.project.current_image_storage_id, baseline.project.current_image_storage_id);

  const bindingAfterAccept = await readBinding(invocationId);
  assert.deepEqual(bindingAfterAccept, binding, 'explicit Project Accept must not mutate immutable Automation invocation binding');
  const finalRuns = await readExecutionRuns(projectId);
  assert.equal(workflowRoot(finalRuns, executionId).run_id, root.run_id);
  assert.equal(workflowRoot(finalRuns, executionId).status, 'SUCCEEDED');

  const financialAfter = await readFinancialState();
  assert.deepEqual(financialAfter, financialBefore, 'LOCAL_ONLY Automation journey must not mutate wallet/reservation/journal/entitlement/grant state');
  assert.equal(providerCalls, 0, 'Automation bounded deterministic workflow must never reach provider boundary');
  assert.deepEqual(diagnostics.agentRequests, [], 'Automation browser must never call generic bounded Agent transport directly');
  assert.equal(diagnostics.localExecutionRequests.length, 4, 'Automation must use exactly input+upload for Orthogonal and Resize');
  assert.equal(diagnostics.localExecutionRequests.some(entry => /\/prepare$|\/result$/.test(entry.path)), false, 'Automation workflow steps must never use standalone prepare/result transport');
  assert.deepEqual(diagnostics.creativeRequests, [], 'Automation must not route through generic Creative/provider authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'Automation browser must not call Billing/credits APIs');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'Automation browser journey must not call external origins');
  assert.deepEqual(diagnostics.projectMutations, [`POST /api/core/projects/${projectId}/accept-final`], 'explicit Accept must be the only Project mutation after Automation start');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.consoleErrors.length, 0, `unexpected browser console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('C3B_BROWSER_AUTOMATION_RECOVERY_ACCEPTED', JSON.stringify({
    projectId,
    automationId: definition.id,
    invocationId,
    executionId,
    rootRunId: root.run_id,
    terminalArtifactId: terminal.terminalArtifactId,
    automationRequests: diagnostics.automationRequests,
    localExecutionRequests: diagnostics.localExecutionRequests,
    executionRunRequests: diagnostics.executionRunRequests,
    projectMutations: diagnostics.projectMutations,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `C3b browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
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

async function executeOrthogonal(page, projectId, ticket) {
  const sourceArtifactId = ticket.inputs?.[0]?.artifactId;
  assert.equal(typeof sourceArtifactId, 'string');
  const delivered = await browserLocalInput(page, 'orthogonal-transform', ticket.ticketId, projectId);
  assert.equal(delivered.sourceSha256, ticket.inputs[0].sha256.toLowerCase());
  let clock = 10;
  const executor = new CoreAuthorizedOrthogonalTransform(projectId, {
    prepareOrthogonalTransform: async () => { throw new Error('C3b workflow must not prepare a second Orthogonal ticket'); },
    uploadOrthogonalTransformImage: ({ ticketId, projectId: scopedProjectId, bytes }) => browserLocalUpload(page, 'orthogonal-transform', ticketId, scopedProjectId, bytes),
    submitOrthogonalTransform: async () => { throw new Error('C3b workflow must finalize through Automation invocation result transport'); },
  }, {
    loadImage: async artifactId => {
      assert.equal(artifactId, sourceArtifactId);
      return Object.freeze({ width: delivered.width, height: delivered.height, data: new Uint8ClampedArray(delivered.bytes), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' });
    },
    sha256: async artifactId => { assert.equal(artifactId, sourceArtifactId); return delivered.sourceSha256; },
  }, () => ++clock);
  return executor.runPrepared({ ticket, sourceArtifactId, mode: ticket.operation.parameters.mode });
}

async function executeResize(page, projectId, ticket) {
  const sourceArtifactId = ticket.inputs?.[0]?.artifactId;
  assert.equal(typeof sourceArtifactId, 'string');
  const delivered = await browserLocalInput(page, 'resize', ticket.ticketId, projectId);
  assert.equal(delivered.sourceSha256, ticket.inputs[0].sha256.toLowerCase());
  let clock = 20;
  const executor = new CoreAuthorizedResize(projectId, {
    prepareResize: async () => { throw new Error('C3b workflow must not prepare a second Resize ticket'); },
    uploadResizeImage: ({ ticketId, projectId: scopedProjectId, bytes }) => browserLocalUpload(page, 'resize', ticketId, scopedProjectId, bytes),
    submitResize: async () => { throw new Error('C3b workflow must finalize through Automation invocation result transport'); },
  }, {
    loadImage: async artifactId => {
      assert.equal(artifactId, sourceArtifactId);
      return Object.freeze({ width: delivered.width, height: delivered.height, data: new Uint8ClampedArray(delivered.bytes), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' });
    },
    sha256: async artifactId => { assert.equal(artifactId, sourceArtifactId); return delivered.sourceSha256; },
  }, () => ++clock);
  return executor.runPrepared({
    ticket,
    sourceArtifactId,
    target: Object.freeze({ width: ticket.operation.parameters.width, height: ticket.operation.parameters.height }),
  });
}

function assertTicket(ticket, projectId, operation) {
  assert(ticket && typeof ticket === 'object');
  assert.equal(ticket.version, '2');
  assert.equal(ticket.issuer, 'CORE');
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.scope?.projectId, projectId);
  assert.equal(ticket.operation?.type, operation);
  assert.equal(ticket.cost?.providerCalls, 0);
  assert.equal(ticket.cost?.paidCloudCredits, 0);
  assert.equal(ticket.inputs?.length, 1);
}

async function browserJson(page, method, pathName, body, extraHeaders = {}) {
  return page.evaluate(async ({ expectedCoreOrigin, method, pathName, body, hasBody, extraHeaders }) => {
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const headers = new Headers(extraHeaders);
    if (hasBody) headers.set('Content-Type', 'application/json');
    if (unsafe) {
      if (!window.__c3bCsrf) throw new Error('C3b browser CSRF token is unavailable');
      headers.set('X-Bers-CSRF-Token', window.__c3bCsrf);
    }
    const response = await fetch(`${expectedCoreOrigin}/api/core${pathName}`, {
      method,
      credentials: 'include',
      headers,
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
    const responseBody = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    return { status: response.status, body: responseBody, headers: Object.fromEntries(response.headers.entries()) };
  }, { expectedCoreOrigin: coreOrigin, method, pathName, body, hasBody: body !== undefined, extraHeaders });
}

async function browserLocalInput(page, operation, ticketId, projectId) {
  return page.evaluate(async ({ expectedCoreOrigin, operation, ticketId, projectId }) => {
    const query = new URLSearchParams({ projectId });
    const response = await fetch(`${expectedCoreOrigin}/api/core/local-execution/${operation}/${encodeURIComponent(ticketId)}/inputs?${query}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`C3b local input failed with HTTP ${response.status}`);
    const width = Number(response.headers.get('X-Bers-Local-Input-Width'));
    const height = Number(response.headers.get('X-Bers-Local-Input-Height'));
    const sourceSha256 = String(response.headers.get('X-Bers-Local-Source-Sha256') || '').toLowerCase();
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    return { width, height, sourceSha256, bytes };
  }, { expectedCoreOrigin: coreOrigin, operation, ticketId, projectId });
}

async function browserLocalUpload(page, operation, ticketId, projectId, bytes) {
  return page.evaluate(async ({ expectedCoreOrigin, operation, ticketId, projectId, bytes }) => {
    if (!window.__c3bCsrf) throw new Error('C3b browser CSRF token is unavailable for local upload');
    const query = new URLSearchParams({ projectId });
    const response = await fetch(`${expectedCoreOrigin}/api/core/local-execution/${operation}/${encodeURIComponent(ticketId)}/image-upload?${query}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'image/png', 'X-Bers-CSRF-Token': window.__c3bCsrf },
      body: Uint8Array.from(bytes),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(`C3b local upload failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }, { expectedCoreOrigin: coreOrigin, operation, ticketId, projectId, bytes: Array.from(bytes) });
}

async function browserBinary(page, pathName) {
  return page.evaluate(async ({ expectedCoreOrigin, pathName }) => {
    const url = pathName.startsWith('/api/core/') ? `${expectedCoreOrigin}${pathName}` : `${expectedCoreOrigin}/api/core${pathName}`;
    const response = await fetch(url, { credentials: 'include' });
    const bytes = await response.arrayBuffer();
    return { status: response.status, contentType: response.headers.get('content-type') || '', byteLength: bytes.byteLength };
  }, { expectedCoreOrigin: coreOrigin, pathName });
}

async function ensureBrowserCsrf(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const value = await page.evaluate(() => window.__c3bCsrf);
    if (typeof value === 'string' && value.length > 0) return value;
    await browserJson(page, 'GET', '/auth/context');
    await page.waitForTimeout(50);
  }
  const value = await page.evaluate(() => window.__c3bCsrf);
  assert.equal(typeof value, 'string', 'authenticated browser must receive CSRF token from Core');
  assert.ok(value.length > 0);
  return value;
}

function resetJourneyDiagnostics() {
  for (const key of Object.keys(diagnostics)) diagnostics[key].length = 0;
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
    if (pathName.startsWith('/api/core/automations/') || pathName.startsWith('/api/core/automation-invocations/')) diagnostics.automationRequests.push(entry);
    if (pathName.startsWith('/api/core/agent/')) diagnostics.agentRequests.push(entry);
    if (pathName.startsWith('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (pathName.startsWith('/api/core/execution-runs')) diagnostics.executionRunRequests.push(entry);
    if (pathName.startsWith('/api/core/artifacts/results/')) diagnostics.terminalDeliveryRequests.push(entry);
    if (pathName.startsWith('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (!['GET', 'HEAD'].includes(method) && pathName.startsWith('/api/core/projects/')) diagnostics.projectMutations.push(`${method} ${pathName}`);
  });
}

async function readBinding(invocationId) {
  const result = await pool.query(`SELECT invocation_id::text,tenant_id,user_id,automation_id::text,definition_revision,plan_kind,orthogonal_mode,target_width,target_height,plan_digest,project_id::text,source_image_storage_id::text,source_role,source_width,source_height,client_request_id,downstream_client_request_id,created_at
    FROM canonical_automation_invocation_bindings
    WHERE invocation_id=$1 AND tenant_id=$2 AND user_id=$3`, [invocationId, tenantId, userId]);
  assert.equal(result.rowCount, 1, 'exact immutable Automation invocation binding must exist');
  return normalizeRow(result.rows[0]);
}

async function readContinuationByClientRequest(clientRequestId, projectId) {
  const result = await pool.query(`SELECT execution_id,client_request_id,project_id,plan_id,plan_revision,state,current_step_id,completed_steps_json,terminal_artifact_id,failure_code,revision
    FROM workflow_continuations
    WHERE client_request_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`, [clientRequestId, projectId, tenantId, userId]);
  assert.equal(result.rowCount, 1, 'Automation downstream identity must own exactly one durable workflow continuation');
  return result.rows[0];
}

async function readContinuation(executionId, projectId) {
  const result = await pool.query(`SELECT execution_id,client_request_id,project_id,plan_id,plan_revision,state,current_step_id,completed_steps_json,terminal_artifact_id,failure_code,revision
    FROM workflow_continuations
    WHERE execution_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`, [executionId, projectId, tenantId, userId]);
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

function completedStepIds(row) {
  const value = Array.isArray(row.completed_steps_json) ? row.completed_steps_json : JSON.parse(String(row.completed_steps_json ?? '[]'));
  return value.map(step => step.stepId);
}

async function readExecutionRuns(projectId) {
  const result = await pool.query(`SELECT run_id::text,capability,authority_kind,authority_ref,parent_run_id::text,status,revision,status_reason_code
    FROM canonical_execution_runs
    WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3
    ORDER BY created_at ASC,run_id ASC`, [projectId, tenantId, userId]);
  return result.rows;
}

function workflowRoot(runs, executionId) {
  const roots = runs.filter(run => run.parent_run_id === null && run.capability === 'WORKFLOW_CONTINUATION' && run.authority_kind === 'WORKFLOW_CONTINUATION' && run.authority_ref === executionId);
  assert.equal(roots.length, 1, 'Automation must own exactly one canonical workflow root run');
  return roots[0];
}
function childrenOf(runs, runId) { return runs.filter(run => run.parent_run_id === runId); }

async function readProjectState(projectId) {
  const projectResult = await pool.query(`SELECT p.project_id,p.original_image_storage_id,p.current_image_storage_id,p.width,p.height,p.history_cursor_id,c.ordinal AS cursor_ordinal,c.kind AS cursor_kind
    FROM canonical_projects p JOIN canonical_project_history c ON c.history_id=p.history_cursor_id
    WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`, [projectId, tenantId, userId]);
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for C3b browser user');
  const row = projectResult.rows[0];
  const historyResult = await pool.query(`SELECT h.history_id,h.ordinal,h.image_storage_id,h.source_image_storage_id,h.kind,h.instruction,a.width,a.height
    FROM canonical_project_history h JOIN canonical_image_artifacts a ON a.storage_id=h.image_storage_id
    WHERE h.project_id=$1 AND h.tenant_id=$2 AND h.user_id=$3 AND h.retired_at IS NULL ORDER BY h.ordinal ASC`, [projectId, tenantId, userId]);
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

async function readFinancialState() {
  const [wallets, reservations, journal, entitlements, grants] = await Promise.all([
    pool.query('SELECT owner_id,total_credited,lifetime_spent,balance,reserved,version,created_at,updated_at FROM credit_wallets WHERE owner_id=$1 ORDER BY owner_id', [userId]),
    pool.query('SELECT id,correlation_id,idempotency_key,request_fingerprint,owner_id,project_id,operation_id,operation_version,provider,amount,status,provider_state,created_at,expires_at,committed_at,released_at,lease_owner,lease_until,lease_version FROM credit_reservations WHERE owner_id=$1 ORDER BY id', [userId]),
    pool.query(`SELECT j.id,j.reservation_id,j.correlation_id,j.sequence,j.event,j.source,j.occurred_at,j.metadata
      FROM transaction_journal j JOIN credit_reservations r ON r.id=j.reservation_id WHERE r.owner_id=$1 ORDER BY j.reservation_id,j.sequence`, [userId]),
    pool.query('SELECT owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,ends_at,trial_consumed_at,provider_customer_ref,provider_subscription_ref,created_at,updated_at FROM financial_entitlement_accounts WHERE owner_id=$1 ORDER BY owner_id', [userId]),
    pool.query('SELECT id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at,metadata FROM credit_grants WHERE owner_id=$1 ORDER BY id', [userId]),
  ]);
  return Object.freeze({
    wallets: normalizeRows(wallets.rows),
    reservations: normalizeRows(reservations.rows),
    journal: normalizeRows(journal.rows),
    entitlements: normalizeRows(entitlements.rows),
    grants: normalizeRows(grants.rows),
  });
}

function normalizeRows(rows) { return JSON.parse(JSON.stringify(rows)); }
function normalizeRow(row) { return JSON.parse(JSON.stringify(row)); }

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
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  assert(stat?.isFile(), `required built file missing: ${file}`);
}
