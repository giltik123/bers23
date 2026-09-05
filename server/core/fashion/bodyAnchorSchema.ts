import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const BASE_MIGRATION = '028_project_body_anchor_sets.sql';
const SEQUENCE_MIGRATION = '031_project_body_anchor_acquisition_sequence.sql';
const IDEMPOTENCY_MIGRATION = '035_project_body_anchor_idempotency.sql';
const TABLE = 'canonical_project_body_anchor_sets';
const EXPECTED_COLUMNS = Object.freeze([
  ['anchor_set_id', 'uuid', false],
  ['tenant_id', 'text', false],
  ['user_id', 'text', false],
  ['project_id', 'uuid', false],
  ['project_image_storage_id', 'uuid', false],
  ['project_image_sha256', 'bpchar', false],
  ['project_image_width', 'int4', false],
  ['project_image_height', 'int4', false],
  ['schema_id', 'text', false],
  ['coordinate_space', 'text', false],
  ['anchor_payload', 'jsonb', false],
  ['anchor_payload_sha256', 'bpchar', false],
  ['producer_id', 'text', false],
  ['producer_version', 'text', false],
  ['created_at', 'timestamptz', false],
  ['acquisition_sequence', 'int8', false],
  ['idempotency_key', 'uuid', true],
  ['idempotency_binding_sha256', 'bpchar', true],
] as const);

const EXPECTED_CHECK_FRAGMENTS = Object.freeze(new Map<string, readonly string[]>([
  ['canonical_project_body_anchor_sets_image_sha256_check', ["project_image_sha256 ~ '^[0-9a-f]{64}$'::text"]],
  ['canonical_project_body_anchor_sets_image_width_check', ['project_image_width > 0']],
  ['canonical_project_body_anchor_sets_image_height_check', ['project_image_height > 0']],
  ['canonical_project_body_anchor_sets_schema_id_check', ["schema_id = 'BERS_BODY_ANCHORS_V1'::text"]],
  ['canonical_project_body_anchor_sets_coordinate_space_check', ["coordinate_space = 'PROJECT_IMAGE_NORMALIZED'::text"]],
  ['canonical_project_body_anchor_sets_payload_object_check', ["jsonb_typeof(anchor_payload) = 'object'::text"]],
  ['canonical_project_body_anchor_sets_payload_sha256_check', ["anchor_payload_sha256 ~ '^[0-9a-f]{64}$'::text"]],
  ['canonical_project_body_anchor_sets_producer_id_check', ['producer_id = btrim(producer_id)', "producer_id !~ '[[:cntrl:]]'::text"]],
  ['canonical_project_body_anchor_sets_producer_version_check', ['producer_version = btrim(producer_version)', "producer_version !~ '[[:cntrl:]]'::text"]],
  ['canonical_project_body_anchor_sets_idempotency_binding_check', [
    'idempotency_key IS NULL',
    'idempotency_binding_sha256 IS NULL',
    'idempotency_key IS NOT NULL',
    'idempotency_binding_sha256 IS NOT NULL',
    "idempotency_binding_sha256 ~ '^[0-9a-f]{64}$'::text",
  ]],
]));

const LEGACY_INDEX = 'canonical_project_body_anchor_sets_owner_project_idx';
const SEQUENCE_INDEX = 'canonical_project_body_anchor_sets_owner_project_sequence_idx';
const IDEMPOTENCY_INDEX = 'canonical_project_body_anchor_sets_owner_idempotency_key_unique';
const LEGACY_INDEX_FRAGMENT = 'USING btree (tenant_id, user_id, project_id, project_image_storage_id, created_at DESC, anchor_set_id)';
const SEQUENCE_INDEX_FRAGMENT = 'USING btree (tenant_id, user_id, project_id, project_image_storage_id, acquisition_sequence DESC, anchor_set_id)';
const IDEMPOTENCY_INDEX_FRAGMENT = 'USING btree (tenant_id, user_id, idempotency_key)';

