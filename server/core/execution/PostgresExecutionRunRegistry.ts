import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  EXECUTION_RUN_AUTHORITY_KINDS,
  EXECUTION_RUN_CAPABILITIES,
  EXECUTION_RUN_STATUSES,
  type ExecutionRun,
  type ExecutionRunAuthorityKind,
  type ExecutionRunCapability,
  type ExecutionRunRegistry,
  type ExecutionRunScope,
  type ExecutionRunStatus,
  type IssueExecutionRunInput,
  type IssueExecutionRunResult,
} from './executionRunRegistry.ts';

const TABLE = 'canonical_execution_runs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASON = /^[A-Z0-9_]{1,128}$/;
const COLUMNS = 'run_id,tenant_id,user_id,project_id,capability,idempotency_key,authority_kind,authority_ref,parent_run_id,status,revision,status_reason_code,created_at,updated_at,started_at,finished_at';
const CAPABILITIES = new Set<string>(EXECUTION_RUN_CAPABILITIES);
const AUTHORITY_KINDS = new Set<string>(EXECUTION_RUN_AUTHORITY_KINDS);
const STATUSES = new Set<string>(EXECUTION_RUN_STATUSES);

export class PostgresExecutionRunRegistry implements ExecutionRunRegistry {
  constructor(private readonly pool: Pool) {}

  async issue(input: IssueExecutionRunInput): Promise<IssueExecutionRunResult> {
    const candidate = normalizeIssue(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lockKeys = [
        `authority:${candidate.authorityKind}:${candidate.authorityRef}`,
        `idempotency:${candidate.scope.tenantId}:${candidate.scope.userId}:${candidate.scope.projectId}:${candidate.capability}:${candidate.idempotencyKey}`,
      ].sort();
      for (const key of lockKeys) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 917))', [key]);

      const existingByIdempotency = await client.query(`SELECT ${COLUMNS} FROM ${TABLE}
        WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND capability=$4 AND idempotency_key=$5`,
      [candidate.scope.tenantId,candidate.scope.userId,candidate.scope.projectId,candidate.capability,candidate.idempotencyKey]);
      if (existingByIdempotency.rows[0]) {
        const stored = rowToRun(existingByIdempotency.rows[0]);
        assertSameIssueBinding(stored, candidate);
        await client.query('COMMIT');
        return Object.freeze({ run: stored, created: false });
      }

      const project = await client.query(`SELECT 1 FROM canonical_projects
        WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL`,
      [candidate.scope.projectId,candidate.scope.tenantId,candidate.scope.userId]);
      if (project.rowCount !== 1) throw registryError('execution_run_project_unavailable', 'Execution run Project is unavailable in this scope');

      const existingAuthority = await client.query(`SELECT ${COLUMNS} FROM ${TABLE}
        WHERE authority_kind=$1 AND authority_ref=$2`,
      [candidate.authorityKind,candidate.authorityRef]);
      if (existingAuthority.rows[0]) throw registryError('execution_run_authority_already_bound', 'Execution authority is already bound to another run');

      if (candidate.parentRunId) {
        const parent = await client.query(`SELECT ${COLUMNS} FROM ${TABLE}
          WHERE run_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4`,
        [candidate.parentRunId,candidate.scope.tenantId,candidate.scope.userId,candidate.scope.projectId]);
        if (!parent.rows[0]) throw registryError('execution_run_parent_unavailable', 'Parent execution run is unavailable in this scope');
        const parentRun = rowToRun(parent.rows[0]);
        if (candidate.capability === 'WORKFLOW_STEP' && parentRun.capability !== 'WORKFLOW_CONTINUATION') {
          throw registryError('execution_run_parent_capability_conflict', 'WORKFLOW_STEP parent must be a WORKFLOW_CONTINUATION run in the same scope');
        }
      }

