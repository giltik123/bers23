import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '025_managed_outfits.sql';

type ColumnContract = Readonly<{
  table: 'canonical_outfits' | 'canonical_outfit_entries';
  name: string;
  udtName: string;
  nullable: boolean;
  defaultKind: 'none' | 'timestamp' | 'exact';
  expectedDefault?: string;
}>;

type IndexContract = Readonly<{
  columns: readonly string[];
  options: readonly number[];
}>;

const REQUIRED_COLUMNS: readonly ColumnContract[] = Object.freeze([
  { table: 'canonical_outfits', name: 'outfit_id', udtName: 'uuid', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfits', name: 'tenant_id', udtName: 'text', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfits', name: 'user_id', udtName: 'text', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfits', name: 'name', udtName: 'text', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfits', name: 'style', udtName: 'text', nullable: false, defaultKind: 'exact', expectedDefault: "'casual'::text" },
  { table: 'canonical_outfits', name: 'season', udtName: 'text', nullable: false, defaultKind: 'exact', expectedDefault: "'all_season'::text" },
  { table: 'canonical_outfits', name: 'occasion', udtName: 'text', nullable: false, defaultKind: 'exact', expectedDefault: "'casual'::text" },
  { table: 'canonical_outfits', name: 'favorite', udtName: 'bool', nullable: false, defaultKind: 'exact', expectedDefault: 'false' },
  { table: 'canonical_outfits', name: 'status', udtName: 'text', nullable: false, defaultKind: 'exact', expectedDefault: "'ACTIVE'::text" },
  { table: 'canonical_outfits', name: 'revision', udtName: 'int8', nullable: false, defaultKind: 'exact', expectedDefault: '1' },
  { table: 'canonical_outfits', name: 'created_at', udtName: 'timestamptz', nullable: false, defaultKind: 'timestamp' },
  { table: 'canonical_outfits', name: 'updated_at', udtName: 'timestamptz', nullable: false, defaultKind: 'timestamp' },
  { table: 'canonical_outfits', name: 'deleted_at', udtName: 'timestamptz', nullable: true, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'entry_id', udtName: 'uuid', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'outfit_id', udtName: 'uuid', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'garment_id', udtName: 'uuid', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'tenant_id', udtName: 'text', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'user_id', udtName: 'text', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'position', udtName: 'int4', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'layer_role', udtName: 'text', nullable: false, defaultKind: 'none' },
  { table: 'canonical_outfit_entries', name: 'created_at', udtName: 'timestamptz', nullable: false, defaultKind: 'timestamp' },
]);

const STYLE_VALUES = Object.freeze([
  'minimal','classic','elegant','streetwear','business','luxury','sport','vintage','casual','modern','creative','smart_casual',
] as const);
const SEASON_VALUES = Object.freeze(['all_season','spring','summer','autumn','winter'] as const);
const OCCASION_VALUES = Object.freeze([
  'casual','business','formal','wedding','party','travel','sport','outdoor','streetwear','luxury','home','beach','night_out',
] as const);
const STATUS_VALUES = Object.freeze(['ACTIVE','ARCHIVED'] as const);
const LAYER_ROLE_VALUES = Object.freeze(['BASE_TOP','MID_TOP','OUTER_TOP','FULL_BODY','BOTTOM','FOOTWEAR','ACCESSORY'] as const);

const NAME_CHECK = "CHECK (char_length(name) >= 1 AND char_length(name) <= 200 AND name = btrim(name) AND name !~ '[[:cntrl:]]')";
const REVISION_CHECK = 'CHECK (revision >= 1)';
const POSITION_CHECK = 'CHECK (position >= 0 AND position < 32)';

