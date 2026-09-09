import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  AUTOMATION_PLAN_KIND,
  type AutomationDefinitionPlan,
  type AutomationOwnerScope,
} from './PostgresAutomationDefinitionStore.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_REQUEST_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const PLAN_DIGEST_DOMAIN = 'bers:automation-definition-plan:v1\0';
const DOWNSTREAM_REQUEST_DOMAIN = 'bers:automation-agent-invocation:v1\0';

export type AutomationInvocationBinding = Readonly<{
  invocationId: string;
  tenantId: string;
  userId: string;
  automationId: string;
  definitionRevision: number;
  plan: AutomationDefinitionPlan;
  planDigest: string;
  projectId: string;
  sourceImageStorageId: string;
  sourceRole: 'ORIGINAL' | 'COMPOSITE';
  sourceWidth: number;
  sourceHeight: number;
  clientRequestId: string;
  downstreamClientRequestId: string;
  createdAt: string;
}>;

export type AutomationInvocationBindCommand = Readonly<{
  automationId: string;
  definitionRevision: number;
  projectId: string;
  clientRequestId: string;
}>;

export class PostgresAutomationInvocationStore {
  constructor(
    private readonly pool: Pool,
    private readonly nextId: () => string = randomUUID,
  ) {}

  async bind(scopeInput: AutomationOwnerScope, commandInput: AutomationInvocationBindCommand): Promise<AutomationInvocationBinding> {
    const scope = requireScope(scopeInput);
    const command = normalizeBindCommand(commandInput);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const replay = await findByIntent(client, scope, command);
      if (replay) {
        assertReplayCompatible(replay, command);
        await client.query('COMMIT');
        return replay;
      }

      // New invocation creation is serialized against definition mutation first.
      // The second replay lookup is required for an identical invocation that was
      // committed while this transaction waited for the canonical definition lock.
      const definition = await lockDefinition(client, scope, command.automationId);
      if (!definition) throw notFound('automation_not_found', 'Automation definition not found');
      const racedReplay = await findByIntent(client, scope, command);
      if (racedReplay) {
        assertReplayCompatible(racedReplay, command);
        await client.query('COMMIT');
        return racedReplay;
      }
      if (Number(definition.revision) !== command.definitionRevision) {
        throw conflict('automation_revision_conflict', 'Automation definition revision is stale');
      }
      if (String(definition.status) !== 'ACTIVE') {
        throw conflict('automation_not_active', 'Only an ACTIVE Automation definition can start a new invocation');
      }

      // Project mutations serialize through the same canonical project-row lock.
      // Holding both locks until INSERT makes definition revision + source cursor
      // one atomic invocation snapshot without moving either authority into this store.
      const project = await lockProject(client, scope, command.projectId);
      if (!project) throw notFound('project_not_found', 'Project not found');
      const currentStorageId = String(project.current_image_storage_id).toLowerCase();
      const originalStorageId = String(project.original_image_storage_id).toLowerCase();
      if (!normalizeUuid(currentStorageId) || !normalizeUuid(originalStorageId)) {
        throw conflict('automation_project_source_invalid', 'Project image cursor is not canonical');
      }
      // Exact Project transport rule: the original storage identity is the role
      // discriminator. Any other current cursor must be a durable FINAL composite.
      const expectedSourceRole = currentStorageId === originalStorageId ? 'ORIGINAL' : 'COMPOSITE';
      const expectedSourceLifecycle = expectedSourceRole === 'ORIGINAL' ? 'IMMUTABLE' : 'FINAL';
      const source = await lockCurrentProjectImage(
        client,
        scope,
        command.projectId,
        currentStorageId,
        expectedSourceRole,
        expectedSourceLifecycle,
      );
      if (!source) throw conflict('automation_project_source_invalid', 'Current Project image is unavailable or does not match the canonical Project source role');
      if (Number(project.width) !== Number(source.width) || Number(project.height) !== Number(source.height)) {
        throw conflict('automation_project_source_geometry_conflict', 'Project geometry does not match its current canonical image');
      }

      const plan = planFromDefinition(definition);
      const planDigest = digestPlan(plan);
      const downstreamClientRequestId = downstreamRequestId(scope, command, source, planDigest);
      const invocationId = requireUuid(this.nextId(), 'Automation invocation ID generator returned an invalid UUID');
      const result = await client.query(`INSERT INTO canonical_automation_invocation_bindings (
        invocation_id,tenant_id,user_id,automation_id,definition_revision,
        plan_kind,orthogonal_mode,target_width,target_height,plan_digest,
        project_id,source_image_storage_id,source_role,source_width,source_height,
        client_request_id,downstream_client_request_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`, [
        invocationId, scope.tenantId, scope.userId, command.automationId, command.definitionRevision,
        plan.kind, plan.orthogonalMode, plan.targetWidth, plan.targetHeight, planDigest,
        command.projectId, source.storage_id, source.role, Number(source.width), Number(source.height),
        command.clientRequestId, downstreamClientRequestId,
      ]);
      if (result.rowCount !== 1) throw new Error('Automation invocation binding did not insert exactly one immutable row');
      const binding = fromRow(result.rows[0]);
      await client.query('COMMIT');
      return binding;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async get(scopeInput: AutomationOwnerScope, invocationIdInput: string): Promise<AutomationInvocationBinding | undefined> {
    const scope = requireScope(scopeInput);
    const invocationId = normalizeUuid(invocationIdInput);
    if (!invocationId) return undefined;
    const result = await this.pool.query(`SELECT * FROM canonical_automation_invocation_bindings
      WHERE invocation_id=$1 AND tenant_id=$2 AND user_id=$3`, [invocationId, scope.tenantId, scope.userId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }
}

async function findByIntent(client: PoolClient, scope: AutomationOwnerScope, command: AutomationInvocationBindCommand): Promise<AutomationInvocationBinding | undefined> {
  const result = await client.query(`SELECT * FROM canonical_automation_invocation_bindings
    WHERE tenant_id=$1 AND user_id=$2 AND automation_id=$3 AND project_id=$4 AND client_request_id=$5`,
  [scope.tenantId, scope.userId, command.automationId, command.projectId, command.clientRequestId]);
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}

async function lockDefinition(client: PoolClient, scope: AutomationOwnerScope, automationId: string): Promise<any | undefined> {
  const result = await client.query(`SELECT automation_id,revision,status,plan_kind,orthogonal_mode,target_width,target_height
    FROM canonical_automation_definitions
    WHERE automation_id=$1 AND tenant_id=$2 AND user_id=$3
    FOR UPDATE`, [automationId, scope.tenantId, scope.userId]);
  return result.rows[0];
}

async function lockProject(client: PoolClient, scope: AutomationOwnerScope, projectId: string): Promise<any | undefined> {
  const result = await client.query(`SELECT project_id,original_image_storage_id,current_image_storage_id,width,height
    FROM canonical_projects
    WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL
    FOR UPDATE`, [projectId, scope.tenantId, scope.userId]);
  return result.rows[0];
}

async function lockCurrentProjectImage(
  client: PoolClient,
  scope: AutomationOwnerScope,
  projectId: string,
  storageId: string,
  role: 'ORIGINAL' | 'COMPOSITE',
  lifecycle: 'IMMUTABLE' | 'FINAL',
): Promise<any | undefined> {
  const result = await client.query(`SELECT storage_id,role,lifecycle,width,height
    FROM canonical_image_artifacts
    WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
      AND role=$5 AND lifecycle=$6
      AND revoked_at IS NULL AND deleted_at IS NULL
    FOR SHARE`, [storageId, scope.tenantId, scope.userId, projectId, role, lifecycle]);
  return result.rows[0];
}

function planFromDefinition(row: any): AutomationDefinitionPlan {
  const kind = String(row.plan_kind);
  if (kind !== AUTOMATION_PLAN_KIND) throw conflict('automation_plan_contract', 'Stored Automation plan kind is unsupported');
  const orthogonalMode = String(row.orthogonal_mode) as AutomationDefinitionPlan['orthogonalMode'];
  const targetWidth = Number(row.target_width);
  const targetHeight = Number(row.target_height);
  return Object.freeze({ kind: AUTOMATION_PLAN_KIND, orthogonalMode, targetWidth, targetHeight });
}

export function automationInvocationPlanDigest(plan: AutomationDefinitionPlan): string {
  return digestPlan(plan);
}

function digestPlan(plan: AutomationDefinitionPlan): string {
  return createHash('sha256')
    .update(PLAN_DIGEST_DOMAIN)
    .update(JSON.stringify([plan.kind, plan.orthogonalMode, plan.targetWidth, plan.targetHeight]))
    .digest('hex');
}

function downstreamRequestId(
  scope: AutomationOwnerScope,
  command: AutomationInvocationBindCommand,
  source: Readonly<{ storage_id: unknown; role: unknown; width: unknown; height: unknown }>,
  planDigest: string,
): string {
  const material = [
    scope.tenantId, scope.userId, command.automationId, String(command.definitionRevision), command.projectId,
    String(source.storage_id).toLowerCase(), String(source.role), String(source.width), String(source.height),
    command.clientRequestId, planDigest,
  ].join('\0');
  return `automation-agent-v1-${createHash('sha256').update(DOWNSTREAM_REQUEST_DOMAIN).update(material).digest('hex')}`;
}

function normalizeBindCommand(input: AutomationInvocationBindCommand): AutomationInvocationBindCommand {
  const automationId = requireUuid(input?.automationId, 'automationId must be a UUID');
  const projectId = requireUuid(input?.projectId, 'projectId must be a UUID');
  const definitionRevision = input?.definitionRevision;
  if (!Number.isSafeInteger(definitionRevision) || definitionRevision < 1) {
    throw badRequest('invalid_automation_revision', 'definitionRevision must be a positive safe integer');
  }
  const clientRequestId = typeof input?.clientRequestId === 'string' ? input.clientRequestId.trim() : '';
  if (!CLIENT_REQUEST_PATTERN.test(clientRequestId)) {
    throw badRequest('invalid_automation_client_request_id', 'clientRequestId must contain 1-160 safe token characters');
  }
  return Object.freeze({ automationId, definitionRevision, projectId, clientRequestId });
}

function requireScope(scope: AutomationOwnerScope): AutomationOwnerScope {
  const tenantId = typeof scope?.tenantId === 'string' ? scope.tenantId.trim() : '';
  const userId = typeof scope?.userId === 'string' ? scope.userId.trim() : '';
  if (!tenantId || !userId || tenantId.length > 256 || userId.length > 256 || CONTROL_PATTERN.test(tenantId) || CONTROL_PATTERN.test(userId)) {
    throw Object.assign(new Error('Authenticated Automation owner scope is required'), { status: 401, code: 'automation_scope_invalid' });
  }
  return Object.freeze({ tenantId, userId });
}

function assertReplayCompatible(binding: AutomationInvocationBinding, command: AutomationInvocationBindCommand): void {
  if (binding.automationId !== command.automationId || binding.projectId !== command.projectId || binding.clientRequestId !== command.clientRequestId) {
    throw conflict('automation_invocation_binding_conflict', 'Automation invocation intent does not match immutable binding');
  }
  if (binding.definitionRevision !== command.definitionRevision) {
    throw conflict('automation_invocation_revision_conflict', 'Automation invocation client request is already bound to a different definition revision');
  }
}

function fromRow(row: any): AutomationInvocationBinding {
  return Object.freeze({
    invocationId: String(row.invocation_id).toLowerCase(),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    automationId: String(row.automation_id).toLowerCase(),
    definitionRevision: Number(row.definition_revision),
    plan: Object.freeze({
      kind: AUTOMATION_PLAN_KIND,
      orthogonalMode: String(row.orthogonal_mode) as AutomationDefinitionPlan['orthogonalMode'],
      targetWidth: Number(row.target_width),
      targetHeight: Number(row.target_height),
    }),
    planDigest: String(row.plan_digest).toLowerCase(),
    projectId: String(row.project_id).toLowerCase(),
    sourceImageStorageId: String(row.source_image_storage_id).toLowerCase(),
    sourceRole: String(row.source_role) as 'ORIGINAL' | 'COMPOSITE',
    sourceWidth: Number(row.source_width),
    sourceHeight: Number(row.source_height),
    clientRequestId: String(row.client_request_id),
    downstreamClientRequestId: String(row.downstream_client_request_id),
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function normalizeUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}
function requireUuid(value: unknown, message: string): string {
  const normalized = normalizeUuid(value);
  if (!normalized) throw badRequest('invalid_automation_invocation_request', message);
  return normalized;
}
function badRequest(code: string, message: string) { return Object.assign(new Error(message), { status: 400, code }); }
function conflict(code: string, message: string) { return Object.assign(new Error(message), { status: 409, code }); }
function notFound(code: string, message: string) { return Object.assign(new Error(message), { status: 404, code }); }
