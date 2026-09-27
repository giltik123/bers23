import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import sharp from 'sharp';

import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresOutfitStore } from '../server/core/fashion/postgresOutfitStore.ts';
import { PostgresExecutionRunRegistry } from '../server/core/execution/PostgresExecutionRunRegistry.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3n cross-scope browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4221;
const corePort = 4222;
const providerPort = 4223;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}
await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);
assert.equal(process.env.VITE_CORE_API_URL, `${coreOrigin}/api/core`, 'R3n SPA Core origin must match the browser harness');

const tenantId = 'release-r3n-tenant';
const owner = Object.freeze({ tenantId, userId: 'release-r3n-owner' });
const attacker = Object.freeze({ tenantId, userId: 'release-r3n-attacker' });
const ownerEmail = 'release-r3n-owner@example.test';
const attackerEmail = 'release-r3n-attacker@example.test';
const ownerPassword = `R3n-Owner!${'o'.repeat(32)}9`;
const attackerPassword = `R3n-Attacker!${'a'.repeat(28)}7`;

const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-release-r3n-cross-scope-browser-e2e' });
const auth = new PostgresAuthStore(pool);
await auth.provisionLocalUser({ ...owner, email: ownerEmail, password: ownerPassword, displayName: 'R3n Owner' });
await auth.provisionLocalUser({ ...attacker, email: attackerEmail, password: attackerPassword, displayName: 'R3n Attacker' });

const projectStore = new PostgresProjectStore(pool);
const garmentStore = new PostgresGarmentStore(pool);
const outfitStore = new PostgresOutfitStore(pool);
const runRegistry = new PostgresExecutionRunRegistry(pool);
const projectLimits = Object.freeze({ maxDimension: 1024, maxPixels: 1_048_576 });
const garmentLimits = Object.freeze({ maxUploadBytes: 2_097_152, maxDimension: 1024, maxPixels: 1_048_576 });

const projectImageA = await image(12, 8, { r: 37, g: 81, b: 129, alpha: 1 });
const projectImageB = await image(10, 7, { r: 61, g: 103, b: 149, alpha: 1 });
const attackerImage = await image(9, 6, { r: 73, g: 119, b: 167, alpha: 1 });
const garmentImage = await image(16, 20, { r: 131, g: 79, b: 53, alpha: 1 });

const ownerProjectA = await projectStore.create(owner, 'R3n Owner Project A', projectImageA, projectLimits);
const ownerProjectB = await projectStore.create(owner, 'R3n Owner Project B', projectImageB, projectLimits);
const attackerProject = await projectStore.create(attacker, 'R3n Attacker Project', attackerImage, projectLimits);
const ownerGarment = await garmentStore.createWithInitialView(owner, {
  name: 'R3n Owner Garment',
  viewKind: 'FRONT',
  sourceContentType: 'image/png',
  bytes: garmentImage,
}, garmentLimits);
const ownerOutfit = await outfitStore.create(owner, { name: 'R3n Owner Outfit', style: 'casual', season: 'all_season', occasion: 'casual' });

const ownerScopeA = Object.freeze({ ...owner, projectId: String(ownerProjectA.project_id) });
const ownerRun = (await runRegistry.issue({
  scope: ownerScopeA,
  capability: 'WORKFLOW_CONTINUATION',
  idempotencyKey: 'r3n-owner-root-run',
  authorityKind: 'WORKFLOW_CONTINUATION',
  authorityRef: 'r3n-owner-fixture-continuation',
})).run;

