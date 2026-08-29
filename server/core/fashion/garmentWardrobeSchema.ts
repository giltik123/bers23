import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '023_managed_garment_wardrobe_metadata.sql';

const REQUIRED_COLUMNS = Object.freeze([
  ['canonical_garments', 'category', 'text', false, true],
  ['canonical_garments', 'favorite', 'bool', false, true],
  ['canonical_garment_seasons', 'garment_id', 'uuid', false, false],
  ['canonical_garment_seasons', 'tenant_id', 'text', false, false],
  ['canonical_garment_seasons', 'user_id', 'text', false, false],
  ['canonical_garment_seasons', 'season', 'text', false, false],
  ['canonical_garment_materials', 'garment_id', 'uuid', false, false],
  ['canonical_garment_materials', 'tenant_id', 'text', false, false],
  ['canonical_garment_materials', 'user_id', 'text', false, false],
  ['canonical_garment_materials', 'material', 'text', false, false],
  ['canonical_garment_tags', 'garment_id', 'uuid', false, false],
  ['canonical_garment_tags', 'tenant_id', 'text', false, false],
  ['canonical_garment_tags', 'user_id', 'text', false, false],
  ['canonical_garment_tags', 'tag', 'text', false, false],
] as const);

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const structural = await pool.query(`SELECT
    to_regclass('canonical_garments')::text AS garments,
    to_regclass('canonical_garment_seasons')::text AS seasons,
    to_regclass('canonical_garment_materials')::text AS materials,
    to_regclass('canonical_garment_tags')::text AS tags,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments')
        AND conname='canonical_garments_category_check'
        AND contype='c' AND convalidated
    ) AS category_check,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_seasons')
        AND conname='canonical_garment_seasons_pkey'
        AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (garment_id, tenant_id, user_id, season)'
    ) AS seasons_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_materials')
        AND conname='canonical_garment_materials_pkey'
        AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (garment_id, tenant_id, user_id, material)'
    ) AS materials_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags')
        AND conname='canonical_garment_tags_pkey'
        AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (garment_id, tenant_id, user_id, tag)'
    ) AS tags_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_seasons')
        AND conname='canonical_garment_seasons_value_check'
        AND contype='c' AND convalidated
    ) AS seasons_check,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_materials')
        AND conname='canonical_garment_materials_value_check'
        AND contype='c' AND convalidated
    ) AS materials_check,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags')
        AND conname='canonical_garment_tags_value_check'
        AND contype='c' AND convalidated
    ) AS tags_check,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_seasons')
        AND conname='canonical_garment_seasons_owner_fkey'
        AND contype='f' AND convalidated
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%'
    ) AS seasons_owner_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_materials')
        AND conname='canonical_garment_materials_owner_fkey'
        AND contype='f' AND convalidated
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%'
    ) AS materials_owner_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags')
        AND conname='canonical_garment_tags_owner_fkey'
        AND contype='f' AND convalidated
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%'
    ) AS tags_owner_fk`);
  const columns = await pool.query(`SELECT table_name,column_name,udt_name,is_nullable,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema()
      AND table_name IN ('canonical_garments','canonical_garment_seasons','canonical_garment_materials','canonical_garment_tags')`);
  return Object.freeze({ ...(structural.rows[0] ?? {}), columns: columns.rows });
}

function columnsReady(rows: readonly any[]): boolean {
  const columns = new Map(rows.map(row => [`${String(row.table_name)}.${String(row.column_name)}`, row]));
  return REQUIRED_COLUMNS.every(([table, name, udtName, nullable, requiresDefault]) => {
    const row = columns.get(`${table}.${name}`);
    if (!row || String(row.udt_name) !== udtName) return false;
    if ((String(row.is_nullable) === 'YES') !== nullable) return false;
    if (requiresDefault && (row.column_default === null || row.column_default === undefined || String(row.column_default).trim() === '')) return false;
    return true;
  });
}

function schemaReady(state: any): boolean {
  return Boolean(
    state?.garments && state?.seasons && state?.materials && state?.tags
    && columnsReady(Array.isArray(state?.columns) ? state.columns : [])
    && state?.category_check
    && state?.seasons_pk && state?.materials_pk && state?.tags_pk
    && state?.seasons_check && state?.materials_check && state?.tags_check
    && state?.seasons_owner_fk && state?.materials_owner_fk && state?.tags_owner_fk
  );
}

export async function checkGarmentWardrobeSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) {
    throw new Error('canonical managed Garment wardrobe schema is incomplete; apply migration 023');
  }
}

export async function migrateGarmentWardrobeSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) await pool.query(await migration());
  await checkGarmentWardrobeSchema(pool);
}
