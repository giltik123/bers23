import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  normalizeOrthogonalTransformMode,
  type OrthogonalTransformMode,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';

export const AUTOMATION_PLAN_KIND = 'BOUNDED_DETERMINISTIC_IMAGE_V1' as const;
export const AUTOMATION_TRIGGER = 'MANUAL' as const;

export type AutomationOwnerScope = Readonly<{ tenantId: string; userId: string }>;
export type AutomationDefinitionStatus = 'ACTIVE' | 'ARCHIVED';
export type AutomationDefinitionPlan = Readonly<{
  kind: typeof AUTOMATION_PLAN_KIND;
  orthogonalMode: OrthogonalTransformMode;
  targetWidth: number;
  targetHeight: number;
}>;
export type AutomationDefinition = Readonly<{
  id: string;
  name: string;
  trigger: typeof AUTOMATION_TRIGGER;
  plan: AutomationDefinitionPlan;
  status: AutomationDefinitionStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;
export type AutomationDefinitionLimits = Readonly<{ maxDimension: number; maxPixels: number }>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_KEYS = Object.freeze(['name','trigger','plan']);
const UPDATE_KEYS = Object.freeze(['name','plan']);
const PLAN_KEYS = Object.freeze(['kind','orthogonalMode','targetWidth','targetHeight']);

export class PostgresAutomationDefinitionStore {
  constructor(
    private readonly pool: Pool,
    private readonly limits: AutomationDefinitionLimits,
    private readonly nextId: () => string = randomUUID,
  ) { requireLimits(limits); }

  async create(scope: AutomationOwnerScope, raw: unknown): Promise<AutomationDefinition> {
    const owner = requireScope(scope);
    const input = normalizeCreate(raw, this.limits);
    const id = requireGeneratedId(this.nextId());
    const result = await this.pool.query(`INSERT INTO canonical_automation_definitions
      (automation_id,tenant_id,user_id,name,trigger,plan_kind,orthogonal_mode,target_width,target_height,status,revision)
      VALUES ($1,$2,$3,$4,'MANUAL',$5,$6,$7,$8,'ACTIVE',1)
      RETURNING *`, [id, owner.tenantId, owner.userId, input.name, input.plan.kind, input.plan.orthogonalMode, input.plan.targetWidth, input.plan.targetHeight]);
    if (result.rowCount !== 1) throw new Error('Automation definition creation did not insert one aggregate');
    return fromRow(result.rows[0]);
  }

  async list(scope: AutomationOwnerScope): Promise<readonly AutomationDefinition[]> {
    const owner = requireScope(scope);
    const result = await this.pool.query(`SELECT * FROM canonical_automation_definitions
      WHERE tenant_id=$1 AND user_id=$2 ORDER BY updated_at DESC,automation_id`, [owner.tenantId, owner.userId]);
    return Object.freeze(result.rows.map(fromRow));
  }

  async get(scope: AutomationOwnerScope, automationId: string): Promise<AutomationDefinition | undefined> {
    const owner = requireScope(scope);
    const id = normalizeUuid(automationId);
    if (!id) return undefined;
    const result = await this.pool.query(`SELECT * FROM canonical_automation_definitions
      WHERE automation_id=$1 AND tenant_id=$2 AND user_id=$3`, [id, owner.tenantId, owner.userId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async update(scope: AutomationOwnerScope, automationId: string, expectedRevision: number, raw: unknown): Promise<AutomationDefinition> {
    const owner = requireScope(scope);
    const id = requireMutationId(automationId, expectedRevision);
    const patch = normalizeUpdate(raw, this.limits);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await locked(client, owner, id);
      if (!current) throw notFound();
      assertRevision(current, expectedRevision);
      if (current.status !== 'ACTIVE') throw httpError(409, 'automation_archived', 'Archived Automation definition cannot be edited');
      const nextName = patch.name ?? current.name;
      const nextPlan = patch.plan ?? current.plan;
      if (nextName === current.name && samePlan(nextPlan, current.plan)) { await client.query('COMMIT'); return current; }
      const result = await client.query(`UPDATE canonical_automation_definitions SET
        name=$4,plan_kind=$5,orthogonal_mode=$6,target_width=$7,target_height=$8,
        revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE automation_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$9 RETURNING *`,
      [id, owner.tenantId, owner.userId, nextName, nextPlan.kind, nextPlan.orthogonalMode, nextPlan.targetWidth, nextPlan.targetHeight, expectedRevision]);
      if (result.rowCount !== 1 || Number(result.rows[0]?.revision) !== expectedRevision + 1) throw revisionConflict();
      await client.query('COMMIT');
      return fromRow(result.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async archive(scope: AutomationOwnerScope, automationId: string, expectedRevision: number): Promise<AutomationDefinition> {
    return this.setStatus(scope, automationId, expectedRevision, 'ARCHIVED');
  }
  async restore(scope: AutomationOwnerScope, automationId: string, expectedRevision: number): Promise<AutomationDefinition> {
    return this.setStatus(scope, automationId, expectedRevision, 'ACTIVE');
  }

  private async setStatus(scope: AutomationOwnerScope, automationId: string, expectedRevision: number, status: AutomationDefinitionStatus): Promise<AutomationDefinition> {
    const owner = requireScope(scope);
    const id = requireMutationId(automationId, expectedRevision);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await locked(client, owner, id);
      if (!current) throw notFound();
      assertRevision(current, expectedRevision);
      if (current.status === status) { await client.query('COMMIT'); return current; }
      const result = await client.query(`UPDATE canonical_automation_definitions
        SET status=$4,revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE automation_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$5 RETURNING *`,
      [id, owner.tenantId, owner.userId, status, expectedRevision]);
      if (result.rowCount !== 1 || Number(result.rows[0]?.revision) !== expectedRevision + 1) throw revisionConflict();
      await client.query('COMMIT');
      return fromRow(result.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

function normalizeCreate(raw: unknown, limits: AutomationDefinitionLimits) {
  const record = exactRecord(raw, CREATE_KEYS, CREATE_KEYS, 'invalid_automation_create');
  if (record.trigger !== AUTOMATION_TRIGGER) throw httpError(400, 'invalid_automation_trigger', 'C3a Automation trigger must be MANUAL');
  return Object.freeze({ name: normalizeName(record.name), plan: normalizePlan(record.plan, limits) });
}
function normalizeUpdate(raw: unknown, limits: AutomationDefinitionLimits) {
  const record = exactRecord(raw, UPDATE_KEYS, [], 'invalid_automation_update');
  if (Object.keys(record).length === 0) throw httpError(400, 'invalid_automation_update', 'Automation update must change name or plan');
  return Object.freeze({
    ...(Object.hasOwn(record, 'name') ? { name: normalizeName(record.name) } : {}),
    ...(Object.hasOwn(record, 'plan') ? { plan: normalizePlan(record.plan, limits) } : {}),
  });
}
function normalizePlan(raw: unknown, limits: AutomationDefinitionLimits): AutomationDefinitionPlan {
  const record = exactRecord(raw, PLAN_KEYS, PLAN_KEYS, 'invalid_automation_plan');
  if (record.kind !== AUTOMATION_PLAN_KIND) throw httpError(400, 'unsupported_automation_plan', 'Automation plan kind is unsupported');
  let orthogonalMode: OrthogonalTransformMode;
  try { orthogonalMode = normalizeOrthogonalTransformMode(record.orthogonalMode); }
  catch { throw httpError(400, 'invalid_automation_orthogonal_mode', 'Automation orthogonal mode is unsupported'); }
  const targetWidth = dimension(record.targetWidth, 'targetWidth', limits.maxDimension);
  const targetHeight = dimension(record.targetHeight, 'targetHeight', limits.maxDimension);
  if (targetWidth * targetHeight > limits.maxPixels) throw httpError(400, 'automation_geometry_too_large', 'Automation resize geometry exceeds the configured pixel limit');
  return Object.freeze({ kind: AUTOMATION_PLAN_KIND, orthogonalMode, targetWidth, targetHeight });
}
function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], code: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpError(400, code, 'Automation definition body must be an object');
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) throw httpError(400, code, `Automation definition accepts only: ${allowed.join(', ')}`);
  return record;
}
function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw httpError(400, 'invalid_automation_name', 'Automation name must be a string');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) throw httpError(400, 'invalid_automation_name', 'Automation name must contain 1-120 characters');
  return name;
}
function dimension(value: unknown, field: string, maxDimension: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maxDimension) throw httpError(400, 'invalid_automation_geometry', `${field} must be a positive integer within the configured image limit`);
  return value;
}
function requireLimits(limits: AutomationDefinitionLimits): void {
  if (!Number.isSafeInteger(limits.maxDimension) || limits.maxDimension < 1 || !Number.isSafeInteger(limits.maxPixels) || limits.maxPixels < 1) throw new Error('Automation definition limits are invalid');
}
function requireScope(scope: AutomationOwnerScope): AutomationOwnerScope {
  if (!scope || typeof scope.tenantId !== 'string' || !scope.tenantId.trim() || typeof scope.userId !== 'string' || !scope.userId.trim()) throw httpError(401, 'automation_scope_invalid', 'Authenticated Automation owner scope is required');
  return Object.freeze({ tenantId: scope.tenantId.trim(), userId: scope.userId.trim() });
}
function requireGeneratedId(value: string): string {
  const id = normalizeUuid(value);
  if (!id) throw new Error('Automation definition ID generator returned an invalid UUID');
  return id;
}
function requireMutationId(value: string, revision: number): string {
  const id = normalizeUuid(value);
  if (!id) throw notFound();
  if (!Number.isSafeInteger(revision) || revision < 1) throw httpError(400, 'invalid_automation_revision', 'Automation revision must be a positive integer');
  return id;
}
function normalizeUuid(value: unknown): string | undefined { return typeof value === 'string' && UUID_PATTERN.test(value.trim()) ? value.trim().toLowerCase() : undefined; }
async function locked(client: PoolClient, scope: AutomationOwnerScope, id: string): Promise<AutomationDefinition | undefined> {
  const result = await client.query(`SELECT * FROM canonical_automation_definitions WHERE automation_id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE`, [id, scope.tenantId, scope.userId]);
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}
function fromRow(row: any): AutomationDefinition {
  return Object.freeze({
    id: String(row.automation_id), name: String(row.name), trigger: AUTOMATION_TRIGGER,
    plan: Object.freeze({ kind: AUTOMATION_PLAN_KIND, orthogonalMode: normalizeOrthogonalTransformMode(row.orthogonal_mode), targetWidth: Number(row.target_width), targetHeight: Number(row.target_height) }),
    status: String(row.status) as AutomationDefinitionStatus, revision: Number(row.revision),
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  });
}
function samePlan(left: AutomationDefinitionPlan, right: AutomationDefinitionPlan): boolean {
  return left.kind === right.kind && left.orthogonalMode === right.orthogonalMode && left.targetWidth === right.targetWidth && left.targetHeight === right.targetHeight;
}
function assertRevision(current: AutomationDefinition, expectedRevision: number): void { if (current.revision !== expectedRevision) throw revisionConflict(); }
function notFound() { return httpError(404, 'automation_not_found', 'Automation definition not found'); }
function revisionConflict() { return httpError(409, 'automation_revision_conflict', 'Automation definition revision is stale'); }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
