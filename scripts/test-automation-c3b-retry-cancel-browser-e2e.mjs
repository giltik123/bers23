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
const coreEntry = path.resolve('dist-server/server.mjs');
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');
const tenantId = 'automation-c3b-retry-tenant';
const userId = 'automation-c3b-retry-user';
const email = 'automation-c3b-retry@example.test';
const password = `automation-c3b-retry-password-${'x'.repeat(32)}`;
const mode = 'FLIP_HORIZONTAL';
const target = Object.freeze({ width: 7, height: 5 });

for (const name of ['FAL_KEY','JWT_SECRET','AUTH_CHALLENGE_SECRET','RESEND_API_KEY','GOOGLE_OAUTH_CLIENT_SECRET','ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from CI`);
}
await assertFile(path.resolve('dist/index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);
assert.equal(process.env.VITE_CORE_API_URL, `${coreOrigin}/api/core`);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-c3b-retry-cancel-browser-e2e' });
const ledger = new PostgresLocalExecutionLedger(pool);
await new PostgresAuthStore(pool).provisionLocalUser({ tenantId, userId, email, password, displayName: 'C3b Retry Browser User' });
const sourcePng = await sharp({ create: { width: 11, height: 9, channels: 4, background: { r: 73, g: 119, b: 43, alpha: 1 } } }).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((_request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.end('provider boundary forbidden');
});
await listen(providerTrap, providerPort);

const coreLogs = [];
const frontendLogs = [];
const core = spawn(process.execPath, [coreEntry], {
  env: {
    ...process.env,
    NODE_ENV: 'production', PORT: String(corePort), DATABASE_URL: databaseUrl,
    CREATIVE_PROVIDER: 'FAL', FAL_BASE_URL: providerOrigin,
    JWT_ISSUER: 'automation-c3b-retry-core', JWT_AUDIENCE: 'automation-c3b-retry-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId, AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS C3b Retry <auth@example.test>', GOOGLE_OAUTH_CLIENT_ID: 'automation-c3b-retry-google-unused',
    ALLOWED_WEB_ORIGINS: frontendOrigin, TRUSTED_PROXY_HEADER_MODE: 'NONE',
    HARD_BUDGET_CREDITS: '1', CREDITS_PER_EDIT: '1', REQUEST_BODY_LIMIT_BYTES: '262144',
    MASK_UPLOAD_LIMIT_BYTES: '1048576', MASK_MAX_DIMENSION: '1024', IMAGE_UPLOAD_LIMIT_BYTES: '2097152',
    IMAGE_MAX_DIMENSION: '1024', IMAGE_MAX_PIXELS: '1048576', REQUEST_TIMEOUT_MS: '15000', PROVIDER_TIMEOUT_MS: '2000', SHUTDOWN_TIMEOUT_MS: '3000',
  },
  stdio: ['ignore','pipe','pipe'],
});
core.stdout.on('data', chunk => coreLogs.push(String(chunk)));
core.stderr.on('data', chunk => coreLogs.push(String(chunk)));

let frontend;
let browser;
const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [], automationRequests: [], agentRequests: [], localExecutionRequests: [], executionRunRequests: [], creativeRequests: [], financialRequests: [], projectMutations: [], externalBrowserRequests: [] };

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = spawn(process.execPath, [viteEntry, 'preview', '--host', host, '--port', String(frontendPort), '--strictPort'], { env: process.env, stdio: ['ignore','pipe','pipe'] });
  frontend.stdout.on('data', chunk => frontendLogs.push(String(chunk)));
  frontend.stderr.on('data', chunk => frontendLogs.push(String(chunk)));
  await waitForHttp(frontendOrigin, 15_000, frontend);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.__c3bRetryCsrf = null;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const csrf = response.headers.get('X-Bers-CSRF-Token');
      if (csrf) window.__c3bRetryCsrf = csrf;
      return response;
    };
  });
  const page = await context.newPage();
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
  assert(projectId);
  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  await ensureCsrf(page);

  const baseline = await readProject(projectId);
  const financialBefore = await readFinancial();
  resetDiagnostics();

  const definitionResponse = await browserJson(page, 'POST', '/automations', {
    name: 'C3b retry cancel acceptance', trigger: 'MANUAL',
    plan: { kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1', orthogonal_mode: mode, target_width: target.width, target_height: target.height },
  });
  assert.equal(definitionResponse.status, 201);
  const definition = definitionResponse.body;

  const started = await browserJson(page, 'POST', `/automations/${encodeURIComponent(definition.id)}/manual-runs`,
    { projectId, clientRequestId: 'c3b-browser-retry-cancel-1' }, { 'X-Expected-Automation-Revision': '1' });
  assert.equal(started.status, 202);
  assert.equal(Object.hasOwn(started.body, 'executionId'), false);
  assert.equal(started.body.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(started.body.nextAction?.operation, 'ORTHOGONAL_TRANSFORM');
  const invocationId = started.body.invocationId;
  const firstTicket = started.body.nextAction.ticket;
  assertTicket(firstTicket, projectId);

  const binding = await readBinding(invocationId);
  const initialContinuation = await readContinuationByClientRequest(binding.downstream_client_request_id, projectId);
  const executionId = initialContinuation.execution_id;
  assert.equal(initialContinuation.outstanding_ticket_id, firstTicket.ticketId);
  const initialRuns = await readRuns(projectId);
  const root = workflowRoot(initialRuns, executionId);
  assert.equal(root.status, 'RUNNING');
  assert.equal(childrenOf(initialRuns, root.run_id).length, 1);

  // Controlled failure: validate a real browser-produced Core-authorized result through
  // the production PostgreSQL ledger, then terminalize that admitted attempt FAILED.
  // No raw SQL mutates the ticket and no malformed candidate is reclassified as retryable.
  const candidate = await executeOrthogonal(page, projectId, firstTicket);
  const claim = await ledger.claimV2({ ticketId: firstTicket.ticketId, result: candidate.result, callerScope: firstTicket.scope, now: Date.now() });
  assert.equal(claim.allowed, true, `exact candidate must be admitted before controlled FAILED, got ${claim.reasonCode ?? 'unknown'}`);
  await ledger.commit(firstTicket.ticketId, 'FAILED');
  assert.equal((await ledger.getFinalization(firstTicket.ticketId))?.status, 'FAILED');

  const observedFailure = await browserJson(page, 'GET', `/automation-invocations/${encodeURIComponent(invocationId)}`);
  assert.equal(observedFailure.status, 200);
  assert.equal(Object.hasOwn(observedFailure.body, 'executionId'), false);
  assert.equal(observedFailure.body.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(observedFailure.body.retryAvailable, true);
  assert.equal(observedFailure.body.attemptStatus, 'FAILED');
  assert.equal(observedFailure.body.nextAction, undefined);
  assert.deepEqual(await readProject(projectId), baseline);

  const retry = await browserJson(page, 'POST', `/automation-invocations/${encodeURIComponent(invocationId)}/retry`, {});
  assert.equal(retry.status, 202);
  assert.equal(Object.hasOwn(retry.body, 'executionId'), false);
  assert.equal(retry.body.invocationId, invocationId);
  assert.equal(retry.body.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(retry.body.nextAction?.operation, 'ORTHOGONAL_TRANSFORM');
  const replacementTicket = retry.body.nextAction.ticket;
  assertTicket(replacementTicket, projectId);
  assert.notEqual(replacementTicket.ticketId, firstTicket.ticketId);
  assert.notEqual(replacementTicket.nonce, firstTicket.nonce);
  assert.equal(replacementTicket.workflowId, firstTicket.workflowId);
  assert.equal(replacementTicket.inputs[0].artifactId, firstTicket.inputs[0].artifactId);

  const afterRetry = await readContinuation(executionId, projectId);
  assert.equal(afterRetry.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(afterRetry.current_step_id, ORTHOGONAL_TRANSFORM_STEP_ID);
  assert.equal(afterRetry.outstanding_ticket_id, replacementTicket.ticketId);
  const retryRuns = await readRuns(projectId);
  const retryRoot = workflowRoot(retryRuns, executionId);
  assert.equal(retryRoot.run_id, root.run_id);
  assert.equal(retryRoot.status, 'RUNNING');
  const retryChildren = childrenOf(retryRuns, root.run_id);
  assert.equal(retryChildren.length, 2);
  const oldRun = retryChildren.find(run => run.authority_ref === firstTicket.ticketId);
  const replacementRun = retryChildren.find(run => run.authority_ref === replacementTicket.ticketId);
  assert.equal(oldRun?.status, 'FAILED');
  assert.equal(oldRun?.status_reason_code, 'LOCAL_EXECUTION_RETRIED');
  assert.equal(replacementRun?.status, 'RUNNING');

  const cancel = await browserJson(page, 'POST', `/automation-invocations/${encodeURIComponent(invocationId)}/cancel`, {});
  assert.equal(cancel.status, 200);
  assert.equal(Object.hasOwn(cancel.body, 'executionId'), false);
  assert.equal(cancel.body.invocationId, invocationId);
  assert.equal(cancel.body.state, 'CANCELLED');
  assert.equal(cancel.body.terminalArtifactId, undefined);
  assert.deepEqual(await readProject(projectId), baseline);

  const cancelledContinuation = await readContinuation(executionId, projectId);
  assert.equal(cancelledContinuation.state, 'CANCELLED');
  assert.equal(cancelledContinuation.terminal_artifact_id, null);
  const cancelledRuns = await readRuns(projectId);
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

  const oldAuthority = await ledger.observe(firstTicket.ticketId, firstTicket.scope, Date.now());
  const replacementAuthority = await ledger.observe(replacementTicket.ticketId, replacementTicket.scope, Date.now());
  assert.equal(oldAuthority?.state, 'FINALIZED_FAILED');
  assert.equal(oldAuthority?.cancellation, 'UNSUPPORTED');
  assert.equal(replacementAuthority?.state, 'ACTIVE', 'workflow cancellation must not invent local-ticket cancellation authority');
  assert.equal(replacementAuthority?.cancellation, 'UNSUPPORTED');

  const roots = await browserJson(page, 'GET', `/execution-runs?${new URLSearchParams({ projectId })}`);
  assert.equal(roots.status, 200);
  const publicRoot = roots.body.runs.find(run => run.authorityKind === 'WORKFLOW_CONTINUATION' && run.authorityRef === executionId);
  assert.equal(publicRoot?.runId, root.run_id);
  assert.equal(publicRoot?.status, 'CANCELLED');
  const children = await browserJson(page, 'GET', `/execution-runs/${encodeURIComponent(root.run_id)}/children?${new URLSearchParams({ projectId })}`);
  assert.equal(children.status, 200);
  assert.equal(children.body.runs.length, 2);
  const publicOld = children.body.runs.find(run => run.authorityRef === firstTicket.ticketId);
  const publicReplacement = children.body.runs.find(run => run.authorityRef === replacementTicket.ticketId);
  assert.equal(publicOld?.status, 'FAILED');
  assert.equal(publicOld?.localExecution?.state, 'FINALIZED_FAILED');
  assert.equal(publicOld?.localExecution?.cancellation, 'UNSUPPORTED');
  assert.equal(publicReplacement?.status, 'CANCELLED');
  assert.equal(publicReplacement?.localExecution?.state, 'ACTIVE');
  assert.equal(publicReplacement?.localExecution?.cancellation, 'UNSUPPORTED');

  assert.deepEqual(await readBinding(invocationId), binding);
  assert.deepEqual(await readFinancial(), financialBefore);
  assert.equal(providerCalls, 0);
  assert.deepEqual(diagnostics.agentRequests, []);
  assert.deepEqual(diagnostics.creativeRequests, []);
  assert.deepEqual(diagnostics.financialRequests, []);
  assert.deepEqual(diagnostics.projectMutations, []);
  assert.deepEqual(diagnostics.externalBrowserRequests, []);
  assert.equal(diagnostics.localExecutionRequests.length, 2, 'controlled candidate uses only Orthogonal input+upload');
  assert.equal(diagnostics.localExecutionRequests.some(entry => /\/prepare$|\/result$/.test(entry.path)), false);
  assert.equal(diagnostics.pageErrors.length, 0, JSON.stringify(diagnostics.pageErrors));
  assert.equal(diagnostics.consoleErrors.length, 0, JSON.stringify(diagnostics.consoleErrors));
  assert.equal(diagnostics.requestFailures.length, 0, JSON.stringify(diagnostics.requestFailures));

  console.log('C3B_BROWSER_AUTOMATION_RETRY_CANCEL_ACCEPTED', JSON.stringify({
    projectId, automationId: definition.id, invocationId, executionId, rootRunId: root.run_id,
    firstTicketId: firstTicket.ticketId, replacementTicketId: replacementTicket.ticketId,
    automationRequests: diagnostics.automationRequests, localExecutionRequests: diagnostics.localExecutionRequests, executionRunRequests: diagnostics.executionRunRequests,
  }));
  await context.close();
} catch (error) {
  throw new Error([
    `C3b retry/cancel browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`, `providerCalls=${providerCalls}`,
    `coreLogs=${coreLogs.join('').slice(-18000)}`, `frontendLogs=${frontendLogs.join('').slice(-8000)}`,
  ].join('\n'));
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
  const delivered = await browserLocalInput(page, ticket.ticketId, projectId);
  assert.equal(delivered.sourceSha256, ticket.inputs[0].sha256.toLowerCase());
  let clock = 10;
  const executor = new CoreAuthorizedOrthogonalTransform(projectId, {
    prepareOrthogonalTransform: async () => { throw new Error('workflow must not prepare another ticket'); },
    uploadOrthogonalTransformImage: ({ ticketId, projectId: scopedProjectId, bytes }) => browserLocalUpload(page, ticketId, scopedProjectId, bytes),
    submitOrthogonalTransform: async () => { throw new Error('fault injection must not use standalone result'); },
  }, {
    loadImage: async artifactId => {
      assert.equal(artifactId, sourceArtifactId);
      return Object.freeze({ width: delivered.width, height: delivered.height, data: new Uint8ClampedArray(delivered.bytes), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' });
    },
    sha256: async artifactId => { assert.equal(artifactId, sourceArtifactId); return delivered.sourceSha256; },
  }, () => ++clock);
  return executor.runPrepared({ ticket, sourceArtifactId, mode: ticket.operation.parameters.mode });
}

function assertTicket(ticket, projectId) {
  assert(ticket && typeof ticket === 'object');
  assert.equal(ticket.version, '2'); assert.equal(ticket.issuer, 'CORE'); assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.scope?.tenantId, tenantId); assert.equal(ticket.scope?.userId, userId); assert.equal(ticket.scope?.projectId, projectId);
  assert.equal(ticket.operation?.type, 'ORTHOGONAL_TRANSFORM'); assert.equal(ticket.cost?.providerCalls, 0); assert.equal(ticket.cost?.paidCloudCredits, 0); assert.equal(ticket.inputs?.length, 1);
}

async function browserJson(page, method, pathName, body, extraHeaders = {}) {
  return page.evaluate(async ({ origin, method, pathName, body, hasBody, extraHeaders }) => {
    const headers = new Headers(extraHeaders);
    if (hasBody) headers.set('Content-Type', 'application/json');
    if (!['GET','HEAD','OPTIONS'].includes(method)) {
      if (!window.__c3bRetryCsrf) throw new Error('CSRF token unavailable');
      headers.set('X-Bers-CSRF-Token', window.__c3bRetryCsrf);
    }
    const response = await fetch(`${origin}/api/core${pathName}`, { method, credentials: 'include', headers, ...(hasBody ? { body: JSON.stringify(body) } : {}) });
    const responseBody = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    return { status: response.status, body: responseBody };
  }, { origin: coreOrigin, method, pathName, body, hasBody: body !== undefined, extraHeaders });
}

async function browserLocalInput(page, ticketId, projectId) {
  return page.evaluate(async ({ origin, ticketId, projectId }) => {
    const response = await fetch(`${origin}/api/core/local-execution/orthogonal-transform/${encodeURIComponent(ticketId)}/inputs?${new URLSearchParams({ projectId })}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`local input HTTP ${response.status}`);
    return { width: Number(response.headers.get('X-Bers-Local-Input-Width')), height: Number(response.headers.get('X-Bers-Local-Input-Height')), sourceSha256: String(response.headers.get('X-Bers-Local-Source-Sha256') || '').toLowerCase(), bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
  }, { origin: coreOrigin, ticketId, projectId });
}

async function browserLocalUpload(page, ticketId, projectId, bytes) {
  return page.evaluate(async ({ origin, ticketId, projectId, bytes }) => {
    if (!window.__c3bRetryCsrf) throw new Error('CSRF token unavailable for local upload');
    const response = await fetch(`${origin}/api/core/local-execution/orthogonal-transform/${encodeURIComponent(ticketId)}/image-upload?${new URLSearchParams({ projectId })}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/png', 'X-Bers-CSRF-Token': window.__c3bRetryCsrf }, body: Uint8Array.from(bytes),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(`local upload HTTP ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }, { origin: coreOrigin, ticketId, projectId, bytes: Array.from(bytes) });
}

async function ensureCsrf(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const value = await page.evaluate(() => window.__c3bRetryCsrf);
    if (typeof value === 'string' && value) return value;
    await browserJson(page, 'GET', '/auth/context');
    await page.waitForTimeout(50);
  }
  const value = await page.evaluate(() => window.__c3bRetryCsrf);
  assert.equal(typeof value, 'string'); assert.ok(value.length > 0); return value;
}

function resetDiagnostics() { for (const key of Object.keys(diagnostics)) diagnostics[key].length = 0; }
function attachDiagnostics(page) {
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText }));
  page.on('request', request => {
    let url; try { url = new URL(request.url()); } catch { return; }
    if (url.origin !== frontendOrigin && url.origin !== coreOrigin) diagnostics.externalBrowserRequests.push(request.url());
    if (url.origin !== coreOrigin || request.method() === 'OPTIONS') return;
    const entry = Object.freeze({ method: request.method(), path: url.pathname });
    if (url.pathname === '/api/core/automations' || url.pathname.startsWith('/api/core/automations/') || url.pathname.startsWith('/api/core/automation-invocations/')) diagnostics.automationRequests.push(entry);
    if (url.pathname.startsWith('/api/core/agent/')) diagnostics.agentRequests.push(entry);
    if (url.pathname.startsWith('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (url.pathname.startsWith('/api/core/execution-runs')) diagnostics.executionRunRequests.push(entry);
    if (url.pathname.startsWith('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(url.pathname)) diagnostics.financialRequests.push(entry);
    if (!['GET','HEAD'].includes(request.method()) && url.pathname.startsWith('/api/core/projects/')) diagnostics.projectMutations.push(`${request.method()} ${url.pathname}`);
  });
}

async function readBinding(invocationId) {
  const result = await pool.query(`SELECT invocation_id::text,tenant_id,user_id,automation_id::text,definition_revision,project_id::text,source_image_storage_id::text,source_role,client_request_id,downstream_client_request_id,plan_kind,orthogonal_mode,target_width,target_height,plan_digest FROM canonical_automation_invocation_bindings WHERE invocation_id=$1 AND tenant_id=$2 AND user_id=$3`, [invocationId, tenantId, userId]);
  assert.equal(result.rowCount, 1); return result.rows[0];
}
async function readContinuationByClientRequest(clientRequestId, projectId) {
  const result = await pool.query(`SELECT execution_id,client_request_id,project_id,state,current_step_id,outstanding_ticket_id,terminal_artifact_id,failure_code,revision FROM workflow_continuations WHERE client_request_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`, [clientRequestId, projectId, tenantId, userId]);
  assert.equal(result.rowCount, 1); return result.rows[0];
}
async function readContinuation(executionId, projectId) {
  const result = await pool.query(`SELECT execution_id,client_request_id,project_id,state,current_step_id,outstanding_ticket_id,terminal_artifact_id,failure_code,revision FROM workflow_continuations WHERE execution_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`, [executionId, projectId, tenantId, userId]);
  assert.equal(result.rowCount, 1); return result.rows[0];
}
async function readRuns(projectId) {
  return (await pool.query(`SELECT run_id::text,capability,authority_kind,authority_ref,parent_run_id::text,status,revision,status_reason_code FROM canonical_execution_runs WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 ORDER BY created_at ASC,run_id ASC`, [projectId, tenantId, userId])).rows;
}
function workflowRoot(runs, executionId) { const roots = runs.filter(run => run.parent_run_id === null && run.capability === 'WORKFLOW_CONTINUATION' && run.authority_kind === 'WORKFLOW_CONTINUATION' && run.authority_ref === executionId); assert.equal(roots.length, 1); return roots[0]; }
function childrenOf(runs, runId) { return runs.filter(run => run.parent_run_id === runId); }

async function readProject(projectId) {
  const p = await pool.query(`SELECT p.project_id,p.original_image_storage_id,p.current_image_storage_id,p.width,p.height,p.history_cursor_id,c.ordinal AS cursor_ordinal,c.kind AS cursor_kind FROM canonical_projects p JOIN canonical_project_history c ON c.history_id=p.history_cursor_id WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`, [projectId, tenantId, userId]);
  assert.equal(p.rowCount, 1);
  const h = await pool.query(`SELECT history_id,ordinal,image_storage_id,source_image_storage_id,kind,instruction FROM canonical_project_history WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND retired_at IS NULL ORDER BY ordinal ASC`, [projectId, tenantId, userId]);
  return Object.freeze({ project: Object.freeze({ project_id: p.rows[0].project_id, original_image_storage_id: p.rows[0].original_image_storage_id, current_image_storage_id: p.rows[0].current_image_storage_id, width: p.rows[0].width, height: p.rows[0].height, history_cursor_id: p.rows[0].history_cursor_id }), cursor: Object.freeze({ ordinal: p.rows[0].cursor_ordinal, kind: p.rows[0].cursor_kind }), history: Object.freeze(h.rows.map(row => Object.freeze({ ...row }))) });
}
async function readFinancial() {
  const [wallets,reservations,journal,entitlements,grants] = await Promise.all([
    pool.query('SELECT owner_id,total_credited,lifetime_spent,balance,reserved,version FROM credit_wallets WHERE owner_id=$1 ORDER BY owner_id',[userId]),
    pool.query('SELECT id,owner_id,project_id,provider,amount,status,provider_state FROM credit_reservations WHERE owner_id=$1 ORDER BY id',[userId]),
    pool.query(`SELECT j.id,j.reservation_id,j.sequence,j.event,j.source FROM transaction_journal j JOIN credit_reservations r ON r.id=j.reservation_id WHERE r.owner_id=$1 ORDER BY j.reservation_id,j.sequence`,[userId]),
    pool.query('SELECT owner_id,tenant_id,plan_id,state,source,entitlement_revision FROM financial_entitlement_accounts WHERE owner_id=$1 ORDER BY owner_id',[userId]),
    pool.query('SELECT id,tenant_id,owner_id,grant_kind,source,amount FROM credit_grants WHERE owner_id=$1 ORDER BY id',[userId]),
  ]);
  return Object.freeze({ wallets: wallets.rows, reservations: reservations.rows, journal: journal.rows, entitlements: entitlements.rows, grants: grants.rows });
}

async function waitForHttp(url, timeoutMs, child) { const deadline = Date.now() + timeoutMs; let lastError; while (Date.now() < deadline) { if (child.exitCode !== null) throw new Error(`process exited before ${url} became ready`); try { const response = await fetch(url, { redirect: 'manual' }); if (response.status >= 200 && response.status < 500) return; lastError = new Error(`HTTP ${response.status}`); } catch (error) { lastError = error; } await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`); }
async function listen(server, port) { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
async function closeServer(server) { if (!server.listening) return; await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
async function stopChild(child) { if (!child || child.exitCode !== null) return; child.kill('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3_000))]); if (child.exitCode === null) child.kill('SIGKILL'); }
async function assertFile(file) { const stat = await fs.stat(file).catch(() => undefined); assert(stat?.isFile(), `required built file missing: ${file}`); }
