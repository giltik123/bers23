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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3g release browser E2E must use real PostgreSQL');

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
const tenantId = 'release-r3g-tenant';
const userId = 'release-r3g-user';
const email = 'release-r3g@example.test';
const password = `release-r3g-browser-password-${'x'.repeat(32)}`;

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3g-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3g Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 67, g: 113, b: 157, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3G_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3g-core',
    JWT_AUDIENCE: 'release-r3g-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3g <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3g-google-unused',
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
  fashionReads: [],
  localExecutionRequests: [],
  creativeRequests: [],
  financialRequests: [],
  maskRequests: [],
  projectMutations: [],
  externalBrowserRequests: [],
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
  const page = await browserContext.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3g`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'release-r3g-source.png', mimeType: 'image/png', buffer: sourcePng });
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
  assert.deepEqual(initial.project.objects, [], 'new canonical Project must begin with zero detected/selected objects');
  assert.equal(initial.cursor.ordinal, 0);
  assert.equal(initial.cursor.kind, 'ORIGINAL');
  assert.equal(initial.history.length, 1);
  assert.equal(await countMasks(projectId), 0, 'zero-object Project must begin without canonical MASK artifacts');
  assert.equal(await countLocalTickets(projectId), 0, 'navigation-only journey must begin without local execution tickets');

  resetJourneyDiagnostics();

  const prompt = page.getByRole('button', { name: 'Prompt', exact: true });
  const fashion = page.getByRole('button', { name: 'Fashion', exact: true });
  const outfits = page.getByRole('button', { name: 'Outfits', exact: true });
  await prompt.waitFor({ state: 'visible', timeout: 10_000 });
  await fashion.waitFor({ state: 'visible', timeout: 10_000 });
  await outfits.waitFor({ state: 'visible', timeout: 10_000 });

  const fashionLoad = waitForCoreResponses(page, [
    '/api/core/garments',
    '/api/core/wardrobe/garments',
  ]);
  await fashion.click();
  await fashionLoad;
  await page.getByRole('region', { name: 'Canonical fashion wardrobe', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('No managed garments yet. Add a garment photo to create the first stable wardrobe item.', { exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
  await assertActiveNavigation(fashion, 'Fashion');

  const outfitLoad = waitForCoreResponses(page, [
    '/api/core/wardrobe/outfits',
    '/api/core/wardrobe/garments',
  ]);
  await outfits.click();
  await outfitLoad;
  await page.getByRole('region', { name: 'Canonical Outfit builder', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('No managed outfits yet. Create one to compose stable garment references.', { exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
  await assertActiveNavigation(outfits, 'Outfits');

  await prompt.click();
  await assertActiveNavigation(prompt, 'Prompt');

  const fashionReload = waitForCoreResponses(page, [
    '/api/core/garments',
    '/api/core/wardrobe/garments',
  ]);
  await fashion.click();
  await fashionReload;
  await page.getByRole('region', { name: 'Canonical fashion wardrobe', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });

  const outfitReload = waitForCoreResponses(page, [
    '/api/core/wardrobe/outfits',
    '/api/core/wardrobe/garments',
  ]);
  await outfits.click();
  await outfitReload;
  await page.getByRole('region', { name: 'Canonical Outfit builder', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });

  const finalState = await readProjectState(projectId);
  assert.deepEqual(finalState, initial, 'Fashion/Outfits navigation must not mutate canonical Project state or objects');
  assert.equal(await projectImage.evaluate(element => element.src), initialProjectImageSrc, 'navigation must keep canonical Project image source unchanged');
  assert.equal(await countMasks(projectId), 0, 'zero-object Fashion/Outfits navigation must not mint canonical MASK artifacts');
  assert.equal(await countLocalTickets(projectId), 0, 'zero-object Fashion/Outfits navigation must not prepare local execution');

  assert.equal(countRequest('GET /api/core/garments'), 2, 'Fashion must load Managed Garment authority on each mount');
  assert.equal(countRequest('GET /api/core/wardrobe/outfits'), 2, 'Outfits must load canonical Outfit authority on each mount');
  assert.equal(countRequest('GET /api/core/wardrobe/garments'), 4, 'Fashion and Outfits must each load the canonical Wardrobe projection on each mount');
  assert.equal(providerCalls, 0, 'zero-object navigation must never reach provider boundary');
  assert.deepEqual(diagnostics.localExecutionRequests, [], 'zero-object navigation must not invoke local execution');
  assert.deepEqual(diagnostics.creativeRequests, [], 'zero-object navigation must not route through generic Creative/provider authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'zero-object navigation must not reach Billing/credits authority');
  assert.deepEqual(diagnostics.maskRequests, [], 'zero-object navigation must not persist or read a MASK as navigation authority');
  assert.deepEqual(diagnostics.projectMutations, [], 'zero-object navigation must not mutate Project through Core');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'zero-object navigation must not call external browser origins');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3G_BROWSER_ZERO_OBJECT_FASHION_OUTFITS_ACCEPTED', JSON.stringify({
    projectId,
    objects: finalState.project.objects,
    project: summarize(finalState),
    fashionReads: diagnostics.fashionReads,
    maskCount: await countMasks(projectId),
    localTicketCount: await countLocalTickets(projectId),
    providerCalls,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `R3g browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
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
    if (method === 'OPTIONS') return;
    const entry = `${method} ${pathName}`;
    if (method === 'GET' && ['/api/core/garments', '/api/core/wardrobe/garments', '/api/core/wardrobe/outfits'].includes(pathName)) diagnostics.fashionReads.push(entry);
    if (pathName.includes('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (pathName.includes('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (pathName.includes('/api/core/artifacts/masks')) diagnostics.maskRequests.push(entry);
    if (!['GET', 'HEAD'].includes(method) && pathName.includes('/api/core/projects/')) diagnostics.projectMutations.push(entry);
  });
}

