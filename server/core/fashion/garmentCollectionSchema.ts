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
  forbidsDefault?: boolean;
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
  { table: 'canonical_garment_collections', name: 'deleted_at', udtName: 'timestamptz', nullable: true, forbidsDefault: true },
  { table: 'canonical_garment_collection_members', name: 'collection_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'garment_id', udtName: 'uuid', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'tenant_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'user_id', udtName: 'text', nullable: false },
  { table: 'canonical_garment_collection_members', name: 'created_at', udtName: 'timestamptz', nullable: false, requiresDefault: true },
]);

const NAME_CHECK = "CHECK (char_length(name) >= 1 AND char_length(name) <= 100 AND name = btrim(name) AND name !~ '[[:cntrl:]]')";
const DESCRIPTION_CHECK = "CHECK (char_length(description) <= 500 AND description !~ '[[:cntrl:]]')";
const REVISION_CHECK = 'CHECK (revision >= 1)';

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const structural = await pool.query(`SELECT
    to_regclass('canonical_garment_collections')::text AS collections,
    to_regclass('canonical_garment_collection_members')::text AS members,
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
    ) AS garment_owner_fk,
    (SELECT json_build_object(
      'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'primary',i.indisprimary,
      'keys',ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true) FROM generate_series(1,i.indnkeyatts) n ORDER BY n))
      FROM pg_index i WHERE i.indexrelid=to_regclass('canonical_garment_collections_owner_updated_idx')) AS owner_updated_index,
    (SELECT json_build_object(
      'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'primary',i.indisprimary,
      'keys',ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true) FROM generate_series(1,i.indnkeyatts) n ORDER BY n))
      FROM pg_index i WHERE i.indexrelid=to_regclass('canonical_garment_collection_members_owner_idx')) AS members_owner_index,
    (SELECT json_build_object(
      'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'primary',i.indisprimary,
      'keys',ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true) FROM generate_series(1,i.indnkeyatts) n ORDER BY n))
      FROM pg_index i WHERE i.indexrelid=to_regclass('canonical_garment_collection_members_garment_idx')) AS members_garment_index`);
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
    const actualDefault = String(row.column_default ?? '');
    if (expected.expectedDefault !== undefined && actualDefault !== expected.expectedDefault) return false;
    if (expected.requiresDefault && !actualDefault.trim()) return false;
    if (expected.forbidsDefault && actualDefault.trim()) return false;
    return true;
  });
}

function canonicalCheck(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/::text/g, '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '');
}

function checkReady(actual: unknown, expected: string): boolean {
  return canonicalCheck(actual) === canonicalCheck(expected);
}

function indexReady(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const index = value as Record<string, unknown>;
  if (index.valid !== true || index.ready !== true || index.unique === true || index.primary === true) return false;
  const keys = Array.isArray(index.keys) ? index.keys.map(String) : [];
  return keys.length === expectedKeys.length && keys.every((key, indexPosition) => key === expectedKeys[indexPosition]);
}

function schemaReady(state: any): boolean {
  return Boolean(
    state?.collections && state?.members
    && columnsReady(Array.isArray(state?.columns) ? state.columns : [])
    && state?.collection_pk && state?.collection_owner_unique && state?.member_pk
    && checkReady(state?.name_check_definition, NAME_CHECK)
    && checkReady(state?.description_check_definition, DESCRIPTION_CHECK)
    && checkReady(state?.revision_check_definition, REVISION_CHECK)
    && state?.collection_owner_fk && state?.garment_owner_fk
    && indexReady(state?.owner_updated_index, ['tenant_id', 'user_id', 'updated_at DESC', 'collection_id'])
    && indexReady(state?.members_owner_index, ['tenant_id', 'user_id', 'collection_id', 'created_at', 'garment_id'])
    && indexReady(state?.members_garment_index, ['tenant_id', 'user_id', 'garment_id', 'collection_id'])
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
  if (!schemaReady(state)) {
    const client = await pool.connect();
    try {
      await client.query(await migration());
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  await checkGarmentCollectionSchema(pool);
}
