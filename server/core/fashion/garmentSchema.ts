import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { checkGarmentCollectionSchema, migrateGarmentCollectionSchema } from './garmentCollectionSchema.ts';
import { checkGarmentWardrobeSchema, migrateGarmentWardrobeSchema } from './garmentWardrobeSchema.ts';

const MIGRATION = '022_managed_garments_and_initial_views.sql';

type ColumnContract = Readonly<{
  table: 'canonical_garments' | 'canonical_garment_views';
  name: string;
  udtName: string;
  nullable: boolean;
  maxLength?: number;
  requiresDefault?: boolean;
}>;

const REQUIRED_COLUMNS: readonly ColumnContract[] = Object.freeze([
  { table: 'canonical_garments', name: 'garment_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garments', name: 'tenant_id', udtName: 'text', nullable: false },
  { table: 'canonical_garments', name: 'user_id', udtName: 'text', nullable: false },
  { table: 'canonical_garments', name: 'name', udtName: 'text', nullable: false },
  { table: 'canonical_garments', name: 'representation_tier', udtName: 'text', nullable: false },
  { table: 'canonical_garments', name: 'status', udtName: 'text', nullable: false },
  { table: 'canonical_garments', name: 'revision', udtName: 'int8', nullable: false },
  { table: 'canonical_garments', name: 'primary_view_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garments', name: 'created_at', udtName: 'timestamptz', nullable: false, requiresDefault: true },
  { table: 'canonical_garments', name: 'updated_at', udtName: 'timestamptz', nullable: false, requiresDefault: true },
  { table: 'canonical_garments', name: 'deleted_at', udtName: 'timestamptz', nullable: true },
  { table: 'canonical_garment_views', name: 'view_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_views', name: 'garment_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_views', name: 'tenant_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_views', name: 'user_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_views', name: 'ordinal', udtName: 'int4', nullable: false },
  { table: 'canonical_garment_views', name: 'view_kind', udtName: 'text', nullable: false },
  { table: 'canonical_garment_views', name: 'source_content_type', udtName: 'text', nullable: false },
  { table: 'canonical_garment_views', name: 'width', udtName: 'int4', nullable: false },
  { table: 'canonical_garment_views', name: 'height', udtName: 'int4', nullable: false },
  { table: 'canonical_garment_views', name: 'encoding', udtName: 'text', nullable: false },
  { table: 'canonical_garment_views', name: 'content_type', udtName: 'text', nullable: false },
  { table: 'canonical_garment_views', name: 'content_sha256', udtName: 'bpchar', nullable: false, maxLength: 64 },
  { table: 'canonical_garment_views', name: 'storage_backend', udtName: 'text', nullable: false },
  { table: 'canonical_garment_views', name: 'image_bytes', udtName: 'bytea', nullable: false },
  { table: 'canonical_garment_views', name: 'created_at', udtName: 'timestamptz', nullable: false, requiresDefault: true },
  { table: 'canonical_garment_views', name: 'revoked_at', udtName: 'timestamptz', nullable: true },
  { table: 'canonical_garment_views', name: 'deleted_at', udtName: 'timestamptz', nullable: true },
]);

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const structural = await pool.query(`SELECT
    to_regclass('canonical_garments')::text AS garments,
    to_regclass('canonical_garment_views')::text AS views,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND contype='p'
        AND pg_get_constraintdef(oid)='PRIMARY KEY (garment_id)'
    ) AS garment_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='p'
        AND pg_get_constraintdef(oid)='PRIMARY KEY (view_id)'
    ) AS view_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (garment_id, tenant_id, user_id)'
    ) AS garment_owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (view_id, garment_id, tenant_id, user_id)'
    ) AS view_owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (garment_id, ordinal)'
    ) AS garment_ordinal_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='f'
        AND confrelid=to_regclass('canonical_garments')
        AND convalidated
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%'
    ) AS view_owner_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND contype='f'
        AND confrelid=to_regclass('canonical_garment_views')
        AND convalidated AND condeferrable AND condeferred
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (primary_view_id, garment_id, tenant_id, user_id) REFERENCES canonical_garment_views(view_id, garment_id, tenant_id, user_id)%'
    ) AS primary_view_owner_fk`);
  const columns = await pool.query(`SELECT table_name,column_name,udt_name,is_nullable,character_maximum_length,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name IN ('canonical_garments','canonical_garment_views')`);
  return Object.freeze({ ...(structural.rows[0] ?? {}), columns: columns.rows });
}

function columnsReady(rows: readonly any[]): boolean {
  const columns = new Map(rows.map(row => [`${String(row.table_name)}.${String(row.column_name)}`, row]));
  return REQUIRED_COLUMNS.every(expected => {
    const row = columns.get(`${expected.table}.${expected.name}`);
    if (!row || String(row.udt_name) !== expected.udtName) return false;
    if ((String(row.is_nullable) === 'YES') !== expected.nullable) return false;
    if (expected.maxLength !== undefined && Number(row.character_maximum_length) !== expected.maxLength) return false;
    if (expected.requiresDefault && (row.column_default === null || row.column_default === undefined || String(row.column_default).trim() === '')) return false;
    return true;
  });
}

function schemaReady(state: any): boolean {
  return Boolean(
    state?.garments
    && state?.views
    && columnsReady(Array.isArray(state?.columns) ? state.columns : [])
    && state?.garment_pk
    && state?.view_pk
    && state?.garment_owner_unique
    && state?.view_owner_unique
    && state?.garment_ordinal_unique
    && state?.view_owner_fk
    && state?.primary_view_owner_fk
  );
}

async function checkBaseGarmentSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) {
    throw new Error('canonical managed Garment schema columns or ownership constraints are incomplete; apply migration 022');
  }
}

export async function checkGarmentSchema(pool: Pool): Promise<void> {
  await checkBaseGarmentSchema(pool);
  await checkGarmentWardrobeSchema(pool);
  await checkGarmentCollectionSchema(pool);
}

export async function migrateGarmentSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) await pool.query(await migration());
  await checkBaseGarmentSchema(pool);
  await migrateGarmentWardrobeSchema(pool);
  await migrateGarmentCollectionSchema(pool);
  await checkGarmentSchema(pool);
}
