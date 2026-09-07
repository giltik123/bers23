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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3e release browser E2E must use real PostgreSQL');

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
const tenantId = 'release-r3e-tenant';
const userId = 'release-r3e-user';
const email = 'release-r3e@example.test';
const password = `release-r3e-browser-password-${'x'.repeat(32)}`;

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3e-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3e Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 44, g: 96, b: 148, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3E_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3e-core',
    JWT_AUDIENCE: 'release-r3e-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3e <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3e-google-unused',
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
  maskRequests: [],
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

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3e`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'release-r3e-source.png', mimeType: 'image/png', buffer: sourcePng });
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
  assert.deepEqual(initial.objects, []);
  assert.equal((await readMasks(projectId)).length, 0);

  // Start Selection without invoking Smart Select, switch immediately to deterministic manual Add,
  // and drive the real ImageCanvas pointer path. The maximum UI brush size plus a substantial
  // displayed stroke keeps this tiny 12x8 fixture robust after display->original scaling.
  await page.getByRole('button', { name: 'Smart Select', exact: true }).click();
  await page.getByRole('region', { name: 'Selection tools' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Brush Size').fill('96');

  const projectImage = page.getByRole('img', { name: 'Project', exact: true });
  const box = await projectImage.boundingBox();
  assert(box && box.width > 4 && box.height > 4, 'Project image must expose a real browser pointer surface');
  const startX = box.x + box.width * 0.4;
  const endX = box.x + box.width * 0.6;
  const centerY = box.y + box.height * 0.5;
  await page.mouse.move(startX, centerY);
  await page.mouse.down();
  await page.mouse.move(endX, centerY, { steps: 8 });
  await page.mouse.up();

  const done = page.getByRole('button', { name: 'Done', exact: true });
  await waitForEnabled(done, 'Done');
  assert.equal((await readMasks(projectId)).length, 0, 'manual selection draft must remain noncanonical before Done');
  assert.deepEqual(await readProjectState(projectId), initial, 'manual selection draft must not mutate Project before Done');

  const maskResponsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && url.origin === coreOrigin && url.pathname === '/api/core/artifacts/masks';
  }, { timeout: 15_000 });
  await done.click();
  const maskResponse = await maskResponsePromise;
  assert.equal(maskResponse.status(), 201, 'Done must persist MASK through canonical Core endpoint');
  const maskBody = await maskResponse.json();
  assert.equal(maskBody.role, 'MASK');
  assert.equal(maskBody.state, 'AVAILABLE');
  assert.equal(maskBody.encoding, 'ALPHA_8_LOSSLESS');
  assert.equal(maskBody.coordinateSpace, 'ORIGINAL');
  assert.equal(maskBody.producerOperation, 'MANUAL_SELECTION');
  assert.equal(typeof maskBody.artifactId, 'string');
  assert(maskBody.artifactId.length > 0);
  const maskRequestUrl = new URL(maskResponse.request().url());
  assert.equal(maskBody.sourceImageArtifactId, maskRequestUrl.searchParams.get('sourceImageArtifactId'));

  await page.getByRole('region', { name: 'Selection tools' }).waitFor({ state: 'detached', timeout: 15_000 });
  const selected = await waitForSelectedMaskObject(projectId, maskBody.artifactId);
  assert.equal(selected.label, 'Smart selection');
  assert.equal(selected.selected, true);

  const masks = await readMasks(projectId);
  assert.equal(masks.length, 1, 'Done must mint exactly one canonical manual MASK');
  const canonicalMask = masks[0];
  assert.equal(canonicalMask.role, 'MASK');
  assert.equal(canonicalMask.encoding, 'ALPHA_8_LOSSLESS');
  assert.equal(canonicalMask.coordinate_space, 'ORIGINAL');
  assert.equal(canonicalMask.width, 12);
  assert.equal(canonicalMask.height, 8);
  assert.equal(canonicalMask.source_image_storage_id, initial.project.current_image_storage_id);
  assert.equal(canonicalMask.parent_mask_storage_id, null);
  assert.equal(canonicalMask.producer_operation, 'MANUAL_SELECTION');
  const maskAlpha = await sharp(canonicalMask.png_bytes).greyscale().raw().toBuffer();
  assert.equal(maskAlpha.byteLength, 12 * 8);
  const selectedPixels = [...maskAlpha].filter(value => value > 0).length;
  assert(selectedPixels > 0, 'manual Add must persist a non-empty MASK');
  assert(selectedPixels < 12 * 8, 'manual Add fixture must remain a bounded partial MASK');

  const selectedState = await readProjectState(projectId);
  assert.equal(selectedState.project.current_image_storage_id, initial.project.current_image_storage_id);
  assert.equal(selectedState.cursor.ordinal, 0);
  assert.equal(selectedState.history.length, 1);
  assert.equal(selectedState.objects.length, 1);
  assert.equal(selectedState.objects[0].mask_artifact_id, maskBody.artifactId);
  assert.equal(selectedState.objects[0].selected, true);

  // First exact-MASK Background Isolation produces a Core-verified Preview; Discard is non-mutating.
  const isolationDiscardBefore = selectedState;
  const firstIsolationRequests = diagnostics.localExecutionRequests.length;
  await runBackgroundIsolation(page);
  await waitImage(page, 'after', 12, 8);
  assert.equal(diagnostics.localExecutionRequests.length, firstIsolationRequests + 4, 'Background Isolation must use exactly prepare/input/upload/result semantic requests');
  assert.deepEqual(await readProjectState(projectId), isolationDiscardBefore, 'Background Isolation Preview must not mutate Project before explicit Accept');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 15_000 });
  await waitImage(page, 'Project', 12, 8);
  assert.deepEqual(await readProjectState(projectId), isolationDiscardBefore, 'Background Isolation Discard must be non-mutating');

  // Reuse the exact same selected canonical MASK, then explicitly Accept the Core FINAL.
  const sourceStorageId = isolationDiscardBefore.project.current_image_storage_id;
  const secondIsolationRequests = diagnostics.localExecutionRequests.length;
  await runBackgroundIsolation(page);
  await waitImage(page, 'after', 12, 8);
  assert.equal(diagnostics.localExecutionRequests.length, secondIsolationRequests + 4);
  assert.equal((await readMasks(projectId)).length, 1, 'repeated Background Isolation must reuse the exact canonical MASK rather than minting another');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  await waitImage(page, 'Project', 12, 8);

  const accepted = await readProjectState(projectId);
  assert.notEqual(accepted.project.current_image_storage_id, sourceStorageId);
  assert.equal(accepted.cursor.ordinal, 1);
  assert.equal(accepted.cursor.kind, 'ACCEPTED_FINAL');
  assert.equal(accepted.history.length, 2);
  assert.equal(accepted.history[1].width, 12);
  assert.equal(accepted.history[1].height, 8);
  assert.equal(accepted.history[1].source_image_storage_id, sourceStorageId);
  const acceptedStorageId = accepted.project.current_image_storage_id;

  await waitEnabledButton(page, 'Undo');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitImage(page, 'Project', 12, 8);
  const undone = await readProjectState(projectId);
  assert.equal(undone.project.current_image_storage_id, sourceStorageId);
  assert.equal(undone.cursor.ordinal, 0);

  await waitEnabledButton(page, 'Redo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitImage(page, 'Project', 12, 8);
  const redone = await readProjectState(projectId);
  assert.equal(redone.project.current_image_storage_id, acceptedStorageId);
  assert.equal(redone.cursor.ordinal, 1);

  assert.deepEqual(diagnostics.maskRequests, ['POST /api/core/artifacts/masks'], 'manual release-floor Selection must create exactly one Core MASK');
  assert.equal(providerCalls, 0, 'manual Selection and deterministic Background Isolation must never reach provider boundary');
  assert.deepEqual(diagnostics.creativeRequests, [], 'Selection/MASK deterministic journey must not route through generic Creative/provider authority');
  assert.deepEqual(diagnostics.financialRequests, [], 'Selection/MASK deterministic journey must not reach Billing/credits authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'browser must not call external origins during Selection/MASK deterministic journey');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3E_BROWSER_SELECTION_MASK_ACCEPTED', JSON.stringify({
    projectId,
    maskArtifactId: maskBody.artifactId,
    maskStorageId: canonicalMask.storage_id,
    selectedPixels,
    initial: summarize(initial),
    accepted: summarize(accepted),
    maskRequests: diagnostics.maskRequests,
    localExecutionRequests: diagnostics.localExecutionRequests,
    projectMutations: diagnostics.projectMutations,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `R3e browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
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

