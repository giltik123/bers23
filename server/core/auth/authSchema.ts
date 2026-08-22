import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const migrationName = '008_canonical_auth_identity_sessions.sql';

async function migration() {
  try { return await readFile(new URL(`./migrations/${migrationName}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/auth/migrations', migrationName), 'utf8'); }
}

async function complete(pool: Pool) {
  const result = await pool.query(`SELECT
    to_regclass('canonical_auth_users')::text AS users,
    to_regclass('canonical_auth_password_credentials')::text AS credentials,
    to_regclass('canonical_auth_sessions')::text AS sessions`);
  const row = result.rows[0];
  return Boolean(row?.users && row?.credentials && row?.sessions);
}

export async function checkAuthSchema(pool: Pool) {
  if (!await complete(pool)) throw new Error('canonical auth schema is incomplete; apply migration 008');
}

export async function migrateAuthSchema(pool: Pool) {
  if (!await complete(pool)) await pool.query(await migration());
}
