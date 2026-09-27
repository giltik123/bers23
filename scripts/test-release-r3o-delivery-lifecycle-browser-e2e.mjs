import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import sharp from 'sharp';

import { SignedArtifactAuthority } from '../server/core/artifacts/signedArtifactAuthority.ts';
import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';
import { GarmentDeliveryAuthority } from '../server/core/fashion/garmentDeliveryAuthority.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3o delivery browser E2E must use real PostgreSQL');

const signingSecret = process.env.ARTIFACT_SIGNING_SECRET;
if (!signingSecret) throw new Error('ARTIFACT_SIGNING_SECRET is required');

const host = '127.0.0.1';
const frontendPort = 4231;
const corePort = 4232;
const providerPort = 4233;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}
await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
assert.equal(process.env.VITE_CORE_API_URL, `${coreOrigin}/api/core`, 'R3o SPA Core origin must match the browser harness');

const tenantId = 'release-r3o-tenant';
const userId = 'release-r3o-user';
const scope = Object.freeze({ tenantId, userId });
const email = 'release-r3o@example.test';
const password = `R3o-Delivery!${'d'.repeat(30)}9`;
const projectLimits = Object.freeze({ maxDimension: 1024, maxPixels: 1_048_576 });
const garmentLimits = Object.freeze({ maxUploadBytes: 2_097_152, maxDimension: 1024, maxPixels: 1_048_576 });

const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-release-r3o-delivery-browser-e2e' });
const auth = new PostgresAuthStore(pool);
await auth.provisionLocalUser({ ...scope, email, password, displayName: 'R3o Delivery User' });

const projects = new PostgresProjectStore(pool);
const garments = new PostgresGarmentStore(pool);
const expiringProject = await projects.create(scope, 'R3o Expiring Project', await png(12, 8, 41), projectLimits);
const revokedProject = await projects.create(scope, 'R3o Revoked Project', await png(11, 7, 73), projectLimits);
const expiringGarment = await garments.createWithInitialView(scope, {
  name: 'R3o Expiring Garment',
  viewKind: 'FRONT',
  sourceContentType: 'image/png',
  bytes: await png(16, 20, 111),
}, garmentLimits);
const revokedGarment = await garments.createWithInitialView(scope, {
  name: 'R3o Revoked Garment',
  viewKind: 'FRONT',
  sourceContentType: 'image/png',
  bytes: await png(15, 19, 151),
}, garmentLimits);

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3O_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3o-core',
    JWT_AUDIENCE: 'release-r3o-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3o <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3o-google-unused',
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
const diagnostics = { pageErrors: [], requestFailures: [], externalBrowserRequests: [] };

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = await startStaticSpaServer(distDir, frontendPort);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  await page.goto(`${frontendOrigin}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ state: 'visible', timeout: 10_000 });
  attachDiagnostics(page);

  const expiringProjectDto = await api(page, `/api/core/projects/${expiringProject.project_id}`);
  assert.equal(expiringProjectDto.status, 200);
  const durableProjectArtifactId = expiringProjectDto.body.current_image_artifact_id;
  assert.equal(typeof durableProjectArtifactId, 'string');
  assert.match(expiringProjectDto.body.current_image_url, /^\/api\/core\/artifacts\/results\//);
  assertImage(await api(page, expiringProjectDto.body.current_image_url), 'server-issued Project delivery capability');

  const stableAsDelivery = await api(page, `/api/core/artifacts/results/${encodeURIComponent(durableProjectArtifactId)}`);
  assertDenied(stableAsDelivery, 404, 'result_not_found', 'durable Project Artifact identity as delivery URL');

  const artifactAuthority = new SignedArtifactAuthority(signingSecret, []);
  const garmentAuthority = new GarmentDeliveryAuthority(signingSecret);
  const expiryAt = Date.now() + 1_800;
  const shortProjectToken = artifactAuthority.issueStoredOriginalDelivery(
    expiringProject.current_image_storage_id,
    { ...scope, projectId: String(expiringProject.project_id) },
    expiryAt,
  );
  const expiringGarmentView = expiringGarment.views[0];
  assert.ok(expiringGarmentView);
  const shortGarmentToken = garmentAuthority.issue(
    scope,
    expiringGarment.id,
    expiringGarmentView.id,
    expiryAt,
  );

  const shortProjectUrl = `/api/core/artifacts/results/${encodeURIComponent(shortProjectToken)}`;
  const shortGarmentUrl = `/api/core/garments/delivery/${encodeURIComponent(shortGarmentToken)}`;
  assertImage(await api(page, shortProjectUrl), 'short-lived Project delivery capability before expiry');
  assertImage(await api(page, shortGarmentUrl), 'short-lived Garment delivery capability before expiry');

  await waitPast(expiryAt);

  assertDenied(await api(page, shortProjectUrl), 404, 'result_not_found', 'expired Project delivery capability');
  assertDenied(await api(page, shortGarmentUrl), 404, 'garment_view_not_found', 'expired Garment delivery capability');

  const projectAfterExpiry = await api(page, `/api/core/projects/${expiringProject.project_id}`);
  assert.equal(projectAfterExpiry.status, 200);
  assert.equal(projectAfterExpiry.body.current_image_artifact_id, durableProjectArtifactId, 'Project durable Artifact identity must survive delivery expiry');
  assertImage(await api(page, projectAfterExpiry.body.current_image_url), 'fresh Project delivery capability after expiry');

  const garmentAfterExpiry = await api(page, `/api/core/garments/${expiringGarment.id}`);
  assert.equal(garmentAfterExpiry.status, 200);
  assert.equal(garmentAfterExpiry.body.id, expiringGarment.id);
  assert.equal(garmentAfterExpiry.body.views[0].id, expiringGarmentView.id, 'Garment durable view identity must survive delivery expiry');
  assertImage(await api(page, garmentAfterExpiry.body.views[0].delivery_url), 'fresh Garment delivery capability after expiry');

  const revokedProjectDto = await api(page, `/api/core/projects/${revokedProject.project_id}`);
  assert.equal(revokedProjectDto.status, 200);
  assertImage(await api(page, revokedProjectDto.body.current_image_url), 'Project delivery capability before revocation');

  const revokedGarmentDto = await api(page, `/api/core/garments/${revokedGarment.id}`);
  assert.equal(revokedGarmentDto.status, 200);
  const revokedGarmentView = revokedGarmentDto.body.views[0];
  assert.ok(revokedGarmentView);
  assertImage(await api(page, revokedGarmentView.delivery_url), 'Garment delivery capability before revocation');

  await pool.query(
    'UPDATE canonical_image_artifacts SET revoked_at=CURRENT_TIMESTAMP WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4',
    [revokedProject.current_image_storage_id, tenantId, userId, revokedProject.project_id],
  );
  await pool.query(
    'UPDATE canonical_garment_views SET revoked_at=CURRENT_TIMESTAMP WHERE view_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4',
    [revokedGarmentView.id, revokedGarment.id, tenantId, userId],
  );

  assertDenied(await api(page, revokedProjectDto.body.current_image_url), 404, 'result_not_found', 'revoked Project delivery capability');
  assertDenied(await api(page, revokedGarmentView.delivery_url), 404, 'garment_view_not_found', 'revoked Garment delivery capability');

  const projectAfterRevocation = await api(page, `/api/core/projects/${revokedProject.project_id}`);
  assert.equal(projectAfterRevocation.status, 200, 'Project durable identity must not be replaced by its revoked delivery URL');
  assert.equal(projectAfterRevocation.body.id, revokedProject.project_id);
  assertDenied(await api(page, projectAfterRevocation.body.current_image_url), 404, 'result_not_found', 'fresh URL for revoked Project Artifact');

  const revokedGarmentRow = await pool.query(
    'SELECT garment_id,primary_view_id,deleted_at FROM canonical_garments WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3',
    [revokedGarment.id, tenantId, userId],
  );
  assert.equal(revokedGarmentRow.rowCount, 1, 'revoking a delivery source must not rewrite or delete stable Garment identity');
  assert.equal(String(revokedGarmentRow.rows[0].garment_id), revokedGarment.id);
  assert.equal(String(revokedGarmentRow.rows[0].primary_view_id), revokedGarmentView.id);
  assert.equal(revokedGarmentRow.rows[0].deleted_at, null);

  assert.equal(providerCalls, 0, 'delivery lifecycle must never reach provider authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'R3o browser must not call external origins');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.deepEqual(diagnostics.requestFailures, [], `unexpected network failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3O_BROWSER_DELIVERY_LIFECYCLE_ACCEPTED', JSON.stringify({
    expiringProjectId: expiringProject.project_id,
    revokedProjectId: revokedProject.project_id,
    expiringGarmentId: expiringGarment.id,
    revokedGarmentId: revokedGarment.id,
    durableProjectArtifactId,
    providerCalls,
  }));

  await context.close();
} catch (error) {
  throw new Error([
    `R3o delivery browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`,
    `providerCalls=${providerCalls}`,
    `coreLogs=${coreLogs.join('').slice(-16000)}`,
  ].join('\n'));
} finally {
  await browser?.close().catch(() => undefined);
  if (frontend) await closeServer(frontend).catch(() => undefined);
  await stopChild(core);
  await closeServer(providerTrap).catch(() => undefined);
  await pool.end();
}

