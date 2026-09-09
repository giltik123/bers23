import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '043_aee_admitted_plan_graphs.sql';
const TABLE = 'aee_admitted_plan_graphs';
const IMMUTABLE_TRIGGER = 'aee_admitted_plan_graphs_immutable';
const IMMUTABLE_FUNCTION = 'aee_reject_admitted_plan_graph_mutation';
const REQUIRED_COLUMNS = Object.freeze([
  ['tenant_id', 'text', 'NO'],
  ['user_id', 'text', 'NO'],
  ['project_id', 'text', 'NO'],
  ['graph_digest', 'text', 'NO'],
  ['schema_version', 'text', 'NO'],
  ['compiler_version', 'text', 'NO'],
  ['capability_registry_version', 'int4', 'NO'],
  ['capability_registry_digest', 'text', 'NO'],
  ['intent_digest', 'text', 'NO'],
  ['proposal_digest', 'text', 'NO'],
  ['graph_json', 'jsonb', 'NO'],
  ['created_at', 'timestamptz', 'NO'],
] as const);
const REQUIRED_CONSTRAINTS = Object.freeze([
  'aee_admitted_plan_graphs_pkey',
  'aee_admitted_plan_graphs_scope_check',
  'aee_admitted_plan_graphs_digest_check',
  'aee_admitted_plan_graphs_schema_check',
  'aee_admitted_plan_graphs_compiler_check',
  'aee_admitted_plan_graphs_registry_version_check',
  'aee_admitted_plan_graphs_registry_digest_check',
  'aee_admitted_plan_graphs_intent_digest_check',
  'aee_admitted_plan_graphs_proposal_digest_check',
  'aee_admitted_plan_graphs_json_object_check',
  'aee_admitted_plan_graphs_json_binding_check',
] as const);
const SCOPE_INDEX = 'aee_admitted_plan_graphs_scope_created_idx';

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/agentic/migrations', MIGRATION), 'utf8'); }
}

async function state(pool: Pool) {
  const [table, columns, constraints, indexes, triggers] = await Promise.all([
    pool.query("SELECT to_regclass('aee_admitted_plan_graphs')::text AS table_name"),
    pool.query(`SELECT column_name,udt_name,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name=$1`, [TABLE]),
    pool.query(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=to_regclass($1)`, [TABLE]),
    pool.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1`, [TABLE]),
    pool.query(`SELECT t.tgname,t.tgenabled,t.tgtype,p.proname
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
  if (columns.size !== REQUIRED_COLUMNS.length || !REQUIRED_COLUMNS.every(([name, type, nullable]) => {
    const row = columns.get(name);
    return row && String(row.udt_name) === type && String(row.is_nullable) === nullable;
  })) return false;
  if (semanticDefault(columns.get('created_at')) !== 'current_timestamp') return false;

  const constraints = new Map(value.constraints.map(row => [String(row.conname), row]));
  if (constraints.size !== REQUIRED_CONSTRAINTS.length
    || !REQUIRED_CONSTRAINTS.every(name => constraints.get(name)?.convalidated === true)) return false;
  if (String(constraints.get('aee_admitted_plan_graphs_pkey')?.contype) !== 'p'
    || compactDefinition(constraints.get('aee_admitted_plan_graphs_pkey')) !== 'PRIMARYKEY(tenant_id,user_id,project_id,graph_digest)') return false;

  const checks = Object.fromEntries(REQUIRED_CONSTRAINTS
    .filter(name => name !== 'aee_admitted_plan_graphs_pkey')
    .map(name => [name, semanticDefinition(constraints.get(name))]));
  if (checks.aee_admitted_plan_graphs_scope_check
    !== "checkbtrimtenant_id<>''andoctet_lengthtenant_id<=256andbtrimuser_id<>''andoctet_lengthuser_id<=256andbtrimproject_id<>''andoctet_lengthproject_id<=256") return false;
  if (checks.aee_admitted_plan_graphs_digest_check !== "checkgraph_digest~'^[0-9a-f]{64}$'") return false;
  if (checks.aee_admitted_plan_graphs_schema_check !== "checkschema_version='bers_aee_admitted_plan_graph_v1'") return false;
  if (checks.aee_admitted_plan_graphs_compiler_check !== "checkcompiler_version='1'") return false;
  if (checks.aee_admitted_plan_graphs_registry_version_check !== 'checkcapability_registry_version=1') return false;
  if (checks.aee_admitted_plan_graphs_registry_digest_check !== "checkcapability_registry_digest~'^[0-9a-f]{64}$'") return false;
  if (checks.aee_admitted_plan_graphs_intent_digest_check !== "checkintent_digest~'^[0-9a-f]{64}$'") return false;
  if (checks.aee_admitted_plan_graphs_proposal_digest_check !== "checkproposal_digest~'^[0-9a-f]{64}$'") return false;
  if (checks.aee_admitted_plan_graphs_json_object_check !== "checkjsonb_typeofgraph_json='object'") return false;
  const binding = checks.aee_admitted_plan_graphs_json_binding_check ?? '';
  for (const fragment of [
    "graph_json->>'digest'=graph_digest",
    "graph_json->>'schemaversion'=schema_version",
    "graph_json->>'compilerversion'=compiler_version",
    "graph_json->>'intentdigest'=intent_digest",
    "graph_json->>'proposaldigest'=proposal_digest",
    "graph_json->'capabilityregistry'->>'digest'=capability_registry_digest",
    "graph_json->'capabilityregistry'->>'version'=capability_registry_version",
  ]) if (!binding.includes(fragment)) return false;

  const scopeIndex = value.indexes.find(row => String(row.indexname) === SCOPE_INDEX);
  const indexDefinition = String(scopeIndex?.indexdef ?? '').replace(/["\s]+/g, '').toLowerCase();
  if (!indexDefinition.includes('usingbtree(tenant_id,user_id,project_id,created_atdesc,graph_digest)')) return false;

  if (value.triggers.length !== 1) return false;
  const trigger = value.triggers[0];
  return String(trigger.tgname) === IMMUTABLE_TRIGGER
    && String(trigger.tgenabled) === 'O'
    && Number(trigger.tgtype) === 27
    && String(trigger.proname) === IMMUTABLE_FUNCTION;
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

export async function checkAeeAdmittedPlanSchema(pool: Pool): Promise<void> {
  if (!ready(await state(pool))) throw new Error('AEE admitted-plan schema is incomplete or permissive; apply exact migration 043');
}

export async function migrateAeeAdmittedPlanSchema(pool: Pool): Promise<void> {
  if (ready(await state(pool))) return;
  await pool.query(await migration());
  await checkAeeAdmittedPlanSchema(pool);
}
