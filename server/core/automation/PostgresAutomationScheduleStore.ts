import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AutomationOwnerScope } from './PostgresAutomationDefinitionStore.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const REQUEST_DOMAIN = 'bers:automation-schedule-occurrence:v1\0';
const CREATE_KEYS = Object.freeze(['automationId','definitionRevision','projectId','intervalSeconds']);
const UPDATE_KEYS = Object.freeze(['intervalSeconds']);
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 2_592_000;
const DEFAULT_LEASE_MS = 60_000;

export type AutomationScheduleStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type AutomationScheduleDecision = 'EXECUTE' | 'SKIPPED_ACTIVE' | 'SKIPPED_CONFIGURATION';

export type AutomationSchedule = Readonly<{
  scheduleId: string;
  tenantId: string;
  userId: string;
  automationId: string;
  definitionRevision: number;
  projectId: string;
  intervalSeconds: number;
  nextFireAt: string;
  status: AutomationScheduleStatus;
  revision: number;
  overlapPolicy: 'SKIP_WHILE_ACTIVE';
  missedRunPolicy: 'ONE_CATCH_UP';
  createdAt: string;
  updatedAt: string;
}>;

export type AutomationScheduleClaim = Readonly<{
  schedule: AutomationSchedule;
  scheduleRevision: number;
  scheduledFor: string;
  leaseToken: string;
  leaseExpiresAt: string;
  clientRequestId: string;
}>;

export type AutomationTriggerOccurrence = Readonly<{
  occurrenceId: string;
  tenantId: string;
  userId: string;
  scheduleId: string;
  scheduleRevision: number;
  automationId: string;
  definitionRevision: number;
  projectId: string;
  scheduledFor: string;
  decision: AutomationScheduleDecision;
  clientRequestId: string;
  invocationId?: string;
  createdAt: string;
}>;

export type AutomationScheduleRecoveryCursor = Readonly<{
  scheduledFor: string;
  occurrenceId: string;
}>;

export type AutomationScheduleRecoveryPage = Readonly<{
  occurrences: readonly AutomationTriggerOccurrence[];
  nextCursor?: AutomationScheduleRecoveryCursor;
}>;

