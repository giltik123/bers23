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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3j release browser E2E must use real PostgreSQL');

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
const tenantId = 'release-r3j-tenant';
const userId = 'release-r3j-user';
const email = 'release-r3j@example.test';
const password = `release-r3j-browser-password-${'x'.repeat(32)}`;
const garmentName = 'R3j Navy Jacket';
const outfitName = 'R3j Deterministic Look';
const uncertainMessage = 'Try-On outcome is uncertain. Recover or resume explicitly; no automatic retry occurs.';
const WARP_SUFFIX = ':garment-warp:v1';
const TEXTURE_SUFFIX = ':texture-composite:v1';
let currentProjectId = null;

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);
assert.equal(
  process.env.VITE_CORE_API_URL,
  `${coreOrigin}/api/core`,
  'R3j harness Core origin must exactly match the Core API origin baked into the release SPA',
);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3j-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3j Browser User' });

const projectPng = await sharp({
  create: { width: 120, height: 160, channels: 4, background: { r: 54, g: 92, b: 136, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

const garmentPng = await sharp({
  create: { width: 640, height: 640, channels: 4, background: { r: 20, g: 42, b: 74, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3J_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3j-core',
    JWT_AUDIENCE: 'release-r3j-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3j <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3j-google-unused',
    ALLOWED_WEB_ORIGINS: frontendOrigin,
    TRUSTED_PROXY_HEADER_MODE: 'NONE',
    HARD_BUDGET_CREDITS: '1',
    CREDITS_PER_EDIT: '1',
    REQUEST_BODY_LIMIT_BYTES: '262144',
    MASK_UPLOAD_LIMIT_BYTES: '1048576',
    MASK_MAX_DIMENSION: '1024',
    IMAGE_UPLOAD_LIMIT_BYTES: '4194304',
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
  tryOnRequests: [],
  manualMutations: [],
  creativeRequests: [],
  financialRequests: [],
  maskRequests: [],
  genericAssetMutations: [],
  projectMutations: [],
  legacyTryOnRequests: [],
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
    window.__r3jFault = null;
    window.__r3jFaultDrops = [];
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      let url;
      try { url = new URL(response.url); } catch { return response; }
      const fault = window.__r3jFault;
      const target = fault === 'prepare'
        ? '/api/core/fashion/try-on/prepare'
        : fault === 'result'
          ? '/api/core/fashion/try-on/result'
          : null;
      if (target && url.origin === expectedCoreOrigin && url.pathname === target && response.ok) {
        await response.clone().arrayBuffer();
        window.__r3jFault = null;
        window.__r3jFaultDrops.push({ fault, status: response.status, url: response.url });
        throw new TypeError(`R3j injected transport ambiguity after real ${fault} response`);
      }
      return response;
    };
  }, { expectedCoreOrigin: coreOrigin });

  const page = await browserContext.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3j`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: 'release-r3j-project.png',
    mimeType: 'image/png',
    buffer: projectPng,
  });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');
  currentProjectId = projectId;

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  const initialImage = await waitImage(page, 'Project', 120, 160);
  const initialProjectImageSrc = await initialImage.evaluate(element => element.src);
  assert.equal(new URL(initialProjectImageSrc).origin, coreOrigin);

  const initialProject = await readProjectState(projectId);
  assert.deepEqual(initialProject.project.objects, []);
  assert.equal(initialProject.cursor.ordinal, 0);
  assert.equal(initialProject.cursor.kind, 'ORIGINAL');
  assert.equal(initialProject.history.length, 1);
  assert.equal(await countMasks(projectId), 0);
  assert.equal(await countLocalTickets(projectId), 0);

  const fashionNav = page.getByRole('button', { name: 'Fashion', exact: true });
  const fashionLoad = waitForCoreResponses(page, [
    ['GET', '/api/core/garments'],
    ['GET', '/api/core/wardrobe/garments'],
    ['GET', '/api/core/wardrobe/collections'],
  ]);
  await fashionNav.click();
  await fashionLoad;
  const wardrobeRegion = page.getByRole('region', { name: 'Canonical fashion wardrobe', exact: true });
  await wardrobeRegion.waitFor({ state: 'visible', timeout: 15_000 });

  const garment = await createGarmentThroughUi();
  const garmentBeforeContour = await readGarmentRow(garment.id);
  assert.equal(Number(garmentBeforeContour.revision), 2);
  assert.equal(garmentBeforeContour.category, 'jackets');

  const outfitsNav = page.getByRole('button', { name: 'Outfits', exact: true });
  const outfitLoad = waitForCoreResponses(page, [
    ['GET', '/api/core/wardrobe/outfits'],
    ['GET', '/api/core/wardrobe/garments'],
  ]);
  await outfitsNav.click();
  await outfitLoad;
  const outfitRegion = page.getByRole('region', { name: 'Canonical Outfit builder', exact: true });
  await outfitRegion.waitFor({ state: 'visible', timeout: 15_000 });

  await outfitRegion.getByPlaceholder('New outfit').fill(outfitName);
  const createOutfitWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/wardrobe/outfits');
  await outfitRegion.getByRole('button', { name: 'Create', exact: true }).click();
  const createOutfitResponse = await createOutfitWait;
  assert.equal(createOutfitResponse.status(), 201);
  const createdOutfit = await createOutfitResponse.json();
  const outfitId = createdOutfit.id;
  assert.match(outfitId, /^[0-9a-f-]{36}$/);
  assert.equal(createdOutfit.revision, 1);

  const garmentSelect = outfitRegion.getByLabel('Garment to add');
  await garmentSelect.selectOption({ label: `${garmentName} · jackets` });
  const addEntryWait = waitForCoreResponse(page, 'POST', pathname => pathname === `/api/core/wardrobe/outfits/${outfitId}/entries`);
  await outfitRegion.getByRole('button', { name: 'Add', exact: true }).click();
  const addEntryResponse = await addEntryWait;
  assert.equal(addEntryResponse.status(), 200);
  assert.equal(await addEntryResponse.request().headerValue('x-expected-outfit-revision'), '1');
  const outfitWithEntry = await addEntryResponse.json();
  assert.equal(outfitWithEntry.revision, 2);
  assert.equal(outfitWithEntry.entries.length, 1);
  const entryId = outfitWithEntry.entries[0].entry_id;
  assert.match(entryId, /^[0-9a-f-]{36}$/);
  assert.equal(outfitWithEntry.entries[0].garment_id, garment.id);

  const runner = page.getByRole('region', { name: 'Canonical deterministic Try-On runner', exact: true });
  await runner.waitFor({ state: 'visible', timeout: 15_000 });
  const runnerReload = waitForCoreResponses(page, [
    ['GET', '/api/core/wardrobe/outfits'],
    ['GET', '/api/core/wardrobe/garments'],
  ]);
  await runner.getByRole('button', { name: 'Reload Try-On Outfit choices', exact: true }).click();
  await runnerReload;
  await runner.getByLabel('Outfit for deterministic Try-On').selectOption({ label: outfitName });
  await runner.getByLabel('Garment entry for deterministic Try-On').selectOption({ label: garmentName });

  resetJourneyDiagnostics();

  const firstReadinessWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/readiness');
  await runner.getByRole('button', { name: 'Check readiness', exact: true }).click();
  const firstReadiness = await firstReadinessWait;
  assert.equal(firstReadiness.status(), 200);
  const firstReadinessBody = await firstReadiness.json();
  assert.equal(firstReadinessBody.status, 'REPRESENTATION_REQUIRED');
  assert.equal(firstReadinessBody.categoryGroup, 'tops');

  const remediation = page.getByRole('region', { name: 'Canonical Try-On manual remediation', exact: true });
  await remediation.getByRole('button', { name: 'Draw garment contour', exact: true }).click();
  const contourEditor = page.getByRole('region', { name: 'Manual garment contour editor', exact: true });
  await contourEditor.waitFor({ state: 'visible', timeout: 15_000 });
  const contourImage = await waitImage(page, 'Managed garment primary view for manual contour editing', 640, 640);
  assert.equal(new URL(await contourImage.evaluate(element => element.src)).origin, coreOrigin);

  for (const [x, y] of [[0.12, 0.12], [0.88, 0.12], [0.82, 0.88], [0.18, 0.88]]) {
    await contourEditor.getByLabel('New contour point x').fill(String(x));
    await contourEditor.getByLabel('New contour point y').fill(String(y));
    await contourEditor.getByRole('button', { name: 'Add', exact: true }).click();
  }

  const contourSaveWait = waitForCoreResponse(
    page,
    'POST',
    pathname => pathname === `/api/core/fashion/garments/${garment.id}/parametric-representation`,
  );
  await contourEditor.getByRole('button', { name: 'Save contour', exact: true }).click();
  const contourSave = await contourSaveWait;
  assert.equal(contourSave.status(), 201);
  const contourIntent = JSON.parse(contourSave.request().postData() ?? '{}');
  assert.equal(contourIntent.expectedRevision, 2);
  assert.deepEqual(contourIntent.contour.contour, [[0.12, 0.12], [0.88, 0.12], [0.82, 0.88], [0.18, 0.88]]);
  const contourResult = await contourSave.json();
  assert.equal(contourResult.garmentId, garment.id);
  assert.equal(contourResult.garmentRevision, 3);
  assert.equal(contourResult.representationTier, 'PARAMETRIC');
  assert.equal(contourResult.replayed, false);
  await remediation.getByRole('button', { name: 'Check readiness again', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });

  const garmentAfterContour = await readGarmentRow(garment.id);
  assert.equal(Number(garmentAfterContour.revision), 3);
  const representation = await readRepresentation(garment.id);
  assert.equal(representation.tier, 'PARAMETRIC');
  assert.equal(representation.format, 'BERS_PARAMETRIC_V1');
  assert.equal(representation.admission_state, 'ADMITTED');
  assert.equal(representation.revoked_at, null);

  const bodyReadinessWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/readiness');
  await remediation.getByRole('button', { name: 'Check readiness again', exact: true }).click();
  const bodyReadiness = await bodyReadinessWait;
  assert.equal(bodyReadiness.status(), 200);
  const bodyReadinessBody = await bodyReadiness.json();
  assert.equal(bodyReadinessBody.status, 'BODY_ANCHORS_REQUIRED');
  assert.equal(bodyReadinessBody.categoryGroup, 'tops');
  assert.equal(bodyReadinessBody.sourceArtifactId, firstReadinessBody.sourceArtifactId);

  await remediation.getByRole('button', { name: 'Place body anchors', exact: true }).click();
  const bodyEditor = page.getByRole('region', { name: 'Manual body-anchor editor', exact: true });
  await bodyEditor.waitFor({ state: 'visible', timeout: 15_000 });
  const bodyImage = await waitImage(page, 'Current canonical project image for manual body-anchor editing', 120, 160);
  assert.equal(new URL(await bodyImage.evaluate(element => element.src)).origin, coreOrigin);

  const anchors = {
    'left shoulder': [0.2, 0.1],
    'right shoulder': [0.8, 0.1],
    'left hip': [0.25, 0.8],
    'right hip': [0.75, 0.8],
  };
  for (const [label, [x, y]] of Object.entries(anchors)) {
    await bodyEditor.getByLabel(`${label} x`).fill(String(x));
    await bodyEditor.getByLabel(`${label} y`).fill(String(y));
    await bodyEditor.getByRole('button', { name: `Set ${label} coordinates`, exact: true }).click();
  }

  const anchorSaveWait = waitForCoreResponse(
    page,
    'POST',
    pathname => pathname === `/api/core/fashion/projects/${projectId}/body-anchors`,
  );
  await bodyEditor.getByRole('button', { name: 'Save body anchors', exact: true }).click();
  const anchorSave = await anchorSaveWait;
  assert.equal(anchorSave.status(), 201);
  const anchorIntent = JSON.parse(anchorSave.request().postData() ?? '{}');
  assert.match(anchorIntent.idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.equal(anchorIntent.sourceArtifactId, firstReadinessBody.sourceArtifactId);
  assert.deepEqual(anchorIntent.payload.anchors, {
    leftShoulder: [0.2, 0.1],
    rightShoulder: [0.8, 0.1],
    leftHip: [0.25, 0.8],
    rightHip: [0.75, 0.8],
  });
  const anchorPublic = await anchorSave.json();
  assert.equal(anchorPublic.projectId, projectId);
  assert.equal(anchorPublic.anchorSet.schemaId, 'BERS_BODY_ANCHORS_V1');
  assert.equal(anchorPublic.anchorSet.coordinateSpace, 'PROJECT_IMAGE_NORMALIZED');
  await remediation.getByRole('button', { name: 'Check readiness again', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });

  const anchorRow = await readAnchorSet(projectId);
  assert.equal(anchorRow.project_image_storage_id, initialProject.project.current_image_storage_id);
  assert.equal(Number(anchorRow.project_image_width), 120);
  assert.equal(Number(anchorRow.project_image_height), 160);
  assert.equal(anchorRow.schema_id, 'BERS_BODY_ANCHORS_V1');
  assert.equal(anchorRow.coordinate_space, 'PROJECT_IMAGE_NORMALIZED');
  assert.deepEqual(anchorRow.anchor_payload.anchors, {
    leftShoulder: [0.2, 0.1],
    rightShoulder: [0.8, 0.1],
    leftHip: [0.25, 0.8],
    rightHip: [0.75, 0.8],
  });

  const readyWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/readiness');
  await remediation.getByRole('button', { name: 'Check readiness again', exact: true }).click();
  const readyResponse = await readyWait;
  assert.equal(readyResponse.status(), 200);
  const readyBody = await readyResponse.json();
  assert.equal(readyBody.status, 'READY');
  assert.equal(readyBody.categoryGroup, 'tops');
  assert.equal(readyBody.sourceArtifactId, firstReadinessBody.sourceArtifactId);
  await runner.getByText('Deterministic Try-On prerequisites are ready.', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await runner.getByRole('button', { name: 'Run', exact: true }).isDisabled(), false);

  const projectBeforeExecution = await readProjectState(projectId);
  assert.deepEqual(projectBeforeExecution, initialProject, 'manual readiness evidence must not mutate canonical Project history');

  // Scenario A: real prepare reaches Core, its response is drained, then the browser loses only the response.
  await page.evaluate(() => { window.__r3jFault = 'prepare'; });
  const prepareAWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/prepare');
  await runner.getByRole('button', { name: 'Run', exact: true }).click();
  const prepareA = await prepareAWait;
  assert.equal(prepareA.status(), 200);
  const intentA = JSON.parse(prepareA.request().postData() ?? '{}');
  const clientRequestA = intentA.clientRequestId;
  assert.match(clientRequestA, /^fashion-tryon:[0-9a-f-]{36}$/);
  await runner.getByText(uncertainMessage, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  const dropsA = await page.evaluate(() => window.__r3jFaultDrops.slice());
  assert.deepEqual(dropsA.map(value => value.fault), ['prepare']);
  assert.equal(diagnostics.tryOnRequests.some(value => value.includes('/warp/')), false, 'dropped prepare response must prevent browser pixel execution');
  assert.equal(diagnostics.tryOnRequests.some(value => value.endsWith('/continue')), false);
  assert.equal(diagnostics.tryOnRequests.some(value => value.endsWith('/result')), false);

  const aWarp = await readPhaseTicket(clientRequestA, 'garment-warp');
  assert.equal(aWarp.consumed_at, null);
  assert.equal(aWarp.finalized_status, null);
  assert.equal((await readPhaseTickets(clientRequestA, 'texture-composite')).length, 0);
  assert.deepEqual(await readProjectState(projectId), initialProject);

  await runner.getByRole('button', { name: 'Abandon', exact: true }).click();
  await runner.getByText('Check readiness before running deterministic Try-On.', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await runner.getByRole('button', { name: 'Run', exact: true }).isDisabled(), true, 'Abandon must not preserve a synthetic READY result');

  const recheckAfterAbandonWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/readiness');
  await runner.getByRole('button', { name: 'Check readiness', exact: true }).click();
  const recheckAfterAbandon = await recheckAfterAbandonWait;
  assert.equal((await recheckAfterAbandon.json()).status, 'READY');
  assert.equal(await runner.getByRole('button', { name: 'Run', exact: true }).isDisabled(), false);

  // Scenario B: complete real deterministic execution, then lose only the committed FINAL result response.
  await page.evaluate(() => { window.__r3jFault = 'result'; });
  const prepareBWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/prepare');
  const resultBWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/result', 30_000);
  await runner.getByRole('button', { name: 'Run', exact: true }).click();
  const prepareB = await prepareBWait;
  const intentB = JSON.parse(prepareB.request().postData() ?? '{}');
  const clientRequestB = intentB.clientRequestId;
  assert.match(clientRequestB, /^fashion-tryon:[0-9a-f-]{36}$/);
  assert.notEqual(clientRequestB, clientRequestA);
  const resultB = await resultBWait;
  assert.equal(resultB.status(), 200);
  const resultBBody = await resultB.json();
  assert.equal(resultBBody.status, 'FINAL_READY');
  await runner.getByText(uncertainMessage, { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
  const dropsB = await page.evaluate(() => window.__r3jFaultDrops.slice());
  assert.deepEqual(dropsB.map(value => value.fault), ['prepare', 'result']);

  const bWarp = await readPhaseTicket(clientRequestB, 'garment-warp');
  const bTexture = await readPhaseTicket(clientRequestB, 'texture-composite');
  for (const ticket of [bWarp, bTexture]) {
    assert(ticket.consumed_at, 'successful deterministic phase ticket must be consumed');
    assert.equal(ticket.finalized_status, 'SUCCESS');
  }
  const bFinal = await readFashionFinalByExecution(bTexture.request_id);
  assert.equal(bFinal.producer_operation, 'GARMENT_TEXTURE_COMPOSITE');
  assert.equal(Number(bFinal.width), 120);
  assert.equal(Number(bFinal.height), 160);

  const executionBeforeRecover = executionTryOnRequests();
  const previewWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/preview');
  await runner.getByRole('button', { name: 'Recover', exact: true }).click();
  const previewResponse = await previewWait;
  assert.equal(previewResponse.status(), 200);
  const previewIntent = JSON.parse(previewResponse.request().postData() ?? '{}');
  assert.deepEqual(previewIntent, intentB, 'Recover must reuse the exact stable in-flight product intent');
  const previewBody = await previewResponse.json();
  assert.equal(previewBody.status, 'PREVIEW_READY');
  assert.equal(previewBody.artifactId, resultBBody.artifactId);
  assert.deepEqual(executionTryOnRequests(), executionBeforeRecover, 'read-only Recover must not repeat prepare/continue/pixel execution/result');

  const recoveredAfter = await waitImage(page, 'after', 120, 160, 20_000);
  const recoveredSrc = new URL(await recoveredAfter.evaluate(element => element.src));
  assert.equal(recoveredSrc.origin, coreOrigin, 'recovered Try-On preview must render from Core in split-origin release composition');
  assert.match(recoveredSrc.pathname, /^\/api\/core\/artifacts\/results\/[^/]+$/);
  assert.deepEqual(await readProjectState(projectId), initialProject, 'recovered FINAL remains an Editor candidate until Accept');

  // Scenario C: explicit ResultCompare Retry must mint a third identity and perform a fresh canonical run.
  const prepareCWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/prepare');
  const resultCWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/fashion/try-on/result', 30_000);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const prepareC = await prepareCWait;
  const intentC = JSON.parse(prepareC.request().postData() ?? '{}');
  const clientRequestC = intentC.clientRequestId;
  assert.match(clientRequestC, /^fashion-tryon:[0-9a-f-]{36}$/);
  assert.notEqual(clientRequestC, clientRequestA);
  assert.notEqual(clientRequestC, clientRequestB);
  const resultC = await resultCWait;
  assert.equal(resultC.status(), 200);
  const resultCBody = await resultC.json();
  assert.equal(resultCBody.status, 'FINAL_READY');

  const cAfter = await waitImage(page, 'after', 120, 160, 20_000);
  const cAfterSrc = await cAfter.evaluate(element => element.src);
  assert.match(cAfterSrc, /^blob:/, 'fresh local deterministic Retry preview must remain Editor-owned blob data');
  const cWarp = await readPhaseTicket(clientRequestC, 'garment-warp');
  const cTexture = await readPhaseTicket(clientRequestC, 'texture-composite');
  for (const ticket of [cWarp, cTexture]) {
    assert(ticket.consumed_at);
    assert.equal(ticket.finalized_status, 'SUCCESS');
  }
  const cFinal = await readFashionFinalByExecution(cTexture.request_id);
  assert.equal(cFinal.producer_operation, 'GARMENT_TEXTURE_COMPOSITE');
  assert.notEqual(cFinal.storage_id, bFinal.storage_id, 'fresh Retry must produce a distinct durable FINAL');
  assert.equal(await countLocalTickets(projectId), 5, 'one abandoned warp plus two complete deterministic runs must produce five local tickets');

  const projectBeforeAccept = await readProjectState(projectId);
  assert.deepEqual(projectBeforeAccept, initialProject, 'Try-On execution/recovery/retry must not mutate Project before Accept');

  // Scenario D: existing Editor ResultCompare -> Accept is the sole Project mutation boundary.
  const acceptWait = waitForCoreResponse(page, 'POST', pathname => pathname === `/api/core/projects/${projectId}/accept-final`);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  const acceptResponse = await acceptWait;
  assert.equal(acceptResponse.status(), 200);
  assert.deepEqual(JSON.parse(acceptResponse.request().postData() ?? '{}'), {
    finalArtifactId: resultCBody.artifactId,
    instruction: 'Try on garment',
  });

  const acceptedImage = await waitImage(page, 'Project', 120, 160, 20_000);
  const acceptedSrc = new URL(await acceptedImage.evaluate(element => element.src));
  assert.equal(acceptedSrc.origin, coreOrigin);

  const acceptedProject = await readProjectState(projectId);
  assert.deepEqual(acceptedProject.project.objects, []);
  assert.equal(acceptedProject.cursor.ordinal, 1);
  assert.equal(acceptedProject.cursor.kind, 'ACCEPTED_FINAL');
  assert.equal(acceptedProject.history.length, 2);
  assert.equal(acceptedProject.project.current_image_storage_id, cFinal.storage_id);
  assert.equal(acceptedProject.history[1].image_storage_id, cFinal.storage_id);
  assert.equal(acceptedProject.history[1].source_image_storage_id, initialProject.project.current_image_storage_id);
  assert.equal(await countMasks(projectId), 0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedImage = await waitImage(page, 'Project', 120, 160, 20_000);
  assert.equal(new URL(await reloadedImage.evaluate(element => element.src)).origin, coreOrigin);
  const reloadedProject = await readProjectState(projectId);
  assert.deepEqual(reloadedProject, acceptedProject, 'accepted Try-On FINAL must survive full Editor reload');

  assert.equal(providerCalls, 0, 'canonical deterministic Try-On must never reach provider boundary');
  assert.deepEqual(diagnostics.creativeRequests, []);
  assert.deepEqual(diagnostics.financialRequests, []);
  assert.deepEqual(diagnostics.maskRequests, []);
  assert.deepEqual(diagnostics.genericAssetMutations, []);
  assert.deepEqual(diagnostics.legacyTryOnRequests, []);
  assert.deepEqual(diagnostics.projectMutations, [`POST /api/core/projects/${projectId}/accept-final`]);
  assert.deepEqual(diagnostics.externalBrowserRequests, []);
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `real Core requests must not be network-aborted: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3J_BROWSER_CANONICAL_TRYON_ACCEPTED', JSON.stringify({
    projectId,
    garmentId: garment.id,
    outfitId,
    entryId,
    clientRequestIds: [clientRequestA, clientRequestB, clientRequestC],
    abandonedWarpRequestId: aWarp.request_id,
    recoveredTextureRequestId: bTexture.request_id,
    acceptedTextureRequestId: cTexture.request_id,
    acceptedStorageId: cFinal.storage_id,
    projectMutations: diagnostics.projectMutations,
    providerCalls,
  }));

  await browserContext.close();

  async function createGarmentThroughUi() {
    await wardrobeRegion.getByRole('button', { name: 'Add garment', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'r3j-navy-jacket.png', mimeType: 'image/png', buffer: garmentPng });
    await dialog.getByPlaceholder('Name').fill(garmentName);
    await dialog.getByLabel('Garment category').selectOption('jackets');
    await dialog.getByLabel('Initial photo view').selectOption('FRONT');
    await dialog.getByLabel('Season').selectOption('winter');
    await dialog.getByLabel('Material').fill('Wool');
    await dialog.getByPlaceholder('Tags (comma separated)').fill('r3j');

    const createWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/garments');
    const metadataWait = waitForCoreResponse(page, 'PATCH', pathname => /^\/api\/core\/wardrobe\/garments\/[0-9a-f-]+$/.test(pathname));
    await dialog.getByRole('button', { name: 'Save garment', exact: true }).click();
    const [createResponse, metadataResponse] = await Promise.all([createWait, metadataWait]);
    assert.equal(createResponse.status(), 201);
    const created = await createResponse.json();
    assert.equal(created.revision, 1);
    assert.equal(created.views[0].width, 640);
    assert.equal(created.views[0].height, 640);
    assert.equal(created.views[0].encoding, 'PNG_RGBA8_LOSSLESS');
    assert.equal(created.views[0].storage_provenance, 'POSTGRES_BYTEA_V1');
    assert.equal(metadataResponse.status(), 200);
    assert.equal(await metadataResponse.request().headerValue('x-expected-garment-revision'), '1');
    const metadata = await metadataResponse.json();
    assert.equal(metadata.revision, 2);
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
    const image = await waitImage(page, garmentName, 640, 640);
    assert.equal(new URL(await image.evaluate(element => element.src)).origin, coreOrigin);
    return Object.freeze({ id: created.id, revision: metadata.revision });
  }

  function executionTryOnRequests() {
    return diagnostics.tryOnRequests.filter(value => (
      value.includes('/prepare')
      || value.includes('/continue')
      || value.includes('/warp/')
      || value.includes('/texture/')
      || value.includes('/result')
    ));
  }
} catch (error) {
  const detail = [
    `R3j browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`,
    `providerCalls=${providerCalls}`,
    `frontendLogs=${frontendLogs.join('').slice(-8000)}`,
    `coreLogs=${coreLogs.join('').slice(-20000)}`,
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
    const pathname = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return;
    const entry = `${method} ${pathname}`;

    if (pathname.startsWith('/api/core/fashion/try-on/')) diagnostics.tryOnRequests.push(entry);
    if (
      pathname.includes('/parametric-representation')
      || pathname.endsWith('/body-anchors')
    ) diagnostics.manualMutations.push(entry);
    if (pathname.includes('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathname)) diagnostics.financialRequests.push(entry);
    if (pathname.includes('/api/core/artifacts/masks')) diagnostics.maskRequests.push(entry);
    if (!['GET', 'HEAD'].includes(method) && (pathname.includes('/api/core/assets') || pathname.includes('/api/core/artifacts'))) {
      diagnostics.genericAssetMutations.push(entry);
    }
    if (!['GET', 'HEAD'].includes(method) && pathname.startsWith('/api/core/projects/')) diagnostics.projectMutations.push(entry);
    if ([
      '/api/core/local-execution/garment-mesh-warp/prepare',
      '/api/core/local-execution/garment-texture-composite/prepare',
    ].includes(pathname)) diagnostics.legacyTryOnRequests.push(entry);
  });
}

function resetJourneyDiagnostics() {
  for (const key of [
    'tryOnRequests',
    'manualMutations',
    'creativeRequests',
    'financialRequests',
    'maskRequests',
    'genericAssetMutations',
    'projectMutations',
    'legacyTryOnRequests',
    'externalBrowserRequests',
    'pageErrors',
    'consoleErrors',
    'requestFailures',
  ]) diagnostics[key].length = 0;
}

function waitForCoreResponse(page, method, pathPredicate, timeout = 15_000) {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === method && url.origin === coreOrigin && pathPredicate(url.pathname);
  }, { timeout });
}

