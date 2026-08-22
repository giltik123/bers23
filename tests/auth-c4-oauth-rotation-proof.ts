import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { migrateAuthSchema } from '../server/core/auth/authSchema.ts';
import { CanonicalAuthService } from '../server/core/auth/canonicalAuthService.ts';
import { PostgresAuthSecurityStore } from '../server/core/auth/postgresAuthSecurityStore.ts';
import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';

export async function proveOAuthReauthenticationRotation() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the C4 OAuth rotation proof');

  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-c4-oauth-rotation-proof' });
  try {
    await migrateAuthSchema(pool);
    await resetAuth(pool);

    const store = new PostgresAuthStore(pool);
    const securityStore = new PostgresAuthSecurityStore(pool);
    const email = 'oauth-reauth@gmail.com';
    const password = 'OAuthReauthPassword!!123';
    const user = await store.provisionLocalUser({ tenantId: 'tenant-a', email, password });
    assert.ok(user);

    let issuedState = '';
    let issuedNonce = '';
    const google = {
      authorizationUrl: ({ state, nonce }: { state: string; nonce: string }) => {
        issuedState = state;
        issuedNonce = nonce;
        return `https://oauth.example.test/authorize?state=${encodeURIComponent(state)}`;
      },
      exchangeAndVerify: async () => ({
        sub: 'google-c4-reauth-subject',
        email,
        email_verified: true,
        nonce: issuedNonce,
        name: 'OAuth Reauth User',
      }),
    };
    const sender = {
      sendVerification: async () => undefined,
      sendPasswordReset: async () => undefined,
    };
    const service = new CanonicalAuthService({
      store,
      securityStore,
      jwt: { secret: 'c4-oauth-jwt-secret', issuer: 'bers-c4-oauth', audience: 'bers-c4-oauth' },
      challengeSecret: 'c4-oauth-challenge-secret',
      defaultTenantId: 'tenant-a',
      publicOrigin: 'http://localhost',
      email: sender as any,
      google: google as any,
      sessionTtlMs: 60_000,
      sessionIdleTtlMs: 30_000,
    });

    const original = await service.login(email, password, { peerAddress: '10.44.0.1' });
    const originalAuthorization = `Bearer ${original.access_token}`;
    const originalSessionId = sessionId(original.access_token);

    const authorizationUrl = await service.googleStart('/', { peerAddress: '10.44.0.1' }, originalAuthorization);
    assert.match(authorizationUrl, /^https:\/\/oauth\.example\.test\/authorize/);
    assert.ok(issuedState.length >= 40);
    assert.ok(issuedNonce.length >= 40);

    const stateDigestRow = await pool.query<{ previous_session_id: string | null }>(
      `SELECT previous_session_id FROM canonical_auth_oauth_states WHERE previous_session_id=$1`,
      [originalSessionId],
    );
    assert.equal(stateDigestRow.rows[0]?.previous_session_id, originalSessionId);

    // Simulate the real Strict-cookie callback: no original browser cookie/Authorization
    // reaches the cross-site OAuth callback. Rotation must come from server-side state.
    const completed = await service.googleCallback(issuedState, 'authorization-code', { peerAddress: '10.44.0.1' }, undefined);
    const replacementAuthorization = `Bearer ${completed.session.access_token}`;
    const replacementSessionId = sessionId(completed.session.access_token);
    assert.notEqual(replacementSessionId, originalSessionId);

    await assert.rejects(() => service.verify(originalAuthorization), hasCode('unauthenticated'));
    const replacementPrincipal = await service.verify(replacementAuthorization);
    assert.equal(replacementPrincipal.userId, user.user_id);
    assert.equal(replacementPrincipal.tenantId, user.tenant_id);

    const oldRow = await pool.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM canonical_auth_sessions WHERE session_id=$1',
      [originalSessionId],
    );
    assert.ok(oldRow.rows[0]?.revoked_at instanceof Date);
  } finally {
    await pool.end();
  }
}

function sessionId(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sid;
}

function hasCode(code: string) {
  return (error: any) => Boolean(error && error.code === code);
}

async function resetAuth(pool: Pool) {
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
