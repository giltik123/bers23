import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import sharp from 'sharp';

import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: C3c Studio browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4207;
const corePort = 4208;
const providerPort = 4209;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');
const tenantId = 'automation-c3c-studio-tenant';
const userId = 'automation-c3c-studio-user';
const email = 'automation-c3c-studio@example.test';
const password = `automation-c3c-studio-password-${'x'.repeat(32)}`;
const mode = 'ROTATE_90_CW';
const target = Object.freeze({ width: 6, height: 5 });
const definitionName = 'C3c canonical Studio acceptance';

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);
assert.equal(process.env.VITE_CORE_API_URL, `${coreOrigin}/api/core`, 'C3c harness Core origin must exactly match the release SPA');

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-c3c-studio-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'C3c Studio Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 43, g: 91, b: 157, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'C3C_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'automation-c3c-studio-core',
    JWT_AUDIENCE: 'automation-c3c-studio',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS C3c <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'automation-c3c-google-unused',
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
  manualStarts: [],
  invocationResults: [],
  agentRequests: [],
  localExecutionRequests: [],
  creativeRequests: [],
  financialRequests: [],
  projectMutations: [],
  externalBrowserRequests: [],
};

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = spawn(process.execPath, [viteEntry, 'preview', '--host', host, '--port', String(frontendPort), '--strictPort'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  frontend.stdout.on('data', chunk => frontendLogs.push(String(chunk)));
  frontend.stderr.on('data', chunk => frontendLogs.push(String(chunk)));
  await waitForHttp(frontendOrigin, 15_000, frontend);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const browserContext = await browser.newContext();
  await browserContext.addInitScript(({ expectedCoreOrigin }) => {
    const originalFetch = window.fetch.bind(window);
    window.__c3cDropNextStart = false;
    window.__c3cDropNextResult = false;
    window.__c3cDrops = [];
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      let url;
      try { url = new URL(response.url); } catch { return response; }
      if (url.origin !== expectedCoreOrigin || !response.ok) return response;
      const isStart = /^\/api\/core\/automations\/[^/]+\/manual-runs$/.test(url.pathname);
      const isResult = /^\/api\/core\/automation-invocations\/[^/]+\/result$/.test(url.pathname);
      if ((isStart && window.__c3cDropNextStart) || (isResult && window.__c3cDropNextResult)) {
        if (isStart) window.__c3cDropNextStart = false;
        if (isResult) window.__c3cDropNextResult = false;
        const payload = await response.clone().json().catch(() => null);
        window.__c3cDrops.push({
          kind: isStart ? 'start' : 'result',
          path: url.pathname,
          status: response.status,
          invocationId: payload?.invocationId ?? null,
          state: payload?.state ?? null,
          operation: payload?.nextAction?.operation ?? null,
          executionId: payload?.executionId ?? null,
        });
        await response.clone().arrayBuffer();
        throw new TypeError(isStart ? 'C3c injected start response ambiguity' : 'C3c injected result response ambiguity');
      }
      return response;
    };
  }, { expectedCoreOrigin: coreOrigin });

  const page = await browserContext.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-c3c`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'automation-c3c-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Project upload must navigate to Editor with canonical project id');
  const baseline = await readProjectState(projectId);
  assert.equal(baseline.width, 12);
  assert.equal(baseline.height, 8);
  assert.equal(baseline.cursorOrdinal, 0);
  const financialBefore = await readFinancialState();

  resetJourneyDiagnostics();
  await page.goto(`${frontendOrigin}/automations`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Automation Studio' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByLabel('Name').fill(definitionName);
  await page.getByLabel('Transform').selectOption(mode);
  await page.getByLabel('Target width').fill('7');
  await page.getByLabel('Target height').fill('6');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: 'Save revision' }).waitFor({ state: 'visible', timeout: 10_000 });

  let definition = await readDefinition(definitionName);
  assert.equal(Number(definition.revision), 1);
  assert.equal(definition.orthogonal_mode, mode);
  assert.equal(Number(definition.target_width), 7);
  assert.equal(Number(definition.target_height), 6);

  await page.getByLabel('Target width').fill(String(target.width));
  await page.getByLabel('Target height').fill(String(target.height));
  assert.equal(await page.getByRole('button', { name: 'Run' }).isDisabled(), true, 'unsaved UI draft must not run an older canonical revision');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await page.getByText('r2', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  definition = await readDefinition(definitionName);
  assert.equal(Number(definition.revision), 2);
  assert.equal(Number(definition.target_width), target.width);
  assert.equal(Number(definition.target_height), target.height);

  await page.getByLabel('Project').selectOption(projectId);
  await page.evaluate(() => { window.__c3cDropNextStart = true; });
  await page.getByRole('button', { name: 'Run' }).click();
  await page.getByRole('alert').filter({ hasText: 'C3c injected start response ambiguity' }).waitFor({ state: 'visible', timeout: 15_000 });
  assert.equal(diagnostics.manualStarts.length, 1);
  const firstClientRequestId = diagnostics.manualStarts[0].clientRequestId;
  assert.equal(typeof firstClientRequestId, 'string');
  assert.ok(firstClientRequestId.length > 0);

  const firstDrops = await page.evaluate(() => window.__c3cDrops);
  assert.equal(firstDrops.length, 1);
  assert.equal(firstDrops[0].kind, 'start');
  assert.equal(firstDrops[0].executionId, null, 'Automation public start response must not expose Agent executionId');
  const invocationId = firstDrops[0].invocationId;
  assert.equal(typeof invocationId, 'string');
  assert.ok(invocationId.length > 0);
  assert.equal(await invocationCount(firstClientRequestId), 1, 'ambiguous start must persist exactly one immutable invocation binding');
  assertProjectUnchanged(await readProjectState(projectId), baseline, 'ambiguous start');

  await page.evaluate(() => { window.__c3cDropNextResult = true; });
  await page.getByRole('button', { name: 'Run' }).click();
  await page.getByRole('alert').filter({ hasText: 'C3c injected result response ambiguity' }).waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(diagnostics.manualStarts.length, 2);
  assert.equal(diagnostics.manualStarts[1].clientRequestId, firstClientRequestId, 'UI must replay the same durable start intent after an ambiguous start response');
  assert.equal(await invocationCount(firstClientRequestId), 1, 'replayed start intent must not create another invocation binding');

  const dropsAfterResult = await page.evaluate(() => window.__c3cDrops);
  assert.equal(dropsAfterResult.length, 2);
  assert.equal(dropsAfterResult[1].kind, 'result');
  assert.equal(dropsAfterResult[1].invocationId, invocationId);
  assert.equal(dropsAfterResult[1].state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(dropsAfterResult[1].operation, 'RESIZE');
  assert.equal(dropsAfterResult[1].executionId, null);
  assert.equal(diagnostics.localExecutionRequests.length, 2, 'only Orthogonal input+upload should run before lost first result response');
  assertProjectUnchanged(await readProjectState(projectId), baseline, 'lost committed Orthogonal result');

  const persistedPointer = await page.evaluate(({ automationId, projectId }) => localStorage.getItem(`bers:automation-invocation:${automationId}:${projectId}`), { automationId: definition.automation_id, projectId });
  const pendingStartIntent = await page.evaluate(({ automationId, projectId }) => localStorage.getItem(`bers:automation-start-intent:${automationId}:${projectId}`), { automationId: definition.automation_id, projectId });
  assert.equal(persistedPointer, invocationId, 'accepted invocationId must be persisted before local execution can become ambiguous');
  assert.equal(pendingStartIntent, null, 'start intent pointer is cleared once canonical invocationId is observed');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Automation Studio' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByLabel('Project').selectOption(projectId);
  const resume = page.getByRole('button', { name: 'Resume latest' });
  await assertEventually(async () => !(await resume.isDisabled()), 'Resume latest must recover persisted invocation pointer');
  await resume.click();

  await page.getByRole('button', { name: 'Accept result into Project' }).waitFor({ state: 'visible', timeout: 25_000 });
  await page.getByAltText('Automation result preview').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText(`Invocation ${invocationId}`, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(diagnostics.localExecutionRequests.length, 4, 'reload recovery must run only the remaining Resize input+upload');
  assertProjectUnchanged(await readProjectState(projectId), baseline, 'terminal Automation preview');

  const binding = await readBinding(invocationId);
  assert.equal(binding.automation_id, definition.automation_id);
  assert.equal(Number(binding.definition_revision), 2);
  assert.equal(binding.client_request_id, firstClientRequestId);
  assert.equal(Number(binding.target_width), target.width);
  assert.equal(Number(binding.target_height), target.height);

  await page.getByRole('button', { name: 'Accept result into Project' }).click();
  await assertEventually(async () => {
    const state = await readProjectState(projectId);
    return state.width === target.width && state.height === target.height && state.cursorOrdinal === 1;
  }, 'explicit Studio Accept must advance canonical Project once');
  const accepted = await readProjectState(projectId);
  assert.equal(accepted.width, target.width);
  assert.equal(accepted.height, target.height);
  assert.equal(accepted.cursorOrdinal, 1);
  assert.notEqual(accepted.currentImageStorageId, baseline.currentImageStorageId);

  const financialAfter = await readFinancialState();
  assert.deepEqual(financialAfter, financialBefore, 'LOCAL_ONLY Automation Studio journey must not mutate financial authority');
  assert.equal(providerCalls, 0, 'Automation Studio bounded local workflow must never reach provider boundary');
  assert.deepEqual(diagnostics.agentRequests, [], 'Automation Studio browser must never call Agent transport directly');
  assert.deepEqual(diagnostics.creativeRequests, [], 'Automation Studio browser must not route through generic Creative/provider authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'Automation Studio browser must not call Billing/credits APIs');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'Automation Studio journey must not call external origins');
  assert.deepEqual(diagnostics.projectMutations, [`POST /api/core/projects/${projectId}/accept-final`], 'explicit Accept must be the only Project mutation');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.consoleErrors.length, 0, `unexpected console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected network request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('C3C_AUTOMATION_STUDIO_BROWSER_ACCEPTED', JSON.stringify({
    projectId,
    automationId: definition.automation_id,
    definitionRevision: Number(definition.revision),
    invocationId,
    clientRequestId: firstClientRequestId,
    startRequests: diagnostics.manualStarts,
    invocationResults: diagnostics.invocationResults,
    localExecutionRequests: diagnostics.localExecutionRequests,
    projectMutations: diagnostics.projectMutations,
  }));

  await browserContext.close();
} catch (error) {
  throw new Error([
    `C3c Studio browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`,
    `providerCalls=${providerCalls}`,
    `coreLogs=${coreLogs.join('').slice(-18000)}`,
    `frontendLogs=${frontendLogs.join('').slice(-8000)}`,
  ].join('\n'));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (frontend) await stopChild(frontend);
  await stopChild(core);
  await closeServer(providerTrap);
  await pool.end();
}

