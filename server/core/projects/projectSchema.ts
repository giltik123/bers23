import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
export async function checkProjectSchema(pool: Pool) { const result = await pool.query("SELECT to_regclass('canonical_projects')::text AS projects"); if (!result.rows[0]?.projects) throw new Error('canonical Project schema is incomplete; apply migration 004_canonical_projects_and_originals.sql'); }
export async function migrateProjectSchema(pool: Pool) { const result = await pool.query("SELECT to_regclass('canonical_projects')::text AS projects"); if (!result.rows[0]?.projects) await pool.query(await readFile(new URL('./migrations/004_canonical_projects_and_originals.sql', import.meta.url), 'utf8')); }
