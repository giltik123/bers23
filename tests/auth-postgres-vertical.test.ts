import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { createNodeHttpAdapter } from '../server/core/http/nodeHttpAdapter.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { migrateAuthSchema } from '../server/core/auth/authSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: canonical auth acceptance must use real PostgreSQL');

const jwtSecret = 'auth-vertical-jwt-secret';
const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'production', port: 8080, databaseUrl, provider: 'FAL', falKey: 'auth-provider-must-not-run',
  falBaseUrl: 'https://provider.auth.test', jwtSecret, jwtIssuer: 'auth-test', jwtAudience: 'auth-core',
  authChallengeSecret: 'auth-vertical-challenge-secret', authDefaultTenantId: 'auth-default-tenant', authPublicOrigin: 'http://localhost',
  resendApiKey: 'auth-resend-must-not-run', authEmailFrom: 'Bers Test <auth@example.test>',
  googleOauthClientId: 'auth-google-client', googleOauthClientSecret: 'auth-google-secret',
  artifactSigningSecret: 'auth-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze(['http://localhost']), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 64_000, maskUploadLimitBytes: 64_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 1_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

function bearer(token: string) { return { authorization: `Bearer ${token}` }; }
function browser(cookie: string, extra: Record<string,string> = {}) { return { cookie, 'sec-fetch-site': 'same-origin', ...extra }; }
function sessionCookie(response: Response) {
  const raw=response.headers.get('set-cookie'); assert(raw,'auth response must set session cookie');
  assert.match(raw,/^bers_session_dev=/); assert.match(raw,/HttpOnly/); assert.match(raw,/SameSite=Strict/); assert.match(raw,/Path=\//); assert.doesNotMatch(raw,/; Secure(?:;|$)/);
  return raw.split(';',1)[0];
}
function tokenFromCookie(cookie: string) { const separator=cookie.indexOf('='); assert(separator>0); return cookie.slice(separator+1); }
function decodePayload(token: string) { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>; }
function sign(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode(claims);
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
async function closeServer(server: Server) { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }

async function start(providerCalls: { count: number }) {
  const production = await createProductionCore(config, { fetcher: async () => { providerCalls.count++; throw new Error('auth vertical must not call provider'); } });
  const server = createServer(createNodeHttpAdapter({ core: production.core, artifacts: production.artifacts, projects: production.projects, auth: production.auth, config, ready: async () => true, accepting: () => true }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object');
  return { production, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function login(baseUrl: string, email: string, password: string) {
  return fetch(`${baseUrl}/api/core/auth/password/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ email, password }),
  });
}

test('canonical cookie session survives reload/restart and authorizes Project to Editor identity', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'auth-postgres-acceptance' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await migrateAuthSchema(pool);
  await pool.query('TRUNCATE canonical_auth_sessions,canonical_auth_password_credentials,canonical_auth_users,canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_auth_sessions,canonical_auth_password_credentials,canonical_auth_users,canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
    await pool.end();
  });

  const providerCalls = { count: 0 };
  let running = await start(providerCalls);
  t.after(async () => { if (running) { await closeServer(running.server); await running.production.close(); } });

  const userId = 'auth-user';
  const tenantId = 'auth-tenant';
  const email = 'User@Example.test';
  const password = 'correct horse battery staple';
  await running.production.auth.store.provisionLocalUser({ userId, tenantId, email, password, displayName: 'Auth User' });

  const wrong = await login(running.baseUrl, email, 'not-the-right-password');
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json() as any).code, 'invalid_credentials');
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.equal(await running.production.auth.store.activeSessionCount(userId), 0);

  const unknown = await login(running.baseUrl, 'missing@example.test', 'not-the-right-password');
  assert.equal(unknown.status, 401);
  assert.equal((await unknown.json() as any).code, 'invalid_credentials');
  assert.equal(unknown.headers.get('set-cookie'), null);
  assert.equal(await running.production.auth.store.activeSessionCount(userId), 0);

  const successful = await login(running.baseUrl, 'user@example.test', password);
  assert.equal(successful.status, 200);
  const firstCookie=sessionCookie(successful);
  const loginBody = await successful.json() as any;
  assert.equal('access_token' in loginBody,false); assert.equal('token_type' in loginBody,false);
  assert.equal(loginBody.user.id, userId);
  assert.equal(loginBody.user.tenant_id, tenantId);
  assert.equal(loginBody.user.email, email);
  assert.equal('password' in loginBody.user, false);
  assert.equal('password_hash' in loginBody.user, false);
  const firstToken = tokenFromCookie(firstCookie);
  const firstClaims = decodePayload(firstToken);
  assert.equal(firstClaims.sub, userId);
  assert.equal(firstClaims.tenantId, tenantId);
  assert.equal(typeof firstClaims.sid, 'string');
  assert.equal(firstClaims.iss, config.jwtIssuer);
  assert.equal(firstClaims.aud, config.jwtAudience);
  assert.equal(await running.production.auth.store.activeSessionCount(userId), 1);

  const context = await fetch(`${running.baseUrl}/api/core/auth/context`, { headers: browser(firstCookie) });
  assert.equal(context.status, 200);
  assert.equal((await context.json() as any).id, userId);
  assert.equal((await fetch(`${running.baseUrl}/api/core/auth/context`, { headers: { ...bearer(firstToken), 'sec-fetch-site':'same-origin' } })).status,401,'browser Authorization fallback must be rejected without cookie');

  const pixels = await sharp({ create: { width: 6, height: 5, channels: 4, background: { r: 30, g: 40, b: 50, alpha: 1 } } }).png().toBuffer();
  const createProject = await fetch(`${running.baseUrl}/api/core/projects?name=Authenticated%20Project`, { method: 'POST', headers: browser(firstCookie,{ 'content-type': 'image/png' }), body: pixels });
  assert.equal(createProject.status, 201);
  const project = await createProject.json() as any;
  assert.equal(project.name, 'Authenticated Project');
  assert.equal(project.current_image_artifact_id, project.original_image_artifact_id, 'Editor input must begin from stable ORIGINAL identity');
  assert.match(project.current_image_url, /^\/api\/core\/artifacts\/results\//);

  const list = await fetch(`${running.baseUrl}/api/core/projects`, { headers: browser(firstCookie) });
  assert.equal(list.status, 200);
  assert.equal((await list.json() as any[]).length, 1);
  const get = await fetch(`${running.baseUrl}/api/core/projects/${project.id}`, { headers: browser(firstCookie) });
  assert.equal(get.status, 200);
  assert.equal((await get.json() as any).current_image_artifact_id, project.original_image_artifact_id);

  await running.production.auth.store.provisionLocalUser({ userId: 'other-auth-user', tenantId, email: 'other@example.test', password: 'another correct battery staple' });
  const otherLogin = await login(running.baseUrl, 'other@example.test', 'another correct battery staple');
  const otherCookie=sessionCookie(otherLogin);
  const otherGet = await fetch(`${running.baseUrl}/api/core/projects/${project.id}`, { headers: browser(otherCookie) });
  assert.equal(otherGet.status, 404);

  const tampered = `${firstToken.slice(0, -1)}${firstToken.endsWith('a') ? 'b' : 'a'}`;
  assert.equal((await fetch(`${running.baseUrl}/api/core/auth/context`, { headers: browser(`bers_session_dev=${tampered}`) })).status, 401);
  const expired = sign({ sub: userId, tenantId, sid: firstClaims.sid, iss: config.jwtIssuer, aud: config.jwtAudience, iat: 1, exp: 2 });
  assert.equal((await fetch(`${running.baseUrl}/api/core/auth/context`, { headers: bearer(expired) })).status, 401,'explicit non-browser bearer compatibility still validates expiry');

  const logout = await fetch(`${running.baseUrl}/api/core/auth/logout`, { method: 'POST', headers: browser(firstCookie) });
  assert.equal(logout.status, 204);
  assert.match(String(logout.headers.get('set-cookie')),/^bers_session_dev=;/);
  assert.equal((await fetch(`${running.baseUrl}/api/core/auth/context`, { headers: browser(firstCookie) })).status, 401);
  assert.equal((await fetch(`${running.baseUrl}/api/core/projects`, { headers: browser(firstCookie) })).status, 401);

  const secondLogin = await login(running.baseUrl, 'USER@example.test', password);
  assert.equal(secondLogin.status, 200);
  const secondCookie=sessionCookie(secondLogin);
  const secondToken=tokenFromCookie(secondCookie);
  const secondClaims = decodePayload(secondToken);
  assert.notEqual(secondClaims.sid, firstClaims.sid);
  assert.equal((await fetch(`${running.baseUrl}/api/core/projects/${project.id}`, { headers: browser(secondCookie) })).status, 200);

  await closeServer(running.server); await running.production.close();
  running = await start(providerCalls);
  const afterRestart = await fetch(`${running.baseUrl}/api/core/auth/context`, { headers: browser(secondCookie) });
  assert.equal(afterRestart.status, 200, 'active PostgreSQL session cookie must survive Core restart');
  const projectAfterRestart = await fetch(`${running.baseUrl}/api/core/projects/${project.id}`, { headers: browser(secondCookie) });
  assert.equal(projectAfterRestart.status, 200);
  assert.equal((await projectAfterRestart.json() as any).current_image_artifact_id, project.original_image_artifact_id);

  assert.equal(providerCalls.count, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);
});