async function migration(name: string): Promise<string> {
  try { return await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', name), 'utf8'); }
}

async function ready(pool: Pool): Promise<boolean> {
  const structural = await pool.query(`SELECT
    to_regclass($1)::text AS relation,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='canonical_project_body_anchor_sets_pkey'
        AND conrelid=to_regclass($1) AND contype='p' AND convalidated
        AND pg_get_constraintdef(oid)='PRIMARY KEY (anchor_set_id)'
    ) AS primary_key,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='canonical_project_body_anchor_sets_owner_unique'
        AND conrelid=to_regclass($1) AND contype='u' AND convalidated
        AND pg_get_constraintdef(oid)='UNIQUE (anchor_set_id, project_id, tenant_id, user_id)'
    ) AS owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='canonical_project_body_anchor_sets_acquisition_sequence_unique'
        AND conrelid=to_regclass($1) AND contype='u' AND convalidated
        AND pg_get_constraintdef(oid)='UNIQUE (acquisition_sequence)'
    ) AS sequence_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='canonical_project_body_anchor_sets_project_fk'
        AND conrelid=to_regclass($1) AND contype='f' AND confrelid=to_regclass('canonical_projects') AND convalidated
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (project_id) REFERENCES canonical_projects(project_id)%ON DELETE RESTRICT%'
    ) AS project_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='canonical_project_body_anchor_sets_image_fk'
        AND conrelid=to_regclass($1) AND contype='f' AND confrelid=to_regclass('canonical_image_artifacts') AND convalidated
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (project_image_storage_id) REFERENCES canonical_image_artifacts(storage_id)%ON DELETE RESTRICT%'
    ) AS image_fk`, [TABLE]);
  const row = structural.rows[0];
  if (!row?.relation || !row.primary_key || !row.owner_unique || !row.sequence_unique || !row.project_fk || !row.image_fk) return false;

  const columns = await pool.query(`SELECT column_name,udt_name,is_nullable,character_maximum_length,column_default,is_identity,identity_generation
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1`, [TABLE]);
  const byName = new Map(columns.rows.map(candidate => [String(candidate.column_name), candidate]));
  if (byName.size !== EXPECTED_COLUMNS.length) return false;
  for (const [name, type, nullable] of EXPECTED_COLUMNS) {
    const candidate = byName.get(name);
    if (!candidate || String(candidate.udt_name) !== type || ((String(candidate.is_nullable) === 'YES') !== nullable)) return false;
    if ((name === 'project_image_sha256' || name === 'anchor_payload_sha256' || name === 'idempotency_binding_sha256') && Number(candidate.character_maximum_length) !== 64) return false;
    const columnDefault = candidate.column_default == null ? null : normalizeSql(String(candidate.column_default));
    if (name === 'created_at') {
      if (columnDefault !== 'CURRENT_TIMESTAMP' || String(candidate.is_identity) !== 'NO') return false;
    } else if (name === 'acquisition_sequence') {
      if (columnDefault !== null || String(candidate.is_identity) !== 'YES' || String(candidate.identity_generation) !== 'ALWAYS') return false;
    } else if (columnDefault !== null || String(candidate.is_identity) !== 'NO') {
      return false;
    }
  }

  const checks = await pool.query(`SELECT conname,pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid=to_regclass($1) AND contype='c' AND convalidated`, [TABLE]);
  const checkByName = new Map(checks.rows.map(candidate => [String(candidate.conname), normalizeSql(String(candidate.definition))]));
  if (checkByName.size !== EXPECTED_CHECK_FRAGMENTS.size) return false;
  for (const [name, fragments] of EXPECTED_CHECK_FRAGMENTS) {
    const definition = checkByName.get(name);
    if (!definition || fragments.some(fragment => !definition.includes(fragment))) return false;
    if ((name.endsWith('_producer_id_check') || name.endsWith('_producer_version_check')) && !hasOneToHundredBound(definition)) return false;
  }

  const indexes = await pool.query(`SELECT i.indexname,i.indexdef,x.indisvalid,x.indisready,x.indisunique
    FROM pg_indexes i
    JOIN pg_namespace n ON n.nspname=i.schemaname
    JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=i.indexname
    JOIN pg_index x ON x.indexrelid=c.oid
    WHERE i.schemaname=current_schema() AND i.tablename=$1
      AND i.indexname IN ($2,$3,$4)`, [TABLE, LEGACY_INDEX, SEQUENCE_INDEX, IDEMPOTENCY_INDEX]);
  const indexByName = new Map(indexes.rows.map(candidate => [String(candidate.indexname), candidate]));
  const legacyIndex = indexByName.get(LEGACY_INDEX);
  const sequenceIndex = indexByName.get(SEQUENCE_INDEX);
  const idempotencyIndex = indexByName.get(IDEMPOTENCY_INDEX);
  if (
    !healthyIndex(sequenceIndex, SEQUENCE_INDEX_FRAGMENT)
    || !healthyIdempotencyIndex(idempotencyIndex)
    || (legacyIndex !== undefined && !healthyIndex(legacyIndex, LEGACY_INDEX_FRAGMENT))
    || indexByName.size !== (legacyIndex === undefined ? 2 : 3)
  ) return false;

  const triggers = await pool.query(`SELECT t.tgname,t.tgtype,t.tgenabled,p.proname
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid=to_regclass($1) AND NOT t.tgisinternal
      AND t.tgname IN ('canonical_project_body_anchor_sets_insert_guard','canonical_project_body_anchor_sets_immutable_guard')`, [TABLE]);
  const triggerByName = new Map(triggers.rows.map(candidate => [String(candidate.tgname), candidate]));
  const insertGuard = triggerByName.get('canonical_project_body_anchor_sets_insert_guard');
  const immutableGuard = triggerByName.get('canonical_project_body_anchor_sets_immutable_guard');
  if (
    triggerByName.size !== 2
    || Number(insertGuard?.tgtype) !== 7 || insertGuard?.tgenabled !== 'O' || insertGuard?.proname !== 'canonical_assert_project_body_anchor_insert'
    || Number(immutableGuard?.tgtype) !== 27 || immutableGuard?.tgenabled !== 'O' || immutableGuard?.proname !== 'canonical_project_body_anchor_immutable_guard'
  ) return false;

  return true;
}

function normalizeSql(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
function hasOneToHundredBound(definition: string): boolean {
  return definition.includes('BETWEEN 1 AND 100')
    || (definition.includes('>= 1') && definition.includes('<= 100'));
}
function healthyIndex(candidate: any, expectedFragment: string): boolean {
  if (!candidate || candidate.indisvalid !== true || candidate.indisready !== true) return false;
  const definition = normalizeSql(String(candidate.indexdef));
  return definition.includes(expectedFragment) && !/\bWHERE\b/.test(definition);
}
function healthyIdempotencyIndex(candidate: any): boolean {
  if (!candidate || candidate.indisvalid !== true || candidate.indisready !== true || candidate.indisunique !== true) return false;
  const definition = normalizeSql(String(candidate.indexdef));
  return definition.includes(IDEMPOTENCY_INDEX_FRAGMENT)
    && definition.includes('WHERE (idempotency_key IS NOT NULL)');
}

export async function checkProjectBodyAnchorSchema(pool: Pool): Promise<void> {
  if (!await ready(pool)) throw new Error('canonical Project body anchor schema is incomplete or drifted; apply migrations 028, 031 and 035; legacy index cleanup is a separate post-rollout contract step');
}

export async function migrateProjectBodyAnchorSchema(pool: Pool): Promise<void> {
  const relation = await pool.query(`SELECT to_regclass($1)::text AS relation`, [TABLE]);
  if (!relation.rows[0]?.relation) await pool.query(await migration(BASE_MIGRATION));
  const sequenceColumn = await pool.query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1 AND column_name='acquisition_sequence'`, [TABLE]);
  if (sequenceColumn.rowCount !== 1) await pool.query(await migration(SEQUENCE_MIGRATION));
  const idempotencyColumn = await pool.query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1 AND column_name='idempotency_key'`, [TABLE]);
  if (idempotencyColumn.rowCount !== 1) await pool.query(await migration(IDEMPOTENCY_MIGRATION));
  await checkProjectBodyAnchorSchema(pool);
}