const baselineAuthorityCounts = await authorityCounts();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3N_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
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
    JWT_ISSUER: 'release-r3n-core',
    JWT_AUDIENCE: 'release-r3n-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3n <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3n-google-unused',
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
  requestFailures: [],
  externalBrowserRequests: [],
};

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = await startStaticSpaServer(distDir, frontendPort);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const ownerContext = await browser.newContext();
  const attackerContext = await browser.newContext();

  const ownerPage = await ownerContext.newPage();
  const attackerPage = await attackerContext.newPage();

  await login(ownerPage, ownerEmail, ownerPassword);
  await login(attackerPage, attackerEmail, attackerPassword);

  // Login lands on Projects, whose thumbnail image loads are unrelated to this
  // cross-scope HTTP vertical. Move both authenticated sessions onto a quiet
  // protected surface before starting network diagnostics so every captured
  // failure belongs to an explicit R3n probe.
  await ownerPage.goto(`${frontendOrigin}/settings`, { waitUntil: 'domcontentloaded' });
  await attackerPage.goto(`${frontendOrigin}/settings`, { waitUntil: 'domcontentloaded' });
  await ownerPage.getByRole('button', { name: 'Sign out' }).waitFor({ state: 'visible', timeout: 10_000 });
  await attackerPage.getByRole('button', { name: 'Sign out' }).waitFor({ state: 'visible', timeout: 10_000 });
  attachDiagnostics(ownerPage);
  attachDiagnostics(attackerPage);

  const ownerProjectAHttp = await api(ownerPage, `/api/core/projects/${ownerProjectA.project_id}`);
  assert.equal(ownerProjectAHttp.status, 200);
  assert.equal(ownerProjectAHttp.body.id, ownerProjectA.project_id);
  assert.equal(typeof ownerProjectAHttp.body.current_image_artifact_id, 'string');
  assert.match(ownerProjectAHttp.body.current_image_url, /^\/api\/core\/artifacts\/results\//);
  const ownerSourceArtifactId = ownerProjectAHttp.body.current_image_artifact_id;

  const ownerProjectBHttp = await api(ownerPage, `/api/core/projects/${ownerProjectB.project_id}`);
  assert.equal(ownerProjectBHttp.status, 200);
  const attackerProjectHttp = await api(attackerPage, `/api/core/projects/${attackerProject.project_id}`);
  assert.equal(attackerProjectHttp.status, 200);

  const ownerGarmentHttp = await api(ownerPage, `/api/core/garments/${ownerGarment.id}`);
  assert.equal(ownerGarmentHttp.status, 200);
  assert.equal(ownerGarmentHttp.body.id, ownerGarment.id);
  assert.equal(ownerGarmentHttp.body.views.length, 1);
  const ownerGarmentDeliveryUrl = ownerGarmentHttp.body.views[0].delivery_url;
  assert.match(ownerGarmentDeliveryUrl, /^\/api\/core\/garments\/delivery\//);
  const ownerGarmentDelivery = await api(ownerPage, ownerGarmentDeliveryUrl);
  assert.equal(ownerGarmentDelivery.status, 200);
  assert.equal(ownerGarmentDelivery.contentType, 'image/png');

  const ownerOutfitHttp = await api(ownerPage, `/api/core/wardrobe/outfits/${ownerOutfit.id}`);
  assert.equal(ownerOutfitHttp.status, 200);
  assert.equal(ownerOutfitHttp.body.id, ownerOutfit.id);

  const ownerRunHttp = await api(ownerPage, `/api/core/execution-runs/${ownerRun.runId}?projectId=${ownerProjectA.project_id}`);
  assert.equal(ownerRunHttp.status, 200);
  assert.equal(ownerRunHttp.body.runId, ownerRun.runId);

  const crossProjectRun = await api(ownerPage, `/api/core/execution-runs/${ownerRun.runId}?projectId=${ownerProjectB.project_id}`);
  assertDenied(crossProjectRun, 404, 'execution_run_not_found', 'same-user cross-project ExecutionRun substitution');

  const crossProjectArtifact = await api(ownerPage, '/api/core/agent/bounded-deterministic/start', {
    method: 'POST',
    body: {
      clientRequestId: 'r3n-cross-project-source',
      projectId: String(ownerProjectB.project_id),
      sourceArtifactId: ownerSourceArtifactId,
      mode: 'ROTATE_90_CW',
      width: Number(ownerProjectB.width),
      height: Number(ownerProjectB.height),
    },
  });
  assertDenied(crossProjectArtifact, 404, 'bounded_agent_source_artifact_unavailable', 'same-user cross-project Artifact substitution');

  const attackerProjectRead = await api(attackerPage, `/api/core/projects/${ownerProjectA.project_id}`);
  assert.equal(attackerProjectRead.status, 404, 'cross-user Project lookup must fail closed');

  const attackerGarment = await api(attackerPage, `/api/core/garments/${ownerGarment.id}`);
  assertDenied(attackerGarment, 404, 'garment_not_found', 'cross-user Garment identity substitution');

  const attackerGarmentDelivery = await api(attackerPage, ownerGarmentDeliveryUrl);
  assertDenied(attackerGarmentDelivery, 404, 'garment_view_not_found', 'cross-user Garment delivery capability substitution');

  const attackerOutfit = await api(attackerPage, `/api/core/wardrobe/outfits/${ownerOutfit.id}`);
  assertDenied(attackerOutfit, 404, 'outfit_not_found', 'cross-user Outfit identity substitution');

  const attackerRun = await api(attackerPage, `/api/core/execution-runs/${ownerRun.runId}?projectId=${ownerProjectA.project_id}`);
  assertDenied(attackerRun, 404, 'execution_run_not_found', 'cross-user ExecutionRun substitution');

  const attackerArtifact = await api(attackerPage, '/api/core/agent/bounded-deterministic/start', {
    method: 'POST',
    body: {
      clientRequestId: 'r3n-cross-user-source',
      projectId: String(attackerProject.project_id),
      sourceArtifactId: ownerSourceArtifactId,
      mode: 'ROTATE_90_CW',
      width: Number(attackerProject.width),
      height: Number(attackerProject.height),
    },
  });
  assertDenied(attackerArtifact, 404, 'bounded_agent_source_artifact_unavailable', 'cross-user durable Artifact substitution');

  const stableIdentityAsDelivery = await api(ownerPage, `/api/core/artifacts/results/${encodeURIComponent(ownerSourceArtifactId)}`);
  assert.notEqual(stableIdentityAsDelivery.status, 200, 'durable Artifact identity must never become a delivery credential');

  const finalAuthorityCounts = await authorityCounts();
  assert.deepEqual(finalAuthorityCounts, baselineAuthorityCounts, 'denied cross-scope requests must not create plans, continuations, tickets or runs');
  assert.equal(providerCalls, 0, 'cross-scope denial must occur before any provider boundary');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'R3n browser must not call external origins');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.deepEqual(diagnostics.requestFailures, [], `unexpected network failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  console.log('R3N_BROWSER_CROSS_SCOPE_ACCEPTED', JSON.stringify({
    ownerProjectA: ownerProjectA.project_id,
    ownerProjectB: ownerProjectB.project_id,
    attackerProject: attackerProject.project_id,
    ownerGarmentId: ownerGarment.id,
    ownerOutfitId: ownerOutfit.id,
    ownerRunId: ownerRun.runId,
    authorityCounts: finalAuthorityCounts,
    providerCalls,
  }));

  await ownerContext.close();
  await attackerContext.close();
} catch (error) {
  throw new Error([
    `R3n cross-scope browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`,
    `providerCalls=${providerCalls}`,
    `coreLogs=${coreLogs.join('').slice(-18000)}`,
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

async function login(page, email, password) {
  await page.goto(`${frontendOrigin}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });

  const csrf = await page.evaluate(async url => {
    const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`auth context returned HTTP ${response.status}`);
    const token = response.headers.get('X-Bers-CSRF-Token');
    if (token) sessionStorage.setItem('r3n.csrf', token);
    return token;
  }, `${coreOrigin}/api/core/auth/context`);
  assert.match(csrf ?? '', /^[A-Za-z0-9_-]{43}$/, 'authenticated context must restore the session-bound CSRF proof');
}

