import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function checkMaskArtifactSchema(pool: Pool): Promise<void> {
  const result = await pool.query("SELECT to_regclass('canonical_mask_artifacts')::text AS table_name");
  if (!result.rows[0]?.table_name) throw new Error('canonical MASK artifact schema is incomplete; apply migration 002_canonical_mask_artifacts.sql');
}

export async function migrateMaskArtifactSchema(pool: Pool): Promise<void> {
  const exists = await pool.query("SELECT to_regclass('canonical_mask_artifacts')::text AS table_name");
  if (exists.rows[0]?.table_name) return;
  await pool.query(await readFile(new URL('./migrations/002_canonical_mask_artifacts.sql', import.meta.url), 'utf8'));
}