function attachDiagnostics(page) {
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' }));
  page.on('request', request => {
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.origin !== frontendOrigin && url.origin !== coreOrigin) diagnostics.externalBrowserRequests.push(request.url());
  });
}

async function login(page) {
  await page.goto(`${frontendOrigin}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
}

async function api(page, pathName) {
  return page.evaluate(async url => {
    const response = await fetch(url, { credentials: 'include', headers: { Accept: '*/*' } });
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim()?.toLowerCase() ?? '';
    let body;
    if (contentType === 'application/json') body = await response.json().catch(() => undefined);
    else if (contentType.startsWith('image/')) body = { byteLength: (await response.arrayBuffer()).byteLength };
    else body = await response.text().catch(() => '');
    return { status: response.status, contentType, body };
  }, `${coreOrigin}${pathName}`);
}

function assertImage(response, label) {
  assert.equal(response.status, 200, `${label} returned HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  assert.equal(response.contentType, 'image/png', `${label} must deliver canonical PNG`);
  assert.ok(Number(response.body?.byteLength) > 0, `${label} must deliver non-empty bytes`);
}

function assertDenied(response, status, code, label) {
  assert.equal(response.status, status, `${label} returned HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  assert.equal(response.body?.error ?? response.body?.code, code, `${label} returned an unexpected denial code`);
}

async function waitPast(expiresAt) {
  const delay = Math.max(0, expiresAt - Date.now() + 80);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function png(width, height, red) {
  return sharp({
    create: { width, height, channels: 4, background: { r: red, g: (red + 41) % 255, b: (red + 83) % 255, alpha: 1 } },
  }).png({ compressionLevel: 9 }).toBuffer();
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`R3o release artifact is missing: ${file}`);
}

async function waitForHttp(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited before ${url} became ready with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`process did not become ready at ${url}: ${last ?? 'no response'}`);
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

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
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
        response.end('R3o SPA server has no API authority');
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
      response.end(error instanceof Error ? error.message : 'R3o static server error');
    });
  });
  await listen(server, port);
  return server;
}
