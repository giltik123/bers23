import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '040_automation_definitions.sql';
const TABLE = 'canonical_automation_definitions';
const REQUIRED_COLUMNS = Object.freeze([
  ['automation_id','uuid','NO'],
  ['tenant_id','text','NO'],
  ['user_id','text','NO'],
  ['name','text','NO'],
  ['trigger','text','NO'],
  ['plan_kind','text','NO'],
  ['orthogonal_mode','text','NO'],
  ['target_width','int4','NO'],
  ['target_height','int4','NO'],
  ['status','text','NO'],
  ['revision','int8','NO'],
  ['created_at','timestamptz','NO'],
  ['updated_at','timestamptz','NO'],
] as const);
const REQUIRED_CONSTRAINTS = Object.freeze([
  'canonical_automation_definitions_pkey',
  'canonical_automation_definitions_owner_check',
  'canonical_automation_definitions_name_check',
  'canonical_automation_definitions_trigger_check',
  'canonical_automation_definitions_plan_kind_check',
  'canonical_automation_definitions_orthogonal_mode_check',
  'canonical_automation_definitions_geometry_check',
  'canonical_automation_definitions_status_check',
  'canonical_automation_definitions_revision_check',
] as const);
const SCOPE_INDEX = 'canonical_automation_definitions_scope_updated_idx';

const EXACT_OWNER_CHECK = "checkbtrimtenant_id<>''andoctet_lengthtenant_id<=256andbtrimuser_id<>''andoctet_lengthuser_id<=256";
const EXACT_NAME_CHECK = "checkbtrimname<>''andchar_lengthname<=120";
const EXACT_TRIGGER_CHECK = "checktrigger='manual'";
const EXACT_PLAN_KIND_CHECK = "checkplan_kind='bounded_deterministic_image_v1'";
const EXACT_REVISION_CHECK = 'checkrevision>=1';
const EXACT_ORTHOGONAL_CHECKS = membershipChecks('orthogonal_mode', [
  'flip_horizontal','flip_vertical','rotate_90_cw','rotate_180','rotate_270_cw',
]);
const EXACT_STATUS_CHECKS = membershipChecks('status', ['active','archived']);
const EXACT_GEOMETRY_CHECKS = new Set([
  'checktarget_widthbetween1and16384andtarget_heightbetween1and16384andtarget_width*target_height<=268435456',
  'checktarget_width>=1andtarget_width<=16384andtarget_height>=1andtarget_height<=16384andtarget_width*target_height<=268435456',
]);

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/automation/migrations', MIGRATION), 'utf8'); }
}

async function state(pool: Pool) {
  const [table, columns, constraints, indexes] = await Promise.all([
    pool.query("SELECT to_regclass('canonical_automation_definitions')::text AS table_name"),
    pool.query(`SELECT column_name,udt_name,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name=$1`, [TABLE]),
    pool.query(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=to_regclass($1)`, [TABLE]),
    pool.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1`, [TABLE]),
  ]);
  return Object.freeze({
    table: table.rows[0]?.table_name,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
  });
}

function ready(value: Awaited<ReturnType<typeof state>>): boolean {
  if (value.table !== TABLE) return false;
  const columns = new Map(value.columns.map(row => [String(row.column_name), row]));
  if (columns.size !== REQUIRED_COLUMNS.length || !REQUIRED_COLUMNS.every(([name,type,nullable]) => {
    const row = columns.get(name);
    return row && String(row.udt_name) === type && String(row.is_nullable) === nullable;
  })) return false;
  if (semanticDefault(columns.get('trigger')) !== "'manual'"
    || semanticDefault(columns.get('status')) !== "'active'"
    || semanticDefault(columns.get('revision')) !== '1'
    || semanticDefault(columns.get('created_at')) !== 'current_timestamp'
    || semanticDefault(columns.get('updated_at')) !== 'current_timestamp') return false;

  const constraints = new Map(value.constraints.map(row => [String(row.conname), row]));
  if (!REQUIRED_CONSTRAINTS.every(name => constraints.get(name)?.convalidated === true)) return false;
  if (String(constraints.get('canonical_automation_definitions_pkey')?.contype) !== 'p'
    || compactDefinition(constraints.get('canonical_automation_definitions_pkey')) !== 'PRIMARYKEY(automation_id)') return false;

  if (semanticDefinition(constraints.get('canonical_automation_definitions_owner_check')) !== EXACT_OWNER_CHECK) return false;
  if (semanticDefinition(constraints.get('canonical_automation_definitions_name_check')) !== EXACT_NAME_CHECK) return false;
  if (semanticDefinition(constraints.get('canonical_automation_definitions_trigger_check')) !== EXACT_TRIGGER_CHECK) return false;
  if (semanticDefinition(constraints.get('canonical_automation_definitions_plan_kind_check')) !== EXACT_PLAN_KIND_CHECK) return false;
  if (!EXACT_ORTHOGONAL_CHECKS.has(semanticDefinition(constraints.get('canonical_automation_definitions_orthogonal_mode_check')))) return false;
  if (!EXACT_STATUS_CHECKS.has(semanticDefinition(constraints.get('canonical_automation_definitions_status_check')))) return false;
  if (!EXACT_GEOMETRY_CHECKS.has(semanticDefinition(constraints.get('canonical_automation_definitions_geometry_check')))) return false;
  if (semanticDefinition(constraints.get('canonical_automation_definitions_revision_check')) !== EXACT_REVISION_CHECK) return false;

  const scopeIndex = value.indexes.find(row => String(row.indexname) === SCOPE_INDEX);
  const indexDefinition = String(scopeIndex?.indexdef ?? '').replace(/["\s]+/g, '').toLowerCase();
  return indexDefinition.includes('usingbtree(tenant_id,user_id,status,updated_atdesc,automation_id)');
}

function definition(row: any): string { return String(row?.definition ?? ''); }
function compactDefinition(row: any): string { return definition(row).replace(/\s+/g, ''); }
function semanticDefinition(row: any): string {
  return definition(row)
    .replace(/::(?:text|bigint|integer)/gi, '')
    .replace(/[()\s]+/g, '')
    .toLowerCase();
}
function semanticDefault(row: any): string {
  return String(row?.column_default ?? '')
    .replace(/::(?:text|bigint|integer)/gi, '')
    .replace(/[()\s]+/g, '')
    .toLowerCase();
}
function membershipChecks(field: string, values: readonly string[]): ReadonlySet<string> {
  const literals = values.map(value => `'${value}'`).join(',');
  return new Set([
    `check${field}=anyarray[${literals}]`,
    `check${field}in${literals}`,
  ]);
}

export async function checkAutomationDefinitionSchema(pool: Pool): Promise<void> {
  if (!ready(await state(pool))) throw new Error('canonical automation definition schema is incomplete or permissive; apply exact migration 040');
}

export async function migrateAutomationDefinitionSchema(pool: Pool): Promise<void> {
  if (ready(await state(pool))) return;
  await pool.query(await migration());
  await checkAutomationDefinitionSchema(pool);
}
