import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: R3m auth browser E2E must use real PostgreSQL');

const host = '127.0.0.1';
const frontendPort = 4211;
const corePort = 4212;
const providerPort = 4213;
const frontendOrigin = `http://${host}:${frontendPort}`;
const coreOrigin = `http://${host}:${corePort}`;
const providerOrigin = `http://${host}:${providerPort}`;
const distDir = path.resolve('dist');
const coreEntry = path.resolve('dist-server/server.mjs');
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');
const emailPreload = path.resolve('scripts/release-r3m-auth-email-capture-preload.mjs');
const captureFile = path.resolve('.test-cache/release-r3m/auth-emails.jsonl');

const tenantId = 'release-r3m-tenant';
const email = 'release-r3m@example.test';
const beforePassword = `R3m-BeforeReset!${'a'.repeat(24)}9`;
const afterPassword = `R3m-AfterReset!${'b'.repeat(24)}7`;

for (const name of ['FAL_KEY', 'JWT_SECRET', 'AUTH_CHALLENGE_SECRET', 'RESEND_API_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARTIFACT_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is required from the CI runtime environment`);
}
for (const file of [path.join(distDir, 'index.html'), coreEntry, viteEntry, emailPreload]) await assertFile(file);
assert.equal(process.env.VITE_CORE_API_URL, `${coreOrigin}/api/core`, 'R3m SPA Core origin must match the browser harness');

await fs.mkdir(path.dirname(captureFile), { recursive: true });
await fs.rm(captureFile, { force: true });

const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-release-r3m-auth-browser-e2e' });
assert.equal((await pool.query('SELECT count(*)::int AS count FROM canonical_auth_users WHERE email_normalized=$1', [email])).rows[0].count, 0);

let providerCalls = 0;
const providerTrap = http.createServer((request, response) => {
  providerCalls += 1;
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ error: 'R3M_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED', path: request.url ?? '/' }));
});
await listen(providerTrap, providerPort);