function attachDiagnostics(page) {
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText }));
  page.on('request', request => {
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.origin !== frontendOrigin && url.origin !== coreOrigin) diagnostics.externalBrowserRequests.push(request.url());
    if (url.origin !== coreOrigin || request.method() === 'OPTIONS') return;
    const method = request.method();
    const pathName = url.pathname;
    const entry = { method, path: pathName };
    if (pathName.startsWith('/api/core/automations') || pathName.startsWith('/api/core/automation-invocations/')) diagnostics.automationRequests.push(entry);
    if (/^\/api\/core\/automations\/[^/]+\/manual-runs$/.test(pathName) && method === 'POST') {
      let body;
      try { body = request.postDataJSON(); } catch { body = undefined; }
      diagnostics.manualStarts.push({ ...entry, clientRequestId: body?.clientRequestId ?? null, projectId: body?.projectId ?? null });
    }
    if (/^\/api\/core\/automation-invocations\/[^/]+\/result$/.test(pathName) && method === 'POST') diagnostics.invocationResults.push(entry);
    if (pathName.startsWith('/api/core/agent/')) diagnostics.agentRequests.push(entry);
    if (pathName.startsWith('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (pathName.startsWith('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (!['GET', 'HEAD'].includes(method) && pathName.startsWith('/api/core/projects/')) diagnostics.projectMutations.push(`${method} ${pathName}`);
  });
}

