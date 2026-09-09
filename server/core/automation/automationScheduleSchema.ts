import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

const MIGRATION = '042_automation_schedules.sql';
const SCHEDULE_TABLE = 'canonical_automation_schedules';
const OCCURRENCE_TABLE = 'canonical_automation_trigger_occurrences';
const OCCURRENCE_TRIGGER = 'canonical_automation_trigger_occurrences_immutable_guard';
const OCCURRENCE_FUNCTION = 'canonical_automation_trigger_occurrence_immutable_guard';
const BEFORE_UPDATE_DELETE_ROW_TGTYPE = 27;

const SCHEDULE_COLUMNS = Object.freeze([
  ['schedule_id','uuid','NO'], ['tenant_id','text','NO'], ['user_id','text','NO'],
  ['automation_id','uuid','NO'], ['definition_revision','int8','NO'], ['project_id','uuid','NO'],
  ['interval_seconds','int4','NO'], ['next_fire_at','timestamptz','NO'], ['status','text','NO'],
  ['revision','int8','NO'], ['overlap_policy','text','NO'], ['missed_run_policy','text','NO'],
  ['lease_token','uuid','YES'], ['lease_expires_at','timestamptz','YES'],
  ['created_at','timestamptz','NO'], ['updated_at','timestamptz','NO'],
] as const);
const OCCURRENCE_COLUMNS = Object.freeze([
  ['occurrence_id','uuid','NO'], ['tenant_id','text','NO'], ['user_id','text','NO'],
  ['schedule_id','uuid','NO'], ['schedule_revision','int8','NO'], ['automation_id','uuid','NO'],
  ['definition_revision','int8','NO'], ['project_id','uuid','NO'], ['scheduled_for','timestamptz','NO'],
  ['decision','text','NO'], ['client_request_id','text','NO'], ['invocation_id','uuid','YES'],
  ['created_at','timestamptz','NO'],
] as const);

const SCHEDULE_CONSTRAINTS = Object.freeze([
  'canonical_automation_schedules_pkey', 'canonical_automation_schedules_owner_check',
  'canonical_automation_schedules_definition_revision_check', 'canonical_automation_schedules_interval_check',
  'canonical_automation_schedules_status_check', 'canonical_automation_schedules_revision_check',
  'canonical_automation_schedules_overlap_policy_check', 'canonical_automation_schedules_missed_run_policy_check',
  'canonical_automation_schedules_lease_pair_check', 'canonical_automation_schedules_inactive_lease_check',
] as const);
const OCCURRENCE_CONSTRAINTS = Object.freeze([
  'canonical_automation_trigger_occurrences_pkey', 'canonical_automation_trigger_occurrences_owner_check',
  'canonical_automation_trigger_occurrences_revision_check', 'canonical_automation_trigger_occurrences_decision_check',
  'canonical_automation_trigger_occurrences_client_request_check', 'canonical_automation_trigger_occurrences_invocation_check',
  'canonical_automation_trigger_occurrences_identity_unique', 'canonical_automation_trigger_occurrences_request_unique',
  'canonical_automation_trigger_occurrences_invocation_unique',
] as const);

const EXACT_OWNER = "checkbtrimtenant_id<>''andoctet_lengthtenant_id<=256andbtrimuser_id<>''andoctet_lengthuser_id<=256";
const EXACT_DEFINITION_REVISION = 'checkdefinition_revision>=1';
const EXACT_SCHEDULE_REVISION = 'checkrevision>=1';
const EXACT_OCCURRENCE_REVISION = 'checkschedule_revision>=1anddefinition_revision>=1';
const EXACT_INTERVALS = new Set(['checkinterval_secondsbetween60and2592000','checkinterval_seconds>=60andinterval_seconds<=2592000']);
const EXACT_SCHEDULE_STATUSES = membershipChecks('status', ['active','paused','archived']);
const EXACT_DECISIONS = membershipChecks('decision', ['execute','skipped_active','skipped_configuration']);
const EXACT_OVERLAP = "checkoverlap_policy='skip_while_active'";
const EXACT_MISSED = "checkmissed_run_policy='one_catch_up'";
const EXACT_LEASE_PAIR = 'checklease_tokenisnullandlease_expires_atisnullorlease_tokenisnotnullandlease_expires_atisnotnull';
const EXACT_INACTIVE_LEASE = "checkstatus='active'orlease_tokenisnullandlease_expires_atisnull";
const EXACT_CLIENT_REQUEST = "checkclient_request_id~'^automation-schedule-v1-[0-9a-f]{64}$'";
const EXACT_INVOCATION = new Set([
  "checkdecision='execute'andinvocation_idisnotnullordecision=anyarray['skipped_active','skipped_configuration']andinvocation_idisnull",
  "checkdecision='execute'andinvocation_idisnotnullordecisionin'skipped_active','skipped_configuration'andinvocation_idisnull",
]);
const EXACT_IMMUTABLE_BODY = "beginraiseexception'canonicalautomationtriggeroccurrenceisimmutable'usingerrcode='55000';end;";