function resetJourneyDiagnostics() {
  for (const key of ['fashionReads', 'localExecutionRequests', 'creativeRequests', 'financialRequests', 'maskRequests', 'projectMutations', 'externalBrowserRequests', 'pageErrors', 'requestFailures']) diagnostics[key].length = 0;
}

function countRequest(entry) {
  return diagnostics.fashionReads.filter(value => value === entry).length;
}

async function waitForCoreResponses(page, paths) {
  const waits = paths.map(pathName => page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.origin === coreOrigin && url.pathname === pathName;
  }, { timeout: 15_000 }));
  const responses = await Promise.all(waits);
  for (const response of responses) assert.equal(response.ok(), true, `${response.url()} must succeed through real Core`);
  return responses;
}

async function assertActiveNavigation(locator, label) {
  const className = await locator.getAttribute('class');
  assert.match(className ?? '', /bg-primary/, `${label} navigation must become active`);
}

async function readProjectState(projectId) {
  const projectResult = await pool.query(
    `SELECT p.project_id,p.original_image_storage_id,p.current_image_storage_id,p.width,p.height,p.history_cursor_id,p.objects,
            c.ordinal AS cursor_ordinal,c.kind AS cursor_kind
       FROM canonical_projects p
       JOIN canonical_project_history c ON c.history_id=p.history_cursor_id
      WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`,
    [projectId, tenantId, userId],
  );
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for R3g browser user');
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
      objects: Object.freeze(Array.isArray(row.objects) ? row.objects.map(value => Object.freeze({ ...value })) : row.objects),
    }),
    cursor: Object.freeze({ ordinal: row.cursor_ordinal, kind: row.cursor_kind }),
    history: Object.freeze(historyResult.rows.map(history => Object.freeze({ ...history }))),
  });
}

async function countMasks(projectId) {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM canonical_mask_artifacts
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND revoked_at IS NULL`,
    [projectId, tenantId, userId],
  );
  return result.rows[0].count;
}

async function countLocalTickets(projectId) {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM local_execution_tickets
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [projectId, tenantId, userId],
  );
  return result.rows[0].count;
}

function summarize(state) {
  return Object.freeze({
    current: state.project.current_image_storage_id,
    dimensions: [state.project.width, state.project.height],
    objects: state.project.objects,
    cursor: state.cursor,
    history: state.history.map(entry => ({ ordinal: entry.ordinal, kind: entry.kind, image: entry.image_storage_id, source: entry.source_image_storage_id, dimensions: [entry.width, entry.height] })),
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