async function api(page, pathName, options = {}) {
  const method = options.method ?? 'GET';
  const body = options.body;
  return page.evaluate(async ({ url, method, body }) => {
    const headers = new Headers({ Accept: 'application/json' });
    let payload;
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      const csrf = sessionStorage.getItem('r3n.csrf');
      if (!csrf) throw new Error('R3n browser mutation is missing CSRF proof');
      headers.set('X-Bers-CSRF-Token', csrf);
      payload = JSON.stringify(body);
    }
    const response = await fetch(url, { method, credentials: 'include', headers, body: payload });
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim()?.toLowerCase() ?? '';
    let responseBody;
    if (contentType === 'application/json') responseBody = await response.json().catch(() => undefined);
    else if (contentType.startsWith('image/')) responseBody = { byteLength: (await response.arrayBuffer()).byteLength };
    else responseBody = await response.text().catch(() => '');
    return { status: response.status, body: responseBody, contentType };
  }, { url: `${coreOrigin}${pathName}`, method, body });
}

function assertDenied(response, status, code, label) {
  assert.equal(response.status, status, `${label} returned HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  assert.equal(response.body?.error ?? response.body?.code, code, `${label} returned an unexpected denial code`);
}

async function authorityCounts() {
  const [plans, continuations, tickets, runs] = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM aee_admitted_plan_graphs'),
    pool.query('SELECT count(*)::int AS count FROM workflow_continuations'),
    pool.query('SELECT count(*)::int AS count FROM local_execution_tickets'),
    pool.query('SELECT count(*)::int AS count FROM canonical_execution_runs'),
  ]);
  return Object.freeze({
    plans: Number(plans.rows[0].count),
    continuations: Number(continuations.rows[0].count),
    tickets: Number(tickets.rows[0].count),
    runs: Number(runs.rows[0].count),
  });
}

async function image(width, height, background) {
  return sharp({ create: { width, height, channels: 4, background } }).png({ compressionLevel: 9 }).toBuffer();
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`R3n release artifact is missing: ${file}`);
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
        response.end('R3n SPA server has no API authority');
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
      response.end(error instanceof Error ? error.message : 'R3n static server error');
    });
  });
  await listen(server, port);
  return server;
}