const OWNER_UPDATED_INDEX: IndexContract = Object.freeze({
  columns: Object.freeze(['tenant_id','user_id','updated_at','outfit_id']),
  options: Object.freeze([0,0,3,0]),
});
const ENTRIES_OWNER_ORDER_INDEX: IndexContract = Object.freeze({
  columns: Object.freeze(['tenant_id','user_id','outfit_id','position','entry_id']),
  options: Object.freeze([0,0,0,0,0]),
});
const ENTRIES_GARMENT_INDEX: IndexContract = Object.freeze({
  columns: Object.freeze(['tenant_id','user_id','garment_id','outfit_id','entry_id']),
  options: Object.freeze([0,0,0,0,0]),
});

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const structural = await pool.query(`SELECT
    to_regclass('canonical_outfits')::text AS outfits,
    to_regclass('canonical_outfit_entries')::text AS entries,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_name_check'
        AND contype='c' AND convalidated) AS name_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_style_check'
        AND contype='c' AND convalidated) AS style_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_season_check'
        AND contype='c' AND convalidated) AS season_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_occasion_check'
        AND contype='c' AND convalidated) AS occasion_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_status_check'
        AND contype='c' AND convalidated) AS status_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_revision_check'
        AND contype='c' AND convalidated) AS revision_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries') AND conname='canonical_outfit_entries_position_check'
        AND contype='c' AND convalidated) AS position_check_definition,
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries') AND conname='canonical_outfit_entries_layer_role_check'
        AND contype='c' AND convalidated) AS layer_role_check_definition,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits')
        AND conname='canonical_outfits_pkey' AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (outfit_id)'
    ) AS outfit_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits')
        AND conname='canonical_outfits_owner_unique' AND contype='u' AND convalidated
        AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, tenant_id, user_id)'
    ) AS outfit_owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries')
        AND conname='canonical_outfit_entries_pkey' AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (entry_id)'
    ) AS entry_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries')
        AND conname='canonical_outfit_entries_outfit_garment_unique' AND contype='u' AND convalidated
        AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, garment_id)'
    ) AS outfit_garment_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries')
        AND conname='canonical_outfit_entries_outfit_position_unique' AND contype='u' AND convalidated
        AND condeferrable AND condeferred
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (outfit_id, "position")%'
    ) AS outfit_position_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries')
        AND conname='canonical_outfit_entries_outfit_owner_fkey' AND contype='f' AND convalidated AND confdeltype='c'
        AND confrelid=to_regclass('canonical_outfits')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (outfit_id, tenant_id, user_id) REFERENCES canonical_outfits(outfit_id, tenant_id, user_id)%ON DELETE CASCADE%'
    ) AS outfit_owner_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries')
        AND conname='canonical_outfit_entries_garment_owner_fkey' AND contype='f' AND convalidated AND confdeltype='r'
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%ON DELETE RESTRICT%'
    ) AS garment_owner_fk,
    ${indexProjection('canonical_outfits_owner_updated_idx')} AS owner_updated_index,
    ${indexProjection('canonical_outfit_entries_owner_order_idx')} AS entries_owner_order_index,
    ${indexProjection('canonical_outfit_entries_garment_idx')} AS entries_garment_index`);
  const columns = await pool.query(`SELECT table_name,column_name,udt_name,is_nullable,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema()
      AND table_name IN ('canonical_outfits','canonical_outfit_entries')`);
  return Object.freeze({ ...(structural.rows[0] ?? {}), columns: columns.rows });
}

function indexProjection(indexName: string): string {
  return `(SELECT json_build_object(
    'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'primary',i.indisprimary,
    'method',am.amname,'partial',i.indpred IS NOT NULL,'expressions',i.indexprs IS NOT NULL,
    'columns',ARRAY(
      SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
      WHERE k.ord <= i.indnkeyatts ORDER BY k.ord),
    'options',ARRAY(
      SELECT o.option FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
      WHERE o.ord <= i.indnkeyatts ORDER BY o.ord))
    FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid
    JOIN pg_am am ON am.oid=ic.relam
    WHERE i.indexrelid=to_regclass('${indexName}'))`;
}

function columnsReady(rows: readonly any[]): boolean {
  const columns = new Map(rows.map(row => [`${String(row.table_name)}.${String(row.column_name)}`, row]));
  return REQUIRED_COLUMNS.every(expected => {
    const row = columns.get(`${expected.table}.${expected.name}`);
    if (!row || String(row.udt_name) !== expected.udtName) return false;
    if ((String(row.is_nullable) === 'YES') !== expected.nullable) return false;
    return defaultReady(row.column_default, expected);
  });
}

