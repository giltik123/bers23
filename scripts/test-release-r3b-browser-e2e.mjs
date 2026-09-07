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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3 release browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4187;
const corePort = 4188;
const providerPort = 4189;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const tenantId = 'release-r3b-tenant';
const userId = 'release-r3b-user';
const email = 'release-r3b@example.test';
const requiredRuntimeSecrets = Object.freeze([
  'FAL_KEY',
  'JWT_SECRET',
  'AUTH_CHALLENGE_SECRET',
  'RESEND_API_KEY',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'ARTIFACT_SIGNING_SECRET',
]);
for (const name of requiredRuntimeSecrets) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}
const password = `release-r3b-browser-password-${'x'.repeat(32)}`;

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-release-r3-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3b Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 31, g: 71, b: 111, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3b-core',
    JWT_AUDIENCE: 'release-r3b-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3b <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3b-google-unused',
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
let authenticated = false;
const diagnostics = {
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  expectedAuthContext401s: [],
  unexpectedResponses: [],
  financialRequests: [],
  creativeRequests: [],
  legacyRequests: [],
  externalBrowserRequests: [],
  localExecutionRequests: [],
  artifactResponses: [],
  lastUrl: undefined,
  projectId: undefined,
  projectImage: undefined,
  deterministicEdit: {},
};

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = await startStaticSpaServer(distDir, frontendPort);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const page = await browser.newPage();
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('request', request => {
    const url = safeUrl(request.url());
    if (!url) return;
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.origin !== frontendOrigin && url.origin !== coreOrigin) {
        diagnostics.externalBrowserRequests.push({ url: request.url(), method: request.method() });
      }
    }
    const financialRoute = /^\/api\/core\/(?:financial(?:\/|$)|billing(?:\/|$)|checkout(?:\/|$)|subscriptions?(?:\/|$)|credits?(?:\/|$)|trials?(?:\/|$))/i;
    const legacyFinancialEntity = /^\/api\/core\/data\/(?:Subscription|Credit|Billing|Trial)/i;
    if (financialRoute.test(url.pathname) || legacyFinancialEntity.test(url.pathname)) {
      diagnostics.financialRequests.push({ url: request.url(), method: request.method() });
    }
    if (url.pathname.startsWith('/api/core/creative/')) diagnostics.creativeRequests.push({ url: request.url(), method: request.method() });
    if (url.pathname.startsWith('/api/core/local-execution/')) {
      diagnostics.localExecutionRequests.push({ url: request.url(), pathname: url.pathname, method: request.method() });
    }
    if (url.pathname === '/api/core/observability/events' || url.pathname.startsWith('/api/core/data/Notification')) {
      diagnostics.legacyRequests.push({ url: request.url(), method: request.method() });
    }
  });
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => {
    const url = safeUrl(response.url());
    if (url?.pathname.startsWith('/api/core/artifacts/results/')) {
      diagnostics.artifactResponses.push({ url: response.url(), status: response.status(), contentType: response.headers()['content-type'] ?? null });
    }
    if (response.status() < 400) return;
    if (!authenticated && response.status() === 401 && url?.pathname === '/api/core/auth/context') {
      diagnostics.expectedAuthContext401s.push({ url: response.url(), status: response.status() });
      return;
    }
    diagnostics.unexpectedResponses.push({ url: response.url(), status: response.status() });
  });

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3b`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });
  assert.equal(new URL(page.url()).pathname, '/login', 'protected Editor must redirect an unauthenticated browser to Login');

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  authenticated = true;
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'release-r3b-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && !!url.searchParams.get('id'), { timeout: 20_000 });
  diagnostics.lastUrl = page.url();
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');
  diagnostics.projectId = projectId;

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByText('Prompt', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: /Detect objects/i }).waitFor({ state: 'visible', timeout: 10_000 });

  const imageEvidence = await loadedImageEvidence(page, 'Project', 12, 8);
  diagnostics.projectImage = imageEvidence;
  assertSignedCoreImage(imageEvidence, [12, 8], 'canonical Project image');
  assertArtifactResponse(imageEvidence.src, 'signed canonical Project image');

  const initialState = await readProjectState(projectId);
  diagnostics.deterministicEdit.initialState = initialState;
  assert.equal(initialState.project.tenant_id, tenantId);
  assert.equal(initialState.project.user_id, userId);
  assert.equal(initialState.project.current_image_storage_id, initialState.project.original_image_storage_id, 'new Project must begin at canonical ORIGINAL');
  assert.deepEqual([initialState.project.width, initialState.project.height], [12, 8]);
  assert.equal(initialState.project.cursor_ordinal, 0);
  assert.equal(initialState.project.cursor_kind, 'ORIGINAL');
  assert.equal(initialState.history.length, 1);
  assert.equal(initialState.history[0].ordinal, 0);
  assert.equal(initialState.history[0].kind, 'ORIGINAL');
  assert.equal(initialState.history[0].image_storage_id, initialState.project.original_image_storage_id);

  assert.equal(providerCalls, 0, 'Auth/Project/zero-object Editor journey must not invoke an external provider');
  assert.deepEqual(diagnostics.creativeRequests, [], 'opening zero-object Editor must not implicitly start creative execution');
  assert.deepEqual(diagnostics.legacyRequests, [], 'release browser path must not probe unowned legacy Notification/observability routes');
  assert.deepEqual(diagnostics.financialRequests, [], 'frozen financial authority must not be touched by the base release journey');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'baseline browser journey must not contact an external cloud origin');
  assert.ok(diagnostics.expectedAuthContext401s.length >= 1, 'unauthenticated protected-route probe must observe canonical auth denial');
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.unexpectedResponses, []);

  // R3b: deterministic local Rotate -> Preview -> Accept -> Undo -> Redo.
  const rotate = page.getByRole('button', { name: 'Rotate 90° clockwise', exact: true });
  await rotate.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await rotate.isEnabled(), true, 'Rotate 90° clockwise must be available for a zero-object whole image');
  const resultResponsePromise = page.waitForResponse(response => {
    const url = safeUrl(response.url());
    return response.request().method() === 'POST'
      && url?.origin === coreOrigin
      && /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/result$/.test(url.pathname);
  }, { timeout: 20_000 });
  await rotate.click();

  const resultResponse = await resultResponsePromise;
  assert.equal(resultResponse.status(), 200, 'Core must accept and verify the deterministic orthogonal-transform result');
  const coreResult = await resultResponse.json();
  assert.equal(coreResult.status, 'SUCCESS', 'Core result must be terminal SUCCESS before Preview is admitted');
  assert.equal(coreResult.verification?.valid, true, 'Core must verify the local deterministic result before Preview is admitted');
  assert.equal(typeof coreResult.artifactId === 'string' && coreResult.artifactId.length > 0, true, 'Core-verified deterministic result must expose canonical FINAL artifact identity');
  diagnostics.deterministicEdit.coreResult = Object.freeze({ status: coreResult.status, verificationValid: coreResult.verification?.valid, artifactIdPresent: true });

  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  await accept.waitFor({ state: 'visible', timeout: 20_000 });
  const previewImage = await loadedImageEvidence(page, 'after', 8, 12, 20_000);
  diagnostics.deterministicEdit.previewImage = previewImage;
  assertLocalVerifiedPreview(previewImage, [8, 12], 'orthogonal-transform preview');

  const localCalls = diagnostics.localExecutionRequests;
  assert.ok(localCalls.some(call => call.method === 'POST' && call.pathname === '/api/core/local-execution/orthogonal-transform/prepare'), 'Rotate must prepare through canonical orthogonal-transform Core authority');
  assert.ok(localCalls.some(call => call.method === 'GET' && /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/inputs$/.test(call.pathname)), 'Rotate must load canonical source bytes through ticket-scoped input delivery');
  assert.ok(localCalls.some(call => call.method === 'POST' && /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/image-upload$/.test(call.pathname)), 'Rotate must upload the local deterministic candidate through the exact ticket authority');
  assert.ok(localCalls.some(call => call.method === 'POST' && /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/result$/.test(call.pathname)), 'Rotate must submit the deterministic result through Core verification');

  const previewState = await readProjectState(projectId);
  diagnostics.deterministicEdit.previewState = previewState;
  assert.deepEqual(previewState, initialState, 'Preview must not mutate Project current image, cursor, dimensions or history before explicit Accept');
  assert.equal(providerCalls, 0, 'local deterministic Preview must not call the provider');
  assert.deepEqual(diagnostics.creativeRequests, [], 'local deterministic Preview must not route through creative/cloud execution');
  assert.deepEqual(diagnostics.financialRequests, [], 'local deterministic Preview must not invoke browser financial authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'local deterministic Preview must not contact an external cloud origin');

  await accept.click();
  await accept.waitFor({ state: 'detached', timeout: 20_000 });
  const acceptedImage = await loadedImageEvidence(page, 'Project', 8, 12, 20_000);
  diagnostics.deterministicEdit.acceptedImage = acceptedImage;
  assertSignedCoreImage(acceptedImage, [8, 12], 'accepted orthogonal-transform Project image');
  assertArtifactResponse(acceptedImage.src, 'accepted orthogonal-transform Project image');

  const acceptedState = await readProjectState(projectId);
  diagnostics.deterministicEdit.acceptedState = acceptedState;
  assert.deepEqual([acceptedState.project.width, acceptedState.project.height], [8, 12]);
  assert.notEqual(acceptedState.project.current_image_storage_id, initialState.project.original_image_storage_id, 'Accept must advance current image away from ORIGINAL');
  assert.equal(acceptedState.project.cursor_ordinal, 1);
  assert.equal(acceptedState.project.cursor_kind, 'ACCEPTED_FINAL');
  assert.equal(acceptedState.project.cursor_image_storage_id, acceptedState.project.current_image_storage_id);
  assert.equal(acceptedState.history.length, 2, 'Accept must add exactly one active history entry');
  assert.equal(acceptedState.history[1].ordinal, 1);
  assert.equal(acceptedState.history[1].kind, 'ACCEPTED_FINAL');
  assert.equal(acceptedState.history[1].image_storage_id, acceptedState.project.current_image_storage_id);
  assert.equal(acceptedState.history[1].source_image_storage_id, initialState.project.original_image_storage_id, 'accepted FINAL must preserve source lineage to ORIGINAL');
  assert.equal(acceptedState.history[1].instruction, 'Rotate 90° clockwise');

  const acceptedStorageId = acceptedState.project.current_image_storage_id;
  const acceptedHistoryId = acceptedState.project.history_cursor_id;

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await waitForEnabledButton(page, 'Undo');
  await undo.click();
  const undoImage = await loadedImageEvidence(page, 'Project', 12, 8, 20_000);
  diagnostics.deterministicEdit.undoImage = undoImage;
  assertSignedCoreImage(undoImage, [12, 8], 'Undo Project image');

  const undoState = await readProjectState(projectId);
  diagnostics.deterministicEdit.undoState = undoState;
  assert.deepEqual([undoState.project.width, undoState.project.height], [12, 8]);
  assert.equal(undoState.project.current_image_storage_id, initialState.project.original_image_storage_id);
  assert.equal(undoState.project.history_cursor_id, initialState.project.history_cursor_id);
  assert.equal(undoState.project.cursor_ordinal, 0);
  assert.equal(undoState.project.cursor_kind, 'ORIGINAL');
  assert.equal(undoState.history.length, 2, 'Undo must move the cursor without deleting redo history');
  assert.equal(undoState.history[1].image_storage_id, acceptedStorageId);

  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await waitForEnabledButton(page, 'Redo');
  await redo.click();
  const redoImage = await loadedImageEvidence(page, 'Project', 8, 12, 20_000);
  diagnostics.deterministicEdit.redoImage = redoImage;
  assertSignedCoreImage(redoImage, [8, 12], 'Redo Project image');

  const redoState = await readProjectState(projectId);
  diagnostics.deterministicEdit.redoState = redoState;
  assert.deepEqual([redoState.project.width, redoState.project.height], [8, 12]);
  assert.equal(redoState.project.current_image_storage_id, acceptedStorageId);
  assert.equal(redoState.project.history_cursor_id, acceptedHistoryId);
  assert.equal(redoState.project.cursor_ordinal, 1);
  assert.equal(redoState.project.cursor_kind, 'ACCEPTED_FINAL');
  assert.equal(redoState.history.length, 2);
  assert.equal(redoState.history[1].source_image_storage_id, initialState.project.original_image_storage_id);

  assert.equal(providerCalls, 0, 'R3 deterministic lifecycle must not invoke an external provider');
  assert.deepEqual(diagnostics.creativeRequests, [], 'R3 deterministic lifecycle must not invoke creative/cloud execution');
  assert.deepEqual(diagnostics.legacyRequests, [], 'R3 deterministic lifecycle must not probe unowned legacy routes');
  assert.deepEqual(diagnostics.financialRequests, [], 'R3 deterministic lifecycle must not invoke browser payment/subscription/credit authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'R3 deterministic lifecycle must not contact an external cloud origin');
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.unexpectedResponses, []);

  const expected401Console = /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i;
  const toleratedConsole = diagnostics.consoleErrors.filter(message =>
    /favicon|ResizeObserver/i.test(message)
    || (diagnostics.expectedAuthContext401s.length > 0 && expected401Console.test(message))
  );
  assert.equal(diagnostics.consoleErrors.length, toleratedConsole.length, `unexpected browser console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);

  console.log(JSON.stringify({
    authority: 'R3B_BROWSER_DETERMINISTIC_EDIT_ACCEPTED',
    r3aBaselineAuthority: 'R3A_BROWSER_RELEASE_E2E_ACCEPTED',
    browserVersion: browser.version(),
    frontendOrigin,
    coreOrigin,
    projectId,
    tenantId,
    userId,
    providerCalls,
    creativeRequestCount: diagnostics.creativeRequests.length,
    legacyRequestCount: diagnostics.legacyRequests.length,
    financialRequestCount: diagnostics.financialRequests.length,
    externalBrowserRequestCount: diagnostics.externalBrowserRequests.length,
    localExecutionRequestCount: diagnostics.localExecutionRequests.length,
    expectedAuthContext401Count: diagnostics.expectedAuthContext401s.length,
    projectImage: imageEvidence,
    protectedRouteRedirect: '/login',
    zeroObjectPromptVisible: true,
    deterministicEdit: {
      mode: 'ROTATE_90_CW',
      coreResult: diagnostics.deterministicEdit.coreResult,
      previewImage,
      acceptedImage,
      undoImage,
      redoImage,
      initial: summarizeState(initialState),
      accepted: summarizeState(acceptedState),
      undo: summarizeState(undoState),
      redo: summarizeState(redoState),
    },
  }, null, 2));
} catch (error) {
  throw new Error(
    `R3_BROWSER_RELEASE_E2E_FAILED\n${JSON.stringify({ ...diagnostics, providerCalls, coreLogs: coreLogs.slice(-30) }, null, 2)}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
} finally {
  await browser?.close().catch(() => undefined);
  if (frontend) await closeServer(frontend).catch(() => undefined);
  core.kill('SIGTERM');
  await waitForExit(core, 5_000).catch(() => core.kill('SIGKILL'));
  await closeServer(providerTrap).catch(() => undefined);
  await pool.end();
}

function safeUrl(value) {
  try { return new URL(value); }
  catch { return undefined; }
}

async function readProjectState(projectId) {
  const project = await pool.query(
    `SELECT
       p.project_id,p.tenant_id,p.user_id,p.current_image_storage_id,p.original_image_storage_id,
       p.history_cursor_id,p.width,p.height,
       h.ordinal AS cursor_ordinal,h.image_storage_id AS cursor_image_storage_id,h.kind AS cursor_kind
     FROM canonical_projects p
     LEFT JOIN canonical_project_history h ON h.history_id=p.history_cursor_id
     WHERE p.project_id=$1`,
    [projectId],
  );
  assert.equal(project.rowCount, 1, 'browser Project must exist in canonical PostgreSQL authority');
  const history = await pool.query(
    `SELECT history_id,ordinal,image_storage_id,source_image_storage_id,kind,instruction
     FROM canonical_project_history
     WHERE project_id=$1 AND retired_at IS NULL
     ORDER BY ordinal`,
    [projectId],
  );
  return Object.freeze({
    project: Object.freeze({ ...project.rows[0] }),
    history: Object.freeze(history.rows.map(row => Object.freeze({ ...row }))),
  });
}

async function loadedImageEvidence(page, alt, width, height, timeout = 15_000) {
  const locator = page.getByRole('img', { name: alt, exact: true });
  await locator.waitFor({ state: 'visible', timeout });
  await page.waitForFunction(
    ({ imageAlt, expectedWidth, expectedHeight }) => {
      const image = Array.from(document.images).find(entry => entry.alt === imageAlt);
      return image instanceof HTMLImageElement
        && image.complete
        && image.naturalWidth === expectedWidth
        && image.naturalHeight === expectedHeight;
    },
    { imageAlt: alt, expectedWidth: width, expectedHeight: height },
    { timeout },
  );
  return locator.evaluate(image => ({
    src: image.currentSrc || image.src,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
}

async function waitForEnabledButton(page, label, timeout = 15_000) {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible', timeout });
  await page.waitForFunction(
    buttonLabel => {
      const candidate = Array.from(document.querySelectorAll('button')).find(entry => entry.getAttribute('aria-label') === buttonLabel);
      return candidate instanceof HTMLButtonElement && !candidate.disabled;
    },
    label,
    { timeout },
  );
  assert.equal(await button.isEnabled(), true, `${label} must become enabled after canonical Project state updates`);
}

function assertLocalVerifiedPreview(evidence, dimensions, label) {
  assert.equal(evidence.src.startsWith(`blob:${frontendOrigin}/`), true, `${label} must remain a browser-local blob after Core verification and before Accept`);
  assert.deepEqual([evidence.naturalWidth, evidence.naturalHeight], dimensions, `${label} geometry is incorrect`);
}

function assertSignedCoreImage(evidence, dimensions, label) {
  const imageUrl = new URL(evidence.src);
  assert.equal(imageUrl.origin, coreOrigin, `${label} must resolve against split-origin Core`);
  assert.match(imageUrl.pathname, /^\/api\/core\/artifacts\/results\//, `${label} must use signed Core artifact delivery`);
  assert.deepEqual([evidence.naturalWidth, evidence.naturalHeight], dimensions, `${label} geometry is incorrect`);
}

function assertArtifactResponse(url, label) {
  assert.ok(
    diagnostics.artifactResponses.some(response => response.status === 200 && response.url === url && /^image\/png(?:;|$)/i.test(response.contentType || '')),
    `${label} must receive an HTTP 200 image/png response from Core`,
  );
}

function summarizeState(state) {
  return Object.freeze({
    currentImageStorageId: state.project.current_image_storage_id,
    originalImageStorageId: state.project.original_image_storage_id,
    historyCursorId: state.project.history_cursor_id,
    cursorOrdinal: state.project.cursor_ordinal,
    cursorKind: state.project.cursor_kind,
    width: state.project.width,
    height: state.project.height,
    activeHistoryEntries: state.history.length,
  });
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`R3 release artifact is missing: ${file}`);
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

async function closeServer(server) {
  server.closeIdleConnections?.();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function waitForHttp(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`built Core exited before readiness with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status === 200) return;
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`built Core did not become ready: ${last ?? 'no response'}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('child exit timeout')), timeoutMs)),
  ]);
}

async function startStaticSpaServer(root, port) {
  const contentTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.webp', 'image/webp'],
    ['.woff2', 'font/woff2'],
  ]);
  const index = await fs.readFile(path.join(root, 'index.html'));
  const server = http.createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', frontendOrigin).pathname);
      if (pathname.startsWith('/api/')) {
        response.statusCode = 404;
        response.end('R3 SPA server has no API authority');
        return;
      }
      const relative = pathname === '/' ? '/index.html' : pathname;
      const candidate = path.resolve(root, `.${relative}`);
      if (candidate !== root && candidate.startsWith(`${root}${path.sep}`)) {
        const stat = await fs.stat(candidate).catch(() => undefined);
        if (stat?.isFile()) {
          const body = await fs.readFile(candidate);
          response.statusCode = 200;
          response.setHeader('content-type', contentTypes.get(path.extname(candidate).toLowerCase()) ?? 'application/octet-stream');
          response.setHeader('cache-control', 'no-store');
          response.end(body);
          return;
        }
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(index);
    })().catch(error => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : 'R3 static server error');
    });
  });
  await listen(server, port);
  return server;
}
