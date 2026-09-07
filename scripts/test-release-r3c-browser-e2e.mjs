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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3c release browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4187;
const corePort = 4188;
const providerPort = 4189;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const tenantId = 'release-r3c-tenant';
const userId = 'release-r3c-user';
const email = 'release-r3c@example.test';
const versionName = 'R3c accepted rotate v1';
const conflictMessage = 'The prepared result was not accepted because the Project changed. Run the edit again from the current image.';
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
const password = `release-r3c-browser-password-${'x'.repeat(32)}`;

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3c-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3c Browser User' });

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
    JWT_ISSUER: 'release-r3c-core',
    JWT_AUDIENCE: 'release-r3c-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3c <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3c-google-unused',
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
let tabB;
let authenticated = false;
let expectingFinalSourceConflict = false;
const diagnostics = {
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  expectedAuthContext401s: [],
  expectedFinalSourceConflicts: [],
  unexpectedResponses: [],
  financialRequests: [],
  creativeRequests: [],
  legacyRequests: [],
  externalBrowserRequests: [],
  localExecutionRequests: [],
  projectMutationRequests: [],
  artifactResponses: [],
  lastUrl: undefined,
  projectId: undefined,
  projectLifecycle: {},
};

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = await startStaticSpaServer(distDir, frontendPort);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const page = await browser.newPage();
  attachPageDiagnostics(page, 'A');

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3c`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });
  assert.equal(new URL(page.url()).pathname, '/login', 'protected Editor must redirect an unauthenticated browser to Login');

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  authenticated = true;
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'release-r3c-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && !!url.searchParams.get('id'), { timeout: 20_000 });
  diagnostics.lastUrl = page.url();
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');
  diagnostics.projectId = projectId;

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Versions', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  const initialImage = await loadedImageEvidence(page, 'Project', 12, 8);
  assertSignedCoreImage(initialImage, [12, 8], 'R3c canonical Project ORIGINAL');
  assertArtifactResponse(initialImage.src, 'R3c canonical Project ORIGINAL');
  const initialState = await readProjectState(projectId);
  assert.equal(initialState.project.cursor_ordinal, 0);
  assert.equal(initialState.project.cursor_kind, 'ORIGINAL');
  assert.equal(initialState.history.length, 1);
  assert.equal(initialState.versions.length, 0);

  // Establish the already-accepted R3b starting point: one verified local Rotate FINAL is explicitly accepted.
  const baselinePreview = await runVerifiedRotate(page, 8, 12, 'R3c baseline accepted rotate');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  const baselineAcceptedImage = await loadedImageEvidence(page, 'Project', 8, 12, 20_000);
  assertSignedCoreImage(baselineAcceptedImage, [8, 12], 'R3c baseline accepted Project image');
  const baselineState = await readProjectState(projectId);
  assert.equal(baselineState.project.cursor_ordinal, 1);
  assert.equal(baselineState.project.cursor_kind, 'ACCEPTED_FINAL');
  assert.equal(baselineState.history.length, 2);
  assert.equal(baselineState.history[1].source_image_storage_id, initialState.project.original_image_storage_id);
  const baselineStorageId = baselineState.project.current_image_storage_id;
  const baselineHistoryId = baselineState.project.history_cursor_id;
  diagnostics.projectLifecycle.baseline = summarizeState(baselineState);

  // R3c / Discard: Core-verified preview must disappear without mutating Project or history.
  const discardBefore = await readProjectState(projectId);
  const discardLocalBefore = diagnostics.localExecutionRequests.length;
  const discardPreview = await runVerifiedRotate(page, 12, 8, 'R3c discard preview');
  assert.equal(diagnostics.localExecutionRequests.length, discardLocalBefore + 4, 'one Rotate preview must use exactly four local-execution transport requests');
  const discard = page.getByRole('button', { name: 'Discard', exact: true });
  await discard.waitFor({ state: 'visible', timeout: 10_000 });
  await discard.click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 10_000 });
  await page.getByRole('button', { name: 'Discard', exact: true }).waitFor({ state: 'detached', timeout: 10_000 });
  assert.equal(await page.getByRole('img', { name: 'after', exact: true }).count(), 0, 'Discard must remove the pending preview from the Editor');
  const discardImage = await loadedImageEvidence(page, 'Project', 8, 12, 20_000);
  assertSignedCoreImage(discardImage, [8, 12], 'Project image after Discard');
  const discardAfter = await readProjectState(projectId);
  assert.deepEqual(discardAfter, discardBefore, 'Discard must not mutate canonical Project, history, dimensions or versions');
  const discardLocalAfter = diagnostics.localExecutionRequests.length;
  diagnostics.projectLifecycle.discard = Object.freeze({ preview: discardPreview.previewImage, state: summarizeState(discardAfter), localRequests: discardLocalAfter - discardLocalBefore });

  // R3c / Version create: production Versions UI + native prompt, no cursor mutation.
  const versionBefore = await readProjectState(projectId);
  const versionResponsePromise = page.waitForResponse(response => {
    const url = safeUrl(response.url());
    return response.request().method() === 'POST'
      && url?.origin === coreOrigin
      && url.pathname === `/api/core/projects/${projectId}/versions`;
  }, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  const saveVersion = page.getByRole('menuitem').filter({ hasText: 'Save current as version' });
  await saveVersion.waitFor({ state: 'visible', timeout: 10_000 });
  const dialogPromise = page.waitForEvent('dialog', { timeout: 10_000 });
  const saveClick = saveVersion.click();
  const dialog = await dialogPromise;
  assert.equal(dialog.type(), 'prompt', 'Save current as version must use the production name prompt');
  assert.equal(dialog.message(), 'Version name');
  await dialog.accept(versionName);
  await saveClick;
  const versionResponse = await versionResponsePromise;
  assert.equal(versionResponse.status(), 200, 'Version creation must be admitted by Core');
  const versionAfter = await readProjectState(projectId);
  assert.deepEqual(projectAndHistory(versionAfter), projectAndHistory(versionBefore), 'creating a named version must not move Project current image or history cursor');
  assert.equal(versionAfter.versions.length, 1);
  const version = versionAfter.versions[0];
  assert.equal(version.name, versionName);
  assert.equal(version.image_storage_id, baselineStorageId);
  assert.equal(version.history_id, baselineHistoryId);
  assert.match(version.version_id, /^[0-9a-f-]{36}$/i);
  assert.equal(diagnostics.localExecutionRequests.length, discardLocalAfter, 'creating a version must not trigger another local execution');
  diagnostics.projectLifecycle.version = Object.freeze({ ...version });

  // Advance away from the saved version with another real accepted Rotate.
  const advancePreview = await runVerifiedRotate(page, 12, 8, 'R3c advance-after-version preview');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  const advancedImage = await loadedImageEvidence(page, 'Project', 12, 8, 20_000);
  assertSignedCoreImage(advancedImage, [12, 8], 'Project image after advancing beyond saved version');
  const advancedState = await readProjectState(projectId);
  assert.equal(advancedState.project.cursor_ordinal, 2);
  assert.equal(advancedState.project.cursor_kind, 'ACCEPTED_FINAL');
  assert.equal(advancedState.history.length, 3);
  assert.equal(advancedState.history[2].source_image_storage_id, baselineStorageId);
  assert.notEqual(advancedState.project.current_image_storage_id, baselineStorageId);
  const advancedStorageId = advancedState.project.current_image_storage_id;
  const advancedHistoryId = advancedState.project.history_cursor_id;
  diagnostics.projectLifecycle.advanced = summarizeState(advancedState);

  // Restore saved version through the actual Versions menu. This must append one RESTORE_VERSION step.
  const restoreResponsePromise = page.waitForResponse(response => {
    const url = safeUrl(response.url());
    return response.request().method() === 'POST'
      && url?.origin === coreOrigin
      && url.pathname === `/api/core/projects/${projectId}/versions/${version.version_id}/restore`;
  }, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  const restoreItem = page.getByRole('menuitem').filter({ hasText: versionName });
  await restoreItem.waitFor({ state: 'visible', timeout: 10_000 });
  await restoreItem.click();
  const restoreResponse = await restoreResponsePromise;
  assert.equal(restoreResponse.status(), 200, 'Version restore must be admitted by Core');
  const restoredImage = await loadedImageEvidence(page, 'Project', 8, 12, 20_000);
  assertSignedCoreImage(restoredImage, [8, 12], 'Project image after Version restore');
  const restoredState = await readProjectState(projectId);
  assert.equal(restoredState.project.current_image_storage_id, baselineStorageId);
  assert.equal(restoredState.project.cursor_ordinal, 3);
  assert.equal(restoredState.project.cursor_kind, 'RESTORE_VERSION');
  assert.equal(restoredState.history.length, 4, 'Version restore must append exactly one active history entry');
  assert.equal(restoredState.history[3].kind, 'RESTORE_VERSION');
  assert.equal(restoredState.history[3].source_image_storage_id, advancedStorageId);
  assert.equal(restoredState.history[3].image_storage_id, baselineStorageId);
  assert.equal(restoredState.history[3].instruction, `Restored version "${versionName}"`);
  assert.deepEqual(restoredState.versions, versionAfter.versions, 'restoring a version must not rewrite the named version identity');
  const restoredHistoryId = restoredState.project.history_cursor_id;
  diagnostics.projectLifecycle.restored = summarizeState(restoredState);

  // Restore remains a normal undoable/redoable canonical history step.
  await waitForEnabledButton(page, 'Undo');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await loadedImageEvidence(page, 'Project', 12, 8, 20_000);
  const restoreUndoState = await readProjectState(projectId);
  assert.equal(restoreUndoState.project.current_image_storage_id, advancedStorageId);
  assert.equal(restoreUndoState.project.history_cursor_id, advancedHistoryId);
  assert.equal(restoreUndoState.project.cursor_ordinal, 2);
  assert.equal(restoreUndoState.history.length, 4);

  await waitForEnabledButton(page, 'Redo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await loadedImageEvidence(page, 'Project', 8, 12, 20_000);
  const restoreRedoState = await readProjectState(projectId);
  assert.equal(restoreRedoState.project.current_image_storage_id, baselineStorageId);
  assert.equal(restoreRedoState.project.history_cursor_id, restoredHistoryId);
  assert.equal(restoreRedoState.project.cursor_ordinal, 3);
  assert.equal(restoreRedoState.history.length, 4);

  // Stale FINAL: tab A prepares from restored baseline; tab B moves the canonical cursor via production Undo.
  const staleLocalBefore = diagnostics.localExecutionRequests.length;
  const stalePreview = await runVerifiedRotate(page, 12, 8, 'R3c stale FINAL preview');
  const staleSourceState = await readProjectState(projectId);
  assert.equal(staleSourceState.project.current_image_storage_id, baselineStorageId);
  assert.equal(staleSourceState.project.cursor_ordinal, 3);
  assert.equal(staleSourceState.history.length, 4);
  assert.equal(diagnostics.localExecutionRequests.length, staleLocalBefore + 4);

  tabB = await page.context().newPage();
  attachPageDiagnostics(tabB, 'B');
  await tabB.goto(`${frontendOrigin}/editor?id=${projectId}`, { waitUntil: 'domcontentloaded' });
  await loadedImageEvidence(tabB, 'Project', 8, 12, 20_000);
  await waitForEnabledButton(tabB, 'Undo');
  await tabB.getByRole('button', { name: 'Undo', exact: true }).click();
  const tabBImage = await loadedImageEvidence(tabB, 'Project', 12, 8, 20_000);
  assertSignedCoreImage(tabBImage, [12, 8], 'tab B canonical Project after Undo');
  const tabBState = await readProjectState(projectId);
  assert.equal(tabBState.project.current_image_storage_id, advancedStorageId);
  assert.equal(tabBState.project.history_cursor_id, advancedHistoryId);
  assert.equal(tabBState.project.cursor_ordinal, 2);
  assert.equal(tabBState.history.length, 4, 'tab B history navigation must preserve redo/restore history');

  // Tab A still holds the verified FINAL bound to baselineStorageId. Accept must fail closed with 409.
  const staleAccept = page.getByRole('button', { name: 'Accept', exact: true });
  await staleAccept.waitFor({ state: 'visible', timeout: 10_000 });
  const historyBeforeRejectedAccept = await readProjectState(projectId);
  const localCallsBeforeRejectedAccept = diagnostics.localExecutionRequests.length;
  expectingFinalSourceConflict = true;
  const conflictResponsePromise = page.waitForResponse(response => {
    const url = safeUrl(response.url());
    return response.request().method() === 'POST'
      && url?.origin === coreOrigin
      && url.pathname === `/api/core/projects/${projectId}/accept-final`;
  }, { timeout: 15_000 });
  await staleAccept.click();
  const conflictResponse = await conflictResponsePromise;
  assert.equal(conflictResponse.status(), 409, 'stale FINAL acceptance must be rejected by Core with HTTP 409');
  const conflictBody = await conflictResponse.json();
  assert.equal(conflictBody?.code ?? conflictBody?.error, 'final_source_conflict');
  expectingFinalSourceConflict = false;

  await page.getByText(conflictMessage, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).count(), 0, 'stale recovery must disarm Retry');
  assert.equal(await page.getByRole('button', { name: 'Discard', exact: true }).count(), 0, 'stale recovery must clear the pending result');
  assert.equal(await page.getByRole('img', { name: 'after', exact: true }).count(), 0, 'stale preview must be removed after conflict recovery');
  const recoveredImage = await loadedImageEvidence(page, 'Project', 12, 8, 20_000);
  assertSignedCoreImage(recoveredImage, [12, 8], 'tab A canonical Project after stale FINAL recovery');
  const recoveredState = await readProjectState(projectId);
  assert.deepEqual(recoveredState, tabBState, 'tab A must reload to the exact canonical Project/history state established in tab B');
  assert.deepEqual(recoveredState, historyBeforeRejectedAccept, 'rejected stale FINAL must not add, retire or move any Project history entry');
  assert.equal(diagnostics.localExecutionRequests.length, localCallsBeforeRejectedAccept, 'stale recovery must not automatically rerun local execution');
  assert.equal(diagnostics.expectedFinalSourceConflicts.length, 1, 'exactly one expected final_source_conflict must be observed');
  diagnostics.projectLifecycle.staleConflict = Object.freeze({
    source: summarizeState(staleSourceState),
    tabB: summarizeState(tabBState),
    recovered: summarizeState(recoveredState),
    responseStatus: conflictResponse.status(),
    code: conflictBody?.code ?? conflictBody?.error,
    preview: stalePreview.previewImage,
  });

  assert.equal(providerCalls, 0, 'R3c Project lifecycle must not invoke an external provider');
  assert.deepEqual(diagnostics.creativeRequests, [], 'R3c Project lifecycle must not invoke creative/cloud execution');
  assert.deepEqual(diagnostics.legacyRequests, [], 'R3c Project lifecycle must not probe unowned legacy routes');
  assert.deepEqual(diagnostics.financialRequests, [], 'R3c Project lifecycle must not invoke browser payment/subscription/credit authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'R3c Project lifecycle must not contact an external cloud origin');
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.unexpectedResponses, []);
  assert.equal(diagnostics.localExecutionRequests.length, 16, 'R3c fixture must perform exactly four deterministic Rotate executions');

  const expected401Console = /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i;
  const expected409Console = /Failed to load resource: the server responded with a status of 409 \(Conflict\)/i;
  const toleratedConsole = diagnostics.consoleErrors.filter(entry =>
    /favicon|ResizeObserver/i.test(entry.message)
    || (diagnostics.expectedAuthContext401s.length > 0 && expected401Console.test(entry.message))
    || (diagnostics.expectedFinalSourceConflicts.length > 0 && expected409Console.test(entry.message))
  );
  assert.equal(diagnostics.consoleErrors.length, toleratedConsole.length, `unexpected browser console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);

  console.log(JSON.stringify({
    authority: 'R3C_BROWSER_PROJECT_LIFECYCLE_ACCEPTED',
    r3bBaselineAuthority: 'R3B_BROWSER_DETERMINISTIC_EDIT_ACCEPTED',
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
    projectMutationRequestCount: diagnostics.projectMutationRequests.length,
    expectedFinalSourceConflictCount: diagnostics.expectedFinalSourceConflicts.length,
    protectedRouteRedirect: '/login',
    projectLifecycle: diagnostics.projectLifecycle,
    baselinePreview: baselinePreview.previewImage,
    advancePreview: advancePreview.previewImage,
  }, null, 2));
} catch (error) {
  throw new Error(
    `R3C_BROWSER_RELEASE_E2E_FAILED\n${JSON.stringify({ ...diagnostics, providerCalls, coreLogs: coreLogs.slice(-40) }, null, 2)}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
} finally {
  expectingFinalSourceConflict = false;
  await tabB?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (frontend) await closeServer(frontend).catch(() => undefined);
  core.kill('SIGTERM');
  await waitForExit(core, 5_000).catch(() => core.kill('SIGKILL'));
  await closeServer(providerTrap).catch(() => undefined);
  await pool.end();
}

function attachPageDiagnostics(page, tab) {
  page.on('pageerror', error => diagnostics.pageErrors.push({ tab, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push({ tab, message: message.text() }); });
  page.on('request', request => {
    const url = safeUrl(request.url());
    if (!url) return;
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== frontendOrigin && url.origin !== coreOrigin) {
      diagnostics.externalBrowserRequests.push({ tab, url: request.url(), method: request.method() });
    }
    const financialRoute = /^\/api\/core\/(?:financial(?:\/|$)|billing(?:\/|$)|checkout(?:\/|$)|subscriptions?(?:\/|$)|credits?(?:\/|$)|trials?(?:\/|$))/i;
    const legacyFinancialEntity = /^\/api\/core\/data\/(?:Subscription|Credit|Billing|Trial)/i;
    if (financialRoute.test(url.pathname) || legacyFinancialEntity.test(url.pathname)) diagnostics.financialRequests.push({ tab, url: request.url(), method: request.method() });
    if (url.pathname.startsWith('/api/core/creative/')) diagnostics.creativeRequests.push({ tab, url: request.url(), method: request.method() });
    if (url.pathname.startsWith('/api/core/local-execution/')) diagnostics.localExecutionRequests.push({ tab, url: request.url(), pathname: url.pathname, method: request.method() });
    if (url.pathname === '/api/core/observability/events' || url.pathname.startsWith('/api/core/data/Notification')) diagnostics.legacyRequests.push({ tab, url: request.url(), method: request.method() });
    if (url.pathname.startsWith('/api/core/projects/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) diagnostics.projectMutationRequests.push({ tab, url: request.url(), pathname: url.pathname, method: request.method() });
  });
  page.on('requestfailed', request => diagnostics.requestFailures.push({ tab, url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => {
    const url = safeUrl(response.url());
    if (url?.pathname.startsWith('/api/core/artifacts/results/')) diagnostics.artifactResponses.push({ tab, url: response.url(), status: response.status(), contentType: response.headers()['content-type'] ?? null });
    if (response.status() < 400) return;
    if (!authenticated && response.status() === 401 && url?.pathname === '/api/core/auth/context') {
      diagnostics.expectedAuthContext401s.push({ tab, url: response.url(), status: response.status() });
      return;
    }
    if (expectingFinalSourceConflict
      && response.status() === 409
      && diagnostics.projectId
      && url?.pathname === `/api/core/projects/${diagnostics.projectId}/accept-final`) {
      diagnostics.expectedFinalSourceConflicts.push({ tab, url: response.url(), status: response.status() });
      return;
    }
    diagnostics.unexpectedResponses.push({ tab, url: response.url(), status: response.status() });
  });
}

async function runVerifiedRotate(page, expectedWidth, expectedHeight, label) {
  const localStart = diagnostics.localExecutionRequests.length;
  const resultResponsePromise = page.waitForResponse(response => {
    const url = safeUrl(response.url());
    return response.request().method() === 'POST'
      && url?.origin === coreOrigin
      && /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/result$/.test(url.pathname);
  }, { timeout: 20_000 });
  const rotate = page.getByRole('button', { name: 'Rotate 90° clockwise', exact: true });
  await rotate.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await rotate.isEnabled(), true, `${label}: Rotate must be enabled`);
  await rotate.click();
  const resultResponse = await resultResponsePromise;
  assert.equal(resultResponse.status(), 200, `${label}: Core result response must be HTTP 200`);
  const coreResult = await resultResponse.json();
  assert.equal(coreResult.status, 'SUCCESS', `${label}: Core result must be SUCCESS`);
  assert.equal(coreResult.verification?.valid, true, `${label}: Core verification must be valid`);
  assert.equal(typeof coreResult.artifactId === 'string' && coreResult.artifactId.length > 0, true, `${label}: canonical FINAL artifact identity is required`);
  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  await accept.waitFor({ state: 'visible', timeout: 20_000 });
  const previewImage = await loadedImageEvidence(page, 'after', expectedWidth, expectedHeight, 20_000);
  assertLocalVerifiedPreview(previewImage, [expectedWidth, expectedHeight], label);
  const calls = diagnostics.localExecutionRequests.slice(localStart);
  assert.equal(calls.length, 4, `${label}: deterministic Rotate must perform exactly prepare/inputs/image-upload/result`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].pathname, '/api/core/local-execution/orthogonal-transform/prepare');
  assert.equal(calls[1].method, 'GET');
  assert.match(calls[1].pathname, /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/inputs$/);
  assert.equal(calls[2].method, 'POST');
  assert.match(calls[2].pathname, /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/image-upload$/);
  assert.equal(calls[3].method, 'POST');
  assert.match(calls[3].pathname, /^\/api\/core\/local-execution\/orthogonal-transform\/[^/]+\/result$/);
  return Object.freeze({ coreResult, previewImage });
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
  assert.equal(project.rowCount, 1, 'R3c browser Project must exist in canonical PostgreSQL authority');
  const history = await pool.query(
    `SELECT history_id,ordinal,image_storage_id,source_image_storage_id,kind,instruction
     FROM canonical_project_history
     WHERE project_id=$1 AND retired_at IS NULL
     ORDER BY ordinal`,
    [projectId],
  );
  const versions = await pool.query(
    `SELECT version_id,name,image_storage_id,history_id
     FROM canonical_project_versions
     WHERE project_id=$1 AND deleted_at IS NULL
     ORDER BY created_at,version_id`,
    [projectId],
  );
  return Object.freeze({
    project: Object.freeze({ ...project.rows[0] }),
    history: Object.freeze(history.rows.map(row => Object.freeze({ ...row }))),
    versions: Object.freeze(versions.rows.map(row => Object.freeze({ ...row }))),
  });
}

function projectAndHistory(state) {
  return Object.freeze({ project: state.project, history: state.history });
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
    versions: state.versions.length,
  });
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`R3c release artifact is missing: ${file}`);
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
        response.end('R3c SPA server has no API authority');
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
      response.end(error instanceof Error ? error.message : 'R3c static server error');
    });
  });
  await listen(server, port);
  return server;
}