type Queryable = Pool | PoolClient;
type TableState = Readonly<{ table?: string; columns: readonly any[]; constraints: readonly any[]; indexes: readonly any[]; triggers: readonly any[] }>;

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/automation/migrations', MIGRATION), 'utf8'); }
}

async function tableState(database: Queryable, table: string): Promise<TableState> {
  // Keep catalog reads serialized so this helper is safe inside one adversarial transaction
  // backed by PoolClient as well as against a Pool. pg@9 rejects overlapping client.query calls.
  const exists = await database.query('SELECT to_regclass($1)::text AS table_name', [table]);
  const columns = await database.query(`SELECT column_name,udt_name,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1`, [table]);
  const constraints = await database.query(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid=to_regclass($1)`, [table]);
  const indexes = await database.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1`, [table]);
  const triggers = await database.query(`SELECT t.tgname,t.tgtype,t.tgenabled,p.proname,p.prosrc FROM pg_trigger t
    JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=to_regclass($1) AND NOT t.tgisinternal`, [table]);
  return Object.freeze({ table: exists.rows[0]?.table_name, columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, triggers: triggers.rows });
}

function exactColumns(state: TableState, required: readonly (readonly [string,string,string])[]): boolean {
  const columns = new Map(state.columns.map(row => [String(row.column_name), row]));
  return columns.size === required.length && required.every(([name,type,nullable]) => {
    const row = columns.get(name);
    return row && String(row.udt_name) === type && String(row.is_nullable) === nullable;
  });
}

function scheduleReady(state: TableState): boolean {
  if (state.table !== SCHEDULE_TABLE || !exactColumns(state, SCHEDULE_COLUMNS) || state.triggers.length !== 0) return false;
  const columns = new Map(state.columns.map(row => [String(row.column_name), row]));
  if (semanticDefault(columns.get('status')) !== "'active'" || semanticDefault(columns.get('revision')) !== '1'
    || semanticDefault(columns.get('overlap_policy')) !== "'skip_while_active'" || semanticDefault(columns.get('missed_run_policy')) !== "'one_catch_up'"
    || semanticDefault(columns.get('created_at')) !== 'current_timestamp' || semanticDefault(columns.get('updated_at')) !== 'current_timestamp') return false;
  for (const [name,row] of columns) if (!['status','revision','overlap_policy','missed_run_policy','created_at','updated_at'].includes(name) && row.column_default != null) return false;

  const constraints = new Map(state.constraints.map(row => [String(row.conname), row]));
  if (constraints.size !== SCHEDULE_CONSTRAINTS.length || !SCHEDULE_CONSTRAINTS.every(name => constraints.get(name)?.convalidated === true)) return false;
  if (String(constraints.get('canonical_automation_schedules_pkey')?.contype) !== 'p' || compactDefinition(constraints.get('canonical_automation_schedules_pkey')) !== 'PRIMARYKEY(schedule_id)') return false;
  if (semanticDefinition(constraints.get('canonical_automation_schedules_owner_check')) !== EXACT_OWNER) return false;
  if (semanticDefinition(constraints.get('canonical_automation_schedules_definition_revision_check')) !== EXACT_DEFINITION_REVISION) return false;
  if (!EXACT_INTERVALS.has(semanticDefinition(constraints.get('canonical_automation_schedules_interval_check')))) return false;
  if (!EXACT_SCHEDULE_STATUSES.has(semanticDefinition(constraints.get('canonical_automation_schedules_status_check')))) return false;
  if (semanticDefinition(constraints.get('canonical_automation_schedules_revision_check')) !== EXACT_SCHEDULE_REVISION) return false;
  if (semanticDefinition(constraints.get('canonical_automation_schedules_overlap_policy_check')) !== EXACT_OVERLAP) return false;
  if (semanticDefinition(constraints.get('canonical_automation_schedules_missed_run_policy_check')) !== EXACT_MISSED) return false;
  if (semanticDefinition(constraints.get('canonical_automation_schedules_lease_pair_check')) !== EXACT_LEASE_PAIR) return false;
  if (semanticDefinition(constraints.get('canonical_automation_schedules_inactive_lease_check')) !== EXACT_INACTIVE_LEASE) return false;
  return indexMatches(state,'canonical_automation_schedules_scope_updated_idx','usingbtree(tenant_id,user_id,status,updated_atdesc,schedule_id)')
    && indexMatches(state,'canonical_automation_schedules_due_idx',"usingbtree(next_fire_at,schedule_id)where(status='active')")
    && indexMatches(state,'canonical_automation_schedules_lease_expiry_idx','usingbtree(lease_expires_at,schedule_id)where(lease_tokenisnotnull)');
}

