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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3d release browser E2E must use real PostgreSQL');

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
const tenantId = 'release-r3d-tenant';
const userId = 'release-r3d-user';
const email = 'release-r3d@example.test';
const password = `release-r3d-browser-password-${'x'.repeat(32)}`;

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3d-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3d Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 37, g: 83, b: 127, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3D_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3d-core',
    JWT_AUDIENCE: 'release-r3d-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3d <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3d-google-unused',
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
  const page = await browserContext.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3d`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'release-r3d-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  await waitImage(page, 'Project', 12, 8);

  const initial = await readProjectState(projectId);
  assert.equal(initial.project.width, 12);
  assert.equal(initial.project.height, 8);
  assert.equal(initial.cursor.ordinal, 0);
  assert.equal(initial.cursor.kind, 'ORIGINAL');
  assert.equal(initial.history.length, 1);
  assert.equal(initial.history[0].source_image_storage_id, initial.project.original_image_storage_id);

  // Crop preview + Discard: preview is Core-verified but Project remains byte-for-byte unchanged.
  const cropDiscardBefore = await readProjectState(projectId);
  const cropDiscardRequests = diagnostics.localExecutionRequests.length;
  await runCrop(page, { x: 2, y: 1, width: 8, height: 6 });
  await waitImage(page, 'after', 8, 6);
  assert.equal(diagnostics.localExecutionRequests.length, cropDiscardRequests + 4, 'Crop must use exactly prepare/input/upload/result local-execution requests');
  assert.deepEqual(await readProjectState(projectId), cropDiscardBefore, 'Crop Preview must not mutate Project before explicit Accept');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 15_000 });
  await waitImage(page, 'Project', 12, 8);
  assert.deepEqual(await readProjectState(projectId), cropDiscardBefore, 'Crop Discard must be non-mutating');

  // Accepted Crop: exact dimensions, source lineage, one history append, then Undo/Redo.
  const cropSourceStorageId = cropDiscardBefore.project.current_image_storage_id;
  const cropAcceptRequests = diagnostics.localExecutionRequests.length;
  await runCrop(page, { x: 2, y: 1, width: 8, height: 6 });
  await waitImage(page, 'after', 8, 6);
  assert.equal(diagnostics.localExecutionRequests.length, cropAcceptRequests + 4);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  await waitImage(page, 'Project', 8, 6);
  const cropAccepted = await readProjectState(projectId);
  assert.equal(cropAccepted.project.width, 8);
  assert.equal(cropAccepted.project.height, 6);
  assert.equal(cropAccepted.cursor.ordinal, 1);
  assert.equal(cropAccepted.cursor.kind, 'ACCEPTED_FINAL');
  assert.equal(cropAccepted.history.length, 2);
  assert.equal(cropAccepted.history[1].width, 8);
  assert.equal(cropAccepted.history[1].height, 6);
  assert.equal(cropAccepted.history[1].source_image_storage_id, cropSourceStorageId);
  const cropStorageId = cropAccepted.project.current_image_storage_id;
  assert.notEqual(cropStorageId, cropSourceStorageId);

  await waitEnabledButton(page, 'Undo');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitImage(page, 'Project', 12, 8);
  const cropUndone = await readProjectState(projectId);
  assert.equal(cropUndone.project.current_image_storage_id, cropSourceStorageId);
  assert.equal(cropUndone.cursor.ordinal, 0);

  await waitEnabledButton(page, 'Redo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitImage(page, 'Project', 8, 6);
  const cropRedone = await readProjectState(projectId);
  assert.equal(cropRedone.project.current_image_storage_id, cropStorageId);
  assert.equal(cropRedone.cursor.ordinal, 1);

  // Resize preview + Discard from the accepted Crop source.
  const resizeDiscardBefore = await readProjectState(projectId);
  const resizeDiscardRequests = diagnostics.localExecutionRequests.length;
  await runResize(page, { width: 4, height: 3 });
  await waitImage(page, 'after', 4, 3);
  assert.equal(diagnostics.localExecutionRequests.length, resizeDiscardRequests + 4, 'Resize must use exactly prepare/input/upload/result local-execution requests');
  assert.deepEqual(await readProjectState(projectId), resizeDiscardBefore, 'Resize Preview must not mutate Project before explicit Accept');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 15_000 });
  await waitImage(page, 'Project', 8, 6);
  assert.deepEqual(await readProjectState(projectId), resizeDiscardBefore, 'Resize Discard must be non-mutating');

  // Accepted Resize: exact dimensions and lineage from accepted Crop, then Undo/Redo.
  const resizeSourceStorageId = resizeDiscardBefore.project.current_image_storage_id;
  const resizeAcceptRequests = diagnostics.localExecutionRequests.length;
  await runResize(page, { width: 4, height: 3 });
  await waitImage(page, 'after', 4, 3);
  assert.equal(diagnostics.localExecutionRequests.length, resizeAcceptRequests + 4);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  await waitImage(page, 'Project', 4, 3);
  const resizeAccepted = await readProjectState(projectId);
  assert.equal(resizeAccepted.project.width, 4);
  assert.equal(resizeAccepted.project.height, 3);
  assert.equal(resizeAccepted.cursor.ordinal, 2);
  assert.equal(resizeAccepted.cursor.kind, 'ACCEPTED_FINAL');
  assert.equal(resizeAccepted.history.length, 3);
  assert.equal(resizeAccepted.history[2].width, 4);
  assert.equal(resizeAccepted.history[2].height, 3);
  assert.equal(resizeAccepted.history[2].source_image_storage_id, resizeSourceStorageId);
  const resizeStorageId = resizeAccepted.project.current_image_storage_id;
  assert.notEqual(resizeStorageId, resizeSourceStorageId);

  await waitEnabledButton(page, 'Undo');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitImage(page, 'Project', 8, 6);
  const resizeUndone = await readProjectState(projectId);
  assert.equal(resizeUndone.project.current_image_storage_id, resizeSourceStorageId);
  assert.equal(resizeUndone.cursor.ordinal, 1);

  await waitEnabledButton(page, 'Redo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitImage(page, 'Project', 4, 3);
  const resizeRedone = await readProjectState(projectId);
  assert.equal(resizeRedone.project.current_image_storage_id, resizeStorageId);
  assert.equal(resizeRedone.cursor.ordinal, 2);

  assert.equal(providerCalls, 0, 'deterministic Crop/Resize must never reach provider boundary');
  assert.deepEqual(diagnostics.creativeRequests, [], 'deterministic Crop/Resize must not route through generic Creative/provider authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'deterministic Crop/Resize must not reach Billing/credits authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'browser must not call external origins during deterministic geometry journey');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3D_BROWSER_DETERMINISTIC_GEOMETRY_ACCEPTED', JSON.stringify({
    projectId,
    initial: summarize(initial),
    crop: summarize(cropAccepted),
    resize: summarize(resizeAccepted),
    localExecutionRequests: diagnostics.localExecutionRequests,
    projectMutations: diagnostics.projectMutations,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `R3d browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
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

