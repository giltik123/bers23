import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import sharp from 'sharp';

import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3h release browser E2E must use real PostgreSQL');

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
const tenantId = 'release-r3h-tenant';
const userId = 'release-r3h-user';
const email = 'release-r3h@example.test';
const password = `release-r3h-browser-password-${'x'.repeat(32)}`;
const garmentName = 'R3h Wool Jacket';
const collectionName = 'R3h Capsule';

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3h-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3h Browser User' });

const projectPng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 83, g: 121, b: 159, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

const garmentPng = await sharp({
  create: { width: 640, height: 640, channels: 4, background: { r: 31, g: 57, b: 83, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();
const garmentSourceSha256 = createHash('sha256').update(garmentPng).digest('hex');

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3H_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3h-core',
    JWT_AUDIENCE: 'release-r3h-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3h <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3h-google-unused',
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
  fashionReads: [],
  fashionMutations: [],
  localExecutionRequests: [],
  creativeRequests: [],
  financialRequests: [],
  maskRequests: [],
  genericAssetRequests: [],
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

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3h`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({ name: 'release-r3h-project.png', mimeType: 'image/png', buffer: projectPng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && Boolean(url.searchParams.get('id')), { timeout: 20_000 });
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  const projectImage = await waitImage(page, 'Project', 12, 8);
  const initialProjectImageSrc = await projectImage.evaluate(element => element.src);

  const initialProject = await readProjectState(projectId);
  assert.deepEqual(initialProject.project.objects, [], 'new canonical Project must begin with zero detected/selected objects');
  assert.equal(initialProject.cursor.ordinal, 0);
  assert.equal(initialProject.cursor.kind, 'ORIGINAL');
  assert.equal(initialProject.history.length, 1);
  assert.equal(await countMasks(projectId), 0);
  assert.equal(await countLocalTickets(projectId), 0);
  assert.equal(await countGarments(), 0, 'R3h owner must begin without Managed Garments');
  assert.equal(await countCollections(), 0, 'R3h owner must begin without canonical Collections');

  const fashion = page.getByRole('button', { name: 'Fashion', exact: true });
  const initialFashionLoad = waitForCoreResponses(page, [
    ['GET', '/api/core/garments'],
    ['GET', '/api/core/wardrobe/garments'],
    ['GET', '/api/core/wardrobe/collections'],
  ]);
  await fashion.click();
  await initialFashionLoad;

  const wardrobeRegion = page.getByRole('region', { name: 'Canonical fashion wardrobe', exact: true });
  const collectionsRegion = page.locator('[aria-label="Canonical garment collections"]');
  await wardrobeRegion.waitFor({ state: 'visible', timeout: 15_000 });
  await collectionsRegion.waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('No managed garments yet. Add a garment photo to create the first stable wardrobe item.', { exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
  await collectionsRegion.getByText('No collections yet.', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await assertActiveNavigation(fashion, 'Fashion');

  resetJourneyDiagnostics();

  await wardrobeRegion.getByRole('button', { name: 'Add garment', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'r3h-wool-jacket.png',
    mimeType: 'image/png',
    buffer: garmentPng,
  });
  await dialog.getByPlaceholder('Name').fill(garmentName);
  await dialog.getByLabel('Garment category').selectOption('jackets');
  await dialog.getByLabel('Initial photo view').selectOption('FRONT');
  await dialog.getByLabel('Season').selectOption('winter');
  await dialog.getByLabel('Material').fill('Wool');
  await dialog.getByPlaceholder('Tags (comma separated)').fill('navy, capsule');

  const garmentCreateWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/garments');
  const metadataPatchWait = waitForCoreResponse(page, 'PATCH', pathname => /^\/api\/core\/wardrobe\/garments\/[0-9a-f-]+$/.test(pathname));
  await dialog.getByRole('button', { name: 'Save garment', exact: true }).click();

  const garmentCreateResponse = await garmentCreateWait;
  assert.equal(garmentCreateResponse.status(), 201, 'Managed Garment create must commit through real Core');
  const garmentCreateRequest = garmentCreateResponse.request();
  const garmentCreateUrl = new URL(garmentCreateResponse.url());
  assert.equal(garmentCreateUrl.searchParams.get('name'), garmentName);
  assert.equal(garmentCreateUrl.searchParams.get('view'), 'FRONT');
  assert.equal(await garmentCreateRequest.headerValue('content-type'), 'image/png');
  const postedGarmentBytes = garmentCreateRequest.postDataBuffer();
  assert(postedGarmentBytes, 'Managed Garment create must carry the selected image bytes');
  assert.equal(postedGarmentBytes.byteLength, garmentPng.byteLength);
  assert.equal(createHash('sha256').update(postedGarmentBytes).digest('hex'), garmentSourceSha256, 'browser must send selected image bytes directly to Managed Garment authority');

  const createdGarment = await garmentCreateResponse.json();
  const garmentId = createdGarment.id;
  assert.match(garmentId, /^[0-9a-f-]{36}$/);
  assert.equal(createdGarment.revision, 1);
  assert.equal(await garmentCreateResponse.headerValue('x-garment-revision'), '1');
  assert.equal(createdGarment.views.length, 1);
  assert.equal(createdGarment.views[0].ordinal, 0);
  assert.equal(createdGarment.views[0].kind, 'FRONT');
  assert.equal(createdGarment.views[0].width, 640);
  assert.equal(createdGarment.views[0].height, 640);
  assert.equal(createdGarment.views[0].encoding, 'PNG_RGBA8_LOSSLESS');
  assert.equal(createdGarment.views[0].content_type, 'image/png');
  assert.equal(createdGarment.views[0].storage_provenance, 'POSTGRES_BYTEA_V1');

  const metadataPatchResponse = await metadataPatchWait;
  assert.equal(new URL(metadataPatchResponse.url()).pathname, `/api/core/wardrobe/garments/${garmentId}`);
  assert.equal(metadataPatchResponse.status(), 200);
  assert.equal(await metadataPatchResponse.request().headerValue('x-expected-garment-revision'), '1');
  assert.deepEqual(JSON.parse(metadataPatchResponse.request().postData() ?? '{}'), {
    category: 'jackets',
    season: 'winter',
    material: 'wool',
    tags: ['capsule', 'navy'],
  });
  const metadata = await metadataPatchResponse.json();
  assert.equal(metadata.garment_id, garmentId);
  assert.equal(metadata.revision, 2);
  assert.equal(await metadataPatchResponse.headerValue('x-garment-revision'), '2');
  assert.equal(metadata.favorite, false);

  await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
  await wardrobeRegion.getByText(garmentName, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
  const garmentImage = await waitImage(page, garmentName, 640, 640);
  const garmentImageUrl = new URL(await garmentImage.evaluate(element => element.src));
  assert.equal(garmentImageUrl.origin, coreOrigin);
  assert.match(garmentImageUrl.pathname, /^\/api\/core\/garments\/delivery\/[^/]+$/, 'garment card must render only a server-issued Managed Garment delivery capability');

  const favoriteWait = waitForCoreResponse(page, 'PATCH', pathname => pathname === `/api/core/wardrobe/garments/${garmentId}`);
  const favoriteButton = page.getByRole('button', { name: `Add ${garmentName} to favorites`, exact: true });
  await favoriteButton.click();
  const favoriteResponse = await favoriteWait;
  assert.equal(favoriteResponse.status(), 200);
  assert.equal(await favoriteResponse.request().headerValue('x-expected-garment-revision'), '2');
  assert.deepEqual(JSON.parse(favoriteResponse.request().postData() ?? '{}'), { favorite: true });
  const favorite = await favoriteResponse.json();
  assert.equal(favorite.garment_id, garmentId);
  assert.equal(favorite.revision, 3);
  assert.equal(favorite.favorite, true);
  assert.equal(await favoriteResponse.headerValue('x-garment-revision'), '3');
  const removeFavorite = page.getByRole('button', { name: `Remove ${garmentName} from favorites`, exact: true });
  await removeFavorite.waitFor({ state: 'visible', timeout: 15_000 });
  assert.equal(await removeFavorite.getAttribute('aria-pressed'), 'true');

  await collectionsRegion.getByPlaceholder('New collection').fill(collectionName);
  const collectionCreateWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/wardrobe/collections');
  await collectionsRegion.getByRole('button', { name: 'Create', exact: true }).click();
  const collectionCreateResponse = await collectionCreateWait;
  assert.equal(collectionCreateResponse.status(), 201);
  assert.deepEqual(JSON.parse(collectionCreateResponse.request().postData() ?? '{}'), { name: collectionName, description: '' });
  const collection = await collectionCreateResponse.json();
  const collectionId = collection.id;
  assert.match(collectionId, /^[0-9a-f-]{36}$/);
  assert.equal(collection.revision, 1);
  assert.deepEqual(collection.garment_ids, []);
  assert.equal(await collectionCreateResponse.headerValue('x-collection-revision'), '1');
  await collectionsRegion.getByRole('button', { name: `${collectionName} (0)`, exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  const addSelect = collectionsRegion.locator('select').first();
  await addSelect.selectOption({ label: garmentName });
  const membershipWait = waitForCoreResponse(
    page,
    'POST',
    pathname => pathname === `/api/core/wardrobe/collections/${collectionId}/garments/${garmentId}`,
  );
  await collectionsRegion.getByRole('button', { name: 'Add', exact: true }).click();
  const membershipResponse = await membershipWait;
  assert.equal(membershipResponse.status(), 200);
  assert.equal(await membershipResponse.request().headerValue('x-expected-collection-revision'), '1');
  const collectionWithGarment = await membershipResponse.json();
  assert.equal(collectionWithGarment.id, collectionId);
  assert.equal(collectionWithGarment.revision, 2);
  assert.deepEqual(collectionWithGarment.garment_ids, [garmentId]);
  assert.equal(await membershipResponse.headerValue('x-collection-revision'), '2');
  await collectionsRegion.getByRole('button', { name: `${collectionName} (1)`, exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await collectionsRegion.getByText(garmentName, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  const prompt = page.getByRole('button', { name: 'Prompt', exact: true });
  await prompt.click();
  await assertActiveNavigation(prompt, 'Prompt');

  const remountLoad = waitForCoreResponses(page, [
    ['GET', '/api/core/garments'],
    ['GET', '/api/core/wardrobe/garments'],
    ['GET', '/api/core/wardrobe/collections'],
  ]);
  await fashion.click();
  await remountLoad;
  await wardrobeRegion.waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: `Remove ${garmentName} from favorites`, exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await collectionsRegion.getByRole('button', { name: `${collectionName} (1)`, exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await collectionsRegion.getByText(garmentName, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await waitImage(page, garmentName, 640, 640);

  const durable = await readWardrobeState(garmentId, collectionId);
  assert.equal(durable.garment.garment_id, garmentId);
  assert.equal(durable.garment.name, garmentName);
  assert.equal(durable.garment.representation_tier, 'BASIC');
  assert.equal(durable.garment.status, 'ACTIVE');
  assert.equal(Number(durable.garment.revision), 3);
  assert.equal(durable.garment.primary_view_id, durable.view.view_id);
  assert.equal(durable.garment.category, 'jackets');
  assert.equal(durable.garment.season, 'winter');
  assert.equal(durable.garment.material, 'wool');
  assert.equal(durable.garment.favorite, true);
  assert.equal(durable.garment.deleted_at, null);

  assert.equal(durable.view.garment_id, garmentId);
  assert.equal(Number(durable.view.ordinal), 0);
  assert.equal(durable.view.view_kind, 'FRONT');
  assert.equal(durable.view.source_content_type, 'image/png');
  assert.equal(Number(durable.view.width), 640);
  assert.equal(Number(durable.view.height), 640);
  assert.equal(durable.view.encoding, 'PNG_RGBA8_LOSSLESS');
  assert.equal(durable.view.content_type, 'image/png');
  assert.equal(durable.view.storage_backend, 'POSTGRES_BYTEA_V1');
  assert.equal(durable.view.revoked_at, null);
  assert.equal(durable.view.deleted_at, null);
  assert(Buffer.isBuffer(durable.view.image_bytes));
  assert.equal(createHash('sha256').update(durable.view.image_bytes).digest('hex'), String(durable.view.content_sha256));
  const storedMetadata = await sharp(durable.view.image_bytes).metadata();
  assert.equal(storedMetadata.format, 'png');
  assert.equal(storedMetadata.width, 640);
  assert.equal(storedMetadata.height, 640);
  assert.deepEqual(durable.tags, ['capsule', 'navy']);

  assert.equal(durable.collection.collection_id, collectionId);
  assert.equal(durable.collection.name, collectionName);
  assert.equal(durable.collection.description, '');
  assert.equal(Number(durable.collection.revision), 2);
  assert.equal(durable.collection.deleted_at, null);
  assert.deepEqual(durable.members, [garmentId]);

  const finalProject = await readProjectState(projectId);
  assert.deepEqual(finalProject, initialProject, 'Managed Wardrobe mutations must not mutate canonical Project state or objects');
  assert.equal(await page.getByRole('img', { name: 'Project', exact: true }).evaluate(element => element.src), initialProjectImageSrc);
  assert.equal(await countMasks(projectId), 0, 'Managed Wardrobe journey must not mint canonical MASK artifacts');
  assert.equal(await countLocalTickets(projectId), 0, 'Managed Wardrobe journey must not prepare local execution tickets');

  assert.deepEqual(diagnostics.fashionMutations, [
    'POST /api/core/garments',
    `PATCH /api/core/wardrobe/garments/${garmentId}`,
    `PATCH /api/core/wardrobe/garments/${garmentId}`,
    'POST /api/core/wardrobe/collections',
    `POST /api/core/wardrobe/collections/${collectionId}/garments/${garmentId}`,
  ], 'R3h mutation authority must stay on the five narrow canonical Fashion calls');
  assert.equal(countRead('GET /api/core/garments'), 1, 'Fashion remount must reload Managed Garment list once');
  assert.equal(countRead('GET /api/core/wardrobe/garments'), 1, 'Fashion remount must reload Wardrobe projection once');
  assert.equal(countRead('GET /api/core/wardrobe/collections'), 1, 'Fashion remount must reload Collection authority once');
  assert.equal(providerCalls, 0, 'Managed Wardrobe journey must never reach provider boundary');
  assert.deepEqual(diagnostics.localExecutionRequests, []);
  assert.deepEqual(diagnostics.creativeRequests, []);
  assert.deepEqual(diagnostics.financialRequests, []);
  assert.deepEqual(diagnostics.maskRequests, []);
  assert.deepEqual(diagnostics.genericAssetRequests, []);
  assert.deepEqual(diagnostics.projectMutations, []);
  assert.deepEqual(diagnostics.externalBrowserRequests, []);
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3H_BROWSER_MANAGED_GARMENT_COLLECTION_ACCEPTED', JSON.stringify({
    projectId,
    garmentId,
    garmentRevision: Number(durable.garment.revision),
    viewId: durable.view.view_id,
    viewSha256: durable.view.content_sha256,
    collectionId,
    collectionRevision: Number(durable.collection.revision),
    membership: durable.members,
    fashionMutations: diagnostics.fashionMutations,
    providerCalls,
  }));

  await browserContext.close();
} catch (error) {
  const detail = [
    `R3h browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
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
    const pathname = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return;
    const entry = `${method} ${pathname}`;

    const canonicalFashion = pathname === '/api/core/garments'
      || pathname.startsWith('/api/core/garments/')
      || pathname === '/api/core/wardrobe/garments'
      || pathname.startsWith('/api/core/wardrobe/garments/')
      || pathname === '/api/core/wardrobe/collections'
      || pathname.startsWith('/api/core/wardrobe/collections/');
    if (canonicalFashion) {
      if (['GET', 'HEAD'].includes(method)) diagnostics.fashionReads.push(entry);
      else diagnostics.fashionMutations.push(entry);
    }

    if (pathname.includes('/api/core/local-execution/')) diagnostics.localExecutionRequests.push(entry);
    if (pathname.includes('/api/core/creative')) diagnostics.creativeRequests.push(entry);
    if (/financial|billing|credit|subscription/i.test(pathname)) diagnostics.financialRequests.push(entry);
    if (pathname.includes('/api/core/artifacts/masks')) diagnostics.maskRequests.push(entry);
    if (pathname.includes('/api/core/assets') || pathname.includes('/api/core/artifacts')) diagnostics.genericAssetRequests.push(entry);
    if (!['GET', 'HEAD'].includes(method) && pathname.includes('/api/core/projects/')) diagnostics.projectMutations.push(entry);
  });
}

function resetJourneyDiagnostics() {
  for (const key of [
    'fashionReads',
    'fashionMutations',
    'localExecutionRequests',
    'creativeRequests',
    'financialRequests',
    'maskRequests',
    'genericAssetRequests',
    'projectMutations',
    'externalBrowserRequests',
    'pageErrors',
    'requestFailures',
  ]) diagnostics[key].length = 0;
}

function countRead(entry) {
  return diagnostics.fashionReads.filter(value => value === entry).length;
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
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for R3h browser user');
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

async function readWardrobeState(garmentId, collectionId) {
  const garmentResult = await pool.query(
    `SELECT garment_id,name,representation_tier,status,revision,primary_view_id,category,season,material,favorite,deleted_at
       FROM canonical_garments
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [garmentId, tenantId, userId],
  );
  assert.equal(garmentResult.rowCount, 1, 'canonical Garment row must exist');

  const viewResult = await pool.query(
    `SELECT view_id,garment_id,ordinal,view_kind,source_content_type,width,height,encoding,content_type,content_sha256,
            storage_backend,image_bytes,revoked_at,deleted_at
       FROM canonical_garment_views
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3
      ORDER BY ordinal`,
    [garmentId, tenantId, userId],
  );
  assert.equal(viewResult.rowCount, 1, 'successful create journey must persist exactly one initial immutable Garment view');

  const tagResult = await pool.query(
    `SELECT tag
       FROM canonical_garment_tags
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3
      ORDER BY tag`,
    [garmentId, tenantId, userId],
  );

  const collectionResult = await pool.query(
    `SELECT collection_id,name,description,revision,deleted_at
       FROM canonical_garment_collections
      WHERE collection_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [collectionId, tenantId, userId],
  );
  assert.equal(collectionResult.rowCount, 1, 'canonical Collection row must exist');

  const memberResult = await pool.query(
    `SELECT garment_id
       FROM canonical_garment_collection_members
      WHERE collection_id=$1 AND tenant_id=$2 AND user_id=$3
      ORDER BY garment_id`,
    [collectionId, tenantId, userId],
  );

  return Object.freeze({
    garment: Object.freeze({ ...garmentResult.rows[0] }),
    view: Object.freeze({ ...viewResult.rows[0] }),
    tags: Object.freeze(tagResult.rows.map(row => String(row.tag))),
    collection: Object.freeze({ ...collectionResult.rows[0] }),
    members: Object.freeze(memberResult.rows.map(row => String(row.garment_id))),
  });
}

async function countGarments() {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM canonical_garments
      WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL`,
    [tenantId, userId],
  );
  return result.rows[0].count;
}

async function countCollections() {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM canonical_garment_collections
      WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL`,
    [tenantId, userId],
  );
  return result.rows[0].count;
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
