import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';

import { migrateAuthSchema } from './authSchema.ts';
import { CanonicalAuthService } from './canonicalAuthService.ts';
import { keyedDigest } from './authSecrets.ts';
import { PostgresAuthSecurityStore } from './postgresAuthSecurityStore.ts';
import { PostgresAuthStore } from './postgresAuthStore.ts';
import { createNodeHttpAdapter } from '../http/nodeHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test('Sprint 6.39C4 PostgreSQL security proof', { skip: 'DATABASE_URL is required for the real PostgreSQL C4 suite' }, () => {});
} else {
  test('Sprint 6.39C4 real PostgreSQL abuse and session authority', async (t) => {
    const pool = new Pool({ connectionString: databaseUrl, max: 20, application_name: 'bers-c4-security-test' });
    try {
      await migrateAuthSchema(pool);

      await t.test('parallel callers and separate Core instances share one atomic abuse budget', async () => {
        await resetAuth(pool);
        const clock = Date.now();
        const security = new PostgresAuthSecurityStore(pool);
        const digest = keyedDigest('c4-shared-secret', 'test-subject', 'same-subject');
        const policy = { windowMs: 60_000, maxAttempts: 3, blockMs: 30_000 };
        const decisions = await Promise.all(Array.from({ length: 10 }, () => security.consumeRateLimit('c4-concurrent', digest, clock, policy)));
        assert.equal(decisions.filter(item => item.allowed).length, 3);
        assert.equal(decisions.filter(item => !item.allowed).length, 7);

        await pool.query('DELETE FROM canonical_auth_rate_limits WHERE scope=$1', ['c4-multi-instance']);
        const secondPool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-c4-security-second-instance' });
        try {
          const instanceA = new PostgresAuthSecurityStore(pool);
          const instanceB = new PostgresAuthSecurityStore(secondPool);
          const shared = keyedDigest('c4-shared-secret', 'multi-instance', 'account@example.test');
          const results = [];
          results.push(await instanceA.consumeRateLimit('c4-multi-instance', shared, clock, policy));
          results.push(await instanceB.consumeRateLimit('c4-multi-instance', shared, clock, policy));
          results.push(await instanceA.consumeRateLimit('c4-multi-instance', shared, clock, policy));
          results.push(await instanceB.consumeRateLimit('c4-multi-instance', shared, clock, policy));
          assert.deepEqual(results.map(item => item.allowed), [true, true, true, false]);
        } finally {
          await secondPool.end();
        }
      });

      await t.test('abuse storage contains keyed digests, never plaintext email/IP subjects', async () => {
        await resetAuth(pool);
        const security = new PostgresAuthSecurityStore(pool);
        const now = Date.now();
        const email = 'private-user@example.test';
        const ip = '203.0.113.77';
        const policy = { windowMs: 60_000, maxAttempts: 2, blockMs: 30_000 };
        await security.consumeRateLimit('privacy-email', keyedDigest('privacy-secret', 'email', email), now, policy);
        await security.consumeRateLimit('privacy-peer', keyedDigest('privacy-secret', 'peer', ip), now, policy);
        const columns = await pool.query(`SELECT column_name FROM information_schema.columns
          WHERE table_name='canonical_auth_rate_limits' ORDER BY column_name`);
        assert.deepEqual(columns.rows.map(row => row.column_name), ['attempt_count', 'blocked_until', 'scope', 'subject_digest', 'updated_at', 'window_started_at']);
        const stored = await pool.query(`SELECT scope,encode(subject_digest,'hex') AS subject FROM canonical_auth_rate_limits ORDER BY scope`);
        const serialized = JSON.stringify(stored.rows);
        assert.equal(serialized.includes(email), false);
        assert.equal(serialized.includes(ip), false);
        assert.ok(stored.rows.every(row => /^[a-f0-9]{64}$/.test(row.subject)));
      });

      await t.test('absolute, idle and revoked sessions fail closed in PostgreSQL', async () => {
        await resetAuth(pool);
        const store = new PostgresAuthStore(pool);
        const security = new PostgresAuthSecurityStore(pool);
        const user = await store.provisionLocalUser({ tenantId: 'tenant-a', email: 'session@example.test', password: 'StrongPassword!123' });
        assert.ok(user);
        const base = Date.now();

        const idle = await security.createSession(user, base, base + 100_000);
        assert.ok(await security.activeSession(idle.sessionId, user.user_id, user.tenant_id, base + 5_000, 10_000));
        assert.equal(await security.activeSession(idle.sessionId, user.user_id, user.tenant_id, base + 16_000, 10_000), undefined);

        const absolute = await security.createSession(user, base, base + 5_000);
        assert.equal(await security.activeSession(absolute.sessionId, user.user_id, user.tenant_id, base + 6_000, 60_000), undefined);

        const revoked = await security.createSession(user, base, base + 100_000);
        assert.equal(await security.revokeSession(revoked.sessionId, user.user_id, user.tenant_id, base + 1_000), true);
        assert.equal(await security.activeSession(revoked.sessionId, user.user_id, user.tenant_id, base + 2_000, 60_000), undefined);
      });

      await t.test('reauthentication rotates the old session; listing is secret-free; revoke-all is tenant scoped', async () => {
        await resetAuth(pool);
        const clock = mutableClock();
        const harness = makeService(pool, clock);
        await harness.store.provisionLocalUser({ tenantId: 'tenant-a', email: 'alice@example.test', password: 'AlicePassword!123' });
        await harness.store.provisionLocalUser({ tenantId: 'tenant-b', email: 'bob@example.test', password: 'BobPassword!!123' });

        const first = await harness.service.login('alice@example.test', 'AlicePassword!123', { peerAddress: '10.0.0.1' });
        const firstAuth = bearer(first.access_token);
        const firstSid = jwtSessionId(first.access_token);
        clock.advance(1_000);
        const rotated = await harness.service.login('alice@example.test', 'AlicePassword!123', { peerAddress: '10.0.0.1' }, firstAuth);
        const rotatedAuth = bearer(rotated.access_token);
        const rotatedSid = jwtSessionId(rotated.access_token);
        await assert.rejects(() => harness.service.verify(firstAuth), hasCode('unauthenticated'));
        assert.equal((await harness.service.verify(rotatedAuth)).userId, first.user.user_id);

        const listed = await harness.service.sessions(rotatedAuth);
        assert.ok(listed.some(item => item.current === true && item.status === 'active'));
        const publicJson = JSON.stringify(listed);
        assert.equal(publicJson.includes(first.access_token), false);
        assert.equal(publicJson.includes(rotated.access_token), false);
        assert.equal(publicJson.includes(firstSid), false);
        assert.equal(publicJson.includes(rotatedSid), false);
        assert.ok(listed.every(item => /^[a-f0-9]{32}$/.test(item.id)));

        const secondAlice = await harness.service.login('alice@example.test', 'AlicePassword!123', { peerAddress: '10.0.0.2' });
        const bob = await harness.service.login('bob@example.test', 'BobPassword!!123', { peerAddress: '10.0.0.3' });
        const secondAliceAuth = bearer(secondAlice.access_token);
        const bobAuth = bearer(bob.access_token);
        await harness.service.revokeAllSessions(secondAliceAuth);
        await assert.rejects(() => harness.service.verify(rotatedAuth), hasCode('unauthenticated'));
        await assert.rejects(() => harness.service.verify(secondAliceAuth), hasCode('unauthenticated'));
        assert.equal((await harness.service.verify(bobAuth)).tenantId, 'tenant-b');
      });

      await t.test('password reset invalidates every pre-reset session immediately', async () => {
        await resetAuth(pool);
        const clock = mutableClock();
        const challengeSecret = 'password-reset-c4-secret';
        const harness = makeService(pool, clock, { challengeSecret });
        await harness.store.provisionLocalUser({ tenantId: 'tenant-a', email: 'reset@example.test', password: 'BeforeReset!!123' });
        const one = await harness.service.login('reset@example.test', 'BeforeReset!!123', { peerAddress: '10.1.0.1' });
        const two = await harness.service.login('reset@example.test', 'BeforeReset!!123', { peerAddress: '10.1.0.2' });
        const token = 'reset-token-abcdefghijklmnopqrstuvwxyz-123456';
        await harness.store.createPasswordReset('reset@example.test', keyedDigest(challengeSecret, 'password-reset', token), clock.now(), clock.now() + 60_000);
        await harness.service.resetPassword(token, 'AfterReset!!!123', { peerAddress: '10.1.0.3' });
        await assert.rejects(() => harness.service.verify(bearer(one.access_token)), hasCode('unauthenticated'));
        await assert.rejects(() => harness.service.verify(bearer(two.access_token)), hasCode('unauthenticated'));
      });

      await t.test('OTP brute force is rate-limited before a sixth domain mutation', async () => {
        await resetAuth(pool);
        const clock = mutableClock();
        const mail = captureMail();
        const harness = makeService(pool, clock, { email: mail.sender });
        const registration = await harness.service.register('otp@example.test', 'OtpPassword!!!123', 'OTP User', { peerAddress: '10.2.0.1' });
        assert.equal(registration.status, 'verification_required');
        assert.ok(mail.verificationCode);
        const wrong = mail.verificationCode === '000000' ? '000001' : '000000';
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await assert.rejects(() => harness.service.verifyOtp('otp@example.test', wrong, registration.verification_handle, { peerAddress: '10.2.0.1' }), hasCode('invalid_verification'));
        }
        await assert.rejects(() => harness.service.verifyOtp('otp@example.test', wrong, registration.verification_handle, { peerAddress: '10.2.0.1' }), hasCode('auth_rate_limited'));
        const row = await pool.query(`SELECT v.failed_attempts FROM canonical_auth_email_verifications v
          JOIN canonical_auth_users u USING(user_id) WHERE u.email_normalized=$1`, ['otp@example.test']);
        assert.equal(row.rows[0].failed_attempts, 5);
      });

      await t.test('enumeration-resistant registration/reset/resend shapes survive limiter blocking', async () => {
        await resetAuth(pool);
        const clock = mutableClock();
        const mail = captureMail();
        const harness = makeService(pool, clock, { email: mail.sender });
        await harness.store.provisionLocalUser({ tenantId: 'tenant-a', email: 'existing@example.test', password: 'ExistingPass!!123' });

        const existingRegistration = await harness.service.register('existing@example.test', 'DifferentPass!!123', undefined, { peerAddress: '10.3.0.1' });
        const unknownRegistration = await harness.service.register('pending@example.test', 'PendingPass!!!123', undefined, { peerAddress: '10.3.0.2' });
        assert.deepEqual(Object.keys(existingRegistration).sort(), Object.keys(unknownRegistration).sort());
        assert.equal(existingRegistration.status, 'verification_required');
        assert.equal(unknownRegistration.status, 'verification_required');

        const existingReset = await harness.service.resetPasswordRequest('existing@example.test', { peerAddress: '10.3.0.3' });
        const unknownReset = await harness.service.resetPasswordRequest('missing@example.test', { peerAddress: '10.3.0.4' });
        assert.deepEqual(existingReset, { status: 'accepted' });
        assert.deepEqual(unknownReset, { status: 'accepted' });
        let blockedReset;
        for (let index = 0; index < 6; index += 1) blockedReset = await harness.service.resetPasswordRequest('existing@example.test', { peerAddress: '10.3.0.3' });
        assert.deepEqual(blockedReset, { status: 'accepted' });

        let resend;
        for (let index = 0; index < 12; index += 1) resend = await harness.service.resendOtp('pending@example.test', unknownRegistration.verification_handle, { peerAddress: '10.3.0.5' });
        assert.deepEqual(resend, { status: 'accepted' });
      });

      await t.test('OAuth state creation and callback attempts have bounded shared budgets', async () => {
        await resetAuth(pool);
        const clock = mutableClock();
        const harness = makeService(pool, clock);
        for (let index = 0; index < 30; index += 1) {
          const url = await harness.service.googleStart('/', { peerAddress: '198.51.100.40' });
          assert.match(url, /^https:\/\/oauth\.example\.test\//);
        }
        await assert.rejects(() => harness.service.googleStart('/', { peerAddress: '198.51.100.40' }), hasCode('auth_rate_limited'));

        const invalidState = 'S'.repeat(43);
        for (let index = 0; index < 10; index += 1) {
          await assert.rejects(() => harness.service.googleCallback(invalidState, 'code', { peerAddress: '198.51.100.41' }), hasCode('oauth_failed'));
        }
        await assert.rejects(() => harness.service.googleCallback(invalidState, 'code', { peerAddress: '198.51.100.41' }), hasCode('auth_rate_limited'));
      });

      await t.test('HTTP boundary ignores spoofed proxy headers and protects revoke-all with CSRF/origin', async () => {
        await resetAuth(pool);
        const clock = mutableClock();
        const harness = makeService(pool, clock);
        const config = httpConfig();
        const adapter = createNodeHttpAdapter({
          core: {}, artifacts: {}, projects: {}, auth: harness.service, config,
          ready: async () => true, accepting: () => true, now: clock.now,
        });
        const server = createServer(adapter);
        await listen(server);
        try {
          const address = server.address();
          assert.ok(address && typeof address === 'object');
          const base = `http://127.0.0.1:${address.port}`;

          for (let index = 0; index < 30; index += 1) {
            const response = await fetch(`${base}/api/core/auth/login/google`, {
              redirect: 'manual',
              headers: { 'x-forwarded-for': `198.51.100.${index + 1}`, 'x-real-ip': `203.0.113.${index + 1}` },
            });
            assert.equal(response.status, 302);
          }
          const blocked = await fetch(`${base}/api/core/auth/login/google`, {
            redirect: 'manual',
            headers: { 'x-forwarded-for': '192.0.2.250', forwarded: 'for=192.0.2.251' },
          });
          assert.equal(blocked.status, 429);
          assert.match(blocked.headers.get('retry-after') ?? '', /^\d+$/);

          await resetAuth(pool);
          await harness.store.provisionLocalUser({ tenantId: 'tenant-a', email: 'http@example.test', password: 'HttpPassword!!123' });
          const login = await fetch(`${base}/api/core/auth/password/login`, {
            method: 'POST',
            redirect: 'manual',
            headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'http@example.test', password: 'HttpPassword!!123' }),
          });
          assert.equal(login.status, 200);
          const loginBody = await login.text();
          assert.equal(loginBody.includes('access_token'), false);
          const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
          const csrf = login.headers.get('x-bers-csrf-token');
          assert.ok(cookie.includes('='));
          assert.match(csrf ?? '', /^[A-Za-z0-9_-]{43}$/);

          const sessions = await fetch(`${base}/api/core/auth/sessions`, { headers: { Cookie: cookie } });
          assert.equal(sessions.status, 200);
          const sessionsText = await sessions.text();
          assert.equal(/access_token|Bearer|csrf/i.test(sessionsText), false);

          const missingCsrf = await fetch(`${base}/api/core/auth/sessions/revoke-all`, {
            method: 'POST',
            headers: { Origin: 'http://localhost', Cookie: cookie },
          });
          assert.equal(missingCsrf.status, 403);
          assert.equal((await missingCsrf.json()).code, 'csrf_denied');

          const crossOrigin = await fetch(`${base}/api/core/auth/sessions/revoke-all`, {
            method: 'POST',
            headers: { Origin: 'https://evil.example', Cookie: cookie, 'X-Bers-CSRF-Token': csrf },
          });
          assert.equal(crossOrigin.status, 403);
          assert.equal((await crossOrigin.json()).code, 'origin_denied');

          const revoked = await fetch(`${base}/api/core/auth/sessions/revoke-all`, {
            method: 'POST',
            headers: { Origin: 'http://localhost', Cookie: cookie, 'X-Bers-CSRF-Token': csrf },
          });
          assert.equal(revoked.status, 200);
          assert.match(revoked.headers.get('set-cookie') ?? '', /Max-Age=0/);
          const after = await fetch(`${base}/api/core/auth/sessions`, { headers: { Cookie: cookie } });
          assert.equal(after.status, 401);
        } finally {
          await close(server);
        }
      });
    } finally {
      await pool.end();
    }
  });
}

