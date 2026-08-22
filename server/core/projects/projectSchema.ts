import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

async function migration(name: string) {
  try { return await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/projects/migrations', name), 'utf8'); }
}

export async function checkProjectSchema(pool: Pool) {
  const result = await pool.query("SELECT to_regclass('canonical_projects')::text AS projects, to_regclass('canonical_project_history_entries')::text AS history, to_regclass('canonical_project_versions')::text AS versions");
  if (!result.rows[0]?.projects) throw new Error('canonical Project schema is incomplete; apply migration 004_canonical_projects_and_originals.sql');
  if (!result.rows[0]?.history || !result.rows[0]?.versions) throw new Error('canonical Project history schema is incomplete; apply migration 005_canonical_project_history_and_versions.sql');
}

export async function migrateProjectSchema(pool: Pool) {
  let result = await pool.query("SELECT to_regclass('canonical_projects')::text AS projects");
  if (!result.rows[0]?.projects) await pool.query(await migration('004_canonical_projects_and_originals.sql'));
  result = await pool.query("SELECT to_regclass('canonical_project_history_entries')::text AS history, to_regclass('canonical_project_versions')::text AS versions");
  if (!result.rows[0]?.history || !result.rows[0]?.versions) await pool.query(await migration('005_canonical_project_history_and_versions.sql'));
}
