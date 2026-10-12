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
  segmentationRequests: [],
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

  const browserContext = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 900 } });
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

  await page.getByText('Edit the whole image or use the selection tool to mark a region. Automatic object detection is not available in this version.', { exact: true })
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

  // Local-only browser workspace: real uploaded-in-memory PNG, real pixel
  // processing and a real downloadable file. The canonical Core Project must
  // remain byte-for-byte unchanged; no AI provider or local execution ticket.
  await page.getByRole('button', { name: 'Local tools', exact: true }).click();
  await page.locator('input[aria-label="Choose a local photo without uploading it"]').setInputFiles({
    name: 'release-r3e-local.png', mimeType: 'image/png', buffer: sourcePng,
  });
  const localLab = page.getByRole('region', { name: 'Local photo adjustments' });
  await localLab.getByRole('heading', { name: 'Local photo lab' }).waitFor({ state: 'visible', timeout: 10_000 });
  const brightness = localLab.getByRole('slider', { name: 'Local Brightness' });
  await brightness.fill('40');
  assert.equal(await brightness.inputValue(), '40', 'local brightness slider must drive real pixel settings');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    return canvas instanceof HTMLCanvasElement && canvas.width === 12 && canvas.height === 8
      && canvas.getContext('2d').getImageData(6, 4, 1, 1).data[0] > 44;
  }, null, { timeout: 10_000 });
  const localDownloadPromise = page.waitForEvent('download', { timeout: 10_000 });
  await localLab.getByRole('button', { name: 'Download edited PNG' }).click();
  const localDownload = await localDownloadPromise;
  assert.match(localDownload.suggestedFilename(), /-local-edit\.png$/);
  const localPng = await fs.readFile(await localDownload.path());
  const localPixels = await sharp(localPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(localPixels.info.width, 12);
  assert.equal(localPixels.info.height, 8);
  assert.deepEqual([...localPixels.data.subarray(0, 4)], [94, 146, 198, 255], 'full resolution local PNG must contain actual brightness-adjusted pixels');
  assert.deepEqual(await readProjectState(projectId), initial, 'local PNG editing must never mutate canonical Core Project');
  assert.equal(providerCalls, 0, 'local image editing must never call AI providers');
  assert.deepEqual(diagnostics.localExecutionRequests, [], 'local PNG editing must not manufacture Core execution tickets');

  // New precision controls must modify the rendered pixels, support unified
  // Undo, and not mutate the protected Core Project.
  await localLab.getByText('Tone curve', { exact: true }).click();
  const curveMidpoint = localLab.getByRole('slider', { name: 'Curve Midtones' });
  await curveMidpoint.fill('200');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    return canvas?.getContext('2d')?.getImageData(6, 4, 1, 1).data[0] > 94;
  }, null, { timeout: 10_000 });
  await localLab.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    return canvas?.getContext('2d')?.getImageData(6, 4, 1, 1).data[0] === 94;
  }, null, { timeout: 10_000 });

  // Independent Red-channel tone curve must alter only red (not green/blue).
  await localLab.getByRole('combobox', { name: 'Tone curve channel' }).selectOption('red');
  await curveMidpoint.fill('200');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    const rgba = canvas?.getContext('2d')?.getImageData(6, 4, 1, 1).data;
    return rgba && rgba[0] > 94 && rgba[1] === 146 && rgba[2] === 198 && rgba[3] === 255;
  }, null, { timeout: 10_000 });
  await localLab.getByRole('button', { name: 'Reset tone curve' }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    const rgba = canvas?.getContext('2d')?.getImageData(6, 4, 1, 1).data;
    return rgba && rgba[0] === 94 && rgba[1] === 146 && rgba[2] === 198 && rgba[3] === 255;
  }, null, { timeout: 10_000 });
  await localLab.getByRole('combobox', { name: 'Tone curve channel' }).selectOption('rgb');

  await localLab.getByText('Selective HSL', { exact: true }).click();
  await localLab.getByRole('combobox', { name: 'Selective HSL color range' }).selectOption('blue');
  const selectiveSaturation = localLab.getByRole('slider', { name: 'Selective Saturation' });
  await selectiveSaturation.fill('-90');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    const sample = canvas?.getContext('2d')?.getImageData(6, 4, 1, 1).data;
    return sample && (sample[0] !== 94 || sample[1] !== 146 || sample[2] !== 198);
  }, null, { timeout: 10_000 });
  await localLab.getByRole('button', { name: 'Undo', exact: true }).click();

  // Local gradients must blend the original unadjusted pixels (left side)
  // with the corrected pixels (right side), and Reset must fully undo the mask.
  await localLab.getByText('Local gradient mask', { exact: true }).click();
  await localLab.getByRole('combobox', { name: 'Local gradient mask direction' }).selectOption('left-right');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    if (!canvas) return false;
    const context = canvas.getContext('2d');
    return context.getImageData(0, 4, 1, 1).data[0] === 44
      && context.getImageData(11, 4, 1, 1).data[0] === 94;
  }, null, { timeout: 10_000 });
  await localLab.getByRole('slider', { name: 'Gradient start' }).fill('20');
  await localLab.getByRole('slider', { name: 'Gradient end' }).fill('80');
  await localLab.getByRole('button', { name: 'Clear gradient mask' }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    return canvas?.getContext('2d')?.getImageData(0, 4, 1, 1).data[0] === 94;
  }, null, { timeout: 10_000 });

  // A nonuniform image proves the manual clone tool copies actual user-chosen
  // source pixels. The same exact output must arrive in the downloaded PNG.
  const stampRgba = Buffer.alloc(12 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
    const i = (y * 12 + x) * 4;
    stampRgba[i] = x < 4 ? 255 : 0;
    stampRgba[i + 1] = 0;
    stampRgba[i + 2] = x < 4 ? 0 : 255;
    stampRgba[i + 3] = 255;
  }
  const stampPng = await sharp(stampRgba, { raw: { width: 12, height: 8, channels: 4 } }).png().toBuffer();
  await page.locator('input[aria-label="Choose a local photo without uploading it"]').setInputFiles({
    name: 'r3e-stamp.png', mimeType: 'image/png', buffer: stampPng,
  });
  await localLab.getByText('r3e-stamp.png', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await localLab.getByText('Manual clone stamp', { exact: true }).click();
  await localLab.getByRole('button', { name: 'Pick source' }).click();
  const stampCanvas = localLab.getByRole('img', { name: 'Locally edited photo preview' });
  await stampCanvas.scrollIntoViewIfNeeded();
  const stampRect = await stampCanvas.boundingBox();
  assert(stampRect && stampRect.width > 4 && stampRect.height > 4, 'stamp preview must offer a real pointer surface');
  await stampCanvas.click({ position: { x: stampRect.width * 2.5 / 12, y: stampRect.height * 4.5 / 8 } });
  await localLab.getByText(/Source selected/).waitFor({ state: 'visible', timeout: 10_000 });
  await stampCanvas.click({ position: { x: stampRect.width * 7.5 / 12, y: stampRect.height * 4.5 / 8 } });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    const sample = canvas?.getContext('2d')?.getImageData(7, 4, 1, 1).data;
    return sample && sample[0] === 255 && sample[1] === 0 && sample[2] === 0 && sample[3] === 255;
  }, null, { timeout: 10_000 });
  const stampDownloadPending = page.waitForEvent('download', { timeout: 10_000 });
  await localLab.getByRole('button', { name: 'Download edited PNG' }).click();
  const stampDownload = await stampDownloadPending;
  const stampBytes = await fs.readFile(await stampDownload.path());
  const stampResult = await sharp(stampBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...stampResult.data.subarray((4 * 12 + 7) * 4, (4 * 12 + 7) * 4 + 4)], [255, 0, 0, 255], 'manual clone stroke must survive exact full-resolution local PNG export');
  assert.deepEqual(await readProjectState(projectId), initial, 'local clone editing must not mutate canonical Core Project');
  assert.equal(providerCalls, 0, 'precision local tools must never contact an AI provider');
  assert.deepEqual(diagnostics.localExecutionRequests, [], 'precision local tools must never issue Core execution tickets');

  // Browser annotation acceptance: this must draw genuinely new RGBA on a
  // separate overlay canvas, then flatten those vectors into an actual PNG.
  await localLab.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await localLab.getByRole('button', { name: 'Add centered rectangle' }).click();
  await localLab.getByRole('button', { name: 'Delete annotation 1' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[data-local-annotation-surface="true"]');
    if (!canvas || canvas.width !== 12 || canvas.height !== 8) return false;
    const rgba = canvas.getContext('2d')?.getImageData(0, 0, 12, 8).data;
    if (!rgba) return false;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] > 0) return true;
    return false;
  }, null, { timeout: 10_000 });
  const annotatedDownloadPromise = page.waitForEvent('download', { timeout: 10_000 });
  await localLab.getByRole('button', { name: 'Download edited PNG' }).click();
  const annotatedDownload = await annotatedDownloadPromise;
  const annotationBytes = await fs.readFile(await annotatedDownload.path());
  const annotationPixels = await sharp(annotationBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let modifiedAnnotationPixels = 0;
  for (let offset = 0; offset < annotationPixels.data.length; offset += 4) {
    const current = annotationPixels.data.subarray(offset, offset + 4);
    const previous = stampResult.data.subarray(offset, offset + 4);
    if (!current.every((value, channel) => value === previous[channel])) modifiedAnnotationPixels++;
    assert.equal(current[3], previous[3], 'annotation must preserve original fully opaque RGBA alpha');
  }
  assert(modifiedAnnotationPixels > 0, 'rectangle must change real exported PNG pixels, not just UI controls');
  await localLab.getByRole('button', { name: 'Delete annotation 1' }).click();
  assert.equal(await localLab.getByRole('button', { name: 'Delete annotation 1' }).count(), 0, 'individual annotation deletion must take effect');
  await localLab.getByRole('button', { name: 'Undo', exact: true }).click();
  await localLab.getByRole('button', { name: 'Delete annotation 1' }).waitFor({ state: 'visible' });
  // Drag actual arrow geometry over the interactive overlay; no center-button
  // shortcut. Pointer coordinates are normalized and must reach the saved list.
  await localLab.getByRole('button', { name: 'Arrow', exact: true }).click();
  const drawSurface = localLab.locator('canvas[data-local-annotation-surface="true"]');
  await drawSurface.scrollIntoViewIfNeeded();
  const drawRect = await drawSurface.boundingBox();
  assert(drawRect && drawRect.width > 8 && drawRect.height > 5, 'annotation canvas must accept pointer geometry');
  await page.mouse.move(drawRect.x + drawRect.width * .2, drawRect.y + drawRect.height * .3);
  await page.mouse.down();
  await page.mouse.move(drawRect.x + drawRect.width * .85, drawRect.y + drawRect.height * .7, { steps: 7 });
  await page.mouse.up();
  await localLab.getByRole('button', { name: 'Delete annotation 2' }).waitFor({ state: 'visible', timeout: 10_000 });

  await localLab.getByRole('button', { name: 'Text', exact: true }).click();
  await localLab.getByRole('textbox', { name: 'Annotation text' }).fill('Retouch this area');
  await localLab.getByRole('button', { name: 'Add centered text' }).click();
  await localLab.getByRole('button', { name: 'Delete annotation 3' }).waitFor({ state: 'visible' });

  // Existing vector annotations must be editable after placement. Verify
  // actual stored text/color and shared Undo rather than simply moving sliders.
  await localLab.getByRole('button', { name: 'Select annotation 1' }).click();
  await localLab.getByRole('button', { name: 'Select annotation 3' }).click();
  const selectedProperties = localLab.getByRole('region', { name: 'Selected annotation properties' });
  await selectedProperties.getByRole('textbox', { name: 'Selected annotation text' }).fill('Final review');
  await selectedProperties.getByRole('combobox', { name: 'Selected annotation color' }).selectOption('#0f766e');
  await selectedProperties.getByRole('button', { name: 'Move annotation right' }).click();
  await localLab.getByText('3. text: Final review').waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await selectedProperties.getByRole('combobox', { name: 'Selected annotation color' }).inputValue(), '#0f766e');
  await localLab.getByRole('button', { name: 'Undo', exact: true }).click();
  await localLab.getByText('3. text: Final review').waitFor({ state: 'visible' });
  await localLab.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await selectedProperties.getByRole('combobox', { name: 'Selected annotation color' }).inputValue(), '#ef4444', 'Undo must restore vector annotation color without altering source pixels');

  assert.deepEqual(await readProjectState(projectId), initial, 'local annotations must never mutate canonical Core Project');
  assert.equal(providerCalls, 0, 'annotation drawing must never invoke an AI provider');

  // Manual color-matched repair samples a clean source and target surroundings,
  // then repairs an isolated dark blemish without any network or AI execution.
  const repairRgba = Buffer.alloc(11 * 7 * 4);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 11; x++) {
    const i = (y * 11 + x) * 4;
    const tone = (x === 8 && y === 3) ? 0 : (x < 5 ? 70 : 130);
    repairRgba[i] = tone;
    repairRgba[i + 1] = tone;
    repairRgba[i + 2] = tone;
    repairRgba[i + 3] = 255;
  }
  const repairPng = await sharp(repairRgba, { raw: { width: 11, height: 7, channels: 4 } }).png().toBuffer();
  await page.locator('input[aria-label="Choose a local photo without uploading it"]').setInputFiles({
    name: 'r3e-repair.png', mimeType: 'image/png', buffer: repairPng,
  });
  await localLab.getByText('r3e-repair.png', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await localLab.getByRole('combobox', { name: 'Local retouch method' }).selectOption('color-match');
  await localLab.getByRole('button', { name: 'Pick source' }).click();
  const repairCanvas = localLab.getByRole('img', { name: 'Locally edited photo preview' });
  await repairCanvas.scrollIntoViewIfNeeded();
  const repairBox = await repairCanvas.boundingBox();
  assert(repairBox && repairBox.width > 4, 'repair canvas must be an actual interactive image');
  await repairCanvas.click({ position: { x: repairBox.width * 2.5 / 11, y: repairBox.height * 3.5 / 7 } });
  await repairCanvas.click({ position: { x: repairBox.width * 8.5 / 11, y: repairBox.height * 3.5 / 7 } });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Local photo adjustments"] canvas');
    const color = canvas?.getContext('2d')?.getImageData(8, 3, 1, 1).data;
    return color && color[0] === 130 && color[1] === 130 && color[2] === 130 && color[3] === 255;
  }, null, { timeout: 10_000 });
  const repairDownloadPending = page.waitForEvent('download', { timeout: 10_000 });
  await localLab.getByRole('button', { name: 'Download edited PNG' }).click();
  const repairDownload = await repairDownloadPending;
  const repairBytes = await fs.readFile(await repairDownload.path());
  const repairPixels = await sharp(repairBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...repairPixels.data.subarray((3 * 11 + 8) * 4, (3 * 11 + 8) * 4 + 4)], [130, 130, 130, 255], 'color-matched repair must transfer actual neighboring tone into full-resolution PNG');
  assert.deepEqual(await readProjectState(projectId), initial, 'manual tonal retouch must not mutate Core Project');
  assert.equal(providerCalls, 0, 'manual tonal retouch must never invoke AI providers');
  assert.deepEqual(diagnostics.localExecutionRequests, [], 'manual tonal retouch must never create Core execution tickets');

  await page.getByRole('button', { name: 'Prompt', exact: true }).click();

  // Start Selection without invoking Smart Select, switch immediately to deterministic manual Add,
  // and use Playwright's locator pointer action against the real Project image. A single brush dot
  // is sufficient for the release-floor MASK while preserving normal actionability and pointer events.
  await page.getByRole('button', { name: 'Smart Select', exact: true }).click();
  await page.getByRole('region', { name: 'Selection tools' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Brush Size').fill('96');
  // The Photoshop-inspired opacity control must be keyboard/touch-actionable;
  // reset it to fully opaque before the existing canonical byte-exact baseline.
  const brushOpacity = page.getByLabel('Brush Opacity');
  await brushOpacity.fill('50');
  assert.equal(await brushOpacity.inputValue(), '50', 'real browser brush-opacity slider must accept intermediate values');
  await brushOpacity.fill('100');

  // Display-only mask overlay controls must not touch Core or modify canonical alpha.
  await page.getByLabel('Mask overlay opacity').fill('80');
  await page.getByRole('button', { name: 'Magenta overlay' }).click();
  await page.getByLabel('Show mask overlay').uncheck();
  assert.equal(await page.locator('section[aria-label="Image canvas"] canvas').count(), 0, 'hiding the overlay must remove the visualization');
  await page.getByLabel('Show mask overlay').check();


  const projectImage = page.getByRole('img', { name: 'Project', exact: true });
  await projectImage.scrollIntoViewIfNeeded();
  const box = await projectImage.boundingBox();
  assert(box && box.width > 4 && box.height > 4, 'Project image must expose a real browser pointer surface');
  await page.evaluate(() => {
    window.__r3eSelectionPointer = null;
    window.addEventListener('pointerdown', (event) => {
      window.__r3eSelectionPointer = {
        pointerType: event.pointerType,
        clientX: event.clientX,
        clientY: event.clientY,
        targetTag: event.target instanceof Element ? event.target.tagName : null,
      };
    }, { once: true, capture: true });
  });
  const touchX = box.x + box.width * 0.5;
  const touchY = box.y + box.height * 0.5;
  await projectImage.tap({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  const observedPointer = await page.evaluate(() => window.__r3eSelectionPointer);
  assert.equal(observedPointer?.pointerType, 'touch', 'release-floor Selection input must exercise the real touch PointerEvent path');
  assert(Math.abs(observedPointer.clientX - touchX) <= 1, 'touch pointer X must stay on the requested Project-image coordinate');
  assert(Math.abs(observedPointer.clientY - touchY) <= 1, 'touch pointer Y must stay on the requested Project-image coordinate');

  // Read actual rendered RGBA pixel data to prove that the chosen overlay color
  // and opacity reach the canvas, rather than merely updating inert slider state.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('section[aria-label="Image canvas"] canvas');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width !== 12 || canvas.height !== 8) return false;
    return canvas.getContext('2d').getImageData(6, 4, 1, 1).data[3] > 0;
  }, null, { timeout: 10_000 });
  const overlayColor = await page.locator('section[aria-label="Image canvas"] canvas').evaluate((element) => {
    const rgba = element.getContext('2d').getImageData(6, 4, 1, 1).data;
    return [...rgba];
  });
  assert.deepEqual(overlayColor.slice(0, 3), [217, 70, 239], 'mask visualization must be magenta after changing the color');
  assert.equal(overlayColor[3], 204, '80% overlay transparency must produce a real RGBA alpha value');

  const done = page.getByRole('button', { name: 'Done', exact: true });
  await waitForEnabled(done, 'Done');
  assert.equal((await readMasks(projectId)).length, 0, 'manual selection draft must remain noncanonical before Done');
  assert.deepEqual(await readProjectState(projectId), initial, 'manual selection draft must not mutate Project before Done');
  assert.deepEqual(diagnostics.segmentationRequests, [], 'manual Add release-floor selection must not invoke Smart Select/model execution');

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
  assert(maskAlpha[4 * 12 + 6] > 0, 'center touch must map through the real pointer/view transform into the center of the ORIGINAL-coordinate MASK');
  assert.equal(maskAlpha[4 * 12 + 6], 255, 'display-only magenta and 80% overlay must not attenuate the opaque canonical MASK byte');

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
  const firstTicket = await readLatestBackgroundIsolationTicket(projectId);
  assertExactMaskTicketBinding(firstTicket, maskBody.artifactId);
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
  const secondTicket = await readLatestBackgroundIsolationTicket(projectId);
  assert.notEqual(secondTicket.ticket_id, firstTicket.ticket_id, 'second user intent must receive its own durable local execution ticket');
  assertExactMaskTicketBinding(secondTicket, maskBody.artifactId);
  const sourceProjectImageSrc = await projectImage.evaluate(element => element.src);
  const acceptResponsePromise = waitForProjectMutationResponse(page, projectId, 'accept-final');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  const acceptResponse = await acceptResponsePromise;
  assert.equal(acceptResponse.ok(), true, 'Background Isolation Accept must succeed through canonical Core Project mutation');
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'detached', timeout: 20_000 });
  await waitImageChanged(page, 'Project', sourceProjectImageSrc, 12, 8);

  const accepted = await readProjectState(projectId);
  assert.notEqual(accepted.project.current_image_storage_id, sourceStorageId);
  assert.equal(accepted.cursor.ordinal, 1);
  assert.equal(accepted.cursor.kind, 'ACCEPTED_FINAL');
  assert.equal(accepted.history.length, 2);
  assert.equal(accepted.history[1].width, 12);
  assert.equal(accepted.history[1].height, 8);
  assert.equal(accepted.history[1].source_image_storage_id, sourceStorageId);
  const acceptedStorageId = accepted.project.current_image_storage_id;

  const acceptedFinal = await readImageArtifact(acceptedStorageId, projectId);
  assert.equal(acceptedFinal.producer_operation, 'BACKGROUND_ISOLATION');
  assert.equal(acceptedFinal.source_image_storage_id, sourceStorageId);
  assert.equal(acceptedFinal.mask_storage_id, canonicalMask.storage_id, 'accepted FINAL must durably bind the exact manual MASK row');
  assert.equal(acceptedFinal.width, 12);
  assert.equal(acceptedFinal.height, 8);

  await waitEnabledButton(page, 'Undo');
  const acceptedProjectImageSrc = await projectImage.evaluate(element => element.src);
  const undoResponsePromise = waitForProjectMutationResponse(page, projectId, 'undo');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undoResponse = await undoResponsePromise;
  assert.equal(undoResponse.ok(), true, 'Undo must succeed through canonical Core Project mutation');
  await waitImageChanged(page, 'Project', acceptedProjectImageSrc, 12, 8);
  const undone = await readProjectState(projectId);
  assert.equal(undone.project.current_image_storage_id, sourceStorageId);
  assert.equal(undone.cursor.ordinal, 0);

  await waitEnabledButton(page, 'Redo');
  const undoneProjectImageSrc = await projectImage.evaluate(element => element.src);
  const redoResponsePromise = waitForProjectMutationResponse(page, projectId, 'redo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const redoResponse = await redoResponsePromise;
  assert.equal(redoResponse.ok(), true, 'Redo must succeed through canonical Core Project mutation');
  await waitImageChanged(page, 'Project', undoneProjectImageSrc, 12, 8);
  const redone = await readProjectState(projectId);
  assert.equal(redone.project.current_image_storage_id, acceptedStorageId);
  assert.equal(redone.cursor.ordinal, 1);

  assert.deepEqual(diagnostics.maskRequests, ['POST /api/core/artifacts/masks'], 'manual release-floor Selection must create exactly one Core MASK');
  assert.deepEqual(diagnostics.segmentationRequests, [], 'manual release-floor selection must remain model-independent');
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
    firstTicketId: firstTicket.ticket_id,
    secondTicketId: secondTicket.ticket_id,
    finalStorageId: acceptedFinal.storage_id,
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
    if (method !== 'OPTIONS' && pathName.includes('/api/core/local-execution/segment')) diagnostics.segmentationRequests.push(entry);
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

async function readLatestBackgroundIsolationTicket(projectId) {
  const result = await pool.query(
    `SELECT ticket_id,ticket_json
       FROM local_execution_tickets
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND step_id='background-isolation'
      ORDER BY created_at DESC
      LIMIT 1`,
    [projectId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'Background Isolation must persist a durable local execution ticket');
  return result.rows[0];
}

function assertExactMaskTicketBinding(row, maskArtifactId) {
  const ticket = row.ticket_json;
  assert.equal(ticket.version, '2');
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.stepId, 'background-isolation');
  assert.equal(ticket.operation?.type, 'BACKGROUND_ISOLATION');
  const maskInputs = Array.isArray(ticket.inputs) ? ticket.inputs.filter(binding => binding.kind === 'mask') : [];
  assert.equal(maskInputs.length, 1);
  assert.equal(maskInputs[0].artifactId, maskArtifactId, 'durable ticket must bind the exact Core-issued MASK artifact id stored on Project');
  assert.match(maskInputs[0].sha256 ?? '', /^[a-f0-9]{64}$/i);
}

async function readImageArtifact(storageId, projectId) {
  const result = await pool.query(
    `SELECT storage_id,width,height,source_image_storage_id,mask_storage_id,producer_operation
       FROM canonical_image_artifacts
      WHERE storage_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4 AND revoked_at IS NULL AND deleted_at IS NULL`,
    [storageId, projectId, tenantId, userId],
  );
  assert.equal(result.rowCount, 1, 'accepted canonical IMAGE row must exist');
  return result.rows[0];
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

async function waitImageChanged(page, accessibleName, previousSrc, width, height, timeout = 20_000) {
  assert(previousSrc, `${accessibleName} image must have a source before canonical Project mutation`);
  const image = page.getByRole('img', { name: accessibleName, exact: true });
  await image.waitFor({ state: 'visible', timeout });
  await page.waitForFunction(
    ({ name, previousSrc: prior, expectedWidth, expectedHeight }) => {
      const candidates = [...document.querySelectorAll('img')];
      const element = candidates.find(candidate => candidate.getAttribute('alt') === name);
      return Boolean(
        element?.complete
        && element.src
        && element.src !== prior
        && element.naturalWidth === expectedWidth
        && element.naturalHeight === expectedHeight
      );
    },
    { name: accessibleName, previousSrc, expectedWidth: width, expectedHeight: height },
    { timeout },
  );
  return image;
}

function waitForProjectMutationResponse(page, projectId, action, timeout = 20_000) {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'POST'
      && url.origin === coreOrigin
      && url.pathname === `/api/core/projects/${projectId}/${action}`;
  }, { timeout });
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
