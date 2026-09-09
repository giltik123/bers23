import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '041_automation_invocation_bindings.sql';
const TABLE = 'canonical_automation_invocation_bindings';
const IMMUTABLE_TRIGGER = 'canonical_automation_invocation_bindings_immutable_guard';
const IMMUTABLE_FUNCTION = 'canonical_automation_invocation_binding_immutable_guard';
const BEFORE_UPDATE_DELETE_ROW_TGTYPE = 27;
const REQUIRED_COLUMNS = Object.freeze([
  ['invocation_id','uuid','NO'],
  ['tenant_id','text','NO'],
  ['user_id','text','NO'],
  ['automation_id','uuid','NO'],
  ['definition_revision','int8','NO'],
  ['plan_kind','text','NO'],
  ['orthogonal_mode','text','NO'],
  ['target_width','int4','NO'],
  ['target_height','int4','NO'],
  ['plan_digest','bpchar','NO'],
  ['project_id','uuid','NO'],
  ['source_image_storage_id','uuid','NO'],
  ['source_role','text','NO'],
  ['source_width','int4','NO'],
  ['source_height','int4','NO'],
  ['client_request_id','text','NO'],
  ['downstream_client_request_id','text','NO'],
  ['created_at','timestamptz','NO'],
] as const);
const REQUIRED_CONSTRAINTS = Object.freeze([
  'canonical_automation_invocation_bindings_pkey',
  'canonical_automation_invocation_bindings_owner_check',
  'canonical_automation_invocation_bindings_revision_check',
  'canonical_automation_invocation_bindings_plan_kind_check',
  'canonical_automation_invocation_bindings_orthogonal_mode_check',
  'canonical_automation_invocation_bindings_geometry_check',
  'canonical_automation_invocation_bindings_plan_digest_check',
  'canonical_automation_invocation_bindings_source_check',
  'canonical_automation_invocation_bindings_client_request_check',
  'canonical_automation_invocation_downstream_request_check',
  'canonical_automation_invocation_bindings_intent_unique',
  'canonical_automation_invocation_bindings_downstream_unique',
] as const);
const SCOPE_INDEX = 'canonical_automation_invocation_bindings_scope_created_idx';

const EXACT_OWNER = "checkbtrimtenant_id<>''andoctet_lengthtenant_id<=256andbtrimuser_id<>''andoctet_lengthuser_id<=256";
const EXACT_REVISION = 'checkdefinition_revision>=1';
const EXACT_PLAN_KIND = "checkplan_kind='bounded_deterministic_image_v1'";
const EXACT_PLAN_DIGEST = "checkplan_digest~'^[0-9a-f]{64}$'";
const EXACT_CLIENT_REQUEST = "checkclient_request_id~'^[a-za-z0-9._:-]{1,160}$'";
const EXACT_DOWNSTREAM_REQUEST = "checkdownstream_client_request_id~'^automation-agent-v1-[0-9a-f]{64}$'";
const EXACT_IMMUTABLE_FUNCTION_BODY = "beginraiseexception'canonicalautomationinvocationbindingisimmutable'usingerrcode='55000';end;";
const EXACT_ORTHOGONAL = membershipChecks('orthogonal_mode', [
  'flip_horizontal','flip_vertical','rotate_90_cw','rotate_180','rotate_270_cw',
]);
const EXACT_GEOMETRY = geometryChecks('target_width', 'target_height');
const EXACT_SOURCE_ROLE = membershipChecks('source_role', ['original','composite']);
const EXACT_SOURCE_GEOMETRY = geometryChecks('source_width', 'source_height');

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/automation/migrations', MIGRATION), 'utf8'); }
}

async function state(pool: Pool) {
  const [table, columns, constraints, indexes, triggers] = await Promise.all([
    pool.query("SELECT to_regclass('canonical_automation_invocation_bindings')::text AS table_name"),
    pool.query(`SELECT column_name,udt_name,is_nullable,column_default,character_maximum_length
      FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1`, [TABLE]),
    pool.query(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=to_regclass($1)`, [TABLE]),
    pool.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1`, [TABLE]),
    pool.query(`SELECT t.tgname,t.tgtype,t.tgenabled,p.proname,p.prosrc
      FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid=to_regclass($1) AND NOT t.tgisinternal`, [TABLE]),
  ]);
  return Object.freeze({
    table: table.rows[0]?.table_name,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
  });
}

