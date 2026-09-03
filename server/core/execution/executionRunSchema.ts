import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '034_execution_run_registry.sql';
const TABLE = 'canonical_execution_runs';

const REQUIRED_COLUMNS = Object.freeze([
  ['run_id','uuid','NO'],
  ['tenant_id','text','NO'],
  ['user_id','text','NO'],
  ['project_id','uuid','NO'],
  ['capability','text','NO'],
  ['idempotency_key','text','NO'],
  ['authority_kind','text','NO'],
  ['authority_ref','text','NO'],
  ['parent_run_id','uuid','YES'],
  ['status','text','NO'],
  ['revision','int8','NO'],
  ['status_reason_code','text','YES'],
  ['created_at','timestamptz','NO'],
  ['updated_at','timestamptz','NO'],
  ['started_at','timestamptz','YES'],
  ['finished_at','timestamptz','YES'],
] as const);

const REQUIRED_CONSTRAINTS = Object.freeze([
  'canonical_execution_runs_pkey',
  'canonical_execution_runs_project_fkey',
  'canonical_execution_runs_parent_run_id_fkey',
  'canonical_execution_runs_capability_check',
  'canonical_execution_runs_authority_kind_check',
  'canonical_execution_runs_status_check',
  'canonical_execution_runs_revision_check',
  'canonical_execution_runs_idempotency_key_check',
  'canonical_execution_runs_authority_ref_check',
  'canonical_execution_runs_reason_check',
  'canonical_execution_runs_scope_idempotency_unique',
  'canonical_execution_runs_scope_authority_unique',
  'canonical_execution_runs_time_shape_check',
  'canonical_execution_runs_reason_shape_check',
] as const);

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/execution/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const [table, columns, constraints, indexes] = await Promise.all([
    pool.query("SELECT to_regclass('canonical_execution_runs')::text AS table_name"),
    pool.query(`SELECT column_name,udt_name,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name=$1`, [TABLE]),
    pool.query(`SELECT conname,contype,convalidated,confrelid::regclass::text AS referenced_table,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=to_regclass($1)`, [TABLE]),
    pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1`, [TABLE]),
  ]);
  return Object.freeze({
    table: table.rows[0]?.table_name,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows.map(row => String(row.indexname)),
  });
}

function schemaReady(state: Awaited<ReturnType<typeof schemaState>>): boolean {
  if (state.table !== TABLE) return false;
  const columns = new Map(state.columns.map(row => [String(row.column_name), row]));
  if (!REQUIRED_COLUMNS.every(([name, type, nullable]) => {
    const row = columns.get(name);
    return row && String(row.udt_name) === type && String(row.is_nullable) === nullable;
  })) return false;
  for (const name of ['status','revision','created_at','updated_at']) {
    const value = columns.get(name)?.column_default;
    if (value === null || value === undefined || String(value).trim() === '') return false;
  }
  const constraints = new Map(state.constraints.map(row => [String(row.conname), row]));
  if (!REQUIRED_CONSTRAINTS.every(name => {
    const row = constraints.get(name);
    return row && row.convalidated === true;
  })) return false;
  const capability = String(constraints.get('canonical_execution_runs_capability_check')?.definition ?? '');
  const authority = String(constraints.get('canonical_execution_runs_authority_kind_check')?.definition ?? '');
  const status = String(constraints.get('canonical_execution_runs_status_check')?.definition ?? '');
  const projectFk = constraints.get('canonical_execution_runs_project_fkey');
  const parentFk = constraints.get('canonical_execution_runs_parent_run_id_fkey');
  if (String(projectFk?.referenced_table) !== 'canonical_projects' || !String(projectFk?.definition ?? '').includes('ON DELETE RESTRICT')) return false;
  if (String(parentFk?.referenced_table) !== TABLE || !String(parentFk?.definition ?? '').includes('ON DELETE RESTRICT')) return false;
  if (!['LOCAL_EXECUTION','CREATIVE_EXECUTION'].every(value => capability.includes(value))) return false;
  if (capability.includes('AGENT') || capability.includes('AUTOMATION')) return false;
  if (!['LOCAL_EXECUTION_TICKET','CREATIVE_EXECUTION'].every(value => authority.includes(value))) return false;
  if (!['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED'].every(value => status.includes(value))) return false;
  return state.indexes.includes('canonical_execution_runs_scope_created_idx')
    && state.indexes.includes('canonical_execution_runs_parent_idx');
}

export async function checkExecutionRunSchema(pool: Pool): Promise<void> {
  if (!schemaReady(await schemaState(pool))) {
    throw new Error('canonical execution run registry schema is incomplete or permissive; apply migration 034');
  }
}

export async function migrateExecutionRunSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) await pool.query(await migration());
  await checkExecutionRunSchema(pool);
}
