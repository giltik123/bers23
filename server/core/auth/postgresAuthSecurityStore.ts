import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthUserRow } from './postgresAuthStore.ts';

export type RateLimitPolicy = Readonly<{
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
}>;

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  retryAfterMs: number;
}>;

export type SessionSecurityRow = Readonly<{
  session_id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}>;

/**
 * PostgreSQL-backed security state shared by every Core instance.
 * No process-local cache is authoritative for rate limits or session validity.
 */
export class PostgresAuthSecurityStore {
  constructor(private readonly pool: Pool) {}

  async consumeRateLimit(scope: string, subjectDigest: Buffer, nowMs: number, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    if (!scope || scope.length > 80 || subjectDigest.length !== 32) throw new Error('Invalid auth rate-limit subject');
    if (!Number.isFinite(nowMs) || policy.windowMs < 1 || policy.maxAttempts < 1 || policy.blockMs < 1) throw new Error('Invalid auth rate-limit policy');
    const now = new Date(nowMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_auth_rate_limits(scope,subject_digest,window_started_at,attempt_count,blocked_until,updated_at)
        VALUES($1,$2,$3,0,NULL,$3) ON CONFLICT(scope,subject_digest) DO NOTHING`, [scope, subjectDigest, now]);
      const result = await client.query<{ window_started_at: Date; attempt_count: number; blocked_until: Date | null }>(
        `SELECT window_started_at,attempt_count,blocked_until FROM canonical_auth_rate_limits
         WHERE scope=$1 AND subject_digest=$2 FOR UPDATE`, [scope, subjectDigest]);
      const row = result.rows[0];
      if (!row) throw new Error('Auth rate-limit state is unavailable');

      const blockedUntilMs = row.blocked_until?.getTime() ?? 0;
      if (blockedUntilMs > nowMs) {
        await client.query('COMMIT');
        return Object.freeze({ allowed: false, retryAfterMs: blockedUntilMs - nowMs });
      }

      if (nowMs - row.window_started_at.getTime() >= policy.windowMs) {
        await client.query(`UPDATE canonical_auth_rate_limits
          SET window_started_at=$3,attempt_count=1,blocked_until=NULL,updated_at=$3
          WHERE scope=$1 AND subject_digest=$2`, [scope, subjectDigest, now]);
        await client.query('COMMIT');
        return Object.freeze({ allowed: true, retryAfterMs: 0 });
      }

      const nextCount = row.attempt_count + 1;
      if (nextCount > policy.maxAttempts) {
        const blockedUntil = new Date(nowMs + policy.blockMs);
        await client.query(`UPDATE canonical_auth_rate_limits
          SET attempt_count=$3,blocked_until=$4,updated_at=$5
          WHERE scope=$1 AND subject_digest=$2`, [scope, subjectDigest, nextCount, blockedUntil, now]);
        await client.query('COMMIT');
        return Object.freeze({ allowed: false, retryAfterMs: policy.blockMs });
      }

      await client.query(`UPDATE canonical_auth_rate_limits SET attempt_count=$3,blocked_until=NULL,updated_at=$4
        WHERE scope=$1 AND subject_digest=$2`, [scope, subjectDigest, nextCount, now]);
      await client.query('COMMIT');
      return Object.freeze({ allowed: true, retryAfterMs: 0 });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(user: AuthUserRow, nowMs: number, expiresAtMs: number) {
    const sessionId = randomUUID();
    const createdAt = new Date(nowMs), expiresAt = new Date(expiresAtMs);
    await this.pool.query(`INSERT INTO canonical_auth_sessions(session_id,user_id,tenant_id,created_at,expires_at,last_seen_at)
      VALUES($1,$2,$3,$4,$5,$4)`, [sessionId, user.user_id, user.tenant_id, createdAt, expiresAt]);
    return Object.freeze({ sessionId, createdAt, expiresAt });
  }

  async rotateSession(previousSessionId: string | undefined, user: AuthUserRow, nowMs: number, expiresAtMs: number) {
    const client = await this.pool.connect();
    const sessionId = randomUUID();
    const now = new Date(nowMs), expiresAt = new Date(expiresAtMs);
    try {
      await client.query('BEGIN');
      if (previousSessionId) {
        await client.query(`UPDATE canonical_auth_sessions SET revoked_at=COALESCE(revoked_at,$4)
          WHERE session_id=$1 AND user_id=$2 AND tenant_id=$3`, [previousSessionId, user.user_id, user.tenant_id, now]);
      }
      await client.query(`INSERT INTO canonical_auth_sessions(session_id,user_id,tenant_id,created_at,expires_at,last_seen_at)
        VALUES($1,$2,$3,$4,$5,$4)`, [sessionId, user.user_id, user.tenant_id, now, expiresAt]);
      await client.query('COMMIT');
      return Object.freeze({ sessionId, createdAt: now, expiresAt });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async activeSession(sessionId: string, userId: string, tenantId: string, nowMs: number, idleTtlMs: number): Promise<AuthUserRow | undefined> {
    const now = new Date(nowMs), idleCutoff = new Date(nowMs - idleTtlMs);
    const result = await this.pool.query<AuthUserRow>(`UPDATE canonical_auth_sessions s
      SET last_seen_at=$4
      FROM canonical_auth_users u
      WHERE s.session_id=$1 AND s.user_id=$2 AND s.tenant_id=$3
        AND s.revoked_at IS NULL AND s.expires_at>$4 AND s.last_seen_at>$5
        AND u.user_id=s.user_id AND u.tenant_id=s.tenant_id AND u.status='active'
      RETURNING u.user_id,u.tenant_id,u.email_normalized,u.email,u.display_name,u.status,u.email_verified_at`,
      [sessionId, userId, tenantId, now, idleCutoff]);
    return result.rows[0];
  }

  async revokeSession(sessionId: string, userId: string, tenantId: string, nowMs: number) {
    const result = await this.pool.query(`UPDATE canonical_auth_sessions SET revoked_at=COALESCE(revoked_at,$4)
      WHERE session_id=$1 AND user_id=$2 AND tenant_id=$3 RETURNING session_id`, [sessionId, userId, tenantId, new Date(nowMs)]);
    return Boolean(result.rowCount);
  }

  async revokeAllSessions(userId: string, tenantId: string, nowMs: number) {
    const result = await this.pool.query(`UPDATE canonical_auth_sessions SET revoked_at=COALESCE(revoked_at,$3)
      WHERE user_id=$1 AND tenant_id=$2 AND revoked_at IS NULL RETURNING session_id`, [userId, tenantId, new Date(nowMs)]);
    return result.rowCount ?? 0;
  }

  async listSessions(userId: string, tenantId: string): Promise<readonly SessionSecurityRow[]> {
    const result = await this.pool.query<SessionSecurityRow>(`SELECT session_id,created_at,last_seen_at,expires_at,revoked_at
      FROM canonical_auth_sessions WHERE user_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 100`, [userId, tenantId]);
    return Object.freeze(result.rows.map(row => Object.freeze({ ...row })));
  }
}
