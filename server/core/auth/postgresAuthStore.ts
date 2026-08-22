import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { hashPassword, type PasswordCredential } from './passwordCredential.ts';

export type AuthUserRow = Readonly<{
  user_id: string;
  tenant_id: string;
  email_normalized: string;
  email: string;
  display_name: string | null;
  status: 'pending_verification' | 'active' | 'disabled';
  email_verified_at?: Date | null;
}>;

export type AuthCredentialRow = AuthUserRow & Readonly<{ algorithm: 'scrypt-v1'; salt: Buffer; password_hash: Buffer }>;

const VERIFICATION_COOLDOWN_MS = 60_000;
const MAX_VERIFICATION_SENDS = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;

export class PostgresAuthStore {
  constructor(private readonly pool: Pool) {}

  async provisionLocalUser(input: Readonly<{ tenantId: string; email: string; password: string; displayName?: string; userId?: string }>) {
    const email = normalizeEmail(input.email);
    const tenantId = validateTenant(input.tenantId);
    const displayName = validateDisplayName(input.displayName);
    const credential = await hashPassword(input.password);
    const userId = input.userId?.trim() || randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_auth_users(user_id,tenant_id,email_normalized,email,display_name,status,email_verified_at)
        VALUES($1,$2,$3,$4,$5,'active',CURRENT_TIMESTAMP)`, [userId, tenantId, email.normalized, email.display, displayName]);
      await writeCredential(client, userId, credential);
      await client.query('COMMIT');
      return this.getUser(userId, tenantId);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async beginRegistration(input: Readonly<{ tenantId: string; email: string; password: string; displayName?: string; challengeDigest: Buffer; verificationHandleDigest: Buffer; nowMs: number; expiresAtMs: number }>) {
    const email = normalizeEmail(input.email);
    const tenantId = validateTenant(input.tenantId);
    const displayName = validateDisplayName(input.displayName);
    const credential = await hashPassword(input.password);
    const now = new Date(input.nowMs), expiresAt = new Date(input.expiresAtMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<AuthUserRow>('SELECT * FROM canonical_auth_users WHERE email_normalized=$1 FOR UPDATE', [email.normalized]);
      let userId: string;
      if (existing.rows[0]) {
        if (existing.rows[0].status !== 'pending_verification' || existing.rows[0].tenant_id !== tenantId) throw registrationUnavailable();
        userId = existing.rows[0].user_id;
        const challenge = await client.query<{ last_sent_at: Date; send_count: number }>('SELECT last_sent_at,send_count FROM canonical_auth_email_verifications WHERE user_id=$1 FOR UPDATE', [userId]);
        if (challenge.rows[0] && input.nowMs - challenge.rows[0].last_sent_at.getTime() < VERIFICATION_COOLDOWN_MS) throw verificationRateLimited();
        if ((challenge.rows[0]?.send_count ?? 0) >= MAX_VERIFICATION_SENDS) throw verificationRateLimited();
        // A replacement pending credential is safe only because the OTP is bound to this
        // exact browser-held verification handle below. An older handle/code pair cannot
        // activate this replacement credential.
        await client.query(`UPDATE canonical_auth_users SET email=$2,display_name=$3,updated_at=$4 WHERE user_id=$1`, [userId, email.display, displayName, now]);
        await writeCredential(client, userId, credential);
      } else {
        userId = randomUUID();
        await client.query(`INSERT INTO canonical_auth_users(user_id,tenant_id,email_normalized,email,display_name,status)
          VALUES($1,$2,$3,$4,$5,'pending_verification')`, [userId, tenantId, email.normalized, email.display, displayName]);
        await writeCredential(client, userId, credential);
      }
      const challenge = await client.query<{ send_count: number }>(`INSERT INTO canonical_auth_email_verifications
        (user_id,challenge_digest,verification_handle_digest,created_at,expires_at,last_sent_at,send_count,failed_attempts,consumed_at)
        VALUES($1,$2,$3,$4,$5,$4,1,0,NULL)
        ON CONFLICT(user_id) DO UPDATE SET challenge_digest=EXCLUDED.challenge_digest,
          verification_handle_digest=EXCLUDED.verification_handle_digest,created_at=EXCLUDED.created_at,
          expires_at=EXCLUDED.expires_at,last_sent_at=EXCLUDED.last_sent_at,
          send_count=canonical_auth_email_verifications.send_count+1,failed_attempts=0,consumed_at=NULL
        RETURNING send_count`, [userId, input.challengeDigest, input.verificationHandleDigest, now, expiresAt]);
      await client.query('COMMIT');
      return Object.freeze({ user: await this.findUserByEmail(email.display), sendCount: challenge.rows[0].send_count });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async resendVerification(emailValue: string, verificationHandleDigest: Buffer, challengeDigest: Buffer, nowMs: number, expiresAtMs: number) {
    const email = normalizeEmail(emailValue);
    const now = new Date(nowMs), expiresAt = new Date(expiresAtMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query<AuthUserRow>(`SELECT * FROM canonical_auth_users WHERE email_normalized=$1 AND status='pending_verification' FOR UPDATE`, [email.normalized]);
      const user = userResult.rows[0];
      if (!user) { await client.query('COMMIT'); return undefined; }
      const challenge = await client.query<{ last_sent_at: Date; send_count: number; verification_handle_digest: Buffer }>('SELECT last_sent_at,send_count,verification_handle_digest FROM canonical_auth_email_verifications WHERE user_id=$1 FOR UPDATE', [user.user_id]);
      const storedHandle = challenge.rows[0]?.verification_handle_digest && Buffer.from(challenge.rows[0].verification_handle_digest);
      if (!storedHandle || !safeDigestEqual(storedHandle, verificationHandleDigest)) { await client.query('COMMIT'); return undefined; }
      if (nowMs - challenge.rows[0].last_sent_at.getTime() < VERIFICATION_COOLDOWN_MS) throw verificationRateLimited();
      if (challenge.rows[0].send_count >= MAX_VERIFICATION_SENDS) throw verificationRateLimited();
      const result = await client.query<{ send_count: number }>(`UPDATE canonical_auth_email_verifications
        SET challenge_digest=$2,created_at=$3,expires_at=$4,last_sent_at=$3,send_count=send_count+1,failed_attempts=0,consumed_at=NULL
        WHERE user_id=$1 AND verification_handle_digest=$5 RETURNING send_count`, [user.user_id, challengeDigest, now, expiresAt, verificationHandleDigest]);
      await client.query('COMMIT');
      return result.rows[0] ? Object.freeze({ user, sendCount: result.rows[0].send_count }) : undefined;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async verifyEmail(emailValue: string, challengeDigest: Buffer, verificationHandleDigest: Buffer, nowMs: number): Promise<AuthUserRow> {
    const email = normalizeEmail(emailValue), now = new Date(nowMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<AuthUserRow & { challenge_digest: Buffer; verification_handle_digest: Buffer; expires_at: Date; consumed_at: Date | null; failed_attempts: number }>(`SELECT u.*,v.challenge_digest,v.verification_handle_digest,v.expires_at,v.consumed_at,v.failed_attempts
        FROM canonical_auth_users u JOIN canonical_auth_email_verifications v USING(user_id)
        WHERE u.email_normalized=$1 AND u.status='pending_verification' FOR UPDATE OF u,v`, [email.normalized]);
      const row = result.rows[0];
      if (!row || row.consumed_at || row.expires_at.getTime() <= nowMs || row.failed_attempts >= MAX_VERIFICATION_ATTEMPTS) throw invalidVerification();
      const storedHandle = Buffer.from(row.verification_handle_digest);
      if (!safeDigestEqual(storedHandle, verificationHandleDigest)) throw invalidVerification();
      const actual = Buffer.from(row.challenge_digest);
      if (!safeDigestEqual(actual, challengeDigest)) {
        await client.query(`UPDATE canonical_auth_email_verifications SET failed_attempts=failed_attempts+1 WHERE user_id=$1`, [row.user_id]);
        await client.query('COMMIT');
        throw invalidVerification();
      }
      await client.query(`UPDATE canonical_auth_users SET status='active',email_verified_at=$2,updated_at=$2 WHERE user_id=$1`, [row.user_id, now]);
      await client.query(`UPDATE canonical_auth_email_verifications SET consumed_at=$2 WHERE user_id=$1`, [row.user_id, now]);
      await client.query('COMMIT');
      const user = await this.getUser(row.user_id, row.tenant_id);
      if (!user) throw invalidVerification();
      return user;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async findCredentialByEmail(emailValue: string): Promise<AuthCredentialRow | undefined> {
    const email = normalizeEmail(emailValue);
    const result = await this.pool.query(`SELECT u.user_id,u.tenant_id,u.email_normalized,u.email,u.display_name,u.status,u.email_verified_at,
      c.algorithm,c.salt,c.password_hash FROM canonical_auth_users u JOIN canonical_auth_password_credentials c USING(user_id)
      WHERE u.email_normalized=$1 AND u.status='active'`, [email.normalized]);
    return result.rows[0];
  }

  async findUserByEmail(emailValue: string): Promise<AuthUserRow | undefined> {
    const email = normalizeEmail(emailValue);
    const result = await this.pool.query(`SELECT user_id,tenant_id,email_normalized,email,display_name,status,email_verified_at FROM canonical_auth_users WHERE email_normalized=$1`, [email.normalized]);
    return result.rows[0];
  }

  async createPasswordReset(emailValue: string, tokenDigest: Buffer, nowMs: number, expiresAtMs: number) {
    const user = await this.findUserByEmail(emailValue).catch(() => undefined);
    if (!user || user.status !== 'active' || !user.email_verified_at) return undefined;
    const resetId = randomUUID(), now = new Date(nowMs), expiresAt = new Date(expiresAtMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE canonical_auth_password_resets SET consumed_at=COALESCE(consumed_at,$2) WHERE user_id=$1 AND consumed_at IS NULL`, [user.user_id, now]);
      await client.query(`INSERT INTO canonical_auth_password_resets(reset_id,user_id,token_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5)`, [resetId, user.user_id, tokenDigest, now, expiresAt]);
      await client.query('COMMIT');
      return Object.freeze({ user, resetId });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async consumePasswordReset(tokenDigest: Buffer, newPassword: string, nowMs: number) {
    const credential = await hashPassword(newPassword), now = new Date(nowMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<AuthUserRow & { reset_id: string; expires_at: Date; consumed_at: Date | null }>(`SELECT u.*,r.reset_id,r.expires_at,r.consumed_at FROM canonical_auth_password_resets r
        JOIN canonical_auth_users u USING(user_id) WHERE r.token_digest=$1 FOR UPDATE OF r,u`, [tokenDigest]);
      const row = result.rows[0];
      if (!row || row.status !== 'active' || !row.email_verified_at || row.consumed_at || row.expires_at.getTime() <= nowMs) throw invalidReset();
      await writeCredential(client, row.user_id, credential);
      await client.query(`UPDATE canonical_auth_password_resets SET consumed_at=COALESCE(consumed_at,$2) WHERE user_id=$1 AND consumed_at IS NULL`, [row.user_id, now]);
      await client.query(`UPDATE canonical_auth_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE user_id=$1 AND revoked_at IS NULL`, [row.user_id, now]);
      await client.query('COMMIT');
      return this.getUser(row.user_id, row.tenant_id);
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async createOAuthState(stateDigest: Buffer, nonceDigest: Buffer, returnTo: string, nowMs: number, expiresAtMs: number) {
    await this.pool.query(`INSERT INTO canonical_auth_oauth_states(state_digest,nonce_digest,return_to,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5)`, [stateDigest, nonceDigest, returnTo, new Date(nowMs), new Date(expiresAtMs)]);
  }

  async consumeOAuthState(stateDigest: Buffer, nowMs: number) {
    const result = await this.pool.query<{ nonce_digest: Buffer; return_to: string }>(`UPDATE canonical_auth_oauth_states SET consumed_at=$2
      WHERE state_digest=$1 AND consumed_at IS NULL AND expires_at>$2 RETURNING nonce_digest,return_to`, [stateDigest, new Date(nowMs)]);
    return result.rows[0] ? Object.freeze({ nonceDigest: Buffer.from(result.rows[0].nonce_digest), returnTo: result.rows[0].return_to }) : undefined;
  }

  async resolveGoogleIdentity(input: Readonly<{ subject: string; email: string; displayName?: string; authoritativeEmail: boolean; defaultTenantId: string; nowMs: number }>): Promise<AuthUserRow> {
    const email = normalizeEmail(input.email), now = new Date(input.nowMs), displayName = validateDisplayName(input.displayName);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const linked = await client.query<AuthUserRow>(`SELECT u.* FROM canonical_auth_oauth_identities i JOIN canonical_auth_users u USING(user_id)
        WHERE i.provider='google' AND i.provider_subject=$1 FOR UPDATE OF i,u`, [input.subject]);
      if (linked.rows[0]) {
        if (linked.rows[0].status !== 'active') throw oauthDenied();
        await client.query(`UPDATE canonical_auth_oauth_identities SET last_login_at=$2,email_at_link=$3 WHERE provider='google' AND provider_subject=$1`, [input.subject, now, email.display]);
        await client.query('COMMIT');
        return linked.rows[0];
      }
      const existing = await client.query<AuthUserRow>('SELECT * FROM canonical_auth_users WHERE email_normalized=$1 FOR UPDATE', [email.normalized]);
      let user: AuthUserRow;
      if (existing.rows[0]) {
        if (existing.rows[0].status === 'disabled' || !input.authoritativeEmail) throw accountLinkRequired();
        const alreadyLinked = await client.query<{ provider_subject: string }>(`SELECT provider_subject FROM canonical_auth_oauth_identities WHERE provider='google' AND user_id=$1 FOR UPDATE`, [existing.rows[0].user_id]);
        if (alreadyLinked.rows[0] && alreadyLinked.rows[0].provider_subject !== input.subject) throw accountLinkRequired();
        if (existing.rows[0].status === 'pending_verification' || !existing.rows[0].email_verified_at) {
          // A pending password was never proven to belong to the email owner. Google now
          // proves email ownership, so discard that untrusted password before activation.
          await client.query(`DELETE FROM canonical_auth_password_credentials WHERE user_id=$1`, [existing.rows[0].user_id]);
          await client.query(`UPDATE canonical_auth_users SET status='active',email_verified_at=COALESCE(email_verified_at,$2),updated_at=$2 WHERE user_id=$1`, [existing.rows[0].user_id, now]);
          await client.query(`UPDATE canonical_auth_email_verifications SET consumed_at=COALESCE(consumed_at,$2) WHERE user_id=$1`, [existing.rows[0].user_id, now]);
        }
        user = { ...existing.rows[0], status: 'active', email_verified_at: existing.rows[0].email_verified_at ?? now };
      } else {
        const userId = randomUUID(), tenantId = validateTenant(input.defaultTenantId);
        const inserted = await client.query<AuthUserRow>(`INSERT INTO canonical_auth_users(user_id,tenant_id,email_normalized,email,display_name,status,email_verified_at)
          VALUES($1,$2,$3,$4,$5,'active',$6) RETURNING *`, [userId, tenantId, email.normalized, email.display, displayName, input.authoritativeEmail ? now : null]);
        user = inserted.rows[0];
      }
      await client.query(`INSERT INTO canonical_auth_oauth_identities(provider,provider_subject,user_id,email_at_link,created_at,last_login_at)
        VALUES('google',$1,$2,$3,$4,$4)`, [input.subject, user.user_id, email.display, now]);
      await client.query('COMMIT');
      return user;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async createBrowserGrant(grantDigest: Buffer, user: AuthUserRow, nowMs: number, expiresAtMs: number) {
    await this.pool.query(`INSERT INTO canonical_auth_browser_grants(grant_digest,user_id,tenant_id,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5)`, [grantDigest, user.user_id, user.tenant_id, new Date(nowMs), new Date(expiresAtMs)]);
  }

  async consumeBrowserGrant(grantDigest: Buffer, nowMs: number): Promise<AuthUserRow | undefined> {
    const result = await this.pool.query<{ user_id: string; tenant_id: string }>(`UPDATE canonical_auth_browser_grants SET consumed_at=$2
      WHERE grant_digest=$1 AND consumed_at IS NULL AND expires_at>$2 RETURNING user_id,tenant_id`, [grantDigest, new Date(nowMs)]);
    if (!result.rows[0]) return undefined;
    return this.getUser(result.rows[0].user_id, result.rows[0].tenant_id);
  }

  async getUser(userId: string, tenantId: string): Promise<AuthUserRow | undefined> {
    const result = await this.pool.query(`SELECT user_id,tenant_id,email_normalized,email,display_name,status,email_verified_at
      FROM canonical_auth_users WHERE user_id=$1 AND tenant_id=$2 AND status='active'`, [userId, tenantId]);
    return result.rows[0];
  }

  async activeSessionCount(userId: string) {
    const result = await this.pool.query(`SELECT count(*)::int AS count FROM canonical_auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, [userId]);
    return Number(result.rows[0]?.count ?? 0);
  }
}

async function writeCredential(client: PoolClient, userId: string, credential: PasswordCredential) {
  await client.query(`INSERT INTO canonical_auth_password_credentials(user_id,algorithm,salt,password_hash)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET algorithm=EXCLUDED.algorithm,salt=EXCLUDED.salt,
      password_hash=EXCLUDED.password_hash,updated_at=CURRENT_TIMESTAMP`, [userId, credential.algorithm, credential.salt, credential.hash]);
}

export function credentialFromRow(row: AuthCredentialRow): PasswordCredential {
  return Object.freeze({ algorithm: row.algorithm, salt: Buffer.from(row.salt), hash: Buffer.from(row.password_hash) });
}

function safeDigestEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}
function normalizeEmail(value: string) {
  if (typeof value !== 'string') throw Object.assign(new Error('Email is invalid'), { status: 400, code: 'invalid_email' });
  const display = value.trim(), normalized = display.toLowerCase();
  if (normalized.length < 3 || normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw Object.assign(new Error('Email is invalid'), { status: 400, code: 'invalid_email' });
  return { display, normalized };
}
function validateTenant(value: string) { const tenant = value?.trim(); if (!tenant || tenant.length > 200) throw Object.assign(new Error('Tenant identity is invalid'), { status: 400, code: 'invalid_tenant' }); return tenant; }
function validateDisplayName(value?: string) { const name = value?.trim() || null; if (name && name.length > 200) throw Object.assign(new Error('Display name is invalid'), { status: 400, code: 'invalid_display_name' }); return name; }
function registrationUnavailable() { return Object.assign(new Error('Registration is unavailable for this email'), { status: 409, code: 'registration_unavailable', retryable: false }); }
function verificationRateLimited() { return Object.assign(new Error('Please wait before requesting another verification code'), { status: 429, code: 'verification_rate_limited', retryable: true }); }
function invalidVerification() { return Object.assign(new Error('Verification code is invalid or expired'), { status: 400, code: 'invalid_verification', retryable: false }); }
function invalidReset() { return Object.assign(new Error('Password reset token is invalid or expired'), { status: 400, code: 'invalid_reset_token', retryable: false }); }
function oauthDenied() { return Object.assign(new Error('Google authentication failed'), { status: 401, code: 'oauth_failed', retryable: false }); }
function accountLinkRequired() { return Object.assign(new Error('This Google account cannot be linked automatically'), { status: 409, code: 'oauth_account_link_required', retryable: false }); }
