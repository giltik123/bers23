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

type IndexContract = Readonly<{
  columns: readonly string[];
  options: readonly number[];
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

const OWNER_UPDATED_INDEX: IndexContract = Object.freeze({
  columns: Object.freeze(['tenant_id', 'user_id', 'updated_at', 'collection_id']),
  // PostgreSQL btree indoption: DESC=1, NULLS_FIRST=2. DESC defaults to NULLS FIRST.
  options: Object.freeze([0, 0, 3, 0]),
});
const MEMBERS_OWNER_INDEX: IndexContract = Object.freeze({
  columns: Object.freeze(['tenant_id', 'user_id', 'collection_id', 'created_at', 'garment_id']),
  options: Object.freeze([0, 0, 0, 0, 0]),
});
const MEMBERS_GARMENT_INDEX: IndexContract = Object.freeze({
  columns: Object.freeze(['tenant_id', 'user_id', 'garment_id', 'collection_id']),
  options: Object.freeze([0, 0, 0, 0]),
});

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
      'method',am.amname,'partial',i.indpred IS NOT NULL,'expressions',i.indexprs IS NOT NULL,
      'columns',ARRAY(
        SELECT a.attname
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord),
      'options',ARRAY(
        SELECT o.option
        FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
        WHERE o.ord <= i.indnkeyatts ORDER BY o.ord))
      FROM pg_index i
      JOIN pg_class ic ON ic.oid=i.indexrelid
      JOIN pg_am am ON am.oid=ic.relam
      WHERE i.indexrelid=to_regclass('canonical_garment_collections_owner_updated_idx')) AS owner_updated_index,
    (SELECT json_build_object(
      'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'primary',i.indisprimary,
      'method',am.amname,'partial',i.indpred IS NOT NULL,'expressions',i.indexprs IS NOT NULL,
      'columns',ARRAY(
        SELECT a.attname
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord),
      'options',ARRAY(
        SELECT o.option
        FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
        WHERE o.ord <= i.indnkeyatts ORDER BY o.ord))
      FROM pg_index i
      JOIN pg_class ic ON ic.oid=i.indexrelid
      JOIN pg_am am ON am.oid=ic.relam
      WHERE i.indexrelid=to_regclass('canonical_garment_collection_members_owner_idx')) AS members_owner_index,
    (SELECT json_build_object(
      'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'primary',i.indisprimary,
      'method',am.amname,'partial',i.indpred IS NOT NULL,'expressions',i.indexprs IS NOT NULL,
      'columns',ARRAY(
        SELECT a.attname
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord),
      'options',ARRAY(
        SELECT o.option
        FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
        WHERE o.ord <= i.indnkeyatts ORDER BY o.ord))
      FROM pg_index i
      JOIN pg_class ic ON ic.oid=i.indexrelid
      JOIN pg_am am ON am.oid=ic.relam
      WHERE i.indexrelid=to_regclass('canonical_garment_collection_members_garment_idx')) AS members_garment_index`);
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

function exactArray<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function indexReady(value: unknown, expected: IndexContract): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const index = value as Record<string, unknown>;
  if (index.valid !== true || index.ready !== true || index.unique === true || index.primary === true) return false;
  if (index.method !== 'btree' || index.partial === true || index.expressions === true) return false;
  const columns = Array.isArray(index.columns) ? index.columns.map(String) : [];
  const options = Array.isArray(index.options) ? index.options.map(Number) : [];
  return exactArray(columns, expected.columns) && exactArray(options, expected.options);
}

function schemaFailures(state: any): readonly string[] {
  const failures: string[] = [];
  if (!state?.collections) failures.push('collections_table');
  if (!state?.members) failures.push('members_table');
  if (!columnsReady(Array.isArray(state?.columns) ? state.columns : [])) failures.push('columns');
  if (!state?.collection_pk) failures.push('collection_pk');
  if (!state?.collection_owner_unique) failures.push('collection_owner_unique');
  if (!state?.member_pk) failures.push('member_pk');
  if (!checkReady(state?.name_check_definition, NAME_CHECK)) failures.push('name_check');
  if (!checkReady(state?.description_check_definition, DESCRIPTION_CHECK)) failures.push('description_check');
  if (!checkReady(state?.revision_check_definition, REVISION_CHECK)) failures.push('revision_check');
  if (!state?.collection_owner_fk) failures.push('collection_owner_fk');
  if (!state?.garment_owner_fk) failures.push('garment_owner_fk');
  if (!indexReady(state?.owner_updated_index, OWNER_UPDATED_INDEX)) failures.push('owner_updated_index');
  if (!indexReady(state?.members_owner_index, MEMBERS_OWNER_INDEX)) failures.push('members_owner_index');
  if (!indexReady(state?.members_garment_index, MEMBERS_GARMENT_INDEX)) failures.push('members_garment_index');
  return Object.freeze(failures);
}

function schemaReady(state: any): boolean {
  return schemaFailures(state).length === 0;
}

export async function checkGarmentCollectionSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  const failures = schemaFailures(state);
  if (failures.length > 0) {
    throw new Error(`canonical managed Garment Collection schema is incomplete; apply migration 024 [${failures.join(',')}]`);
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
