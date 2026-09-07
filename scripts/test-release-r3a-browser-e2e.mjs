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
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3a release browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4187;
const corePort = 4188;
const providerPort = 4189;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const tenantId = 'release-r3a-tenant';
const userId = 'release-r3a-user';
const email = 'release-r3a@example.test';
const password = 'Release-R3a-Browser-Password-42!';

await assertFile(path.join(distDir, 'index.html'));
await assertFile(coreEntry);

const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-release-r3a-browser-e2e' });
const authStore = new PostgresAuthStore(pool);
await authStore.provisionLocalUser({ tenantId, userId, email, password, displayName: 'R3a Browser User' });

const sourcePng = await sharp({
  create: { width: 12, height: 8, channels: 4, background: { r: 31, g: 71, b: 111, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3A_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
});
await listen(providerTrap, providerPort);

const coreLogs = [];
const core = spawn(process.execPath, [coreEntry], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(corePort),
    DATABASE_URL: databaseUrl,
    CREATIVE_PROVIDER: 'FAL',
    FAL_KEY: 'release-r3a-provider-must-not-run',
    FAL_BASE_URL: providerOrigin,
    JWT_SECRET: 'release-r3a-jwt-secret-at-least-32-bytes',
    JWT_ISSUER: 'release-r3a-core',
    JWT_AUDIENCE: 'release-r3a-browser',
    AUTH_CHALLENGE_SECRET: 'release-r3a-auth-challenge-secret-at-least-32-bytes',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    RESEND_API_KEY: 'release-r3a-resend-unused',
    AUTH_EMAIL_FROM: 'BERS R3a <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3a-google-unused',
    GOOGLE_OAUTH_CLIENT_SECRET: 'release-r3a-google-secret-unused',
    ARTIFACT_SIGNING_SECRET: 'release-r3a-artifact-signing-secret-at-least-32-bytes',
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
  serverErrors: [],
  lastUrl: undefined,
  projectId: undefined,
};

try {
  await waitForHttp(`${coreOrigin}/health/ready`, 20_000, core);
  frontend = await startStaticSpaServer(distDir, frontendPort);

  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : String(error)}`); }

  const page = await browser.newPage();
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => { if (response.status() >= 500) diagnostics.serverErrors.push({ url: response.url(), status: response.status() }); });

  await page.goto(`${frontendOrigin}/editor?id=unauthenticated-release-r3a`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });
  assert.equal(new URL(page.url()).pathname, '/login', 'protected Editor must redirect an unauthenticated browser to Login');

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: 15_000 });

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'release-r3a-source.png', mimeType: 'image/png', buffer: sourcePng });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/editor' && !!url.searchParams.get('id'), { timeout: 20_000 });
  diagnostics.lastUrl = page.url();
  const projectId = new URL(page.url()).searchParams.get('id');
  assert(projectId, 'Projects upload must navigate to Editor with canonical project id');
  diagnostics.projectId = projectId;

  await page.getByText('Object detection is optional. You can edit the whole image now or detect/select an object first.', { exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByText('Prompt', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: /Detect objects/i }).waitFor({ state: 'visible', timeout: 10_000 });

  const project = await pool.query(
    `SELECT project_id,tenant_id,user_id,current_image_storage_id,original_image_storage_id
     FROM canonical_projects WHERE project_id=$1`,
    [projectId],
  );
  assert.equal(project.rowCount, 1, 'browser-created Project must exist in canonical PostgreSQL authority');
  assert.equal(project.rows[0].tenant_id, tenantId);
  assert.equal(project.rows[0].user_id, userId);
  assert.equal(project.rows[0].current_image_storage_id, project.rows[0].original_image_storage_id, 'new zero-object Project must still point at its canonical ORIGINAL before edits');

  assert.equal(providerCalls, 0, 'Auth/Project/zero-object Editor journey must not invoke an external provider');
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.serverErrors, []);

  const toleratedConsole = diagnostics.consoleErrors.filter(message => /favicon|ResizeObserver/i.test(message));
  assert.equal(diagnostics.consoleErrors.length, toleratedConsole.length, `unexpected browser console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);

  console.log(JSON.stringify({
    authority: 'R3A_BROWSER_RELEASE_E2E_ACCEPTED',
    browserVersion: browser.version(),
    frontendOrigin,
    coreOrigin,
    projectId,
    tenantId,
    userId,
    providerCalls,
    protectedRouteRedirect: '/login',
    zeroObjectPromptVisible: true,
  }, null, 2));
} catch (error) {
  throw new Error(
    `R3A_BROWSER_RELEASE_E2E_FAILED\n${JSON.stringify({ ...diagnostics, providerCalls, coreLogs: coreLogs.slice(-30) }, null, 2)}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
} finally {
  await browser?.close().catch(() => undefined);
  if (frontend) await closeServer(frontend).catch(() => undefined);
  core.kill('SIGTERM');
  await waitForExit(core, 5_000).catch(() => core.kill('SIGKILL'));
  await closeServer(providerTrap).catch(() => undefined);
  await pool.end();
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`R3a release artifact is missing: ${file}`);
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
        response.end('R3a SPA server has no API authority');
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
      response.end(error instanceof Error ? error.message : 'R3a static server error');
    });
  });
  await listen(server, port);
  return server;
}