function resetJourneyDiagnostics() { for (const key of Object.keys(diagnostics)) diagnostics[key].length = 0; }

async function readDefinition(name) {
  const result = await pool.query(`SELECT automation_id::text,revision,status,trigger,plan_kind,orthogonal_mode,target_width,target_height
    FROM canonical_automation_definitions WHERE tenant_id=$1 AND user_id=$2 AND name=$3`, [tenantId, userId, name]);
  assert.equal(result.rowCount, 1, 'exact canonical Automation definition must exist');
  return result.rows[0];
}

async function invocationCount(clientRequestId) {
  const result = await pool.query(`SELECT count(*)::int AS count FROM canonical_automation_invocation_bindings
    WHERE tenant_id=$1 AND user_id=$2 AND client_request_id=$3`, [tenantId, userId, clientRequestId]);
  return Number(result.rows[0].count);
}

async function readBinding(invocationId) {
  const result = await pool.query(`SELECT invocation_id::text,automation_id::text,definition_revision,project_id::text,client_request_id,source_image_storage_id::text,source_role,target_width,target_height,downstream_client_request_id
    FROM canonical_automation_invocation_bindings WHERE invocation_id=$1 AND tenant_id=$2 AND user_id=$3`, [invocationId, tenantId, userId]);
  assert.equal(result.rowCount, 1, 'exact immutable invocation binding must exist');
  return result.rows[0];
}

async function readProjectState(projectId) {
  const result = await pool.query(`SELECT p.current_image_storage_id::text,p.width,p.height,c.ordinal AS cursor_ordinal
    FROM canonical_projects p JOIN canonical_project_history c ON c.history_id=p.history_cursor_id
    WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`, [projectId, tenantId, userId]);
  assert.equal(result.rowCount, 1, 'canonical Project must exist');
  const row = result.rows[0];
  return Object.freeze({ currentImageStorageId: row.current_image_storage_id, width: Number(row.width), height: Number(row.height), cursorOrdinal: Number(row.cursor_ordinal) });
}

function assertProjectUnchanged(actual, expected, phase) {
  assert.deepEqual(actual, expected, `${phase} must not mutate canonical Project`);
}

async function readFinancialState() {
  const [wallets, reservations, journal, entitlements, grants] = await Promise.all([
    pool.query('SELECT owner_id,total_credited,lifetime_spent,balance,reserved,version FROM credit_wallets WHERE owner_id=$1 ORDER BY owner_id', [userId]),
    pool.query('SELECT id,owner_id,project_id,provider,amount,status,provider_state FROM credit_reservations WHERE owner_id=$1 ORDER BY id', [userId]),
    pool.query(`SELECT j.id,j.reservation_id,j.sequence,j.event,j.source FROM transaction_journal j JOIN credit_reservations r ON r.id=j.reservation_id WHERE r.owner_id=$1 ORDER BY j.reservation_id,j.sequence`, [userId]),
    pool.query('SELECT owner_id,tenant_id,plan_id,state,source,entitlement_revision FROM financial_entitlement_accounts WHERE owner_id=$1 ORDER BY owner_id', [userId]),
    pool.query('SELECT id,tenant_id,owner_id,grant_kind,source,amount FROM credit_grants WHERE owner_id=$1 ORDER BY id', [userId]),
  ]);
  return JSON.parse(JSON.stringify({ wallets: wallets.rows, reservations: reservations.rows, journal: journal.rows, entitlements: entitlements.rows, grants: grants.rows }));
}

async function assertEventually(predicate, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; }
    catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${message}${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`);
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

async function listen(server, port) { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
async function closeServer(server) { if (!server.listening) return; await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function assertFile(file) { const stat = await fs.stat(file).catch(() => undefined); assert(stat?.isFile(), `required built file missing: ${file}`); }
