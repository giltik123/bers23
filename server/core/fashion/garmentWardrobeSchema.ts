import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '023_managed_garment_wardrobe_metadata.sql';

type ColumnContract = Readonly<{
  table: 'canonical_garments' | 'canonical_garment_tags';
  name: string;
  udtName: string;
  nullable: boolean;
  expectedDefault?: string;
}>;

const REQUIRED_COLUMNS: readonly ColumnContract[] = Object.freeze([
  { table: 'canonical_garments', name: 'category', udtName: 'text', nullable: false, expectedDefault: "'other'::text" },
  { table: 'canonical_garments', name: 'season', udtName: 'text', nullable: false, expectedDefault: "'all_season'::text" },
  { table: 'canonical_garments', name: 'material', udtName: 'text', nullable: false, expectedDefault: "''::text" },
  { table: 'canonical_garments', name: 'favorite', udtName: 'bool', nullable: false, expectedDefault: 'false' },
  { table: 'canonical_garment_tags', name: 'garment_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_tags', name: 'tenant_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_tags', name: 'user_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_tags', name: 'tag', udtName: 'text', nullable: false },
]);

const CATEGORY_VALUES = Object.freeze([
  'tshirts','shirts','jackets','hoodies','sweaters','pants','shorts','jeans','skirts','dresses',
  'shoes','boots','sneakers','sandals','hats','glasses','scarves','bags','belts','jewelry','gloves','socks','other',
] as const);
const SEASON_VALUES = Object.freeze(['all_season','spring','summer','autumn','winter'] as const);

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const structural = await pool.query(`SELECT
    to_regclass('canonical_garments')::text AS garments,
    to_regclass('canonical_garment_tags')::text AS tags,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND conname='canonical_garments_category_check'
        AND contype='c' AND convalidated) AS category_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND conname='canonical_garments_season_check'
        AND contype='c' AND convalidated) AS season_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND conname='canonical_garments_material_check'
        AND contype='c' AND convalidated) AS material_check_definition,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags')
        AND conname='canonical_garment_tags_pkey'
        AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (garment_id, tenant_id, user_id, tag)'
    ) AS tags_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags')
        AND conname='canonical_garment_tags_value_check'
        AND contype='c' AND convalidated
        AND pg_get_constraintdef(oid) LIKE '%char_length(tag)%'
        AND pg_get_constraintdef(oid) LIKE '%40%'
        AND pg_get_constraintdef(oid) LIKE '%btrim(tag)%'
        AND pg_get_constraintdef(oid) LIKE '%lower(tag)%'
        AND pg_get_constraintdef(oid) LIKE '%cntrl%'
    ) AS tags_check,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags')
        AND conname='canonical_garment_tags_owner_fkey'
        AND contype='f' AND convalidated AND confdeltype='c'
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%ON DELETE CASCADE%'
    ) AS tags_owner_fk`);
  const columns = await pool.query(`SELECT table_name,column_name,udt_name,is_nullable,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema()
      AND table_name IN ('canonical_garments','canonical_garment_tags')`);
  return Object.freeze({ ...(structural.rows[0] ?? {}), columns: columns.rows });
}

function columnsReady(rows: readonly any[]): boolean {
  const columns = new Map(rows.map(row => [`${String(row.table_name)}.${String(row.column_name)}`, row]));
  return REQUIRED_COLUMNS.every(expected => {
    const row = columns.get(`${expected.table}.${expected.name}`);
    if (!row || String(row.udt_name) !== expected.udtName) return false;
    if ((String(row.is_nullable) === 'YES') !== expected.nullable) return false;
    if (expected.expectedDefault !== undefined && String(row.column_default ?? '') !== expected.expectedDefault) return false;
    return true;
  });
}

function enumCheckReady(definition: unknown, values: readonly string[]): boolean {
  const value = String(definition ?? '');
  if (!value.startsWith('CHECK (') || value.includes(' OR ')) return false;
  const quoted = [...value.matchAll(/'([^']+)'::text/g)].map(match => match[1]);
  return quoted.length === values.length
    && values.every(expected => quoted.includes(expected))
    && quoted.every(actual => values.includes(actual));
}

function materialCheckReady(definition: unknown): boolean {
  const value = String(definition ?? '');
  return value.includes('char_length(material)')
    && value.includes('<= 50')
    && value.includes('btrim(material)')
    && value.includes('lower(material)')
    && value.includes('cntrl');
}

function schemaReady(state: any): boolean {
  return Boolean(
    state?.garments && state?.tags
    && columnsReady(Array.isArray(state?.columns) ? state.columns : [])
    && enumCheckReady(state?.category_check_definition, CATEGORY_VALUES)
    && enumCheckReady(state?.season_check_definition, SEASON_VALUES)
    && materialCheckReady(state?.material_check_definition)
    && state?.tags_pk && state?.tags_check && state?.tags_owner_fk
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
