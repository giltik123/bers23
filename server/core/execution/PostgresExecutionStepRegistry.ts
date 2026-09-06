import type { Pool, PoolClient } from 'pg';
import type { ExecutionRunScope } from './executionRunRegistry.ts';
import {
  EXECUTION_STEP_STATUSES,
  type ExecutionStep,
  type ExecutionStepRegistry,
  type ExecutionStepStatus,
  type ProjectExecutionStepInput,
} from './executionStepRegistry.ts';

const TABLE = 'execution_run_steps';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASON = /^[A-Z0-9_]{1,128}$/;
const COLUMNS = 's.run_id,s.step_id,s.source_authority,s.status,s.revision,s.local_ticket_id,s.artifact_ids_json,s.status_reason_code,s.created_at,s.updated_at,s.started_at,s.finished_at';

export class PostgresExecutionStepRegistry implements ExecutionStepRegistry {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async project(inputValue: ProjectExecutionStepInput): Promise<ExecutionStep> {
    const input = normalizeProjection(inputValue);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await assertRunScope(client, input.scope, input.runId);
      const selected = await client.query(`SELECT ${COLUMNS} FROM ${TABLE} s WHERE s.run_id=$1 AND s.step_id=$2 FOR UPDATE`, [input.runId, input.stepId]);
      if (!selected.rows[0]) {
        const terminal = isTerminal(input.status);
        const inserted = await client.query(`INSERT INTO ${TABLE}
          (run_id,step_id,source_authority,status,local_ticket_id,artifact_ids_json,status_reason_code,finished_at)
          VALUES ($1,$2,'WORKFLOW_CONTINUATION',$3,$4,$5::jsonb,$6,CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE NULL END)
          RETURNING run_id,step_id,source_authority,status,revision,local_ticket_id,artifact_ids_json,status_reason_code,created_at,updated_at,started_at,finished_at`,
          [input.runId, input.stepId, input.status, input.localTicketId ?? null, JSON.stringify(input.artifactIds), input.statusReasonCode ?? null, terminal]);
        await client.query('COMMIT');
        return rowToStep(inserted.rows[0]);
      }