function occurrenceReady(state: TableState): boolean {
  if (state.table !== OCCURRENCE_TABLE || !exactColumns(state, OCCURRENCE_COLUMNS)) return false;
  const columns = new Map(state.columns.map(row => [String(row.column_name), row]));
  if (semanticDefault(columns.get('created_at')) !== 'current_timestamp') return false;
  for (const [name,row] of columns) if (name !== 'created_at' && row.column_default != null) return false;

  const constraints = new Map(state.constraints.map(row => [String(row.conname), row]));
  if (constraints.size !== OCCURRENCE_CONSTRAINTS.length || !OCCURRENCE_CONSTRAINTS.every(name => constraints.get(name)?.convalidated === true)) return false;
  if (String(constraints.get('canonical_automation_trigger_occurrences_pkey')?.contype) !== 'p' || compactDefinition(constraints.get('canonical_automation_trigger_occurrences_pkey')) !== 'PRIMARYKEY(occurrence_id)') return false;
  if (String(constraints.get('canonical_automation_trigger_occurrences_identity_unique')?.contype) !== 'u' || compactDefinition(constraints.get('canonical_automation_trigger_occurrences_identity_unique')) !== 'UNIQUE(schedule_id,schedule_revision,scheduled_for)') return false;
  if (String(constraints.get('canonical_automation_trigger_occurrences_request_unique')?.contype) !== 'u' || compactDefinition(constraints.get('canonical_automation_trigger_occurrences_request_unique')) !== 'UNIQUE(tenant_id,user_id,client_request_id)') return false;
  if (String(constraints.get('canonical_automation_trigger_occurrences_invocation_unique')?.contype) !== 'u' || compactDefinition(constraints.get('canonical_automation_trigger_occurrences_invocation_unique')) !== 'UNIQUE(tenant_id,user_id,invocation_id)') return false;
  if (semanticDefinition(constraints.get('canonical_automation_trigger_occurrences_owner_check')) !== EXACT_OWNER) return false;
  if (semanticDefinition(constraints.get('canonical_automation_trigger_occurrences_revision_check')) !== EXACT_OCCURRENCE_REVISION) return false;
  if (!EXACT_DECISIONS.has(semanticDefinition(constraints.get('canonical_automation_trigger_occurrences_decision_check')))) return false;
  if (semanticDefinition(constraints.get('canonical_automation_trigger_occurrences_client_request_check')) !== EXACT_CLIENT_REQUEST) return false;
  if (!EXACT_INVOCATION.has(semanticDefinition(constraints.get('canonical_automation_trigger_occurrences_invocation_check')))) return false;
  if (!indexMatches(state,'canonical_automation_trigger_occurrences_scope_idx','usingbtree(tenant_id,user_id,schedule_id,scheduled_fordesc,occurrence_id)')) return false;
  if (!indexMatches(state,'canonical_automation_trigger_occurrences_recovery_idx',"usingbtree(schedule_id,scheduled_fordesc,occurrence_iddesc,invocation_id)where(decision='execute')")) return false;
  if (state.triggers.length !== 1) return false;
  const trigger = state.triggers[0];
  return String(trigger?.tgname) === OCCURRENCE_TRIGGER && Number(trigger?.tgtype) === BEFORE_UPDATE_DELETE_ROW_TGTYPE
    && String(trigger?.tgenabled) === 'O' && String(trigger?.proname) === OCCURRENCE_FUNCTION
    && semanticFunctionBody(trigger?.prosrc) === EXACT_IMMUTABLE_BODY;
}

function definition(row: any): string { return String(row?.definition ?? ''); }
function compactDefinition(row: any): string { return definition(row).replace(/\s+/g, ''); }
function semanticDefinition(row: any): string { return definition(row).replace(/::(?:text|bigint|integer|bpchar)/gi,'').replace(/[()\s]+/g,'').toLowerCase(); }
function semanticDefault(row: any): string { return String(row?.column_default ?? '').replace(/::(?:text|bigint|integer|bpchar)/gi,'').replace(/[()\s]+/g,'').toLowerCase(); }
function semanticIndex(row: any): string { return String(row?.indexdef ?? '').replace(/::text/gi,'').replace(/["\s]+/g,'').toLowerCase(); }
function semanticFunctionBody(value: unknown): string { return String(value ?? '').replace(/\s+/g,'').toLowerCase(); }
function indexMatches(state: TableState, name: string, fragment: string): boolean { return semanticIndex(state.indexes.find(row => String(row.indexname) === name)).includes(fragment); }
function membershipChecks(field: string, values: readonly string[]): ReadonlySet<string> {
  const literals = values.map(value => `'${value}'`).join(',');
  return new Set([`check${field}=anyarray[${literals}]`,`check${field}in${literals}`]);
}

async function ready(database: Queryable): Promise<boolean> {
  // Serialize the two table scans as well: ready() is deliberately transaction-safe on PoolClient.
  const schedule = await tableState(database,SCHEDULE_TABLE);
  const occurrence = await tableState(database,OCCURRENCE_TABLE);
  return scheduleReady(schedule) && occurrenceReady(occurrence);
}

export async function checkAutomationScheduleSchema(database: Queryable): Promise<void> {
  if (!await ready(database)) throw new Error('canonical Automation recurring schedule schema is incomplete or permissive; apply exact migration 042');
}
export async function migrateAutomationScheduleSchema(database: Queryable): Promise<void> {
  if (await ready(database)) return;
  await database.query(await migration());
  await checkAutomationScheduleSchema(database);
}
