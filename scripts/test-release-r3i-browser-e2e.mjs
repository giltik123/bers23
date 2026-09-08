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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3i release browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4190;
const corePort = 4191;
const providerPort = 4192;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');
const tenantId = 'release-r3i-tenant';
const userId = 'release-r3i-user';
const email = 'release-r3i@example.test';
const password = `release-r3i-browser-password-${'x'.repeat(32)}`;
const jacketName = 'R3i Black Jacket';
const pantsName = 'R3i Blue Pants';
const outfitName = 'R3i Travel Layers';

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
await assertFile(viteEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3i-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3i Browser User' });

const projectPng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 91, g: 123, b: 151, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

const jacketPng = await sharp({
  create: { width: 640, height: 640, channels: 4, background: { r: 24, g: 30, b: 38, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

const pantsPng = await sharp({
  create: { width: 640, height: 640, channels: 4, background: { r: 37, g: 74, b: 122, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3I_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3i-core',
    JWT_AUDIENCE: 'release-r3i-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3i <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3i-google-unused',
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

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3i`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: 'release-r3i-project.png',
    mimeType: 'image/png',
    buffer: projectPng,
  });
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
  assert.equal(await countGarments(), 0, 'R3i owner must begin without Managed Garments');
  assert.equal(await countOutfits(), 0, 'R3i owner must begin without canonical Outfits');

  const fashion = page.getByRole('button', { name: 'Fashion', exact: true });
  const initialFashionLoad = waitForCoreResponses(page, [
    ['GET', '/api/core/garments'],
    ['GET', '/api/core/wardrobe/garments'],
    ['GET', '/api/core/wardrobe/collections'],
  ]);
  await fashion.click();
  await initialFashionLoad;

  const wardrobeRegion = page.getByRole('region', { name: 'Canonical fashion wardrobe', exact: true });
  await wardrobeRegion.waitFor({ state: 'visible', timeout: 15_000 });
  await assertActiveNavigation(fashion, 'Fashion');

  resetJourneyDiagnostics();

  const jacket = await createGarmentThroughUi({
    name: jacketName,
    fileName: 'r3i-black-jacket.png',
    buffer: jacketPng,
    category: 'jackets',
    season: 'winter',
    material: 'Wool',
    tag: 'r3i-jacket',
  });
  const pants = await createGarmentThroughUi({
    name: pantsName,
    fileName: 'r3i-blue-pants.png',
    buffer: pantsPng,
    category: 'pants',
    season: 'winter',
    material: 'Denim',
    tag: 'r3i-pants',
  });
  assert.notEqual(jacket.id, pants.id, 'two visible garment creates must mint two distinct stable Garment IDs');

  const garmentRows = await readGarmentRows();
  assert.equal(garmentRows.length, 2);
  const durableJacket = garmentRows.find(row => row.garment_id === jacket.id);
  const durablePants = garmentRows.find(row => row.garment_id === pants.id);
  assert(durableJacket && durablePants, 'both browser-created stable Garment IDs must be durable');
  assert.equal(durableJacket.name, jacketName);
  assert.equal(durableJacket.category, 'jackets');
  assert.equal(Number(durableJacket.revision), 2);
  assert.equal(durablePants.name, pantsName);
  assert.equal(durablePants.category, 'pants');
  assert.equal(Number(durablePants.revision), 2);
  assert.equal(await countGarmentViews(), 2, 'each browser-created garment must persist one immutable initial view');

  const outfitsNav = page.getByRole('button', { name: 'Outfits', exact: true });
  const initialOutfitLoad = waitForCoreResponses(page, [
    ['GET', '/api/core/wardrobe/outfits'],
    ['GET', '/api/core/wardrobe/garments'],
  ]);
  await outfitsNav.click();
  await initialOutfitLoad;
  await assertActiveNavigation(outfitsNav, 'Outfits');

  const outfitRegion = page.getByRole('region', { name: 'Canonical Outfit builder', exact: true });
  await outfitRegion.waitFor({ state: 'visible', timeout: 15_000 });
  await outfitRegion.getByText('No managed outfits yet. Create one to compose stable garment references.', { exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });

  await outfitRegion.getByPlaceholder('New outfit').fill(outfitName);
  const createOutfitWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/wardrobe/outfits');
  await outfitRegion.getByRole('button', { name: 'Create', exact: true }).click();
  const createOutfitResponse = await createOutfitWait;
  assert.equal(createOutfitResponse.status(), 201);
  assert.deepEqual(JSON.parse(createOutfitResponse.request().postData() ?? '{}'), { name: outfitName });
  const createdOutfit = await createOutfitResponse.json();
  const outfitId = createdOutfit.id;
  assert.match(outfitId, /^[0-9a-f-]{36}$/);
  assert.equal(createdOutfit.revision, 1);
  assert.equal(createdOutfit.reference_readiness, 'EMPTY');
  assert.deepEqual(createdOutfit.entries, []);
  assert.equal(await createOutfitResponse.headerValue('x-outfit-revision'), '1');
  await outfitRegion.getByRole('button', { name: `${outfitName} (0)`, exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  const garmentSelect = outfitRegion.getByLabel('Garment to add');
  await garmentSelect.selectOption({ label: `${jacketName} · jackets` });
  const addJacketWait = waitForCoreResponse(page, 'POST', pathname => pathname === `/api/core/wardrobe/outfits/${outfitId}/entries`);
  await outfitRegion.getByRole('button', { name: 'Add', exact: true }).click();
  const addJacketResponse = await addJacketWait;
  assert.equal(addJacketResponse.status(), 200);
  assert.equal(await addJacketResponse.request().headerValue('x-expected-outfit-revision'), '1');
  assert.deepEqual(JSON.parse(addJacketResponse.request().postData() ?? '{}'), { garment_id: jacket.id });
  const outfitWithJacket = await addJacketResponse.json();
  assert.equal(outfitWithJacket.revision, 2);
  assert.equal(await addJacketResponse.headerValue('x-outfit-revision'), '2');
  assert.equal(outfitWithJacket.reference_readiness, 'REFERENCES_READY');
  assert.equal(outfitWithJacket.entries.length, 1);
  assert.equal(outfitWithJacket.entries[0].garment_id, jacket.id);
  assert.equal(outfitWithJacket.entries[0].position, 0);
  assert.equal(outfitWithJacket.entries[0].layer_role, 'OUTER_TOP');
  const jacketEntryId = outfitWithJacket.entries[0].entry_id;
  assert.match(jacketEntryId, /^[0-9a-f-]{36}$/);
  await outfitRegion.getByRole('button', { name: `${outfitName} (1)`, exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  await garmentSelect.selectOption({ label: `${pantsName} · pants` });
  const addPantsWait = waitForCoreResponse(page, 'POST', pathname => pathname === `/api/core/wardrobe/outfits/${outfitId}/entries`);
  await outfitRegion.getByRole('button', { name: 'Add', exact: true }).click();
  const addPantsResponse = await addPantsWait;
  assert.equal(addPantsResponse.status(), 200);
  assert.equal(await addPantsResponse.request().headerValue('x-expected-outfit-revision'), '2');
  assert.deepEqual(JSON.parse(addPantsResponse.request().postData() ?? '{}'), { garment_id: pants.id });
  const outfitWithBoth = await addPantsResponse.json();
  assert.equal(outfitWithBoth.revision, 3);
  assert.equal(await addPantsResponse.headerValue('x-outfit-revision'), '3');
  assert.equal(outfitWithBoth.reference_readiness, 'REFERENCES_READY');
  assert.deepEqual(outfitWithBoth.entries.map(entry => entry.garment_id), [jacket.id, pants.id]);
  assert.deepEqual(outfitWithBoth.entries.map(entry => entry.position), [0, 1]);
  assert.deepEqual(outfitWithBoth.entries.map(entry => entry.layer_role), ['OUTER_TOP', 'BOTTOM']);
  const pantsEntry = outfitWithBoth.entries.find(entry => entry.garment_id === pants.id);
  assert(pantsEntry, 'second stable garment must receive one canonical Outfit entry');
  const pantsEntryId = pantsEntry.entry_id;
  assert.match(pantsEntryId, /^[0-9a-f-]{36}$/);
  assert.notEqual(pantsEntryId, jacketEntryId, 'Outfit entries must have distinct stable identities');
  await outfitRegion.getByRole('button', { name: `${outfitName} (2)`, exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  assert.deepEqual(await moveLabels(outfitRegion), [
    `Move ${jacketName} up`,
    `Move ${jacketName} down`,
    `Move ${pantsName} up`,
    `Move ${pantsName} down`,
  ]);

  const reorderWait = waitForCoreResponse(page, 'POST', pathname => pathname === `/api/core/wardrobe/outfits/${outfitId}/reorder`);
  await outfitRegion.getByRole('button', { name: `Move ${pantsName} up`, exact: true }).click();
  const reorderResponse = await reorderWait;
  assert.equal(reorderResponse.status(), 200);
  assert.equal(await reorderResponse.request().headerValue('x-expected-outfit-revision'), '3');
  assert.deepEqual(JSON.parse(reorderResponse.request().postData() ?? '{}'), {
    entry_ids: [pantsEntryId, jacketEntryId],
  }, 'visible reorder must submit the complete stable entry-ID permutation');
  const reordered = await reorderResponse.json();
  assert.equal(reordered.id, outfitId);
  assert.equal(reordered.revision, 4);
  assert.equal(await reorderResponse.headerValue('x-outfit-revision'), '4');
  assert.deepEqual(reordered.entries.map(entry => entry.entry_id), [pantsEntryId, jacketEntryId]);
  assert.deepEqual(reordered.entries.map(entry => entry.garment_id), [pants.id, jacket.id]);
  assert.deepEqual(reordered.entries.map(entry => entry.position), [0, 1]);
  assert.deepEqual(reordered.entries.map(entry => entry.layer_role), ['BOTTOM', 'OUTER_TOP']);

  await page.waitForFunction(
    ({ pants, jacket }) => {
      const labels = [...document.querySelectorAll('[aria-label^="Move "]')].map(element => element.getAttribute('aria-label'));
      const start = labels.findIndex(value => value === `Move ${pants} up`);
      return start >= 0
        && labels[start + 1] === `Move ${pants} down`
        && labels[start + 2] === `Move ${jacket} up`
        && labels[start + 3] === `Move ${jacket} down`;
    },
    { pants: pantsName, jacket: jacketName },
    { timeout: 10_000 },
  );
  assert.equal(await outfitRegion.getByRole('button', { name: `Move ${pantsName} up`, exact: true }).isDisabled(), true);
  assert.equal(await outfitRegion.getByRole('button', { name: `Move ${jacketName} down`, exact: true }).isDisabled(), true);

  const prompt = page.getByRole('button', { name: 'Prompt', exact: true });
  await prompt.click();
  await assertActiveNavigation(prompt, 'Prompt');

  const remountOutfitLoad = waitForCoreResponses(page, [
    ['GET', '/api/core/wardrobe/outfits'],
    ['GET', '/api/core/wardrobe/garments'],
  ]);
  await outfitsNav.click();
  await remountOutfitLoad;
  await assertActiveNavigation(outfitsNav, 'Outfits');
  await outfitRegion.waitFor({ state: 'visible', timeout: 15_000 });
  await outfitRegion.getByRole('button', { name: `${outfitName} (2)`, exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await outfitRegion.getByText(pantsName, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await outfitRegion.getByText(jacketName, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  assert.deepEqual(await moveLabels(outfitRegion), [
    `Move ${pantsName} up`,
    `Move ${pantsName} down`,
    `Move ${jacketName} up`,
    `Move ${jacketName} down`,
  ], 'Outfit remount must reconstruct canonical server-owned entry order');
  assert.equal(await outfitRegion.getByRole('button', { name: `Move ${pantsName} up`, exact: true }).isDisabled(), true);
  assert.equal(await outfitRegion.getByRole('button', { name: `Move ${jacketName} down`, exact: true }).isDisabled(), true);

  const durableOutfit = await readOutfitState(outfitId);
  assert.equal(durableOutfit.outfit.outfit_id, outfitId);
  assert.equal(durableOutfit.outfit.name, outfitName);
  assert.equal(durableOutfit.outfit.style, 'casual');
  assert.equal(durableOutfit.outfit.season, 'all_season');
  assert.equal(durableOutfit.outfit.occasion, 'casual');
  assert.equal(durableOutfit.outfit.favorite, false);
  assert.equal(durableOutfit.outfit.status, 'ACTIVE');
  assert.equal(Number(durableOutfit.outfit.revision), 4);
  assert.equal(durableOutfit.outfit.deleted_at, null);
  assert.deepEqual(durableOutfit.entries.map(entry => entry.entry_id), [pantsEntryId, jacketEntryId]);
  assert.deepEqual(durableOutfit.entries.map(entry => entry.garment_id), [pants.id, jacket.id]);
  assert.deepEqual(durableOutfit.entries.map(entry => Number(entry.position)), [0, 1]);
  assert.deepEqual(durableOutfit.entries.map(entry => entry.layer_role), ['BOTTOM', 'OUTER_TOP']);

  const finalProject = await readProjectState(projectId);
  assert.deepEqual(finalProject, initialProject, 'Outfit build/reorder must not mutate canonical Project state or objects');
  assert.equal(await page.getByRole('img', { name: 'Project', exact: true }).evaluate(element => element.src), initialProjectImageSrc);
  assert.equal(await countMasks(projectId), 0, 'Outfit journey must not mint canonical MASK artifacts');
  assert.equal(await countLocalTickets(projectId), 0, 'Outfit journey must not prepare local execution tickets');

  assert.deepEqual(diagnostics.fashionMutations, [
    'POST /api/core/garments',
    `PATCH /api/core/wardrobe/garments/${jacket.id}`,
    'POST /api/core/garments',
    `PATCH /api/core/wardrobe/garments/${pants.id}`,
    'POST /api/core/wardrobe/outfits',
    `POST /api/core/wardrobe/outfits/${outfitId}/entries`,
    `POST /api/core/wardrobe/outfits/${outfitId}/entries`,
    `POST /api/core/wardrobe/outfits/${outfitId}/reorder`,
  ], 'R3i mutation authority must stay on canonical Managed Garment/Wardrobe/Outfit calls');
  assert.equal(providerCalls, 0, 'Outfit build/reorder must never reach provider boundary');
  assert.deepEqual(diagnostics.localExecutionRequests, []);
  assert.deepEqual(diagnostics.creativeRequests, []);
  assert.deepEqual(diagnostics.financialRequests, []);
  assert.deepEqual(diagnostics.maskRequests, []);
  assert.deepEqual(diagnostics.genericAssetRequests, []);
  assert.deepEqual(diagnostics.projectMutations, []);
  assert.deepEqual(diagnostics.externalBrowserRequests, []);
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser request failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3I_BROWSER_OUTFIT_REORDER_ACCEPTED', JSON.stringify({
    projectId,
    jacketId: jacket.id,
    pantsId: pants.id,
    outfitId,
    outfitRevision: Number(durableOutfit.outfit.revision),
    stableEntryIds: [pantsEntryId, jacketEntryId],
    stableGarmentIds: [pants.id, jacket.id],
    positions: durableOutfit.entries.map(entry => Number(entry.position)),
    fashionMutations: diagnostics.fashionMutations,
    providerCalls,
  }));

  await browserContext.close();

  async function createGarmentThroughUi({ name, fileName, buffer, category, season, material, tag }) {
    await wardrobeRegion.getByRole('button', { name: 'Add garment', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    await dialog.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: 'image/png', buffer });
    await dialog.getByPlaceholder('Name').fill(name);
    await dialog.getByLabel('Garment category').selectOption(category);
    await dialog.getByLabel('Initial photo view').selectOption('FRONT');
    await dialog.getByLabel('Season').selectOption(season);
    await dialog.getByLabel('Material').fill(material);
    await dialog.getByPlaceholder('Tags (comma separated)').fill(tag);

    const garmentCreateWait = waitForCoreResponse(page, 'POST', pathname => pathname === '/api/core/garments');
    const metadataPatchWait = waitForCoreResponse(page, 'PATCH', pathname => /^\/api\/core\/wardrobe\/garments\/[0-9a-f-]+$/.test(pathname));
    await dialog.getByRole('button', { name: 'Save garment', exact: true }).click();
    const [garmentCreateResponse, metadataPatchResponse] = await Promise.all([garmentCreateWait, metadataPatchWait]);

    assert.equal(garmentCreateResponse.status(), 201);
    const created = await garmentCreateResponse.json();
    assert.match(created.id, /^[0-9a-f-]{36}$/);
    assert.equal(created.revision, 1);
    assert.equal(created.views.length, 1);
    assert.equal(created.views[0].ordinal, 0);
    assert.equal(created.views[0].kind, 'FRONT');
    assert.equal(created.views[0].width, 640);
    assert.equal(created.views[0].height, 640);
    assert.equal(created.views[0].encoding, 'PNG_RGBA8_LOSSLESS');
    assert.equal(created.views[0].storage_provenance, 'POSTGRES_BYTEA_V1');

    assert.equal(new URL(metadataPatchResponse.url()).pathname, `/api/core/wardrobe/garments/${created.id}`);
    assert.equal(metadataPatchResponse.status(), 200);
    assert.equal(await metadataPatchResponse.request().headerValue('x-expected-garment-revision'), '1');
    assert.deepEqual(JSON.parse(metadataPatchResponse.request().postData() ?? '{}'), {
      category,
      season,
      material: material.toLowerCase(),
      tags: [tag],
    });
    const metadata = await metadataPatchResponse.json();
    assert.equal(metadata.garment_id, created.id);
    assert.equal(metadata.revision, 2);

    await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
    await wardrobeRegion.getByText(name, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
    const image = await waitImage(page, name, 640, 640);
    const imageUrl = new URL(await image.evaluate(element => element.src));
    assert.equal(imageUrl.origin, coreOrigin);
    assert.match(imageUrl.pathname, /^\/api\/core\/garments\/delivery\/[^/]+$/);
    return Object.freeze({ id: created.id, revision: metadata.revision });
  }
} catch (error) {
  const detail = [
    `R3i browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
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
      || pathname.startsWith('/api/core/wardrobe/collections/')
      || pathname === '/api/core/wardrobe/outfits'
      || pathname.startsWith('/api/core/wardrobe/outfits/');
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

async function moveLabels(region) {
  return region.locator('button[aria-label^="Move "]').evaluateAll(elements => (
    elements.map(element => element.getAttribute('aria-label'))
  ));
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
  assert.equal(projectResult.rowCount, 1, 'canonical Project row must exist for R3i browser user');
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

async function readGarmentRows() {
  const result = await pool.query(
    `SELECT garment_id,name,category,status,revision,deleted_at
       FROM canonical_garments
      WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL
      ORDER BY name`,
    [tenantId, userId],
  );
  return Object.freeze(result.rows.map(row => Object.freeze({ ...row })));
}

async function readOutfitState(outfitId) {
  const outfitResult = await pool.query(
    `SELECT outfit_id,name,style,season,occasion,favorite,status,revision,deleted_at
       FROM canonical_outfits
      WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [outfitId, tenantId, userId],
  );
  assert.equal(outfitResult.rowCount, 1, 'canonical Outfit row must exist');
  const entryResult = await pool.query(
    `SELECT entry_id,outfit_id,garment_id,position,layer_role
       FROM canonical_outfit_entries
      WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3
      ORDER BY position`,
    [outfitId, tenantId, userId],
  );
  assert.equal(entryResult.rowCount, 2, 'R3i accepted Outfit must contain exactly two stable garment references');
  return Object.freeze({
    outfit: Object.freeze({ ...outfitResult.rows[0] }),
    entries: Object.freeze(entryResult.rows.map(row => Object.freeze({ ...row }))),
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

async function countGarmentViews() {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM canonical_garment_views
      WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL`,
    [tenantId, userId],
  );
  return result.rows[0].count;
}

async function countOutfits() {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM canonical_outfits
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
