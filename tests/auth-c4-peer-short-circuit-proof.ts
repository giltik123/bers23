import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { migrateAuthSchema } from '../server/core/auth/authSchema.ts';
import { CanonicalAuthService } from '../server/core/auth/canonicalAuthService.ts';
import { keyedDigest } from '../server/core/auth/authSecrets.ts';
import { PostgresAuthSecurityStore, type RateLimitPolicy } from '../server/core/auth/postgresAuthSecurityStore.ts';
import { PostgresAuthStore } from '../server/core/auth/postgresAuthStore.ts';

export async function proveBlockedPeerShortCircuitsSubjectBudgets() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the C4 peer short-circuit proof');

  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-c4-peer-short-circuit-proof' });
  try {
    await migrateAuthSchema(pool);
    await resetAuth(pool);

    const challengeSecret = 'c4-auth-challenge-secret';
    const now = Date.now();
    const store = new PostgresAuthStore(pool);
    const securityStore = new PostgresAuthSecurityStore(pool);
    const service = new CanonicalAuthService({
      store,
      securityStore,
      jwt: { secret: 'c4-peer-jwt-secret', issuer: 'bers-c4-peer', audience: 'bers-c4-peer' },
      challengeSecret,
      defaultTenantId: 'tenant-a',
      publicOrigin: 'http://localhost',
      email: {
        sendVerification: async () => undefined,
        sendPasswordReset: async () => undefined,
      } as any,
      google: {
        authorizationUrl: () => 'https://oauth.example.test/authorize',
        exchangeAndVerify: async () => { throw new Error('provider must not be reached while peer is blocked'); },
      } as any,
      now: () => now,
      sessionTtlMs: 60_000,
      sessionIdleTtlMs: 10_000,
    });

    const resetRequestPeer = '198.51.100.70';
    await blockPeer(securityStore, challengeSecret, 'password-reset-request:peer', resetRequestPeer, now, {
      windowMs: 60 * 60_000,
      maxAttempts: 30,
      blockMs: 30 * 60_000,
    });
    const resetAccountBefore = await countScope(pool, 'password-reset-request:account');
    for (let index = 0; index < 25; index += 1) {
      const result = await service.resetPasswordRequest(`blocked-${index}@example.test`, { peerAddress: resetRequestPeer });
      assert.deepEqual(result, { status: 'accepted' });
    }
    assert.equal(await countScope(pool, 'password-reset-request:account'), resetAccountBefore,
      'blocked peer must not create account subject buckets');

    const resetConsumePeer = '198.51.100.71';
    await blockPeer(securityStore, challengeSecret, 'password-reset-consume:peer', resetConsumePeer, now, {
      windowMs: 60 * 60_000,
      maxAttempts: 30,
      blockMs: 30 * 60_000,
    });
    const resetTokenBefore = await countScope(pool, 'password-reset-consume:token');
    for (let index = 0; index < 25; index += 1) {
      const token = `blocked-reset-token-${String(index).padStart(32, '0')}`;
      await assert.rejects(
        () => service.resetPassword(token, 'AfterReset!!!123', { peerAddress: resetConsumePeer }),
        hasCode('auth_rate_limited'),
      );
    }
    assert.equal(await countScope(pool, 'password-reset-consume:token'), resetTokenBefore,
      'blocked peer must not create reset-token subject buckets');

    const oauthPeer = '198.51.100.72';
    await blockPeer(securityStore, challengeSecret, 'oauth-callback:peer', oauthPeer, now, {
      windowMs: 10 * 60_000,
      maxAttempts: 60,
      blockMs: 10 * 60_000,
    });
    const oauthStateBefore = await countScope(pool, 'oauth-callback:state');
    for (let index = 0; index < 25; index += 1) {
      const state = `S${String(index).padStart(42, '0')}`;
      await assert.rejects(
        () => service.googleCallback(state, 'authorization-code', { peerAddress: oauthPeer }),
        hasCode('auth_rate_limited'),
      );
    }
    assert.equal(await countScope(pool, 'oauth-callback:state'), oauthStateBefore,
      'blocked peer must not create OAuth-state subject buckets');
  } finally {
    await pool.end();
  }
}

async function blockPeer(
  securityStore: PostgresAuthSecurityStore,
  challengeSecret: string,
  scope: string,
  peer: string,
  nowMs: number,
  policy: RateLimitPolicy,
) {
  const digest = keyedDigest(challengeSecret, `abuse:${scope}`, peer.toLowerCase());
  let decision = { allowed: true, retryAfterMs: 0 };
  for (let attempt = 0; attempt <= policy.maxAttempts; attempt += 1) {
    decision = await securityStore.consumeRateLimit(scope, digest, nowMs, policy);
  }
  assert.equal(decision.allowed, false, `${scope} peer should be blocked before subject amplification proof`);
}

async function countScope(pool: Pool, scope: string) {
  const result = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM canonical_auth_rate_limits WHERE scope=$1', [scope]);
  return Number(result.rows[0]?.count ?? 0);
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
