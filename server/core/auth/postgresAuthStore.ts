import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { hashPassword, type PasswordCredential } from './passwordCredential.ts';

export type AuthUserRow = Readonly<{
  user_id: string;
  tenant_id: string;
  email_normalized: string;
  email: string;
  display_name: string | null;
  status: 'active' | 'disabled';
}>;

export type AuthCredentialRow = AuthUserRow & Readonly<{ algorithm: 'scrypt-v1'; salt: Buffer; password_hash: Buffer }>;

export class PostgresAuthStore {
  constructor(private readonly pool: Pool) {}

  async provisionLocalUser(input: Readonly<{ tenantId: string; email: string; password: string; displayName?: string; userId?: string }>) {
    const email = normalizeEmail(input.email);
    const tenantId = input.tenantId.trim();
    const displayName = input.displayName?.trim() || null;
    if (!tenantId || tenantId.length > 200) throw Object.assign(new Error('Tenant identity is invalid'), { status: 400, code: 'invalid_tenant' });
    if (displayName && displayName.length > 200) throw Object.assign(new Error('Display name is invalid'), { status: 400, code: 'invalid_display_name' });
    const credential = await hashPassword(input.password);
    const userId = input.userId?.trim() || randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_auth_users(user_id,tenant_id,email_normalized,email,display_name,status)
        VALUES($1,$2,$3,$4,$5,'active')`, [userId, tenantId, email.normalized, email.display, displayName]);
      await client.query(`INSERT INTO canonical_auth_password_credentials(user_id,algorithm,salt,password_hash)
        VALUES($1,$2,$3,$4)`, [userId, credential.algorithm, credential.salt, credential.hash]);
      await client.query('COMMIT');
      return this.getUser(userId, tenantId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async findCredentialByEmail(emailValue: string): Promise<AuthCredentialRow | undefined> {
    const email = normalizeEmail(emailValue);
    const result = await this.pool.query(`SELECT u.user_id,u.tenant_id,u.email_normalized,u.email,u.display_name,u.status,
      c.algorithm,c.salt,c.password_hash
      FROM canonical_auth_users u JOIN canonical_auth_password_credentials c USING(user_id)
      WHERE u.email_normalized=$1 AND u.status='active'`, [email.normalized]);
    return result.rows[0];
  }

  async createSession(user: AuthUserRow, nowMs: number, expiresAtMs: number) {
    const sessionId = randomUUID();
    const createdAt = new Date(nowMs);
    const expiresAt = new Date(expiresAtMs);
    await this.pool.query(`INSERT INTO canonical_auth_sessions(session_id,user_id,tenant_id,created_at,expires_at,last_seen_at)
      VALUES($1,$2,$3,$4,$5,$4)`, [sessionId, user.user_id, user.tenant_id, createdAt, expiresAt]);
    return Object.freeze({ sessionId, createdAt, expiresAt });
  }

  async activeSession(sessionId: string, userId: string, tenantId: string, nowMs: number): Promise<AuthUserRow | undefined> {
    const result = await this.pool.query(`SELECT u.user_id,u.tenant_id,u.email_normalized,u.email,u.display_name,u.status
      FROM canonical_auth_sessions s JOIN canonical_auth_users u ON u.user_id=s.user_id AND u.tenant_id=s.tenant_id
      WHERE s.session_id=$1 AND s.user_id=$2 AND s.tenant_id=$3
        AND s.revoked_at IS NULL AND s.expires_at>$4 AND u.status='active'`,
      [sessionId, userId, tenantId, new Date(nowMs)]);
    if (result.rows[0]) {
      await this.pool.query(`UPDATE canonical_auth_sessions SET last_seen_at=$2 WHERE session_id=$1`, [sessionId, new Date(nowMs)]);
    }
    return result.rows[0];
  }

  async revokeSession(sessionId: string, userId: string, tenantId: string, nowMs: number) {
    const result = await this.pool.query(`UPDATE canonical_auth_sessions SET revoked_at=COALESCE(revoked_at,$4)
      WHERE session_id=$1 AND user_id=$2 AND tenant_id=$3 RETURNING session_id`,
      [sessionId, userId, tenantId, new Date(nowMs)]);
    return Boolean(result.rowCount);
  }

  async getUser(userId: string, tenantId: string): Promise<AuthUserRow | undefined> {
    const result = await this.pool.query(`SELECT user_id,tenant_id,email_normalized,email,display_name,status
      FROM canonical_auth_users WHERE user_id=$1 AND tenant_id=$2 AND status='active'`, [userId, tenantId]);
    return result.rows[0];
  }

  async activeSessionCount(userId: string) {
    const result = await this.pool.query(`SELECT count(*)::int AS count FROM canonical_auth_sessions
      WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, [userId]);
    return Number(result.rows[0]?.count ?? 0);
  }
}

export function credentialFromRow(row: AuthCredentialRow): PasswordCredential {
  return Object.freeze({ algorithm: row.algorithm, salt: Buffer.from(row.salt), hash: Buffer.from(row.password_hash) });
}

function normalizeEmail(value: string) {
  if (typeof value !== 'string') throw Object.assign(new Error('Email is invalid'), { status: 400, code: 'invalid_email' });
  const display = value.trim();
  const normalized = display.toLowerCase();
  if (normalized.length < 3 || normalized.length > 320 || !normalized.includes('@')) throw Object.assign(new Error('Email is invalid'), { status: 400, code: 'invalid_email' });
  return { display, normalized };
}