export class PostgresAutomationScheduleStore {
  constructor(
    private readonly pool: Pool,
    private readonly nextId: () => string = randomUUID,
    private readonly nextLeaseId: () => string = randomUUID,
    private readonly now: () => number = Date.now,
    private readonly leaseMs: number = DEFAULT_LEASE_MS,
  ) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 10 * 60_000) {
      throw new Error('Automation schedule lease duration must be 1s-10m');
    }
  }

  async create(scopeInput: AutomationOwnerScope, raw: unknown): Promise<AutomationSchedule> {
    const scope = requireScope(scopeInput);
    const command = normalizeCreate(raw);
    const scheduleId = requireUuid(this.nextId(), 'Automation schedule ID generator returned an invalid UUID');
    const nextFireAt = new Date(this.now() + command.intervalSeconds * 1000).toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await requireDefinition(client, scope, command.automationId, command.definitionRevision);
      await requireProject(client, scope, command.projectId);
      const result = await client.query(`INSERT INTO canonical_automation_schedules (
        schedule_id,tenant_id,user_id,automation_id,definition_revision,project_id,interval_seconds,next_fire_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [
        scheduleId, scope.tenantId, scope.userId, command.automationId, command.definitionRevision,
        command.projectId, command.intervalSeconds, nextFireAt,
      ]);
      if (result.rowCount !== 1) throw new Error('Automation schedule creation did not insert exactly one aggregate');
      await client.query('COMMIT');
      return fromScheduleRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async list(scopeInput: AutomationOwnerScope): Promise<readonly AutomationSchedule[]> {
    const scope = requireScope(scopeInput);
    const result = await this.pool.query(`SELECT * FROM canonical_automation_schedules
      WHERE tenant_id=$1 AND user_id=$2 ORDER BY updated_at DESC,schedule_id`, [scope.tenantId, scope.userId]);
    return Object.freeze(result.rows.map(fromScheduleRow));
  }

  async get(scopeInput: AutomationOwnerScope, scheduleIdInput: string): Promise<AutomationSchedule | undefined> {
    const scope = requireScope(scopeInput);
    const scheduleId = normalizeUuid(scheduleIdInput);
    if (!scheduleId) return undefined;
    const result = await this.pool.query(`SELECT * FROM canonical_automation_schedules
      WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3`, [scheduleId, scope.tenantId, scope.userId]);
    return result.rows[0] ? fromScheduleRow(result.rows[0]) : undefined;
  }

  async update(scopeInput: AutomationOwnerScope, scheduleIdInput: string, expectedRevision: number, raw: unknown): Promise<AutomationSchedule> {
    const scope = requireScope(scopeInput);
    const scheduleId = requireMutationId(scheduleIdInput, expectedRevision);
    const patch = normalizeUpdate(raw);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockSchedule(client, scope, scheduleId);
      if (!current) throw notFound();
      assertRevision(current, expectedRevision);
      if (current.status === 'ARCHIVED') throw conflict('automation_schedule_archived', 'Archived Automation schedule cannot be edited');
      if (current.intervalSeconds === patch.intervalSeconds) { await client.query('COMMIT'); return current; }
      const nextFireAt = new Date(this.now() + patch.intervalSeconds * 1000).toISOString();
      const result = await client.query(`UPDATE canonical_automation_schedules SET
        interval_seconds=$4,next_fire_at=$5,lease_token=NULL,lease_expires_at=NULL,
        revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$6 RETURNING *`,
      [scheduleId, scope.tenantId, scope.userId, patch.intervalSeconds, nextFireAt, expectedRevision]);
      if (result.rowCount !== 1) throw revisionConflict();
      await client.query('COMMIT');
      return fromScheduleRow(result.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async pause(scope: AutomationOwnerScope, scheduleId: string, expectedRevision: number): Promise<AutomationSchedule> {
    return this.setStatus(scope, scheduleId, expectedRevision, 'PAUSED');
  }
  async resume(scope: AutomationOwnerScope, scheduleId: string, expectedRevision: number): Promise<AutomationSchedule> {
    return this.setStatus(scope, scheduleId, expectedRevision, 'ACTIVE');
  }
  async archive(scope: AutomationOwnerScope, scheduleId: string, expectedRevision: number): Promise<AutomationSchedule> {
    return this.setStatus(scope, scheduleId, expectedRevision, 'ARCHIVED');
  }

  private async setStatus(scopeInput: AutomationOwnerScope, scheduleIdInput: string, expectedRevision: number, status: AutomationScheduleStatus): Promise<AutomationSchedule> {
    const scope = requireScope(scopeInput);
    const scheduleId = requireMutationId(scheduleIdInput, expectedRevision);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockSchedule(client, scope, scheduleId);
      if (!current) throw notFound();
      assertRevision(current, expectedRevision);
      if (current.status === 'ARCHIVED' && status !== 'ARCHIVED') throw conflict('automation_schedule_archived', 'Archived Automation schedule cannot be restored');
      if (current.status === status) { await client.query('COMMIT'); return current; }
      const nextFireAt = status === 'ACTIVE'
        ? new Date(this.now() + current.intervalSeconds * 1000).toISOString()
        : current.nextFireAt;
      const result = await client.query(`UPDATE canonical_automation_schedules SET
        status=$4,next_fire_at=$5,lease_token=NULL,lease_expires_at=NULL,
        revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$6 RETURNING *`,
      [scheduleId, scope.tenantId, scope.userId, status, nextFireAt, expectedRevision]);
      if (result.rowCount !== 1) throw revisionConflict();
      await client.query('COMMIT');
      return fromScheduleRow(result.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  /** Internal worker claim only. No browser principal or execution fields enter this method. */
  async claimDue(): Promise<AutomationScheduleClaim | undefined> {
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const leaseToken = requireUuid(this.nextLeaseId(), 'Automation schedule lease generator returned an invalid UUID');
    const leaseExpiresAt = new Date(nowMs + this.leaseMs).toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query(`SELECT * FROM canonical_automation_schedules
        WHERE status='ACTIVE' AND next_fire_at <= $1
          AND (lease_token IS NULL OR lease_expires_at <= $1)
        ORDER BY next_fire_at,schedule_id
        FOR UPDATE SKIP LOCKED LIMIT 1`, [now]);
      if (!selected.rows[0]) { await client.query('COMMIT'); return undefined; }
      const schedule = fromScheduleRow(selected.rows[0]);
      const result = await client.query(`UPDATE canonical_automation_schedules
        SET lease_token=$2,lease_expires_at=$3
        WHERE schedule_id=$1 AND status='ACTIVE' RETURNING *`, [schedule.scheduleId, leaseToken, leaseExpiresAt]);
      if (result.rowCount !== 1) throw conflict('automation_schedule_claim_lost', 'Automation schedule claim was lost');
      await client.query('COMMIT');
      const claimed = fromScheduleRow(result.rows[0]);
      const scheduledFor = schedule.nextFireAt;
      return Object.freeze({
        schedule: claimed,
        scheduleRevision: claimed.revision,
        scheduledFor,
        leaseToken,
        leaseExpiresAt,
        clientRequestId: scheduleOccurrenceClientRequestId(claimed, scheduledFor),
      });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async latestExecuteBefore(claim: AutomationScheduleClaim): Promise<AutomationTriggerOccurrence | undefined> {
    const checked = normalizeClaim(claim);
    const result = await this.pool.query(`SELECT * FROM canonical_automation_trigger_occurrences
      WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3 AND decision='EXECUTE' AND scheduled_for < $4
      ORDER BY scheduled_for DESC,occurrence_id DESC LIMIT 1`, [
      checked.schedule.scheduleId, checked.schedule.tenantId, checked.schedule.userId, checked.scheduledFor,
    ]);
    return result.rows[0] ? fromOccurrenceRow(result.rows[0]) : undefined;
  }

  async commitOccurrence(
    claimInput: AutomationScheduleClaim,
    decision: AutomationScheduleDecision,
    invocationIdInput?: string,
  ): Promise<AutomationTriggerOccurrence> {
    const claim = normalizeClaim(claimInput);
    const invocationId = decision === 'EXECUTE'
      ? requireUuid(invocationIdInput, 'EXECUTE occurrence requires canonical invocationId')
      : undefined;
    if (decision !== 'EXECUTE' && invocationIdInput != null) throw badRequest('automation_schedule_occurrence_binding_invalid', 'Skipped occurrence cannot bind an invocation');
    if (!['EXECUTE','SKIPPED_ACTIVE','SKIPPED_CONFIGURATION'].includes(decision)) throw badRequest('automation_schedule_decision_invalid', 'Automation schedule decision is unsupported');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const replay = await findOccurrence(client, claim);
      if (replay) {
        assertOccurrenceReplay(replay, claim, decision, invocationId);
        await client.query('COMMIT');
        return replay;
      }
      const scheduleRow = await client.query(`SELECT * FROM canonical_automation_schedules
        WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE`, [
        claim.schedule.scheduleId, claim.schedule.tenantId, claim.schedule.userId,
      ]);
      if (!scheduleRow.rows[0]) throw notFound();
      const current = fromScheduleRow(scheduleRow.rows[0]);
      const raw = scheduleRow.rows[0];
      const leaseToken = normalizeUuid(raw.lease_token);
      const leaseExpiresAt = raw.lease_expires_at ? new Date(raw.lease_expires_at).getTime() : 0;
      if (current.status !== 'ACTIVE' || current.revision !== claim.scheduleRevision
        || current.nextFireAt !== claim.scheduledFor || leaseToken !== claim.leaseToken
        || leaseExpiresAt <= this.now()) {
        throw conflict('automation_schedule_claim_stale', 'Automation schedule claim is no longer authoritative');
      }

      const occurrenceId = requireUuid(this.nextId(), 'Automation occurrence ID generator returned an invalid UUID');
      const inserted = await client.query(`INSERT INTO canonical_automation_trigger_occurrences (
        occurrence_id,tenant_id,user_id,schedule_id,schedule_revision,automation_id,definition_revision,
        project_id,scheduled_for,decision,client_request_id,invocation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [
        occurrenceId, current.tenantId, current.userId, current.scheduleId, current.revision,
        current.automationId, current.definitionRevision, current.projectId, claim.scheduledFor,
        decision, claim.clientRequestId, invocationId ?? null,
      ]);
      if (inserted.rowCount !== 1) throw new Error('Automation trigger occurrence did not insert exactly one immutable row');
      const nextFireAt = nextFireAfter(current.nextFireAt, current.intervalSeconds, this.now());
      const advanced = await client.query(`UPDATE canonical_automation_schedules SET
        next_fire_at=$4,lease_token=NULL,lease_expires_at=NULL
        WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$5 AND lease_token=$6`, [
        current.scheduleId, current.tenantId, current.userId, nextFireAt, current.revision, claim.leaseToken,
      ]);
      if (advanced.rowCount !== 1) throw conflict('automation_schedule_claim_lost', 'Automation schedule claim was lost during advancement');
      await client.query('COMMIT');
      return fromOccurrenceRow(inserted.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async releaseClaim(claimInput: AutomationScheduleClaim): Promise<void> {
    const claim = normalizeClaim(claimInput);
    await this.pool.query(`UPDATE canonical_automation_schedules SET lease_token=NULL,lease_expires_at=NULL
      WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$4 AND lease_token=$5`, [
      claim.schedule.scheduleId, claim.schedule.tenantId, claim.schedule.userId, claim.scheduleRevision, claim.leaseToken,
    ]);
  }

  /**
   * Internal crash-recovery scan. Only the latest EXECUTE for each schedule can still require
   * recovery: SKIP_WHILE_ACTIVE requires an earlier EXECUTE to be terminal before a later EXECUTE
   * can be admitted. Keyset pagination prevents old schedules from being starved by newer history.
   */
  async listLatestExecuteOccurrences(
    limitInput = 50,
    cursorInput?: AutomationScheduleRecoveryCursor,
  ): Promise<AutomationScheduleRecoveryPage> {
    const limit = Number.isSafeInteger(limitInput) && limitInput >= 1 && limitInput <= 200 ? limitInput : 50;
    const cursor = normalizeRecoveryCursor(cursorInput);
    const result = await this.pool.query(`WITH latest_per_schedule AS (
      SELECT DISTINCT ON (schedule_id) *
      FROM canonical_automation_trigger_occurrences
      WHERE decision='EXECUTE'
      ORDER BY schedule_id,scheduled_for DESC,occurrence_id DESC
    )
    SELECT * FROM latest_per_schedule
      WHERE $1::timestamptz IS NULL
        OR scheduled_for < $1::timestamptz
        OR (scheduled_for = $1::timestamptz AND occurrence_id < $2::uuid)
      ORDER BY scheduled_for DESC,occurrence_id DESC
      LIMIT $3`, [cursor?.scheduledFor ?? null, cursor?.occurrenceId ?? null, limit + 1]);
    const occurrences = Object.freeze(result.rows.slice(0, limit).map(fromOccurrenceRow));
    const last = occurrences.at(-1);
    const nextCursor = result.rows.length > limit && last
      ? Object.freeze({ scheduledFor: last.scheduledFor, occurrenceId: last.occurrenceId })
      : undefined;
    return Object.freeze({ occurrences, ...(nextCursor ? { nextCursor } : {}) });
  }
}

export function scheduleOccurrenceClientRequestId(schedule: AutomationSchedule, scheduledForInput: string): string {
  const scheduledFor = isoTimestamp(scheduledForInput, 'scheduledFor');
  const material = [
    schedule.tenantId, schedule.userId, schedule.scheduleId, String(schedule.revision), scheduledFor,
    schedule.automationId, String(schedule.definitionRevision), schedule.projectId,
  ].join('\0');
  return `automation-schedule-v1-${createHash('sha256').update(REQUEST_DOMAIN).update(material).digest('hex')}`;
}

function nextFireAfter(scheduledForInput: string, intervalSeconds: number, nowMs: number): string {
  const scheduledMs = Date.parse(scheduledForInput);
  const intervalMs = intervalSeconds * 1000;
  if (!Number.isSafeInteger(scheduledMs) || !Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new Error('Automation schedule cadence is invalid');
  const elapsed = Math.max(0, nowMs - scheduledMs);
  const steps = Math.max(1, Math.floor(elapsed / intervalMs) + 1);
  return new Date(scheduledMs + steps * intervalMs).toISOString();
}

async function requireDefinition(client: PoolClient, scope: AutomationOwnerScope, automationId: string, revision: number): Promise<void> {
  const result = await client.query(`SELECT revision,status FROM canonical_automation_definitions
    WHERE automation_id=$1 AND tenant_id=$2 AND user_id=$3 FOR SHARE`, [automationId, scope.tenantId, scope.userId]);
  if (!result.rows[0]) throw Object.assign(new Error('Automation definition not found'), { status: 404, code: 'automation_not_found' });
  if (Number(result.rows[0].revision) !== revision) throw conflict('automation_revision_conflict', 'Automation definition revision is stale');
  if (String(result.rows[0].status) !== 'ACTIVE') throw conflict('automation_not_active', 'Only ACTIVE Automation can be scheduled');
}
async function requireProject(client: PoolClient, scope: AutomationOwnerScope, projectId: string): Promise<void> {
  const result = await client.query(`SELECT project_id FROM canonical_projects
    WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR SHARE`, [projectId, scope.tenantId, scope.userId]);
  if (!result.rows[0]) throw Object.assign(new Error('Project not found'), { status: 404, code: 'project_not_found' });
}
async function lockSchedule(client: PoolClient, scope: AutomationOwnerScope, scheduleId: string): Promise<AutomationSchedule | undefined> {
  const result = await client.query(`SELECT * FROM canonical_automation_schedules
    WHERE schedule_id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE`, [scheduleId, scope.tenantId, scope.userId]);
  return result.rows[0] ? fromScheduleRow(result.rows[0]) : undefined;
}
async function findOccurrence(client: PoolClient, claim: AutomationScheduleClaim): Promise<AutomationTriggerOccurrence | undefined> {
  const result = await client.query(`SELECT * FROM canonical_automation_trigger_occurrences
    WHERE schedule_id=$1 AND schedule_revision=$2 AND scheduled_for=$3`, [claim.schedule.scheduleId, claim.scheduleRevision, claim.scheduledFor]);
  return result.rows[0] ? fromOccurrenceRow(result.rows[0]) : undefined;
}

function normalizeCreate(raw: unknown) {
  const record = exactRecord(raw, CREATE_KEYS, CREATE_KEYS, 'invalid_automation_schedule_create');
  return Object.freeze({
    automationId: requireUuid(record.automationId, 'automationId must be a UUID'),
    definitionRevision: positiveRevision(record.definitionRevision, 'definitionRevision'),
    projectId: requireUuid(record.projectId, 'projectId must be a UUID'),
    intervalSeconds: interval(record.intervalSeconds),
  });
}
function normalizeUpdate(raw: unknown) {
  const record = exactRecord(raw, UPDATE_KEYS, UPDATE_KEYS, 'invalid_automation_schedule_update');
  return Object.freeze({ intervalSeconds: interval(record.intervalSeconds) });
}
function normalizeClaim(claim: AutomationScheduleClaim): AutomationScheduleClaim {
  if (!claim || typeof claim !== 'object') throw badRequest('automation_schedule_claim_invalid', 'Automation schedule claim is invalid');
  const schedule = claim.schedule;
  if (!schedule || schedule.revision !== claim.scheduleRevision) throw badRequest('automation_schedule_claim_invalid', 'Automation schedule claim revision is invalid');
  const leaseToken = requireUuid(claim.leaseToken, 'Automation schedule lease token is invalid');
  const leaseExpiresAt = isoTimestamp(claim.leaseExpiresAt, 'leaseExpiresAt');
  const scheduledFor = isoTimestamp(claim.scheduledFor, 'scheduledFor');
  const expectedRequest = scheduleOccurrenceClientRequestId(schedule, scheduledFor);
  if (claim.clientRequestId !== expectedRequest) throw badRequest('automation_schedule_claim_invalid', 'Automation schedule claim request identity is invalid');
  return Object.freeze({ schedule, scheduleRevision: claim.scheduleRevision, scheduledFor, leaseToken, leaseExpiresAt, clientRequestId: expectedRequest });
}
function normalizeRecoveryCursor(cursor: AutomationScheduleRecoveryCursor | undefined): AutomationScheduleRecoveryCursor | undefined {
  if (cursor === undefined) return undefined;
  if (!cursor || typeof cursor !== 'object') throw badRequest('automation_schedule_recovery_cursor_invalid', 'Automation recovery cursor is invalid');
  return Object.freeze({
    scheduledFor: isoTimestamp(cursor.scheduledFor, 'recoveryCursor.scheduledFor'),
    occurrenceId: requireUuid(cursor.occurrenceId, 'Automation recovery occurrence cursor is invalid'),
  });
}
function assertOccurrenceReplay(existing: AutomationTriggerOccurrence, claim: AutomationScheduleClaim, decision: AutomationScheduleDecision, invocationId?: string): void {
  if (existing.tenantId !== claim.schedule.tenantId || existing.userId !== claim.schedule.userId
    || existing.scheduleId !== claim.schedule.scheduleId || existing.scheduleRevision !== claim.scheduleRevision
    || existing.automationId !== claim.schedule.automationId || existing.definitionRevision !== claim.schedule.definitionRevision
    || existing.projectId !== claim.schedule.projectId || existing.scheduledFor !== claim.scheduledFor
    || existing.clientRequestId !== claim.clientRequestId || existing.decision !== decision
    || existing.invocationId !== invocationId) {
    throw conflict('automation_schedule_occurrence_replay_conflict', 'Automation occurrence replay does not match immutable trigger decision');
  }
}

function fromScheduleRow(row: any): AutomationSchedule {
  return Object.freeze({
    scheduleId: String(row.schedule_id).toLowerCase(), tenantId: String(row.tenant_id), userId: String(row.user_id),
    automationId: String(row.automation_id).toLowerCase(), definitionRevision: Number(row.definition_revision),
    projectId: String(row.project_id).toLowerCase(), intervalSeconds: Number(row.interval_seconds),
    nextFireAt: new Date(row.next_fire_at).toISOString(), status: String(row.status) as AutomationScheduleStatus,
    revision: Number(row.revision), overlapPolicy: 'SKIP_WHILE_ACTIVE', missedRunPolicy: 'ONE_CATCH_UP',
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  });
}
function fromOccurrenceRow(row: any): AutomationTriggerOccurrence {
  return Object.freeze({
    occurrenceId: String(row.occurrence_id).toLowerCase(), tenantId: String(row.tenant_id), userId: String(row.user_id),
    scheduleId: String(row.schedule_id).toLowerCase(), scheduleRevision: Number(row.schedule_revision),
    automationId: String(row.automation_id).toLowerCase(), definitionRevision: Number(row.definition_revision),
    projectId: String(row.project_id).toLowerCase(), scheduledFor: new Date(row.scheduled_for).toISOString(),
    decision: String(row.decision) as AutomationScheduleDecision, clientRequestId: String(row.client_request_id),
    ...(row.invocation_id ? { invocationId: String(row.invocation_id).toLowerCase() } : {}),
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], code: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest(code, 'Automation schedule body must be an object');
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) throw badRequest(code, `Automation schedule accepts exactly: ${allowed.join(', ')}`);
  return record;
}
function requireScope(scope: AutomationOwnerScope): AutomationOwnerScope {
  const tenantId = typeof scope?.tenantId === 'string' ? scope.tenantId.trim() : '';
  const userId = typeof scope?.userId === 'string' ? scope.userId.trim() : '';
  if (!tenantId || !userId || Buffer.byteLength(tenantId,'utf8') > 256 || Buffer.byteLength(userId,'utf8') > 256 || CONTROL_PATTERN.test(tenantId) || CONTROL_PATTERN.test(userId)) {
    throw Object.assign(new Error('Authenticated Automation schedule scope is required'), { status: 401, code: 'automation_schedule_scope_invalid' });
  }
  return Object.freeze({ tenantId, userId });
}
function interval(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < MIN_INTERVAL_SECONDS || value > MAX_INTERVAL_SECONDS) {
    throw badRequest('invalid_automation_schedule_interval', `intervalSeconds must be ${MIN_INTERVAL_SECONDS}-${MAX_INTERVAL_SECONDS}`);
  }
  return value;
}
function positiveRevision(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw badRequest('invalid_automation_schedule_revision', `${field} must be a positive safe integer`);
  return value;
}
function requireMutationId(value: unknown, revision: number): string { const id = requireUuid(value, 'scheduleId must be a UUID'); positiveRevision(revision,'expectedRevision'); return id; }
function normalizeUuid(value: unknown): string | undefined { return typeof value === 'string' && UUID_PATTERN.test(value.trim()) ? value.trim().toLowerCase() : undefined; }
function requireUuid(value: unknown, message: string): string { const id = normalizeUuid(value); if (!id) throw badRequest('invalid_automation_schedule_request', message); return id; }
function isoTimestamp(value: unknown, field: string): string { const time = typeof value === 'string' ? Date.parse(value) : NaN; if (!Number.isFinite(time)) throw badRequest('invalid_automation_schedule_timestamp', `${field} must be an ISO timestamp`); return new Date(time).toISOString(); }
function assertRevision(current: AutomationSchedule, expected: number): void { if (current.revision !== expected) throw revisionConflict(); }
function notFound() { return Object.assign(new Error('Automation schedule not found'), { status: 404, code: 'automation_schedule_not_found' }); }
function revisionConflict() { return conflict('automation_schedule_revision_conflict', 'Automation schedule revision is stale'); }
function badRequest(code: string, message: string) { return Object.assign(new Error(message), { status: 400, code }); }
function conflict(code: string, message: string) { return Object.assign(new Error(message), { status: 409, code }); }
