import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '024_managed_garment_collections.sql';

type ColumnContract = Readonly<{
  table: 'canonical_garment_collections' | 'canonical_garment_collection_members';
  name: string;
  udtName: string;
  nullable: boolean;
  expectedDefault?: string;
  requiresDefault?: boolean;
}>;

const REQUIRED_COLUMNS: readonly ColumnContract[] = Object.freeze([
  { table: 'canonical_garment_collections', name: 'collection_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_collections', name: 'tenant_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_collections', name: 'user_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_collections', name: 'name', udtName: 'text', nullable: false },
  { table: 'canonical_garment_collections', name: 'description', udtName: 'text', nullable: false, expectedDefault: "''::text" },
  { table: 'canonical_garment_collections', name: 'revision', udtName: 'int8', nullable: false, expectedDefault: '1' },
  { table: 'canonical_garment_collections', name: 'created_at', udtName: 'timestamptz', nullable: false, requiresDefault: true },
  { table: 'canonical_garment_collections', name: 'updated_at', udtName: 'timestamptz', nullable: false, requiresDefault: true },
  { table: 'canonical_garment_collections', name: 'deleted_at', udtName: 'timestamptz', nullable: true },
  { table: 'canonical_garment_collection_members', name: 'collection_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'garment_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'tenant_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'user_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'created_at', udtName: 'timestamptz', nullable: false, requiresDefault: true },
]);

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const structural = await pool.query(`SELECT
    to_regclass('canonical_garment_collections')::text AS collections,
    to_regclass('canonical_garment_collection_members')::text AS members,
    to_regclass('canonical_garment_collections_owner_updated_idx')::text AS owner_updated_idx,
    to_regclass('canonical_garment_collection_members_owner_idx')::text AS members_owner_idx,
    to_regclass('canonical_garment_collection_members_garment_idx')::text AS members_garment_idx,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections')
        AND conname='canonical_garment_collections_name_check' AND contype='c' AND convalidated) AS name_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections')
        AND conname='canonical_garment_collections_description_check' AND contype='c' AND convalidated) AS description_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections')
        AND conname='canonical_garment_collections_revision_check' AND contype='c' AND convalidated) AS revision_check_definition,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections')
        AND conname='canonical_garment_collections_pkey' AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (collection_id)'
    ) AS collection_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections')
        AND conname='canonical_garment_collections_owner_unique' AND contype='u' AND convalidated
        AND pg_get_constraintdef(oid)='UNIQUE (collection_id, tenant_id, user_id)'
    ) AS collection_owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collection_members')
        AND conname='canonical_garment_collection_members_pkey' AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (collection_id, garment_id)'
    ) AS member_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collection_members')
        AND conname='canonical_garment_collection_members_collection_owner_fkey'
        AND contype='f' AND convalidated AND confdeltype='c'
        AND confrelid=to_regclass('canonical_garment_collections')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (collection_id, tenant_id, user_id) REFERENCES canonical_garment_collections(collection_id, tenant_id, user_id)%ON DELETE CASCADE%'
    ) AS collection_owner_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collection_members')
        AND conname='canonical_garment_collection_members_garment_owner_fkey'
        AND contype='f' AND convalidated AND confdeltype='c'
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%ON DELETE CASCADE%'
    ) AS garment_owner_fk`);
  const columns = await pool.query(`SELECT table_name,column_name,udt_name,is_nullable,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema()
      AND table_name IN ('canonical_garment_collections','canonical_garment_collection_members')`);
  return Object.freeze({ ...(structural.rows[0] ?? {}), columns: columns.rows });
}

function columnsReady(rows: readonly any[]): boolean {
  const columns = new Map(rows.map(row => [`${String(row.table_name)}.${String(row.column_name)}`, row]));
  return REQUIRED_COLUMNS.every(expected => {
    const row = columns.get(`${expected.table}.${expected.name}`);
    if (!row || String(row.udt_name) !== expected.udtName) return false;
    if ((String(row.is_nullable) === 'YES') !== expected.nullable) return false;
    if (expected.expectedDefault !== undefined && String(row.column_default ?? '') !== expected.expectedDefault) return false;
    if (expected.requiresDefault && !String(row.column_default ?? '').trim()) return false;
    return true;
  });
}

function conjunctiveCheck(definition: unknown, requiredFragments: readonly string[]): boolean {
  const value = String(definition ?? '');
  return value.startsWith('CHECK (')
    && !value.includes(' OR ')
    && requiredFragments.every(fragment => value.includes(fragment));
}

function schemaReady(state: any): boolean {
  return Boolean(
    state?.collections && state?.members
    && columnsReady(Array.isArray(state?.columns) ? state.columns : [])
    && state?.collection_pk && state?.collection_owner_unique && state?.member_pk
    && conjunctiveCheck(state?.name_check_definition, ['char_length(name)', '>= 1', '<= 100', 'btrim(name)', 'cntrl'])
    && conjunctiveCheck(state?.description_check_definition, ['char_length(description)', '<= 500', 'cntrl'])
    && conjunctiveCheck(state?.revision_check_definition, ['revision >= 1'])
    && state?.collection_owner_fk && state?.garment_owner_fk
    && state?.owner_updated_idx && state?.members_owner_idx && state?.members_garment_idx
  );
}

export async function checkGarmentCollectionSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) {
    throw new Error('canonical managed Garment Collection schema is incomplete; apply migration 024');
  }
}

export async function migrateGarmentCollectionSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) await pool.query(await migration());
  await checkGarmentCollectionSchema(pool);
}