function makeService(pool, clock, options = {}) {
  const challengeSecret = options.challengeSecret ?? 'c4-auth-challenge-secret';
  const store = new PostgresAuthStore(pool);
  const securityStore = new PostgresAuthSecurityStore(pool);
  const mail = options.email ?? captureMail().sender;
  const google = options.google ?? {
    authorizationUrl: ({ state, nonce }) => `https://oauth.example.test/authorize?state=${encodeURIComponent(state)}&nonce=${encodeURIComponent(nonce)}`,
    exchangeAndVerify: async () => { throw Object.assign(new Error('Google authentication failed'), { status: 401, code: 'oauth_failed', retryable: false }); },
  };
  const service = new CanonicalAuthService({
    store,
    securityStore,
    jwt: { secret: 'c4-jwt-secret', issuer: 'bers-c4-test', audience: 'bers-c4-test' },
    challengeSecret,
    defaultTenantId: 'tenant-a',
    publicOrigin: 'http://localhost',
    email: mail,
    google,
    now: clock.now,
    sessionTtlMs: 60_000,
    sessionIdleTtlMs: 10_000,
  });
  return { service, store, securityStore };
}

function captureMail() {
  const state = {
    verificationCode: undefined,
    resetUrl: undefined,
    sender: {
      sendVerification: async ({ code }) => { state.verificationCode = code; },
      sendPasswordReset: async ({ resetUrl }) => { state.resetUrl = resetUrl; },
    },
  };
  return state;
}

function mutableClock(start = Date.now()) {
  let value = start;
  return { now: () => value, advance: milliseconds => { value += milliseconds; } };
}

function bearer(token) { return `Bearer ${token}`; }
function jwtSessionId(token) { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sid; }
function hasCode(code) { return error => Boolean(error && error.code === code); }

async function resetAuth(pool) {
  await pool.query(`TRUNCATE TABLE
    canonical_auth_rate_limits,
    canonical_auth_browser_grants,
    canonical_auth_oauth_states,
    canonical_auth_password_resets,
    canonical_auth_email_verifications,
    canonical_auth_oauth_identities,
    canonical_auth_password_credentials,
    canonical_auth_sessions,
    canonical_auth_users
    RESTART IDENTITY CASCADE`);
}

function httpConfig() {
  return {
    nodeEnv: 'test',
    allowedWebOrigins: ['http://localhost'],
    allowApiBearerAuth: true,
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'c4-auth-challenge-secret',
    bodyLimitBytes: 262_144,
    maskUploadLimitBytes: 1024,
    maskMaxDimension: 16,
    imageUploadLimitBytes: 1024,
    imageMaxDimension: 16,
    imageMaxPixels: 256,
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
