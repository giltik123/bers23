import type { Pool, PoolClient } from 'pg';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import {
  assertExpectedRevision,
  isTerminalWorkflowState,
  normalizeArtifactIds,
  normalizeScope,
  normalizeTicketBinding,
  normalizeWorkflowContinuationCreate,
  samePlanBinding,
  sameScope,
  sameStringSetInOrder,
  type CompleteInternalStepInput,
  type CompleteLocalStepInput,
  type CreateWorkflowContinuationInput,
  type RunInternalStepInput,
  type TerminalWorkflowInput,
  type WaitForLocalResultInput,
  type WorkflowCompletedStepBinding,
  type WorkflowContinuationSnapshot,
  type WorkflowContinuationState,
  type WorkflowContinuationStore,
  type WorkflowLocalTicketBinding,
} from './WorkflowContinuationStore.ts';

const COLUMNS = `execution_id,client_request_id,tenant_id,user_id,project_id,plan_id,plan_revision,plan_digest,state,current_step_id,
  outstanding_ticket_id,outstanding_ticket_version,outstanding_ticket_nonce,outstanding_ticket_expires_at,completed_steps_json,
  terminal_artifact_id,failure_code,revision,created_at,updated_at`;
const LOCK_SALT = 643;

type Mutation = (snapshot: WorkflowContinuationSnapshot, client: PoolClient) => Promise<WorkflowContinuationSnapshot | MutableContinuation>;
type MutableContinuation = Readonly<{
  state: WorkflowContinuationState;
  currentStepId?: string;
  outstandingLocal?: WorkflowLocalTicketBinding;
  completedSteps: readonly WorkflowCompletedStepBinding[];
  terminalArtifactId?: string;
  failureCode?: string;
}>;

/** PostgreSQL authority for durable composite continuation state. It never executes a provider or publishes an Artifact. */
export class PostgresWorkflowContinuationStore implements WorkflowContinuationStore {
  constructor(private readonly pool: Pool, private readonly now: () => number = Date.now) {}

  async create(input: CreateWorkflowContinuationInput): Promise<WorkflowContinuationSnapshot> {
    const normalized = normalizeWorkflowContinuationCreate(input);
    const inserted = await this.pool.query(`INSERT INTO workflow_continuations
      (execution_id,client_request_id,tenant_id,user_id,project_id,plan_id,plan_revision,plan_digest,state,completed_steps_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'READY','[]'::jsonb)
      ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      [normalized.executionId, normalized.clientRequestId, normalized.scope.tenantId, normalized.scope.userId, normalized.scope.projectId, normalized.plan.planId, normalized.plan.planRevision, normalized.plan.planDigest]);
    if (inserted.rows[0]) return snapshotFromRow(inserted.rows[0]);

    const byClient = await this.getByClientRequestId(normalized.scope, normalized.clientRequestId);
    if (byClient) return reconcileCreate(byClient, normalized);
    const byExecution = await this.get(normalized.executionId, normalized.scope);
    if (byExecution) return reconcileCreate(byExecution, normalized);
    throw new Error('Workflow continuation persistence conflict could not be reconciled');
  }

  async get(executionId: string, scopeInput: Scope): Promise<WorkflowContinuationSnapshot | undefined> {
    const scope = normalizeScope(scopeInput);
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM workflow_continuations
      WHERE execution_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4`,
      [requireToken(executionId, 'executionId'), scope.tenantId, scope.userId, scope.projectId]);
    return result.rows[0] ? snapshotFromRow(result.rows[0]) : undefined;
  }