const coreLogs = [];
const frontendLogs = [];
const core = spawn(process.execPath, ['--import', pathToFileURL(emailPreload).href, coreEntry], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(corePort),
    DATABASE_URL: databaseUrl,
    CREATIVE_PROVIDER: 'FAL',
    FAL_BASE_URL: providerOrigin,
    JWT_ISSUER: 'release-r3m-core',
    JWT_AUDIENCE: 'release-r3m-browser',
    AUTH_DEFAULT_TENANT_ID: tenantId,
    AUTH_PUBLIC_ORIGIN: frontendOrigin,
    AUTH_EMAIL_FROM: 'BERS R3m <auth@example.test>',
    GOOGLE_OAUTH_CLIENT_ID: 'release-r3m-google-unused',
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
    BERS_R3M_AUTH_EMAIL_CAPTURE_FILE: captureFile,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
core.stdout.on('data', chunk => coreLogs.push(String(chunk)));
core.stderr.on('data', chunk => coreLogs.push(String(chunk)));

let frontend;
let browser;
const diagnostics = {
  authRequests: [],
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
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

  const context = await browser.newContext();
  const page = await context.newPage();
  attachDiagnostics(page);

  await page.goto(`${frontendOrigin}/register`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Create your account' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(beforePassword);
  await page.getByLabel('Confirm Password').fill(beforePassword);
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('heading', { name: 'Verify your email' }).waitFor({ state: 'visible', timeout: 15_000 });
  const verificationMail = await waitForMail(record => record.subject === 'Verify your Bers account' && record.to.includes(email));
  const otp = verificationCode(verificationMail);
  await page.locator('input[autocomplete="one-time-code"]').fill(otp);
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });

  let state = await authState(email);
  assert.equal(state.userCount, 1, 'browser registration must create exactly one canonical auth user');
  assert.equal(state.status, 'active');
  assert.ok(state.emailVerifiedAt, 'OTP verification must activate canonical verified email');
  assert.ok(state.activeSessions >= 1, 'OTP verification must issue a durable server session');

  await page.goto(`${frontendOrigin}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await assertEventually(async () => (await authState(email)).activeSessions === 0, 'Sign out must revoke the canonical server session');

  await page.goto(`${frontendOrigin}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  await login(page, beforePassword);
  state = await authState(email);
  assert.ok(state.activeSessions >= 1, 'password login must issue a new canonical session after logout');

  await page.goto(`${frontendOrigin}/forgot-password`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Reset password' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByText("If an account exists with that email, you'll receive a password reset link shortly.", { exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 });

  const resetMail = await waitForMail(record => record.subject === 'Reset your Bers password' && record.to.includes(email));
  const resetUrl = passwordResetUrl(resetMail);
  assert.equal(new URL(resetUrl).origin, frontendOrigin);
  assert.equal(new URL(resetUrl).pathname, '/reset-password');
  assert.ok(new URL(resetUrl).hash.startsWith('#token='), 'password reset email must use a fragment-only secret');

  await page.goto(resetUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'New password' }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(new URL(page.url()).hash, '', 'ResetPassword must scrub the reset secret from the browser address bar');
  await page.getByLabel('New Password').fill(afterPassword);
  await page.getByLabel('Confirm Password').fill(afterPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  state = await authState(email);
  assert.equal(state.activeSessions, 0, 'password reset must revoke every pre-reset canonical session');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(beforePassword);
  const oldLoginResponse = page.waitForResponse(response =>
    response.url() === `${coreOrigin}/api/core/auth/password/login` && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Log in' }).click();
  assert.equal((await oldLoginResponse).status(), 401, 'old password must fail after reset');
  await page.getByText(/invalid email or password/i).waitFor({ state: 'visible', timeout: 10_000 });

  await page.getByLabel('Password').fill(afterPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
  state = await authState(email);
  assert.ok(state.activeSessions >= 1, 'new password must authenticate after reset');

  await page.goto(`${frontendOrigin}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await assertEventually(async () => (await authState(email)).activeSessions === 0, 'final logout must revoke the reset-era session');
  await page.goto(`${frontendOrigin}/editor?id=00000000-0000-0000-0000-000000000001`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/login', { timeout: 15_000 });

  assert.equal(providerCalls, 0, 'auth lifecycle must never reach Creative provider authority');
  assert.deepEqual(diagnostics.externalBrowserRequests, [], 'auth lifecycle browser must not call external origins');
  assert.equal(diagnostics.pageErrors.length, 0, `unexpected browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(diagnostics.consoleErrors.length, 0, `unexpected browser console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert.equal(diagnostics.requestFailures.length, 0, `unexpected browser network failures: ${JSON.stringify(diagnostics.requestFailures)}`);

  const mail = await capturedMail();
  assert.equal(mail.length, 2, 'R3m should capture exactly verification + reset transactional emails');
  assert.deepEqual(mail.map(record => record.subject), ['Verify your Bers account', 'Reset your Bers password']);
  assert.ok(diagnostics.authRequests.some(entry => entry.path === '/api/core/auth/register' && entry.method === 'POST'));
  assert.ok(diagnostics.authRequests.some(entry => entry.path === '/api/core/auth/verify-otp' && entry.method === 'POST'));
  assert.ok(diagnostics.authRequests.some(entry => entry.path === '/api/core/auth/logout' && entry.method === 'POST'));
  assert.ok(diagnostics.authRequests.some(entry => entry.path === '/api/core/auth/password/reset-request' && entry.method === 'POST'));
  assert.ok(diagnostics.authRequests.some(entry => entry.path === '/api/core/auth/password/reset' && entry.method === 'POST'));

  console.log('R3M_BROWSER_AUTH_LIFECYCLE_ACCEPTED', JSON.stringify({
    email,
    userCount: state.userCount,
    capturedMailSubjects: mail.map(record => record.subject),
    authRequestPaths: diagnostics.authRequests.map(entry => `${entry.method} ${entry.path}`),
    providerCalls,
  }));

  await context.close();
} catch (error) {
  throw new Error([
    `R3m auth lifecycle browser E2E failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    `diagnostics=${JSON.stringify(diagnostics)}`,
    `providerCalls=${providerCalls}`,
    `coreLogs=${coreLogs.join('').slice(-16000)}`,
    `frontendLogs=${frontendLogs.join('').slice(-8000)}`,
  ].join('\n'));
} finally {
  await browser?.close().catch(() => undefined);
  if (frontend) await stopChild(frontend);
  await stopChild(core);
  await closeServer(providerTrap);
  await pool.end();
  await fs.rm(captureFile, { force: true }).catch(() => undefined);
}

function attachDiagnostics(page) {
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => diagnostics.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' }));
  page.on('request', request => {
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.origin !== frontendOrigin && url.origin !== coreOrigin) diagnostics.externalBrowserRequests.push(request.url());
    if (url.origin === coreOrigin && url.pathname.startsWith('/api/core/auth/')) {
      diagnostics.authRequests.push({ method: request.method(), path: url.pathname });
    }
  });
}

async function login(page, password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(url => url.origin === frontendOrigin && url.pathname === '/', { timeout: 15_000 });
}

async function authState(emailAddress) {
  const user = await pool.query(
    `SELECT user_id,status,email_verified_at FROM canonical_auth_users WHERE email_normalized=$1`,
    [emailAddress.toLowerCase()],
  );
  if (user.rowCount !== 1) return Object.freeze({ userCount: user.rowCount, status: undefined, emailVerifiedAt: undefined, activeSessions: 0 });
  const row = user.rows[0];
  const sessions = await pool.query(
    'SELECT count(*)::int AS count FROM canonical_auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
    [row.user_id],
  );
  return Object.freeze({
    userCount: 1,
    status: row.status,
    emailVerifiedAt: row.email_verified_at instanceof Date ? row.email_verified_at.toISOString() : row.email_verified_at,
    activeSessions: Number(sessions.rows[0].count),
  });
}

async function capturedMail() {
  const text = await fs.readFile(captureFile, 'utf8').catch(error => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function waitForMail(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = (await capturedMail()).find(predicate);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Expected transactional auth email was not captured');
}

function verificationCode(record) {
  const match = /verification code is (\d{6})\./u.exec(String(record.text ?? ''));
  if (!match) throw new Error('Captured verification email does not contain the canonical six-digit code');
  return match[1];
}

function passwordResetUrl(record) {
  const match = /one-time link: (https?:\/\/\S+)$/u.exec(String(record.text ?? ''));
  if (!match) throw new Error('Captured reset email does not contain the canonical one-time reset URL');
  return match[1];
}

async function assertEventually(predicate, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; }
    catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${message}${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`);
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`R3m release artifact is missing: ${file}`);
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
