import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const baseMigration = '008_canonical_auth_identity_sessions.sql';
const lifecycleMigration = '009_auth_lifecycle_oauth.sql';

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

export async function checkAuthSchema(pool: Pool) {
  if (!await baseComplete(pool)) throw new Error('canonical auth schema is incomplete; apply migration 008');
  if (!await lifecycleComplete(pool)) throw new Error('canonical auth lifecycle schema is incomplete; apply migration 009');
}

export async function migrateAuthSchema(pool: Pool) {
  if (!await baseComplete(pool)) await pool.query(await migration(baseMigration));
  if (!await lifecycleComplete(pool)) await pool.query(await migration(lifecycleMigration));
}