async function runCrop(page, rect) {
  await page.getByRole('button', { name: 'Start crop' }).click();
  await page.getByRole('region', { name: 'Crop controls' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByLabel('Crop x').fill(String(rect.x));
  await page.getByLabel('Crop y').fill(String(rect.y));
  await page.getByLabel('Crop width').fill(String(rect.width));
  await page.getByLabel('Crop height').fill(String(rect.height));
  const apply = page.getByRole('button', { name: 'Apply crop' });
  await assertEnabled(apply, 'Apply crop');
  await apply.click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
}

async function runResize(page, target) {
  await page.getByRole('button', { name: 'Start resize' }).click();
  await page.getByRole('region', { name: 'Resize controls' }).waitFor({ state: 'visible', timeout: 10_000 });
  const aspect = page.getByLabel('Keep resize aspect ratio');
  if (await aspect.isChecked()) await aspect.uncheck();
  await page.getByLabel('Resize width').fill(String(target.width));
  await page.getByLabel('Resize height').fill(String(target.height));
  const apply = page.getByRole('button', { name: 'Apply resize' });
  await assertEnabled(apply, 'Apply resize');
  await apply.click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
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
    const entry = `${request.method()} ${pathName}`;
    if (pathName.includes('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (pathName.includes('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (request.method() !== 'GET' && request.method() !== 'HEAD' && pathName.includes('/api/core/projects/')) diagnostics.projectMutations.push(entry);
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
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for R3d browser user');
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

function summarize(state) {
  return Object.freeze({
    current: state.project.current_image_storage_id,
    dimensions: [state.project.width, state.project.height],
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

async function waitEnabledButton(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  await button.waitFor({ state: 'visible', timeout: 15_000 });
  await assertEnabled(button, name);
}

async function assertEnabled(locator, label) {
  await assert.doesNotReject(async () => {
    await locator.waitFor({ state: 'visible', timeout: 10_000 });
    await locator.evaluate(element => {
      if (element.disabled) throw new Error('disabled');
    });
  }, `${label} must be enabled`);
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