async function waitForCoreResponses(page, specs) {
  const responses = await Promise.all(specs.map(([method, pathname]) => waitForCoreResponse(page, method, value => value === pathname)));
  for (const response of responses) assert.equal(response.ok(), true, `${response.request().method()} ${response.url()} must succeed through real Core`);
  return responses;
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
  assert.equal(projectResult.rowCount, 1);
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
    cursor: Object.freeze({ ordinal: Number(row.cursor_ordinal), kind: row.cursor_kind }),
    history: Object.freeze(historyResult.rows.map(history => Object.freeze({ ...history, ordinal: Number(history.ordinal) }))),
  });
}

async function readGarmentRow(garmentId) {
  const result = await pool.query(
    `SELECT garment_id,name,category,status,revision,primary_view_id,deleted_at
       FROM canonical_garments
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [garmentId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function readRepresentation(garmentId) {
  const result = await pool.query(
    `SELECT representation_id,garment_id,tier,format,basis_view_id,admission_state,revoked_at
       FROM canonical_garment_representations
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3
      ORDER BY admitted_at DESC,representation_id DESC`,
    [garmentId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'manual contour must create exactly one canonical representation');
  return result.rows[0];
}

async function readAnchorSet(projectId) {
  const result = await pool.query(
    `SELECT anchor_set_id,project_id,project_image_storage_id,project_image_sha256,project_image_width,project_image_height,
            schema_id,coordinate_space,anchor_payload,anchor_payload_sha256
       FROM canonical_project_body_anchor_sets
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3
      ORDER BY created_at DESC,anchor_set_id DESC`,
    [projectId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'manual body-anchor save must create exactly one canonical anchor set');
  return result.rows[0];
}

async function readPhaseTickets(clientRequestId, phase) {
  const suffix = phase === 'garment-warp' ? WARP_SUFFIX : TEXTURE_SUFFIX;
  const result = await pool.query(
    `SELECT ticket_id,idempotency_key,request_id,workflow_id,step_id,consumed_at,finalized_status,finalized_at,ticket_json
       FROM local_execution_tickets
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND idempotency_key LIKE $4
      ORDER BY created_at ASC,ticket_id ASC`,
    [tenantId, userId, projectIdForQuery(), `${clientRequestId}${suffix}:%`],
  );
  return result.rows;
}

async function readPhaseTicket(clientRequestId, phase) {
  const rows = await readPhaseTickets(clientRequestId, phase);
  assert.equal(rows.length, 1, `${phase} must resolve exactly one durable local-execution ticket`);
  return rows[0];
}

function projectIdForQuery() {
  if (currentProjectId) return currentProjectId;
  throw new Error('R3j project id is unavailable for phase-ticket oracle');
}

async function readFashionFinalByExecution(executionId) {
  const result = await pool.query(
    `SELECT storage_id,execution_id,producer_operation,source_image_storage_id,garment_warp_layer_id,
            garment_warp_layer_sha256,producer_parameters_sha256,width,height,revoked_at,deleted_at
       FROM canonical_image_artifacts
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND execution_id=$4`,
    [tenantId, userId, projectIdForQuery(), executionId],
  );
  assert.equal(result.rowCount, 1, 'successful texture execution must persist one canonical Fashion FINAL');
  const row = result.rows[0];
  assert.equal(row.revoked_at, null);
  assert.equal(row.deleted_at, null);
  return row;
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