async function runBackgroundIsolation(page) {
  const button = page.getByRole('button', { name: 'Remove background', exact: true });
  await waitForEnabled(button, 'Remove background');
  await button.click();
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
    const method = request.method();
    const entry = `${method} ${pathName}`;
    if (method !== 'OPTIONS' && pathName === '/api/core/artifacts/masks') diagnostics.maskRequests.push(entry);
    if (method !== 'OPTIONS' && pathName.includes('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (method !== 'OPTIONS' && pathName.includes('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (method !== 'OPTIONS' && /financial|billing|credit|subscription/i.test(pathName)) diagnostics.financialRequests.push(entry);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && pathName.includes('/api/core/projects/')) diagnostics.projectMutations.push(entry);
  });
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
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for R3e browser user');
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
    objects: Object.freeze((row.objects ?? []).map(object => Object.freeze({ ...object }))),
    history: Object.freeze(historyResult.rows.map(history => Object.freeze({ ...history }))),
  });
}

async function readMasks(projectId) {
  const result = await pool.query(
    `SELECT storage_id,role,encoding,coordinate_space,width,height,png_bytes,source_image_storage_id,parent_mask_storage_id,producer_operation
       FROM canonical_mask_artifacts
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND revoked_at IS NULL
      ORDER BY created_at ASC`,
    [projectId, tenantId, userId],
  );
  return result.rows;
}

async function waitForSelectedMaskObject(projectId, artifactId) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = await readProjectState(projectId);
    const found = state.objects.find(object => object.mask_artifact_id === artifactId && object.selected === true);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Project to persist the Core-issued selected MASK object');
}

function summarize(state) {
  return Object.freeze({
    current: state.project.current_image_storage_id,
    dimensions: [state.project.width, state.project.height],
    cursor: state.cursor,
    objects: state.objects.map(object => ({ id: object.id, selected: object.selected, maskArtifactId: object.mask_artifact_id })),
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
  await waitForEnabled(button, name);
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