  async getByClientRequestId(scopeInput: Scope, clientRequestId: string): Promise<WorkflowContinuationSnapshot | undefined> {
    const scope = normalizeScope(scopeInput);
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM workflow_continuations
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND client_request_id=$4`,
      [scope.tenantId, scope.userId, scope.projectId, requireToken(clientRequestId, 'clientRequestId')]);
    return result.rows[0] ? snapshotFromRow(result.rows[0]) : undefined;
  }

  waitForLocalResult(input: WaitForLocalResultInput): Promise<WorkflowContinuationSnapshot> {
    const ticket = normalizeTicketBinding(input.ticket);
    return this.mutate(input.executionId, input.scope, async (snapshot, client) => {
      if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
        if (sameTicket(snapshot.outstandingLocal, ticket)) return snapshot;
        throw conflict('Workflow is already waiting for a different local execution ticket');
      }
      assertMutable(snapshot);
      if (snapshot.state !== 'READY') throw conflict(`Workflow cannot wait for a local result from state ${snapshot.state}`);
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      if (snapshot.completedSteps.some(step => step.stepId === ticket.stepId)) throw conflict('Completed workflow step cannot be reissued as local work');
      await this.assertOutstandingTicket(client, snapshot, ticket);
      return Object.freeze({ state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: ticket.stepId, outstandingLocal: ticket, completedSteps: snapshot.completedSteps });
    });
  }

  completeLocalStep(input: CompleteLocalStepInput): Promise<WorkflowContinuationSnapshot> {
    const stepId = requireToken(input.stepId, 'stepId');
    const ticketId = requireToken(input.ticketId, 'ticketId');
    const artifactIds = normalizeArtifactIds(input.artifactIds);
    return this.mutate(input.executionId, input.scope, async (snapshot, client) => {
      const completed = snapshot.completedSteps.find(step => step.stepId === stepId);
      if (completed) {
        if (completed.ticketId === ticketId && sameStringSetInOrder(completed.artifactIds, artifactIds)) return snapshot;
        throw conflict('Workflow step is already bound to a different canonical result');
      }
      assertMutable(snapshot);
      if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || snapshot.currentStepId !== stepId || snapshot.outstandingLocal?.ticketId !== ticketId) {
        throw conflict('Local result does not match the outstanding workflow step');
      }
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      await assertTicketFinalizedSuccess(client, ticketId);
      const binding = Object.freeze({ stepId, ticketId, artifactIds });
      return Object.freeze({ state: 'READY', completedSteps: Object.freeze([...snapshot.completedSteps, binding]) });
    });
  }

  runInternalStep(input: RunInternalStepInput): Promise<WorkflowContinuationSnapshot> {
    const stepId = requireToken(input.stepId, 'stepId');
    return this.mutate(input.executionId, input.scope, async snapshot => {
      assertMutable(snapshot);
      if (snapshot.state !== 'READY') throw conflict(`Internal step cannot start from state ${snapshot.state}`);
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      if (snapshot.completedSteps.some(step => step.stepId === stepId)) throw conflict('Completed workflow step cannot be rerun');
      return Object.freeze({ state: 'RUNNING_INTERNAL', currentStepId: stepId, completedSteps: snapshot.completedSteps });
    });
  }

  completeInternalStep(input: CompleteInternalStepInput): Promise<WorkflowContinuationSnapshot> {
    const stepId = requireToken(input.stepId, 'stepId');
    const artifactIds = normalizeArtifactIds(input.artifactIds);
    return this.mutate(input.executionId, input.scope, async snapshot => {
      const completed = snapshot.completedSteps.find(step => step.stepId === stepId);
      if (completed) {
        if (!completed.ticketId && sameStringSetInOrder(completed.artifactIds, artifactIds)) return snapshot;
        throw conflict('Internal workflow step is already bound to a different canonical result');
      }
      assertMutable(snapshot);
      if (snapshot.state !== 'RUNNING_INTERNAL' || snapshot.currentStepId !== stepId) throw conflict('Internal result does not match the running workflow step');
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      const binding = Object.freeze({ stepId, artifactIds });
      return Object.freeze({ state: 'READY', completedSteps: Object.freeze([...snapshot.completedSteps, binding]) });
    });
  }

  succeed(input: TerminalWorkflowInput & Readonly<{ terminalArtifactId: string }>): Promise<WorkflowContinuationSnapshot> {
    const terminalArtifactId = requireToken(input.terminalArtifactId, 'terminalArtifactId');
    return this.mutate(input.executionId, input.scope, async snapshot => {
      if (snapshot.state === 'SUCCESS' && snapshot.terminalArtifactId === terminalArtifactId) return snapshot;
      assertMutable(snapshot);
      if (snapshot.state !== 'READY') throw conflict(`Workflow cannot succeed from state ${snapshot.state}`);
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      if (!snapshot.completedSteps.some(step => step.artifactIds.includes(terminalArtifactId))) throw conflict('Terminal Artifact is not bound to a completed workflow step');
      return Object.freeze({ state: 'SUCCESS', completedSteps: snapshot.completedSteps, terminalArtifactId });
    });
  }

  fail(input: TerminalWorkflowInput & Readonly<{ failureCode: string }>): Promise<WorkflowContinuationSnapshot> {
    return this.terminal(input, 'FAILED', requireToken(input.failureCode, 'failureCode'));
  }

  cancel(input: TerminalWorkflowInput): Promise<WorkflowContinuationSnapshot> {
    return this.terminal(input, 'CANCELLED', 'WORKFLOW_CANCELLED');
  }

  markUnknown(input: TerminalWorkflowInput & Readonly<{ failureCode: string }>): Promise<WorkflowContinuationSnapshot> {
    return this.terminal(input, 'UNKNOWN', requireToken(input.failureCode, 'failureCode'));
  }

  private terminal(input: TerminalWorkflowInput, state: 'FAILED' | 'CANCELLED' | 'UNKNOWN', failureCode: string): Promise<WorkflowContinuationSnapshot> {
    return this.mutate(input.executionId, input.scope, async snapshot => {
      if (snapshot.state === state && snapshot.failureCode === failureCode) return snapshot;
      assertMutable(snapshot);
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      return Object.freeze({ state, completedSteps: snapshot.completedSteps, failureCode });
    });
  }

  private async assertOutstandingTicket(client: PoolClient, snapshot: WorkflowContinuationSnapshot, ticket: WorkflowLocalTicketBinding): Promise<void> {
    const result = await client.query(`SELECT ticket_id,tenant_id,user_id,project_id,workflow_id,step_id,ticket_json,consumed_at
      FROM local_execution_tickets WHERE ticket_id=$1`, [ticket.ticketId]);
    const row = result.rows[0];
    if (!row) throw conflict('Outstanding local execution ticket is not durable');
    if (row.consumed_at) throw conflict('Consumed local execution ticket cannot be issued as outstanding work');
    if (row.tenant_id !== snapshot.scope.tenantId || row.user_id !== snapshot.scope.userId || row.project_id !== snapshot.scope.projectId || row.workflow_id !== snapshot.executionId || row.step_id !== ticket.stepId) {
      throw conflict('Local execution ticket scope/workflow/step binding does not match the continuation');
    }
    const durable = row.ticket_json as Record<string, unknown>;
    if (String(durable.version) !== ticket.ticketVersion || durable.nonce !== ticket.nonce || toIsoTimestamp(durable.expiresAt) !== ticket.expiresAt) throw conflict('Local execution ticket identity does not match its durable ledger');
    if (durable.policy !== 'LOCAL_ONLY') throw conflict('Composite continuation only admits LOCAL_ONLY execution tickets');
    const cost = durable.cost as Record<string, unknown> | undefined;
    if (cost?.providerCalls !== 0 || cost?.paidCloudCredits !== 0) throw conflict('Local composite step contains forbidden provider or paid-credit authority');
    if (Date.parse(ticket.expiresAt) <= this.now()) throw conflict('Expired local execution ticket cannot become outstanding work');
  }

  private async mutate(executionIdInput: string, scopeInput: Scope, mutation: Mutation): Promise<WorkflowContinuationSnapshot> {
    const executionId = requireToken(executionIdInput, 'executionId');
    const scope = normalizeScope(scopeInput);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, $2))', [lockKey(scope, executionId), LOCK_SALT]);
      const selected = await client.query(`SELECT ${COLUMNS} FROM workflow_continuations
        WHERE execution_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 FOR UPDATE`,
        [executionId, scope.tenantId, scope.userId, scope.projectId]);
      if (!selected.rows[0]) throw Object.assign(new Error('Workflow continuation not found in authenticated scope'), { code: 'WORKFLOW_CONTINUATION_NOT_FOUND' });
      const snapshot = snapshotFromRow(selected.rows[0]);
      const next = await mutation(snapshot, client);
      if (isSnapshot(next)) {
        await client.query('COMMIT');
        return next;
      }
      const updated = await client.query(`UPDATE workflow_continuations SET
        state=$2,current_step_id=$3,outstanding_ticket_id=$4,outstanding_ticket_version=$5,outstanding_ticket_nonce=$6,
        outstanding_ticket_expires_at=$7,completed_steps_json=$8::jsonb,terminal_artifact_id=$9,failure_code=$10,
        revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE execution_id=$1 AND revision=$11 RETURNING ${COLUMNS}`,
        [executionId, next.state, next.currentStepId ?? null, next.outstandingLocal?.ticketId ?? null, next.outstandingLocal?.ticketVersion ?? null,
          next.outstandingLocal?.nonce ?? null, next.outstandingLocal?.expiresAt ?? null, JSON.stringify(next.completedSteps), next.terminalArtifactId ?? null,
          next.failureCode ?? null, snapshot.revision]);
      if (updated.rowCount !== 1 || !updated.rows[0]) throw conflict('Workflow continuation compare-and-swap failed');
      await client.query('COMMIT');
      return snapshotFromRow(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function reconcileCreate(stored: WorkflowContinuationSnapshot, candidate: ReturnType<typeof normalizeWorkflowContinuationCreate>): WorkflowContinuationSnapshot {
  if (stored.executionId !== candidate.executionId || stored.clientRequestId !== candidate.clientRequestId || !sameScope(stored.scope, candidate.scope) || !samePlanBinding(stored.plan, candidate.plan)) {
    throw conflict('Scoped client request id is already bound to another workflow continuation');
  }
  return stored;
}

function snapshotFromRow(row: Record<string, unknown>): WorkflowContinuationSnapshot {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Workflow continuation revision is invalid');
  const state = String(row.state) as WorkflowContinuationState;
  if (!['READY','WAITING_FOR_LOCAL_RESULT','RUNNING_INTERNAL','SUCCESS','FAILED','CANCELLED','UNKNOWN'].includes(state)) throw new Error('Workflow continuation state is invalid');
  const completedRaw = row.completed_steps_json;
  if (!Array.isArray(completedRaw)) throw new Error('Workflow continuation completed-step binding is invalid');
  const completedSteps = Object.freeze(completedRaw.map((value, index) => normalizeCompletedBinding(value, index)));
  const outstandingLocal = row.outstanding_ticket_id ? Object.freeze({
    stepId: requireToken(row.current_step_id, 'current_step_id'),
    ticketId: requireToken(row.outstanding_ticket_id, 'outstanding_ticket_id'),
    ticketVersion: requireToken(row.outstanding_ticket_version, 'outstanding_ticket_version'),
    nonce: requireToken(row.outstanding_ticket_nonce, 'outstanding_ticket_nonce'),
    expiresAt: toIsoTimestamp(row.outstanding_ticket_expires_at),
  }) : undefined;
  const snapshot = Object.freeze({
    executionId: requireToken(row.execution_id, 'execution_id'),
    clientRequestId: requireToken(row.client_request_id, 'client_request_id'),
    scope: Object.freeze({ tenantId: requireToken(row.tenant_id, 'tenant_id'), userId: requireToken(row.user_id, 'user_id'), projectId: requireToken(row.project_id, 'project_id') }),
    plan: Object.freeze({ planId: requireToken(row.plan_id, 'plan_id'), planRevision: requireToken(row.plan_revision, 'plan_revision'), planDigest: requireSha256(row.plan_digest, 'plan_digest') }),
    state,
    currentStepId: optionalToken(row.current_step_id),
    outstandingLocal,
    completedSteps,
    terminalArtifactId: optionalToken(row.terminal_artifact_id),
    failureCode: optionalToken(row.failure_code),
    revision,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  }) satisfies WorkflowContinuationSnapshot;
  validateStoredSnapshot(snapshot);
  return snapshot;
}

function normalizeCompletedBinding(value: unknown, index: number): WorkflowCompletedStepBinding {
  if (!value || typeof value !== 'object') throw new Error(`completed_steps_json[${index}] is invalid`);
  const raw = value as Record<string, unknown>;
  return Object.freeze({
    stepId: requireToken(raw.stepId, `completedSteps[${index}].stepId`),
    ticketId: optionalToken(raw.ticketId),
    artifactIds: normalizeArtifactIds(raw.artifactIds as readonly string[]),
  });
}

function validateStoredSnapshot(snapshot: WorkflowContinuationSnapshot): void {
  const stepIds = snapshot.completedSteps.map(step => step.stepId);
  if (new Set(stepIds).size !== stepIds.length) throw new Error('Workflow continuation contains duplicate completed step ids');
  if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
    if (!snapshot.currentStepId || !snapshot.outstandingLocal || snapshot.currentStepId !== snapshot.outstandingLocal.stepId) throw new Error('WAITING_FOR_LOCAL_RESULT snapshot is missing its exact local ticket binding');
  } else if (snapshot.outstandingLocal) throw new Error('Non-waiting workflow continuation retains a local ticket binding');
  if (snapshot.state === 'RUNNING_INTERNAL' && !snapshot.currentStepId) throw new Error('RUNNING_INTERNAL snapshot is missing current step identity');
  if (snapshot.state === 'SUCCESS' && !snapshot.terminalArtifactId) throw new Error('SUCCESS workflow continuation is missing terminal Artifact identity');
}

async function assertTicketFinalizedSuccess(client: PoolClient, ticketId: string): Promise<void> {
  const result = await client.query('SELECT consumed_at,finalized_status FROM local_execution_tickets WHERE ticket_id=$1', [ticketId]);
  const row = result.rows[0];
  if (!row?.consumed_at || row.finalized_status !== 'SUCCESS') throw conflict('Local execution ticket must be durably finalized SUCCESS before workflow binding');
}

function assertMutable(snapshot: WorkflowContinuationSnapshot): void {
  if (isTerminalWorkflowState(snapshot.state)) throw conflict(`Terminal workflow continuation ${snapshot.state} cannot advance`);
}

function sameTicket(a: WorkflowLocalTicketBinding | undefined, b: WorkflowLocalTicketBinding): boolean {
  return Boolean(a && a.stepId === b.stepId && a.ticketId === b.ticketId && a.ticketVersion === b.ticketVersion && a.nonce === b.nonce && a.expiresAt === b.expiresAt);
}

function isSnapshot(value: WorkflowContinuationSnapshot | MutableContinuation): value is WorkflowContinuationSnapshot {
  return 'executionId' in value && 'revision' in value;
}

function lockKey(scope: Scope, executionId: string): string {
  return `${scope.tenantId}\u0000${scope.userId}\u0000${scope.projectId}\u0000${executionId}`;
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { code: 'WORKFLOW_CONTINUATION_CONFLICT' });
}

function requireToken(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function optionalToken(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireSha256(value: unknown, field: string): string {
  const normalized = requireToken(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`${field} must be a SHA-256 digest`);
  return normalized;
}

function toIsoTimestamp(value: unknown): string {
  const milliseconds = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(milliseconds)) throw new Error('Workflow continuation timestamp is invalid');
  return new Date(milliseconds).toISOString();
}
