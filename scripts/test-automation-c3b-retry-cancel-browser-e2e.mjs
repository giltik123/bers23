import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import sharp from 'sharp';

import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';
import { PostgresLocalExecutionLedger } from '../server/core/localExecution/PostgresLocalExecutionLedger.ts';
import { CoreAuthorizedOrthogonalTransform } from '../src/application/local-execution/CoreAuthorizedOrthogonalTransform.ts';
import { ORTHOGONAL_TRANSFORM_STEP_ID } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: C3b retry/cancel E2E must use real PostgreSQL');

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
const tenantId = 'automation-c3b-retry-tenant';
const userId = 'automation-c3b-retry-user';
const email = 'automation-c3b-retry@example.test';
const password = `automation-c3b-retry-password-${'x'.repeat(32)}`;
const target = Object.freeze({ width: 7, height: 5 });
const mode = 'FLIP_HORIZONTAL';

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);
assert.equal(process.env.VITE_CORE_API_URL, `${coreOrigin}/api/core`, 'C3b retry/cancel Core origin must match the built SPA');

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-c3b-retry-cancel-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
const ledger = new PostgresLocalExecutionLedger(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'C3b Retry Browser User' });

const sourcePng = await sharp({
  create: { width: 11, height: 9, channels: 4, background: { r: 73, g: 119, b: 43, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'C3B_RETRY_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'automation-c3b-retry-core',
    JWT_AUDIENCE: 'automation-c3b-retry-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS C3b Retry <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'automation-c3b-retry-google-unused',
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
  await browserContext.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.__c3bRetryCsrf = null;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const csrf = response.headers.get('X-Bers-CSRF-Token');
      if (csrf) window.__c3bRetryCsrf = csrf;
      return response;
    };
  });

  const page = await browserContext.newPage();
  attachDiagnostics(page);
  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-c3b-retry`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'automation-c3b-retry-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');
  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  await ensureBrowserCsrf(page);

  const baseline = await readProjectState(projectId);
  const financialBefore = await readFinancialState();
  resetJourneyDiagnostics();

  const definitionResponse = await browserJson(page, 'POST', '/automations', {
    name: 'C3b retry cancel acceptance',
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
  assert.equal(definition.revision, 1);

  const startResponse = await browserJson(
    page,
    'POST',
    `/automations/${encodeURIComponent(definition.id)}/manual-runs`,
    { projectId, clientRequestId: 'c3b-browser-retry-cancel-1' },
    { 'X-Expected-Automation-Revision': '1' },
  );
  assert.equal(startResponse.status, 202);
  const initial = startResponse.body;
  assert.equal(Object.hasOwn(initial, 'executionId'), false, 'Automation start must not publish internal Agent executionId');
  assert.equal(initial.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(initial.nextAction?.operation, 'ORTHOGONAL_TRANSFORM');
  assertTicket(initial.nextAction?.ticket, projectId, 'ORTHOGONAL_TRANSFORM');
  const invocationId = initial.invocationId;
  const firstTicket = initial.nextAction.ticket;

  const binding = await readBinding(invocationId);
  const continuation = await readContinuationByClientRequest(binding.downstream_client_request_id, projectId);
  const executionId = continuation.execution_id;
  const initialRuns = await readExecutionRuns(projectId);
  const root = workflowRoot(initialRuns, executionId);
  assert.equal(root.status, 'RUNNING');
  assert.equal(childrenOf(initialRuns, root.run_id).length, 1);

  // Controlled fault injection uses the production PostgreSQL ledger API rather than
  // raw SQL or malformed browser output. A real Core-authorized deterministic candidate
  // is claimed under the exact ticket and terminalized FAILED to emulate a finished
  // local executor attempt. Recovery/retry/cancel remain browser-to-Core operations.
  const candidate = await executeOrthogonal(page, projectId, firstTicket);
  const claim = await ledger.claimV2({
    ticketId: firstTicket.ticketId,
    result: candidate.result,
    callerScope: firstTicket.scope,
    now: Date.now(),
  });
  assert.equal(claim.allowed, true, `controlled FAILED injection must admit exact result, got ${claim.reasonCode ?? 'unknown'}`);
  await ledger.commit(firstTicket.ticketId, 'FAILED');
  const failedFinalization = await ledger.getFinalization(firstTicket.ticketId);
  assert.equal(failedFinalization?.status, 'FAILED');
  assert.match(failedFinalization?.finalizedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);

  const retryableResponse = await browserJson(page, 'GET', `/automation-invocations/${encodeURIComponent(invocationId)}`);
  assert.equal(retryableResponse.status, 200);
  const retryable = retryableResponse.body;
  assert.equal(Object.hasOwn(retryable, 'executionId'), false);
  assert.equal(retryable.invocationId, invocationId);
  assert.equal(retryable.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(retryable.retryAvailable, true);
  assert.equal(retryable.attemptStatus, 'FAILED');
  assert.equal(retryable.nextAction, undefined, 'FAILED attempt must stop until explicit retry');
  assert.deepEqual(await readProjectState(projectId), baseline, 'FAILED Automation attempt must not mutate Project');

  const retryResponse = await browserJson(page, 'POST', `/automation-invocations/${encodeURIComponent(invocationId)}/retry`, {});
  assert.equal(retryResponse.status, 202);
  const retried = retryResponse.body;
  assert.equal(Object.hasOwn(retried, 'executionId'), false);
  assert.equal(retried.invocationId, invocationId);
  assert.equal(retried.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(retried.retryAvailable, undefined);
  assert.equal(retried.attemptStatus, undefined);
  assert.equal(retried.nextAction?.operation, 'ORTHOGONAL_TRANSFORM');
  assertTicket(retried.nextAction?.ticket, projectId, 'ORTHOGONAL_TRANSFORM');
  const replacementTicket = retried.nextAction.ticket;
  assert.notEqual(replacementTicket.ticketId, firstTicket.ticketId, 'retry must issue a new immutable local ticket');
  assert.notEqual(replacementTicket.nonce, firstTicket.nonce, 'retry ticket nonce must change');
  assert.equal(replacementTicket.workflowId, firstTicket.workflowId, 'retry must remain in the same durable workflow');
  assert.equal(replacementTicket.inputs[0].artifactId, firstTicket.inputs[0].artifactId, 'retry must preserve immutable source identity');

  const afterRetryContinuation = await readContinuation(executionId, projectId);
  assert.equal(afterRetryContinuation.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(afterRetryContinuation.current_step_id, ORTHOGONAL_TRANSFORM_STEP_ID);
  assert.equal(outstandingTicketId(afterRetryContinuation), replacementTicket.ticketId);
  const afterRetryRuns = await readExecutionRuns(projectId);
  const afterRetryRoot = workflowRoot(afterRetryRuns, executionId);
  assert.equal(afterRetryRoot.run_id, root.run_id, 'retry must retain the same canonical workflow root');
  assert.equal(afterRetryRoot.status, 'RUNNING');
  const retryChildren = childrenOf(afterRetryRuns, root.run_id);
  assert.equal(retryChildren.length, 2);
  const firstAttemptRun = retryChildren.find(run => run.authority_ref === firstTicket.ticketId);
  const replacementAttemptRun = retryChildren.find(run => run.authority_ref === replacementTicket.ticketId);
  assert(firstAttemptRun && replacementAttemptRun, 'Job Center must retain both immutable local attempts');
  assert.equal(firstAttemptRun.status, 'FAILED');
  assert.equal(firstAttemptRun.status_reason_code, 'LOCAL_EXECUTION_RETRIED');
  assert.equal(replacementAttemptRun.status, 'RUNNING');

  const cancelResponse = await browserJson(page, 'POST', `/automation-invocations/${encodeURIComponent(invocationId)}/cancel`, {});
  assert.equal(cancelResponse.status, 200);
  const cancelled = cancelResponse.body;
  assert.equal(Object.hasOwn(cancelled, 'executionId'), false);
  assert.equal(cancelled.invocationId, invocationId);
  assert.equal(cancelled.state, 'CANCELLED');
  assert.equal(cancelled.nextAction, undefined);
  assert.equal(cancelled.terminalArtifactId, undefined);
  assert.deepEqual(await readProjectState(projectId), baseline, 'cancelled Automation must not mutate Project');

  const cancelledContinuation = await readContinuation(executionId, projectId);
  assert.equal(cancelledContinuation.state, 'CANCELLED');
  assert.equal(cancelledContinuation.terminal_artifact_id, null);
  const cancelledRuns = await readExecutionRuns(projectId);
  const cancelledRoot = workflowRoot(cancelledRuns, executionId);
  assert.equal(cancelledRoot.run_id, root.run_id);
  assert.equal(cancelledRoot.status, 'CANCELLED');
  assert.equal(cancelledRoot.status_reason_code, 'WORKFLOW_CANCELLED');
  const cancelledChildren = childrenOf(cancelledRuns, root.run_id);
  assert.equal(cancelledChildren.length, 2);
  assert.equal(cancelledChildren.find(run => run.authority_ref === firstTicket.ticketId)?.status, 'FAILED');
  const cancelledReplacement = cancelledChildren.find(run => run.authority_ref === replacementTicket.ticketId);
  assert.equal(cancelledReplacement?.status, 'CANCELLED');
  assert.equal(cancelledReplacement?.status_reason_code, 'WORKFLOW_CANCELLED');

  const firstAuthority = await ledger.observe(firstTicket.ticketId, firstTicket.scope, Date.now());
  const replacementAuthority = await ledger.observe(replacementTicket.ticketId, replacementTicket.scope, Date.now());
  assert.equal(firstAuthority?.state, 'FINALIZED_FAILED');
  assert.equal(firstAuthority?.cancellation, 'UNSUPPORTED');
  assert.equal(replacementAuthority?.state, 'ACTIVE', 'workflow cancellation must not invent local-ticket cancellation authority');
  assert.equal(replacementAuthority?.cancellation, 'UNSUPPORTED');

  const rootsResponse = await browserJson(page, 'GET', `/execution-runs?${new URLSearchParams({ projectId })}`);
  assert.equal(rootsResponse.status, 200);
  const publicRoot = rootsResponse.body.runs.find(run => run.authorityKind === 'WORKFLOW_CONTINUATION' && run.authorityRef === executionId);
  assert(publicRoot, 'Job Center recovery transport must expose the cancelled Automation root');
  assert.equal(publicRoot.runId, root.run_id);
  assert.equal(publicRoot.status, 'CANCELLED');
  const childrenResponse = await browserJson(page, 'GET', `/execution-runs/${encodeURIComponent(root.run_id)}/children?${new URLSearchParams({ projectId })}`);
  assert.equal(childrenResponse.status, 200);
  assert.equal(childrenResponse.body.runs.length, 2);
  const publicOld = childrenResponse.body.runs.find(run => run.authorityRef === firstTicket.ticketId);
  const publicReplacement = childrenResponse.body.runs.find(run => run.authorityRef === replacementTicket.ticketId);
  assert.equal(publicOld?.status, 'FAILED');
  assert.equal(publicOld?.localExecution?.state, 'FINALIZED_FAILED');
  assert.equal(publicOld?.localExecution?.cancellation, 'UNSUPPORTED');
  assert.equal(publicReplacement?.status, 'CANCELLED');
  assert.equal(publicReplacement?.localExecution?.state, 'ACTIVE');
  assert.equal(publicReplacement?.localExecution?.cancellation, 'UNSUPPORTED');

  const bindingAfter = await readBinding(invocationId);
  assert.deepEqual(bindingAfter, binding, 'retry/cancel must not mutate immutable Automation invocation binding');
  const financialAfter = await readFinancialState();
  assert.deepEqual(financialAfter, financialBefore, 'LOCAL_ONLY retry/cancel must not mutate financial authority');
  assert.equal(providerCalls, 0, 'retry/cancel must never reach provider boundary');
  assert.deepEqual(diagnostics.agentRequests, [], 'Automation browser must never call Agent transport directly');
  assert.deepEqual(diagnostics.creativeRequests, [], 'Automation retry/cancel must not route through generic Creative authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'Automation retry/cancel browser must not call Billing/credits APIs');
  assert.deepEqual(diagnostics.projectMutations, [], 'retry/cancel must never mutate Project');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'retry/cancel browser journey must not call external origins');
  assert.equal(diagnostics.localExecutionRequests.length, 2, 'fault injection candidate must use exactly Orthogonal input+upload');
  assert.equal(diagnostics.localExecutionRequests.some(entry => /\/prepare$|\/result$/.test(entry.path)), false, 'workflow retry scenario must not use standalone local prepare/result transport');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.consoleErrors.length, 0, `unexpected browser console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('C3B_BROWSER_AUTOMATION_RETRY_CANCEL_ACCEPTED', JSON.stringify({
    projectId,
    automationId: definition.id,
    invocationId,
    executionId,
    rootRunId: root.run_id,
    firstTicketId: firstTicket.ticketId,
    replacementTicketId: replacementTicket.ticketId,
    automationRequests: diagnostics.automationRequests,
    localExecutionRequests: diagnostics.localExecutionRequests,
    executionRunRequests: diagnostics.executionRunRequests,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `C3b retry/cancel browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
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
    prepareOrthogonalTransform: async () => { throw new Error('C3b retry scenario must not prepare a second Orthogonal ticket'); },
    uploadOrthogonalTransformImage: ({ ticketId, projectId: scopedProjectId, bytes }) => browserLocalUpload(page, 'orthogonal-transform', ticketId, scopedProjectId, bytes),
    submitOrthogonalTransform: async () => { throw new Error('C3b retry fault injection must not finalize through standalone Orthogonal transport'); },
  }, {
    loadImage: async artifactId => {
      assert.equal(artifactId, sourceArtifactId);
      return Object.freeze({ width: delivered.width, height: delivered.height, data: new Uint8ClampedArray(delivered.bytes), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' });
    },
    sha256: async artifactId => { assert.equal(artifactId, sourceArtifactId); return delivered.sourceSha256; },
  }, () => ++clock);
  return executor.runPrepared({ ticket, sourceArtifactId, mode: ticket.operation.parameters.mode });
}

function assertTicket(ticket, projectId, operation) {
  assert(ticket && typeof ticket === 'object');
  assert.equal(ticket.version, '2');
  assert.equal(ticket.issuer, 'CORE');
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.scope?.tenantId, tenantId);
  assert.equal(ticket.scope?.userId, userId);
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
      if (!window.__c3bRetryCsrf) throw new Error('C3b retry browser CSRF token is unavailable');
      headers.set('X-Bers-CSRF-Token', window.__c3bRetryCsrf);
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
    if (!response.ok) throw new Error(`C3b retry local input failed with HTTP ${response.status}`);
    const width = Number(response.headers.get('X-Bers-Local-Input-Width'));
    const height = Number(response.headers.get('X-Bers-Local-Input-Height'));
    const sourceSha256 = String(response.headers.get('X-Bers-Local-Source-Sha256') || '').toLowerCase();
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    return { width, height, sourceSha256, bytes };
  }, { expectedCoreOrigin: coreOrigin, operation, ticketId, projectId });
}

async function browserLocalUpload(page, operation, ticketId, projectId, bytes) {
  return page.evaluate(async ({ expectedCoreOrigin, operation, ticketId, projectId, bytes }) => {
    if (!window.__c3bRetryCsrf) throw new Error('C3b retry browser CSRF token is unavailable for local upload');
    const query = new URLSearchParams({ projectId });
    const response = await fetch(`${expectedCoreOrigin}/api/core/local-execution/${operation}/${encodeURIComponent(ticketId)}/image-upload?${query}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'image/png', 'X-Bers-CSRF-Token': window.__c3bRetryCsrf },
      body: Uint8Array.from(bytes),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(`C3b retry local upload failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }, { expectedCoreOrigin: coreOrigin, operation, ticketId, projectId, bytes: Array.from(bytes) });
}

async function ensureBrowserCsrf(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const value = await page.evaluate(() => window.__c3bRetryCsrf);
    if (typeof value === 'string' && value.length > 0) return value;
    await browserJson(page, 'GET', '/auth/context');
    await page.waitForTimeout(50);
  }
  const value = await page.evaluate(() => window.__c3bRetryCsrf);
  assert.equal(typeof value, 'string', 'authenticated retry browser must receive CSRF token from Core');
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
    if (pathName === '/api/core/automations' || pathName.startsWith('/api/core/automations/') || pathName.startsWith('/api/core/automation-invocations/')) diagnostics.automationRequests.push(entry);
    if (pathName.startsWith('/api/core/agent/')) diagnostics.agentRequests.push(entry);
    if (pathName.startsWith('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (pathName.startsWith('/api/core/execution-runs')) diagnostics.executionRunRequests.push(entry);
    if (pathName.startsWith('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (!['GET', 'HEAD'].includes(method) && pathName.startsWith('/api/core/projects/')) diagnostics.projectMutations.push(`${method} ${pathName}`);
  });
}

async function readBinding(invocationId) {
  const result = await pool.query(
    `SELECT invocation_id::text,tenant_id,user_id,automation_id::text,definition_revision,project_id::text,
            source_image_storage_id::text,source_role,client_request_id,downstream_client_request_id,
            plan_kind,orthogonal_mode,target_width,target_height,plan_digest
       FROM canonical_automation_invocation_bindings
      WHERE invocation_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [invocationId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'Automation invocation binding must exist in exact authenticated scope');
  return result.rows[0];
}

async function readContinuationByClientRequest(clientRequestId, projectId) {
  const result = await pool.query(
    `SELECT execution_id,client_request_id,project_id,state,current_step_id,outstanding_local_json,terminal_artifact_id,failure_code,revision
       FROM workflow_continuations
      WHERE client_request_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`,
    [clientRequestId, projectId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'Automation downstream binding must resolve to one workflow continuation');
  return result.rows[0];
}

async function readContinuation(executionId, projectId) {
  const result = await pool.query(
    `SELECT execution_id,client_request_id,project_id,state,current_step_id,outstanding_local_json,terminal_artifact_id,failure_code,revision
       FROM workflow_continuations
      WHERE execution_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`,
    [executionId, projectId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'Automation continuation must remain in exact authenticated Project scope');
  return result.rows[0];
}

function outstandingTicketId(row) {
  const value = typeof row.outstanding_local_json === 'string'
    ? JSON.parse(row.outstanding_local_json)
    : row.outstanding_local_json;
  return value?.ticketId ?? value?.ticket_id;
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
  assert.equal(roots.length, 1, 'Automation must retain exactly one canonical workflow root');
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
  assert.equal(projectResult.rowCount, 1, 'canonical Project must exist for C3b retry browser user');
  const row = projectResult.rows[0];
  const historyResult = await pool.query(
    `SELECT h.history_id,h.ordinal,h.image_storage_id,h.source_image_storage_id,h.kind,h.instruction
       FROM canonical_project_history h
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

async function readFinancialState() {
  const [wallets, reservations, journal, entitlements, grants] = await Promise.all([
    pool.query('SELECT owner_id,total_credited,lifetime_spent,balance,reserved,version FROM credit_wallets WHERE owner_id=$1 ORDER BY owner_id', [userId]),
    pool.query('SELECT id,owner_id,project_id,provider,amount,status,provider_state FROM credit_reservations WHERE owner_id=$1 ORDER BY id', [userId]),
    pool.query(`SELECT j.id,j.reservation_id,j.sequence,j.event,j.source
                  FROM transaction_journal j
                  JOIN credit_reservations r ON r.id=j.reservation_id
                 WHERE r.owner_id=$1 ORDER BY j.reservation_id,j.sequence`, [userId]),
    pool.query('SELECT owner_id,tenant_id,plan_id,state,source,entitlement_revision FROM financial_entitlement_accounts WHERE owner_id=$1 ORDER BY owner_id', [userId]),
    pool.query('SELECT id,tenant_id,owner_id,grant_kind,source,amount FROM credit_grants WHERE owner_id=$1 ORDER BY id', [userId]),
  ]);
  return Object.freeze({
    wallets: Object.freeze(wallets.rows.map(row => Object.freeze({ ...row }))),
    reservations: Object.freeze(reservations.rows.map(row => Object.freeze({ ...row }))),
    journal: Object.freeze(journal.rows.map(row => Object.freeze({ ...row }))),
    entitlements: Object.freeze(entitlements.rows.map(row => Object.freeze({ ...row }))),
    grants: Object.freeze(grants.rows.map(row => Object.freeze({ ...row }))),
  });
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