      const current = rowToStep(selected.rows[0]);
      if (current.status === input.status) {
        assertSameBinding(current, input);
        await client.query('COMMIT');
        return current;
      }
      if (isTerminal(current.status) || !isActive(current.status) || !isTerminal(input.status)) {
        throw stepError('execution_step_transition_conflict', `Execution step cannot transition from ${current.status} to ${input.status}`);
      }
      assertTerminalTransitionBinding(current, input);
      const updated = await client.query(`UPDATE ${TABLE} SET
        status=$3,revision=revision+1,artifact_ids_json=$4::jsonb,status_reason_code=$5,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
        WHERE run_id=$1 AND step_id=$2
        RETURNING run_id,step_id,source_authority,status,revision,local_ticket_id,artifact_ids_json,status_reason_code,created_at,updated_at,started_at,finished_at`,
        [input.runId, input.stepId, input.status, JSON.stringify(input.artifactIds), input.statusReasonCode ?? null]);
      await client.query('COMMIT');
      return rowToStep(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(scopeValue: ExecutionRunScope, runIdValue: string, stepIdValue: string): Promise<ExecutionStep | undefined> {
    const scope = normalizeScope(scopeValue);
    const runId = canonicalUuid(runIdValue, 'runId');
    const stepId = token(stepIdValue, 'stepId', 256);
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM ${TABLE} s
      JOIN canonical_execution_runs r ON r.run_id=s.run_id
      WHERE s.run_id=$1 AND s.step_id=$2 AND r.tenant_id=$3 AND r.user_id=$4 AND r.project_id=$5`,
      [runId, stepId, scope.tenantId, scope.userId, scope.projectId]);
    return result.rows[0] ? rowToStep(result.rows[0]) : undefined;
  }

  async list(scopeValue: ExecutionRunScope, runIdValue: string): Promise<readonly ExecutionStep[]> {
    const scope = normalizeScope(scopeValue);
    const runId = canonicalUuid(runIdValue, 'runId');
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM ${TABLE} s
      JOIN canonical_execution_runs r ON r.run_id=s.run_id
      WHERE s.run_id=$1 AND r.tenant_id=$2 AND r.user_id=$3 AND r.project_id=$4
      ORDER BY s.created_at ASC,s.step_id ASC`, [runId, scope.tenantId, scope.userId, scope.projectId]);
    return Object.freeze(result.rows.map(rowToStep));
  }
}

async function assertRunScope(client: PoolClient, scope: ExecutionRunScope, runId: string): Promise<void> {
  const result = await client.query(`SELECT capability,authority_kind FROM canonical_execution_runs
    WHERE run_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 FOR SHARE`,
    [runId, scope.tenantId, scope.userId, scope.projectId]);
  const row = result.rows[0];
  if (!row) throw stepError('execution_step_run_unavailable', 'Execution run is unavailable in this scope');
  if (row.capability !== 'WORKFLOW_CONTINUATION' || row.authority_kind !== 'WORKFLOW_CONTINUATION') {
    throw stepError('execution_step_authority_conflict', 'Execution steps in D2 require WORKFLOW_CONTINUATION run authority');
  }
}

function normalizeProjection(input: ProjectExecutionStepInput): Required<Omit<ProjectExecutionStepInput,'localTicketId'|'statusReasonCode'|'artifactIds'>> & Readonly<{ localTicketId?: string; statusReasonCode?: string; artifactIds: readonly string[] }> {
  const status = exactStatus(input.status);
  const localTicketId = input.localTicketId === undefined ? undefined : canonicalUuid(input.localTicketId, 'localTicketId');
  const artifactIds = normalizeArtifactIds(input.artifactIds ?? []);
  const statusReasonCode = input.statusReasonCode === undefined ? undefined : reason(input.statusReasonCode);
  if (status === 'WAITING_FOR_LOCAL_RESULT' && !localTicketId) throw new TypeError('WAITING_FOR_LOCAL_RESULT requires localTicketId');
  if (status === 'RUNNING_INTERNAL' && localTicketId) throw new TypeError('RUNNING_INTERNAL cannot bind localTicketId');
  if (isActive(status) && (artifactIds.length || statusReasonCode)) throw new TypeError('Active execution step cannot have terminal result fields');
  if (status === 'SUCCEEDED' && (!artifactIds.length || statusReasonCode)) throw new TypeError('SUCCEEDED execution step requires artifactIds and no reason');
  if ((status === 'FAILED' || status === 'CANCELLED' || status === 'UNKNOWN') && (!statusReasonCode || artifactIds.length)) throw new TypeError(`${status} execution step requires reason and no artifacts`);
  return Object.freeze({ scope: normalizeScope(input.scope), runId: canonicalUuid(input.runId, 'runId'), stepId: token(input.stepId, 'stepId', 256), status, localTicketId, artifactIds, statusReasonCode });
}

function assertSameBinding(current: ExecutionStep, input: ReturnType<typeof normalizeProjection>): void {
  if ((current.localTicketId ?? undefined) !== input.localTicketId
    || !sameStrings(current.artifactIds, input.artifactIds)
    || (current.statusReasonCode ?? undefined) !== input.statusReasonCode) {
    throw stepError('execution_step_projection_conflict', 'Execution step replay binding differs from durable projection');
  }
}

function assertTerminalTransitionBinding(current: ExecutionStep, input: ReturnType<typeof normalizeProjection>): void {
  if (current.localTicketId && input.localTicketId !== current.localTicketId) throw stepError('execution_step_projection_conflict', 'Local ticket binding cannot change');
  if (!current.localTicketId && input.localTicketId) throw stepError('execution_step_projection_conflict', 'Internal step cannot acquire a local ticket binding');
}

function rowToStep(row: Record<string, unknown>): ExecutionStep {
  if (row.source_authority !== 'WORKFLOW_CONTINUATION') throw new Error('Execution step source authority is invalid');
  const status = exactStatus(row.status);
  const artifactIds = normalizeArtifactIds(row.artifact_ids_json as readonly string[]);
  const localTicketId = row.local_ticket_id == null ? undefined : canonicalUuid(String(row.local_ticket_id), 'local_ticket_id');
  const statusReasonCode = row.status_reason_code == null ? undefined : reason(String(row.status_reason_code));
  const projection = normalizeProjection({ scope: { tenantId: 'row', userId: 'row', projectId: '00000000-0000-0000-0000-000000000000' }, runId: String(row.run_id), stepId: String(row.step_id), status, localTicketId, artifactIds, statusReasonCode });
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Execution step revision is invalid');
  return Object.freeze({ runId: projection.runId, stepId: projection.stepId, sourceAuthority: 'WORKFLOW_CONTINUATION', status, revision, localTicketId, artifactIds, statusReasonCode, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), startedAt: iso(row.started_at), finishedAt: row.finished_at == null ? undefined : iso(row.finished_at) });
}

function exactStatus(value: unknown): ExecutionStepStatus {
  if (typeof value !== 'string' || !(EXECUTION_STEP_STATUSES as readonly string[]).includes(value)) throw new TypeError('Invalid execution step status');
  return value as ExecutionStepStatus;
}
function isActive(status: ExecutionStepStatus): boolean { return status === 'WAITING_FOR_LOCAL_RESULT' || status === 'RUNNING_INTERNAL'; }
function isTerminal(status: ExecutionStepStatus): boolean { return !isActive(status); }
function normalizeScope(scope: ExecutionRunScope): ExecutionRunScope { return Object.freeze({ tenantId: token(scope?.tenantId, 'tenantId', 256), userId: token(scope?.userId, 'userId', 256), projectId: canonicalUuid(scope?.projectId, 'projectId') }); }
function normalizeArtifactIds(values: readonly string[]): readonly string[] { if (!Array.isArray(values)) throw new TypeError('artifactIds must be an array'); const normalized = values.map((value,index)=>token(value,`artifactIds[${index}]`,4096)); if (new Set(normalized).size !== normalized.length) throw new TypeError('artifactIds must be unique'); return Object.freeze(normalized); }
function sameStrings(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((value,index)=>value===b[index]); }
function token(value: unknown, field: string, max: number): string { if (typeof value !== 'string') throw new TypeError(`${field} is required`); const normalized=value.trim(); if (!normalized || normalized.length>max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new TypeError(`${field} is invalid`); return normalized; }
function canonicalUuid(value: unknown, field: string): string { const normalized=token(value,field,64).toLowerCase(); if (!UUID.test(normalized)) throw new TypeError(`${field} must be a UUID`); return normalized; }
function reason(value: string): string { const normalized=value.trim(); if (!REASON.test(normalized)) throw new TypeError('statusReasonCode is invalid'); return normalized; }
function iso(value: unknown): string { const date=new Date(String(value)); if (!Number.isFinite(date.getTime())) throw new Error('Execution step timestamp is invalid'); return date.toISOString(); }
function stepError(code: string, message: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }
