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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3f release browser E2E must use real PostgreSQL');

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
const tenantId = 'release-r3f-tenant';
const userId = 'release-r3f-user';
const email = 'release-r3f@example.test';
const password = `release-r3f-browser-password-${'x'.repeat(32)}`;
const localCapabilityError = 'Deterministic PNG encoding requires CompressionStream(deflate)';

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3f-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3f Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 53, g: 101, b: 149, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3F_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
});
await listen(providerTrap, providerPort);

const coreLogs = [];
const core = spawn(process.execPath, [coreEntry], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(corePort),
    DATABASE_URL: databaseUrl,
    CREATIVE_PROVIDER: 'FAL',
    FAL_BASE_URL: providerOrigin,
    JWT_ISSUER: 'release-r3f-core',
    JWT_AUDIENCE: 'release-r3f-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3f <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3f-google-unused',
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
  localExecutionRequests: [],
  creativeRequests: [],
  financialRequests: [],
  externalBrowserRequests: [],
  projectMutations: [],
};

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = spawn(process.execPath, [viteEntry, 'preview', '--host', host, '--port', String(frontendPort), '--strictPort'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForHttp(frontendOrigin, 15_000, frontend);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const browserContext = await browser.newContext();
  await browserContext.addInitScript(() => {
    Object.defineProperty(globalThis, 'CompressionStream', {
      configurable: true,
      writable: false,
      value: undefined,
    });
  });
  const page = await browserContext.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3f`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });
  assert.equal(await page.evaluate(() => typeof globalThis.CompressionStream), 'undefined', 'R3f must remove only the browser CompressionStream capability before SPA execution');

  await page.locator('input[type="file"]').setInputFiles({ name: 'release-r3f-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  const projectImage = await waitImage(page, 'Project', 12, 8);
  const initialProjectImageSrc = await projectImage.evaluate(element => element.src);

  const initial = await readProjectState(projectId);
  assert.equal(initial.project.width, 12);
  assert.equal(initial.project.height, 8);
  assert.equal(initial.cursor.ordinal, 0);
  assert.equal(initial.cursor.kind, 'ORIGINAL');
  assert.equal(initial.history.length, 1);
  assert.equal(await countCropArtifacts(projectId), 0);

  await page.getByRole('button', { name: 'Start crop' }).click();
  await page.getByRole('region', { name: 'Crop controls' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByLabel('Crop x').fill('2');
  await page.getByLabel('Crop y').fill('1');
  await page.getByLabel('Crop width').fill('8');
  await page.getByLabel('Crop height').fill('6');

  const apply = page.getByRole('button', { name: 'Apply crop' });
  await waitForEnabled(apply, 'Apply crop');

  const prepareResponsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'POST'
      && url.origin === coreOrigin
      && url.pathname === '/api/core/local-execution/crop/prepare';
  }, { timeout: 20_000 });
  const inputResponsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET'
      && url.origin === coreOrigin
      && /^\/api\/core\/local-execution\/crop\/[^/]+\/inputs$/.test(url.pathname);
  }, { timeout: 20_000 });

  await apply.click();
  const prepareResponse = await prepareResponsePromise;
  const inputResponse = await inputResponsePromise;
  assert.equal(prepareResponse.ok(), true, 'Core Crop prepare must succeed before the browser-local capability failure');
  assert.equal(inputResponse.ok(), true, 'canonical Crop input delivery must succeed before the browser-local capability failure');

  await page.getByText(localCapabilityError, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await waitForEnabled(apply, 'Apply crop after local failure');

  assert.equal(await page.getByRole('button', { name: 'Accept', exact: true }).count(), 0, 'local failure must not manufacture an Acceptable Preview');
  assert.equal(await page.getByRole('img', { name: 'after', exact: true }).count(), 0, 'local failure must not manufacture a Preview image');
  assert.equal(await projectImage.evaluate(element => element.src), initialProjectImageSrc, 'local failure must keep the Project image source unchanged');

  const failed = await readProjectState(projectId);
  assert.deepEqual(failed, initial, 'browser-local Crop failure must not mutate canonical Project image/history');
  assert.equal(await countCropArtifacts(projectId), 0, 'browser-local failure must not mint a canonical Crop FINAL artifact');

  const ticketRow = await readLatestCropTicket(projectId);
  const ticket = ticketRow.ticket_json;
  assert.equal(ticket.version, '2');
  assert.equal(ticket.issuer, 'CORE');
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.stepId, 'crop');
  assert.equal(ticket.operation?.type, 'CROP');
  assert.equal(ticket.cost?.providerCalls, 0);
  assert.equal(ticket.cost?.paidCloudCredits, 0);
  assert.equal(ticketRow.consumed_at, null, 'failed local execution ticket must remain unconsumed');
  assert.equal(ticketRow.finalized_status, null, 'failed local execution ticket must remain unfinalized');
  assert.equal(Array.isArray(ticket.inputs), true);
  assert.equal(ticket.inputs.length, 1);
  assert.equal(ticket.inputs[0].kind, 'image');
  assert.match(ticket.inputs[0].sha256 ?? '', /^[a-f0-9]{64}$/i);

  assert.deepEqual(diagnostics.localExecutionRequests, [
    'POST /api/core/local-execution/crop/prepare',
    `GET /api/core/local-execution/crop/${ticketRow.ticket_id}/inputs`,
  ], 'failed LOCAL_ONLY Crop must stop after prepare + canonical input delivery');
  assert.equal(providerCalls, 0, 'LOCAL_ONLY Crop failure must never reach provider boundary');
  assert.deepEqual(diagnostics.creativeRequests, [], 'LOCAL_ONLY Crop failure must not route through generic Creative/provider authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'LOCAL_ONLY Crop failure must not reach Billing/credits authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'browser must not call external origins after LOCAL_ONLY failure');
  assert.deepEqual(diagnostics.projectMutations, [], 'failed Crop must not mutate Project through Core');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3F_BROWSER_LOCAL_ONLY_FAILURE_ACCEPTED', JSON.stringify({
    projectId,
    ticketId: ticketRow.ticket_id,
    localCapabilityError,
    ticketPolicy: ticket.policy,
    ticketCost: ticket.cost,
    ticketConsumedAt: ticketRow.consumed_at,
    ticketFinalizedStatus: ticketRow.finalized_status,
    project: summarize(initial),
    localExecutionRequests: diagnostics.localExecutionRequests,
    providerCalls,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `R3f browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`,
    `providerCalls=${providerCalls}`,
    `coreLogs=${coreLogs.join('').slice(-16000)}`,
  ].join('\n');
  throw new Error(detail);
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
    if (url.origin !== coreOrigin) return;
    const pathName = url.pathname;
    const method = request.method();
    const entry = `${method} ${pathName}`;
    if (method !== 'OPTIONS' && pathName.includes('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (method !== 'OPTIONS' && pathName.includes('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (method !== 'OPTIONS' && /financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && pathName.includes('/api/core/projects/')) diagnostics.projectMutations.push(entry);
  });
}

async function readProjectState(projectId) {
  const projectResult = await pool.query(
    `SELECT p.project_id,p.original_image_storage_id,p.current_image_storage_id,p.width,p.height,p.history_cursor_id,
            c.ordinal AS cursor_ordinal,c.kind AS cursor_kind
       FROM canonical_projects p
       JOIN canonical_project_history c ON c.history_id=p.history_cursor_id
      WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`,
    [projectId, tenantId, userId],
  );
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for R3f browser user');
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

async function countCropArtifacts(projectId) {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM canonical_image_artifacts
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3
        AND producer_operation='CROP' AND revoked_at IS NULL AND deleted_at IS NULL`,
    [projectId, tenantId, userId],
  );
  return result.rows[0].count;
}

async function readLatestCropTicket(projectId) {
  const result = await pool.query(
    `SELECT ticket_id,ticket_json,consumed_at,finalized_status
       FROM local_execution_tickets
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND step_id='crop'
      ORDER BY created_at DESC
      LIMIT 1`,
    [projectId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'Crop prepare must persist a durable local execution ticket');
  return result.rows[0];
}

function summarize(state) {
  return Object.freeze({
    current: state.project.current_image_storage_id,
    dimensions: [state.project.width, state.project.height],
    cursor: state.cursor,
    history: state.history.map(entry => ({
      ordinal: entry.ordinal,
      kind: entry.kind,
      image: entry.image_storage_id,
      source: entry.source_image_storage_id,
      dimensions: [entry.width, entry.height],
    })),
  });
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

async function waitForEnabled(locator, label, timeoutMs = 10_000) {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`${label} must become enabled`);
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