      const inserted = await client.query(`INSERT INTO ${TABLE}
        (run_id,tenant_id,user_id,project_id,capability,idempotency_key,authority_kind,authority_ref,parent_run_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLUMNS}`,
      [randomUUID(),candidate.scope.tenantId,candidate.scope.userId,candidate.scope.projectId,candidate.capability,candidate.idempotencyKey,candidate.authorityKind,candidate.authorityRef,candidate.parentRunId ?? null]);
      const run = rowToRun(inserted.rows[0]);
      await client.query('COMMIT');
      return Object.freeze({ run, created: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(scopeValue: ExecutionRunScope, runIdValue: string): Promise<ExecutionRun | undefined> {
    const scope = normalizeScope(scopeValue);
    const runId = canonicalUuid(runIdValue, 'runId');
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM ${TABLE}
      WHERE run_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4`,
    [runId,scope.tenantId,scope.userId,scope.projectId]);
    return result.rows[0] ? rowToRun(result.rows[0]) : undefined;
  }

  async list(scopeValue: ExecutionRunScope, limitValue = 100): Promise<readonly ExecutionRun[]> {
    const scope = normalizeScope(scopeValue);
    const limit = positiveSafeInteger(limitValue, 'limit');
    if (limit > 200) throw new TypeError('limit must be at most 200');
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM ${TABLE}
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3
      ORDER BY created_at DESC,run_id DESC LIMIT $4`,
    [scope.tenantId,scope.userId,scope.projectId,limit]);
    return Object.freeze(result.rows.map(rowToRun));
  }

  async listChildren(scopeValue: ExecutionRunScope, parentRunIdValue: string, limitValue = 100): Promise<readonly ExecutionRun[]> {
    const scope = normalizeScope(scopeValue);
    const parentRunId = canonicalUuid(parentRunIdValue, 'parentRunId');
    const limit = positiveSafeInteger(limitValue, 'limit');
    if (limit > 200) throw new TypeError('limit must be at most 200');
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM ${TABLE}
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND parent_run_id=$4
      ORDER BY created_at ASC,run_id ASC LIMIT $5`,
    [scope.tenantId,scope.userId,scope.projectId,parentRunId,limit]);
    return Object.freeze(result.rows.map(rowToRun));
  }

  start(scope: ExecutionRunScope, runId: string): Promise<ExecutionRun> { return this.transition(scope, runId, 'RUNNING'); }
  succeed(scope: ExecutionRunScope, runId: string): Promise<ExecutionRun> { return this.transition(scope, runId, 'SUCCEEDED'); }
  fail(scope: ExecutionRunScope, runId: string, reasonCode: string): Promise<ExecutionRun> { return this.transition(scope, runId, 'FAILED', canonicalReason(reasonCode)); }
  cancel(scope: ExecutionRunScope, runId: string, reasonCode: string): Promise<ExecutionRun> { return this.transition(scope, runId, 'CANCELLED', canonicalReason(reasonCode)); }
  markUnknown(scope: ExecutionRunScope, runId: string, reasonCode: string): Promise<ExecutionRun> { return this.transition(scope, runId, 'UNKNOWN', canonicalReason(reasonCode)); }

  private async transition(scopeValue: ExecutionRunScope, runIdValue: string, target: ExecutionRunStatus, reason?: string): Promise<ExecutionRun> {
    const scope = normalizeScope(scopeValue);
    const runId = canonicalUuid(runIdValue, 'runId');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 918))', [`run:${runId}`]);
      const selected = await client.query(`SELECT ${COLUMNS} FROM ${TABLE}
        WHERE run_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 FOR UPDATE`,
      [runId,scope.tenantId,scope.userId,scope.projectId]);
      if (!selected.rows[0]) throw registryError('execution_run_unavailable', 'Execution run is unavailable in this scope');
      const current = rowToRun(selected.rows[0]);
      if (current.status === target) {
        if (requiresReason(target) && current.statusReasonCode !== reason) {
          throw registryError('execution_run_terminal_conflict', 'Terminal execution run reason cannot change');
        }
        await client.query('COMMIT');
        return current;
      }
      if (!allowedTransition(current.status, target)) {
        throw registryError('execution_run_transition_conflict', `Execution run cannot transition from ${current.status} to ${target}`);
      }
      const terminal = isTerminalStatus(target);
      const updated = await client.query(`UPDATE ${TABLE} SET
        status=$5,
        revision=revision+1,
        status_reason_code=$6,
        started_at=CASE WHEN $5='RUNNING' THEN COALESCE(started_at,CURRENT_TIMESTAMP) ELSE started_at END,
        finished_at=CASE WHEN $7::boolean THEN CURRENT_TIMESTAMP ELSE finished_at END,
        updated_at=CURRENT_TIMESTAMP
        WHERE run_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
        RETURNING ${COLUMNS}`,
      [runId,scope.tenantId,scope.userId,scope.projectId,target,reason ?? null,terminal]);
      const run = rowToRun(updated.rows[0]);
      await client.query('COMMIT');
      return run;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeIssue(input: IssueExecutionRunInput): IssueExecutionRunInput {
  if (!input || typeof input !== 'object') throw new TypeError('Execution run issue input must be an object');
  const scope = normalizeScope(input.scope);
  const capability = exactEnum(input.capability, CAPABILITIES, 'capability') as ExecutionRunCapability;
  const authorityKind = exactEnum(input.authorityKind, AUTHORITY_KINDS, 'authorityKind') as ExecutionRunAuthorityKind;
  if (!validAuthorityBinding(capability, authorityKind)) throw new TypeError('Execution run capability and authority kind are incompatible');
  const parentRunId = input.parentRunId ? canonicalUuid(input.parentRunId, 'parentRunId') : undefined;
  if (capability === 'WORKFLOW_STEP' && !parentRunId) throw new TypeError('WORKFLOW_STEP execution run requires parentRunId');
  return Object.freeze({
    scope,
    capability,
    idempotencyKey: boundedText(input.idempotencyKey, 'idempotencyKey', 256),
    authorityKind,
    authorityRef: boundedText(input.authorityRef, 'authorityRef', 4096),
    ...(parentRunId ? { parentRunId } : {}),
  });
}

function normalizeScope(value: ExecutionRunScope): ExecutionRunScope {
  if (!value || typeof value !== 'object') throw new TypeError('Execution run scope is required');
  return Object.freeze({
    tenantId: boundedText(value.tenantId, 'tenantId', 256),
    userId: boundedText(value.userId, 'userId', 256),
    projectId: canonicalUuid(value.projectId, 'projectId'),
  });
}

function rowToRun(row: Record<string, unknown>): ExecutionRun {
  const status = exactEnum(row.status, STATUSES, 'status') as ExecutionRunStatus;
  const reason = row.status_reason_code === null || row.status_reason_code === undefined ? undefined : canonicalReason(String(row.status_reason_code));
  if (requiresReason(status) !== Boolean(reason)) throw new Error('Execution run row reason does not match status');
  const capability = exactEnum(row.capability, CAPABILITIES, 'capability') as ExecutionRunCapability;
  const authorityKind = exactEnum(row.authority_kind, AUTHORITY_KINDS, 'authority_kind') as ExecutionRunAuthorityKind;
  if (!validAuthorityBinding(capability, authorityKind)) throw new Error('Execution run row capability binding is invalid');
  return Object.freeze({
    runId: canonicalUuid(String(row.run_id), 'run_id'),
    scope: Object.freeze({
      tenantId: boundedText(String(row.tenant_id), 'tenant_id', 256),
      userId: boundedText(String(row.user_id), 'user_id', 256),
      projectId: canonicalUuid(String(row.project_id), 'project_id'),
    }),
    capability,
    idempotencyKey: boundedText(String(row.idempotency_key), 'idempotency_key', 256),
    authorityKind,
    authorityRef: boundedText(String(row.authority_ref), 'authority_ref', 4096),
    ...(row.parent_run_id ? { parentRunId: canonicalUuid(String(row.parent_run_id), 'parent_run_id') } : {}),
    status,
    revision: positiveSafeInteger(Number(row.revision), 'revision'),
    ...(reason ? { statusReasonCode: reason } : {}),
    createdAt: canonicalTimestamp(row.created_at, 'created_at'),
    updatedAt: canonicalTimestamp(row.updated_at, 'updated_at'),
    ...(row.started_at ? { startedAt: canonicalTimestamp(row.started_at, 'started_at') } : {}),
    ...(row.finished_at ? { finishedAt: canonicalTimestamp(row.finished_at, 'finished_at') } : {}),
  });
}

function assertSameIssueBinding(stored: ExecutionRun, candidate: IssueExecutionRunInput): void {
  if (stored.scope.tenantId !== candidate.scope.tenantId || stored.scope.userId !== candidate.scope.userId
    || stored.scope.projectId !== candidate.scope.projectId || stored.capability !== candidate.capability
    || stored.idempotencyKey !== candidate.idempotencyKey || stored.authorityKind !== candidate.authorityKind
    || stored.authorityRef !== candidate.authorityRef || stored.parentRunId !== candidate.parentRunId) {
    throw registryError('execution_run_idempotency_conflict', 'Execution run idempotency key is already bound to different authority');
  }
}

function validAuthorityBinding(capability: ExecutionRunCapability, authorityKind: ExecutionRunAuthorityKind): boolean {
  return (capability === 'LOCAL_EXECUTION' && authorityKind === 'LOCAL_EXECUTION_TICKET')
    || (capability === 'CREATIVE_EXECUTION' && authorityKind === 'CREATIVE_EXECUTION')
    || (capability === 'WORKFLOW_CONTINUATION' && authorityKind === 'WORKFLOW_CONTINUATION')
    || (capability === 'WORKFLOW_STEP' && authorityKind === 'WORKFLOW_INTERNAL_STEP');
}
function requiresReason(status: ExecutionRunStatus): boolean { return status === 'FAILED' || status === 'CANCELLED' || status === 'UNKNOWN'; }
function isTerminalStatus(status: ExecutionRunStatus): boolean { return status === 'SUCCEEDED' || requiresReason(status); }
function allowedTransition(from: ExecutionRunStatus, to: ExecutionRunStatus): boolean {
  if (from === 'QUEUED') return to === 'RUNNING' || to === 'CANCELLED';
  if (from === 'RUNNING') return to === 'SUCCEEDED' || to === 'FAILED' || to === 'CANCELLED' || to === 'UNKNOWN';
  return false;
}
function canonicalUuid(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a UUID string`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!UUID.test(normalized)) throw new TypeError(`${label} must be a UUID`);
  return normalized;
}
function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || Array.from(normalized).length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new TypeError(`${label} is outside the accepted text contract`);
  return normalized;
}
function canonicalReason(value: string): string {
  if (typeof value !== 'string' || !REASON.test(value)) throw new TypeError('reasonCode must be 1 to 128 uppercase token characters');
  return value;
}
function exactEnum(value: unknown, allowed: ReadonlySet<string>, label: string): string {
  if (typeof value !== 'string' || !allowed.has(value)) throw new TypeError(`${label} is outside the accepted execution run enum`);
  return value;
}
function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}
function canonicalTimestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : undefined;
  if (!date || !Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a timestamp`);
  return date.toISOString();
}
function registryError(code: string, message: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }
