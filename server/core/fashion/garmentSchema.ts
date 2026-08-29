import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '022_managed_garments_and_initial_views.sql';

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const result = await pool.query(`SELECT
    to_regclass('canonical_garments')::text AS garments,
    to_regclass('canonical_garment_views')::text AS views,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='canonical_garments' AND column_name='representation_tier'
    ) AS representation_tier,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='canonical_garment_views' AND column_name='content_sha256'
    ) AS content_hash`);
  return result.rows[0];
}

export async function checkGarmentSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!state?.garments || !state?.views || !state?.representation_tier || !state?.content_hash) {
    throw new Error('canonical managed Garment schema is incomplete; apply migration 022');
  }
}

export async function migrateGarmentSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!state?.garments || !state?.views || !state?.representation_tier || !state?.content_hash) {
    await pool.query(await migration());
  }
  await checkGarmentSchema(pool);
}
