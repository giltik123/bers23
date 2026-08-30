import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const TABLE = 'canonical_fashion_garment_warp_layers';
const MIGRATION = '029_fashion_garment_warp_layers.sql';

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function ready(pool: Pool): Promise<boolean> {
  const result = await pool.query(`SELECT
    to_regclass($1)::text AS relation,
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname='canonical_fashion_garment_warp_layers_pkey' AND contype='p' AND convalidated AND pg_get_constraintdef(oid)='PRIMARY KEY (layer_id)') AS pkey,
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname='canonical_fashion_garment_warp_layers_execution_unique' AND contype='u' AND convalidated AND pg_get_constraintdef(oid)='UNIQUE (tenant_id, user_id, project_id, execution_id)') AS execution_unique,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass($1) AND tgname='canonical_fashion_garment_warp_layers_insert_guard' AND tgenabled='O' AND NOT tgisinternal) AS insert_guard,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass($1) AND tgname='canonical_fashion_garment_warp_layers_immutable_guard' AND tgenabled='O' AND NOT tgisinternal) AS immutable_guard,
    EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1 AND indexname='canonical_fashion_garment_warp_layers_owner_project_idx' AND indexdef LIKE '%(tenant_id, user_id, project_id, created_at DESC, layer_id)%') AS owner_index`, [TABLE]);
  const row = result.rows[0];
  if (!row?.relation || !row.pkey || !row.execution_unique || !row.insert_guard || !row.immutable_guard || !row.owner_index) return false;
  const columns = await pool.query(`SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1`, [TABLE]);
  if (columns.rows.length !== 24 || columns.rows.some(candidate => candidate.is_nullable === 'YES')) return false;
  const created = columns.rows.find(candidate => candidate.column_name === 'created_at');
  if (!String(created?.column_default ?? '').trim()) return false;
  return true;
}

export async function checkGarmentWarpLayerSchema(pool: Pool): Promise<void> {
  if (!await ready(pool)) throw new Error('canonical Fashion garment warp layer schema is incomplete or drifted; apply migration 029');
}

export async function migrateGarmentWarpLayerSchema(pool: Pool): Promise<void> {
  const relation = await pool.query(`SELECT to_regclass($1)::text AS relation`, [TABLE]);
  if (!relation.rows[0]?.relation) await pool.query(await migration());
  await checkGarmentWarpLayerSchema(pool);
}
