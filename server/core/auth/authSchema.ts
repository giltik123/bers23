import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const baseMigration = '008_canonical_auth_identity_sessions.sql';
const lifecycleMigration = '009_auth_lifecycle_oauth.sql';
const registrationBindingMigration = '010_registration_attempt_binding.sql';
const abuseSessionMigration = '011_auth_abuse_session_controls.sql';

async function migration(name: string) {
  try { return await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/auth/migrations', name), 'utf8'); }
}

async function baseComplete(pool: Pool) {
  const result = await pool.query(`SELECT
    to_regclass('canonical_auth_users')::text AS users,
    to_regclass('canonical_auth_password_credentials')::text AS credentials,
    to_regclass('canonical_auth_sessions')::text AS sessions`);
  const row = result.rows[0];
  return Boolean(row?.users && row?.credentials && row?.sessions);
}

async function lifecycleComplete(pool: Pool) {
  const result = await pool.query(`SELECT
    to_regclass('canonical_auth_email_verifications')::text AS verifications,
    to_regclass('canonical_auth_password_resets')::text AS resets,
    to_regclass('canonical_auth_oauth_identities')::text AS identities,
    to_regclass('canonical_auth_oauth_states')::text AS oauth_states,
    to_regclass('canonical_auth_browser_grants')::text AS grants,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='canonical_auth_users' AND column_name='email_verified_at') AS verified_column`);
  const row = result.rows[0];
  return Boolean(row?.verifications && row?.resets && row?.identities && row?.oauth_states && row?.grants && row?.verified_column);
}

async function registrationBindingComplete(pool: Pool) {
  const result = await pool.query(`SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name='canonical_auth_email_verifications' AND column_name='verification_handle_digest'
  ) AS bound`);
  return Boolean(result.rows[0]?.bound);
}

async function abuseSessionComplete(pool: Pool) {
  const result = await pool.query(`SELECT
    to_regclass('canonical_auth_rate_limits')::text AS rate_limits,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='canonical_auth_sessions' AND column_name='last_seen_at') AS last_seen_column,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='canonical_auth_sessions' AND column_name='revoked_at') AS revoked_column`);
  const row = result.rows[0];
  return Boolean(row?.rate_limits && row?.last_seen_column && row?.revoked_column);
}

export async function checkAuthSchema(pool: Pool) {
  if (!await baseComplete(pool)) throw new Error('canonical auth schema is incomplete; apply migration 008');
  if (!await lifecycleComplete(pool)) throw new Error('canonical auth lifecycle schema is incomplete; apply migration 009');
  if (!await registrationBindingComplete(pool)) throw new Error('canonical registration binding schema is incomplete; apply migration 010');
  if (!await abuseSessionComplete(pool)) throw new Error('canonical auth abuse/session schema is incomplete; apply migration 011');
}

export async function migrateAuthSchema(pool: Pool) {
  if (!await baseComplete(pool)) await pool.query(await migration(baseMigration));
  if (!await lifecycleComplete(pool)) await pool.query(await migration(lifecycleMigration));
  if (!await registrationBindingComplete(pool)) await pool.query(await migration(registrationBindingMigration));
  if (!await abuseSessionComplete(pool)) await pool.query(await migration(abuseSessionMigration));
}