function defaultReady(value: unknown, contract: ColumnContract): boolean {
  const actual = String(value ?? '').trim();
  if (contract.defaultKind === 'none') return actual.length === 0;
  if (contract.defaultKind === 'exact') return actual === contract.expectedDefault;
  const normalized = actual.toLowerCase().replace(/\s+/g, '');
  return normalized === 'current_timestamp' || normalized === 'now()';
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

function enumCheckReady(definition: unknown, column: string, values: readonly string[]): boolean {
  const raw = String(definition ?? '');
  if (!raw.startsWith('CHECK (') || /\b(?:NOT|OR|AND)\b/i.test(raw)) return false;
  const normalized = raw.toLowerCase().replace(/\s+/g, '');
  if (!normalized.includes(`${column.toLowerCase()}=any(array[`)) return false;
  const operators = normalized.match(/<>|!=|<=|>=|=|<|>/g) ?? [];
  if (operators.length !== 1 || operators[0] !== '=') return false;
  const quoted = [...raw.matchAll(/'([^']+)'::text/g)].map(match => match[1]);
  return quoted.length === values.length
    && values.every(expected => quoted.includes(expected))
    && quoted.every(actual => values.includes(actual));
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
  if (!state?.outfits) failures.push('outfits_table');
  if (!state?.entries) failures.push('entries_table');
  if (!columnsReady(Array.isArray(state?.columns) ? state.columns : [])) failures.push('columns');
  if (!state?.outfit_pk) failures.push('outfit_pk');
  if (!state?.outfit_owner_unique) failures.push('outfit_owner_unique');
  if (!state?.entry_pk) failures.push('entry_pk');
  if (!state?.outfit_garment_unique) failures.push('outfit_garment_unique');
  if (!state?.outfit_position_unique) failures.push('outfit_position_unique');
  if (!checkReady(state?.name_check_definition, NAME_CHECK)) failures.push('name_check');
  if (!enumCheckReady(state?.style_check_definition, 'style', STYLE_VALUES)) failures.push('style_check');
  if (!enumCheckReady(state?.season_check_definition, 'season', SEASON_VALUES)) failures.push('season_check');
  if (!enumCheckReady(state?.occasion_check_definition, 'occasion', OCCASION_VALUES)) failures.push('occasion_check');
  if (!enumCheckReady(state?.status_check_definition, 'status', STATUS_VALUES)) failures.push('status_check');
  if (!checkReady(state?.revision_check_definition, REVISION_CHECK)) failures.push('revision_check');
  if (!checkReady(state?.position_check_definition, POSITION_CHECK)) failures.push('position_check');
  if (!enumCheckReady(state?.layer_role_check_definition, 'layer_role', LAYER_ROLE_VALUES)) failures.push('layer_role_check');
  if (!state?.outfit_owner_fk) failures.push('outfit_owner_fk');
  if (!state?.garment_owner_fk) failures.push('garment_owner_fk');
  if (!indexReady(state?.owner_updated_index, OWNER_UPDATED_INDEX)) failures.push('owner_updated_index');
  if (!indexReady(state?.entries_owner_order_index, ENTRIES_OWNER_ORDER_INDEX)) failures.push('entries_owner_order_index');
  if (!indexReady(state?.entries_garment_index, ENTRIES_GARMENT_INDEX)) failures.push('entries_garment_index');
  return Object.freeze(failures);
}

export async function checkOutfitSchema(pool: Pool): Promise<void> {
  const failures = schemaFailures(await schemaState(pool));
  if (failures.length > 0) {
    throw new Error(`canonical managed Outfit schema is incomplete; apply migration 025 [${failures.join(',')}]`);
  }
}

export async function migrateOutfitSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (schemaFailures(state).length > 0) {
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
  await checkOutfitSchema(pool);
}