function ready(value: Awaited<ReturnType<typeof state>>): boolean {
  if (value.table !== TABLE) return false;
  const columns = new Map(value.columns.map(row => [String(row.column_name), row]));
  if (columns.size !== REQUIRED_COLUMNS.length || !REQUIRED_COLUMNS.every(([name,type,nullable]) => {
    const row = columns.get(name);
    return row && String(row.udt_name) === type && String(row.is_nullable) === nullable;
  })) return false;
  if (Number(columns.get('plan_digest')?.character_maximum_length) !== 64) return false;
  if (semanticDefault(columns.get('created_at')) !== 'current_timestamp') return false;
  for (const [name, row] of columns) if (name !== 'created_at' && row.column_default != null) return false;

  const constraints = new Map(value.constraints.map(row => [String(row.conname), row]));
  if (constraints.size !== REQUIRED_CONSTRAINTS.length || !REQUIRED_CONSTRAINTS.every(name => constraints.get(name)?.convalidated === true)) return false;
  if (String(constraints.get('canonical_automation_invocation_bindings_pkey')?.contype) !== 'p'
    || compactDefinition(constraints.get('canonical_automation_invocation_bindings_pkey')) !== 'PRIMARYKEY(invocation_id)') return false;
  if (String(constraints.get('canonical_automation_invocation_bindings_intent_unique')?.contype) !== 'u'
    || compactDefinition(constraints.get('canonical_automation_invocation_bindings_intent_unique')) !== 'UNIQUE(tenant_id,user_id,automation_id,project_id,client_request_id)') return false;
  if (String(constraints.get('canonical_automation_invocation_bindings_downstream_unique')?.contype) !== 'u'
    || compactDefinition(constraints.get('canonical_automation_invocation_bindings_downstream_unique')) !== 'UNIQUE(tenant_id,user_id,downstream_client_request_id)') return false;

  if (semanticDefinition(constraints.get('canonical_automation_invocation_bindings_owner_check')) !== EXACT_OWNER) return false;
  if (semanticDefinition(constraints.get('canonical_automation_invocation_bindings_revision_check')) !== EXACT_REVISION) return false;
  if (semanticDefinition(constraints.get('canonical_automation_invocation_bindings_plan_kind_check')) !== EXACT_PLAN_KIND) return false;
  if (!EXACT_ORTHOGONAL.has(semanticDefinition(constraints.get('canonical_automation_invocation_bindings_orthogonal_mode_check')))) return false;
  if (!EXACT_GEOMETRY.has(semanticDefinition(constraints.get('canonical_automation_invocation_bindings_geometry_check')))) return false;
  if (semanticDefinition(constraints.get('canonical_automation_invocation_bindings_plan_digest_check')) !== EXACT_PLAN_DIGEST) return false;
  const source = semanticDefinition(constraints.get('canonical_automation_invocation_bindings_source_check'));
  if (![...EXACT_SOURCE_ROLE].some(role => [...EXACT_SOURCE_GEOMETRY].some(geometry => source === `check${role.slice(5)}and${geometry.slice(5)}`))) return false;
  if (semanticDefinition(constraints.get('canonical_automation_invocation_bindings_client_request_check')) !== EXACT_CLIENT_REQUEST) return false;
  if (semanticDefinition(constraints.get('canonical_automation_invocation_downstream_request_check')) !== EXACT_DOWNSTREAM_REQUEST) return false;

  const scopeIndex = value.indexes.find(row => String(row.indexname) === SCOPE_INDEX);
  const indexDefinition = String(scopeIndex?.indexdef ?? '').replace(/["\s]+/g, '').toLowerCase();
  if (!indexDefinition.includes('usingbtree(tenant_id,user_id,automation_id,project_id,created_atdesc,invocation_id)')) return false;

  if (value.triggers.length !== 1) return false;
  const immutable = value.triggers[0];
  if (String(immutable?.tgname) !== IMMUTABLE_TRIGGER
    || Number(immutable?.tgtype) !== BEFORE_UPDATE_DELETE_ROW_TGTYPE
    || String(immutable?.tgenabled) !== 'O'
    || String(immutable?.proname) !== IMMUTABLE_FUNCTION
    || semanticFunctionBody(immutable?.prosrc) !== EXACT_IMMUTABLE_FUNCTION_BODY) return false;

  return true;
}

function definition(row: any): string { return String(row?.definition ?? ''); }
function compactDefinition(row: any): string { return definition(row).replace(/\s+/g, ''); }
function semanticDefinition(row: any): string {
  return definition(row).replace(/::(?:text|bigint|integer|bpchar)/gi, '').replace(/[()\s]+/g, '').toLowerCase();
}
function semanticDefault(row: any): string {
  return String(row?.column_default ?? '').replace(/::(?:text|bigint|integer|bpchar)/gi, '').replace(/[()\s]+/g, '').toLowerCase();
}
function semanticFunctionBody(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}
function membershipChecks(field: string, values: readonly string[]): ReadonlySet<string> {
  const literals = values.map(value => `'${value}'`).join(',');
  return new Set([`check${field}=anyarray[${literals}]`, `check${field}in${literals}`]);
}
function geometryChecks(width: string, height: string): ReadonlySet<string> {
  return new Set([
    `check${width}between1and16384and${height}between1and16384and${width}*${height}<=268435456`,
    `check${width}>=1and${width}<=16384and${height}>=1and${height}<=16384and${width}*${height}<=268435456`,
  ]);
}

export async function checkAutomationInvocationSchema(pool: Pool): Promise<void> {
  if (!ready(await state(pool))) throw new Error('canonical automation invocation binding schema is incomplete or permissive; apply exact migration 041');
}

export async function migrateAutomationInvocationSchema(pool: Pool): Promise<void> {
  if (ready(await state(pool))) return;
  await pool.query(await migration());
  await checkAutomationInvocationSchema(pool);
}
