import type { Pool, PoolClient } from 'pg';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import {
  assertExpectedRevision,
  isTerminalWorkflowState,
  normalizeArtifactIds,
  normalizeContinuationStepId,
  normalizeInputArtifactBindings,
  normalizeScope,
  normalizeTicketBinding,
  normalizeWorkflowContinuationCreate,
  normalizeWorkflowPlanParameters,
  sameInputArtifactBindings,
  samePlanBinding,
  sameScope,
  sameStringSetInOrder,
  type CompleteInternalStepInput,
  type CompleteLocalStepInput,
  type CreateWorkflowContinuationInput,
  type RetryLocalResultInput,
  type RunInternalStepInput,
  type TerminalWorkflowInput,
  type WaitForLocalResultInput,
  type WorkflowCompletedStepBinding,
  type WorkflowContinuationSnapshot,
  type WorkflowContinuationState,
  type WorkflowContinuationStore,
  type WorkflowInputArtifactBinding,
  type WorkflowLocalTicketBinding,
} from './WorkflowContinuationStore.ts';

const COLUMNS = `execution_id,client_request_id,tenant_id,user_id,project_id,plan_id,plan_revision,plan_digest,plan_parameters_json,input_artifacts_json,state,current_step_id,
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

export type WorkflowCurrentProjectSourceGuard = Readonly<{
  storageId: string;
  width: number;
  height: number;
}>;

export type RecoverIssuedLocalResultInput = WaitForLocalResultInput & Readonly<{
  /** Present only when recovering a replacement ticket issued during a retry crash window. */
  previousTicketId?: string;
}>;

/** PostgreSQL authority for durable composite continuation state. It never executes a provider or publishes an Artifact. */
export class PostgresWorkflowContinuationStore implements WorkflowContinuationStore {
  private readonly pool: Pool;
  private readonly now: () => number;

  constructor(pool: Pool, now: () => number = Date.now) {
    this.pool = pool;
    this.now = now;
  }

  async create(input: CreateWorkflowContinuationInput): Promise<WorkflowContinuationSnapshot> {
    const normalized = normalizeWorkflowContinuationCreate(input);
    const inserted = await this.pool.query(`INSERT INTO workflow_continuations
      (execution_id,client_request_id,tenant_id,user_id,project_id,plan_id,plan_revision,plan_digest,input_artifacts_json,plan_parameters_json,state,completed_steps_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'READY','[]'::jsonb)
      ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      [normalized.executionId, normalized.clientRequestId, normalized.scope.tenantId, normalized.scope.userId, normalized.scope.projectId, normalized.plan.planId, normalized.plan.planRevision, normalized.plan.planDigest, JSON.stringify(normalized.inputArtifacts), JSON.stringify(normalized.plan.parameters ?? {})]);
    if (inserted.rows[0]) return snapshotFromRow(inserted.rows[0]);

    const byClient = await this.getByClientRequestId(normalized.scope, normalized.clientRequestId);
    if (byClient) return reconcileCreate(byClient, normalized);
    const byExecution = await this.get(normalized.executionId, normalized.scope);
    if (byExecution) return reconcileCreate(byExecution, normalized);
    throw new Error('Workflow continuation persistence conflict could not be reconciled');
  }

  /**
   * Initial AEE admission boundary. A new continuation is published only while
   * the canonical Project row is locked and still points at the exact admitted
   * source geometry. Existing idempotent continuations replay without requiring
   * the Project cursor to remain on their historical source.
   */
  async createBoundToCurrentProjectSource(
    input: CreateWorkflowContinuationInput,
    sourceGuardInput: WorkflowCurrentProjectSourceGuard,
  ): Promise<WorkflowContinuationSnapshot> {
    const normalized = normalizeWorkflowContinuationCreate(input);
    const sourceGuard = normalizeProjectSourceGuard(sourceGuardInput);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, $2))', [lockKey(normalized.scope, normalized.executionId), LOCK_SALT]);

      const replayByClient = await client.query(`SELECT ${COLUMNS} FROM workflow_continuations
        WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND client_request_id=$4 FOR UPDATE`,
      [normalized.scope.tenantId, normalized.scope.userId, normalized.scope.projectId, normalized.clientRequestId]);
      if (replayByClient.rows[0]) {
        const replay = reconcileCreate(snapshotFromRow(replayByClient.rows[0]), normalized);
        await client.query('COMMIT');
        return replay;
      }

      const project = (await client.query(`SELECT current_image_storage_id,width,height FROM canonical_projects
        WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,
      [normalized.scope.projectId, normalized.scope.tenantId, normalized.scope.userId])).rows[0];
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'WORKFLOW_CONTINUATION_PROJECT_NOT_FOUND' });
      if (String(project.current_image_storage_id) !== sourceGuard.storageId
        || Number(project.width) !== sourceGuard.width || Number(project.height) !== sourceGuard.height) {
        throw Object.assign(new Error('Workflow source is not the current canonical Project IMAGE'), { code: 'WORKFLOW_CONTINUATION_PROJECT_SOURCE_CONFLICT' });
      }

      const replayByExecution = await client.query(`SELECT ${COLUMNS} FROM workflow_continuations
        WHERE execution_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 FOR UPDATE`,
      [normalized.executionId, normalized.scope.tenantId, normalized.scope.userId, normalized.scope.projectId]);
      if (replayByExecution.rows[0]) {
        const replay = reconcileCreate(snapshotFromRow(replayByExecution.rows[0]), normalized);
        await client.query('COMMIT');
        return replay;
      }

      const inserted = await client.query(`INSERT INTO workflow_continuations
        (execution_id,client_request_id,tenant_id,user_id,project_id,plan_id,plan_revision,plan_digest,input_artifacts_json,plan_parameters_json,state,completed_steps_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'READY','[]'::jsonb)
        ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      [normalized.executionId, normalized.clientRequestId, normalized.scope.tenantId, normalized.scope.userId, normalized.scope.projectId,
        normalized.plan.planId, normalized.plan.planRevision, normalized.plan.planDigest, JSON.stringify(normalized.inputArtifacts), JSON.stringify(normalized.plan.parameters ?? {})]);
      if (!inserted.rows[0]) throw conflict('Guarded workflow continuation persistence conflict could not be reconciled');
      const snapshot = snapshotFromRow(inserted.rows[0]);
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
    const continuationStepId = normalizeContinuationStepId(input.continuationStepId, ticket.stepId);
    return this.mutate(input.executionId, input.scope, async (snapshot, client) => {
      if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
        if (sameOutstandingTicket(snapshot.outstandingLocal, ticket, continuationStepId)) return snapshot;
        throw conflict('Workflow is already waiting for a different local execution ticket');
      }
      assertMutable(snapshot);
      if (snapshot.state !== 'READY') throw conflict(`Workflow cannot wait for a local result from state ${snapshot.state}`);
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      if (snapshot.completedSteps.some(step => step.stepId === continuationStepId)) throw conflict('Completed workflow step cannot be reissued as local work');
      await this.assertOutstandingTicket(client, snapshot, ticket);
      return Object.freeze({
        state: 'WAITING_FOR_LOCAL_RESULT',
        currentStepId: continuationStepId,
        outstandingLocal: logicalTicketBinding(continuationStepId, ticket),
        completedSteps: snapshot.completedSteps,
      });
    });
  }

  /**
   * Recovery-only binding for a ticket that was already durably issued before a
   * Core crash but was not yet recorded in the continuation. Unlike the normal
   * wait/retry APIs this may bind an expired or already-finalized exact ticket;
   * it cannot issue work, and the ordinary recovery path immediately decides
   * SUCCESS/FAILED/EXPIRED/UNKNOWN afterwards.
   */
  recoverIssuedLocalResult(input: RecoverIssuedLocalResultInput): Promise<WorkflowContinuationSnapshot> {
    const ticket = normalizeTicketBinding(input.ticket);
    const continuationStepId = normalizeContinuationStepId(input.continuationStepId, ticket.stepId);
    const previousTicketId = input.previousTicketId === undefined ? undefined : requireToken(input.previousTicketId, 'previousTicketId');
    return this.mutate(input.executionId, input.scope, async (snapshot, client) => {
      assertMutable(snapshot);
      if (previousTicketId === undefined) {
        if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT' && sameOutstandingTicket(snapshot.outstandingLocal, ticket, continuationStepId)) return snapshot;
        if (snapshot.state !== 'READY') throw conflict(`Issued-ticket recovery cannot bind from state ${snapshot.state}`);
        assertExpectedRevision(snapshot.revision, input.expectedRevision);
        if (snapshot.completedSteps.some(step => step.stepId === continuationStepId)) throw conflict('Completed workflow step cannot be recovered as outstanding work');
        await this.assertRecoveryTicket(client, snapshot, ticket);
        return Object.freeze({
          state: 'WAITING_FOR_LOCAL_RESULT',
          currentStepId: continuationStepId,
          outstandingLocal: logicalTicketBinding(continuationStepId, ticket),
          completedSteps: snapshot.completedSteps,
        });
      }

      if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || !snapshot.currentStepId) {
        throw conflict('Issued retry recovery requires the exact outstanding previous ticket');
      }
      if (sameOutstandingTicket(snapshot.outstandingLocal, ticket, continuationStepId) && snapshot.outstandingLocal.ticketId !== previousTicketId) return snapshot;
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      const current = snapshot.outstandingLocal;
      if (current.ticketId !== previousTicketId) throw conflict('Issued retry recovery previous ticket does not match durable outstanding work');
      if (ticket.ticketId === previousTicketId) throw conflict('Issued retry recovery must bind a replacement ticket');
      if (continuationStepId !== current.stepId || continuationStepId !== snapshot.currentStepId) throw conflict('Issued retry recovery cannot change the durable workflow step');
      const previousOperationStepId = await this.assertRetryablePreviousTicket(client, snapshot, current);
      await this.assertRecoveryTicket(client, snapshot, ticket);
      if (ticket.stepId !== previousOperationStepId) throw conflict('Issued retry recovery cannot change the underlying local operation step');
      return Object.freeze({
        state: 'WAITING_FOR_LOCAL_RESULT',
        currentStepId: continuationStepId,
        outstandingLocal: logicalTicketBinding(continuationStepId, ticket),
        completedSteps: snapshot.completedSteps,
      });
    });
  }

  retryLocalResult(input: RetryLocalResultInput): Promise<WorkflowContinuationSnapshot> {
    const previousTicketId = requireToken(input.previousTicketId, 'previousTicketId');
    const ticket = normalizeTicketBinding(input.ticket);
    const continuationStepId = normalizeContinuationStepId(input.continuationStepId, ticket.stepId);
    return this.mutate(input.executionId, input.scope, async (snapshot, client) => {
      assertMutable(snapshot);
      if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || !snapshot.currentStepId) {
        throw conflict('Workflow can retry local work only while waiting for an exact outstanding ticket');
      }
      if (sameOutstandingTicket(snapshot.outstandingLocal, ticket, continuationStepId) && snapshot.outstandingLocal.ticketId !== previousTicketId) {
        return snapshot;
      }
      assertExpectedRevision(snapshot.revision, input.expectedRevision);
      const current = snapshot.outstandingLocal;
      if (current.ticketId !== previousTicketId) throw conflict('Local retry previous ticket does not match the durable outstanding attempt');
      if (ticket.ticketId === previousTicketId) throw conflict('Local retry must use a new Core-issued ticket identity');
      if (continuationStepId !== current.stepId || continuationStepId !== snapshot.currentStepId) throw conflict('Local retry cannot change the durable workflow step');
      if (snapshot.completedSteps.some(step => step.stepId === continuationStepId)) throw conflict('Completed workflow step cannot be retried');
      const previousOperationStepId = await this.assertRetryablePreviousTicket(client, snapshot, current);
      await this.assertOutstandingTicket(client, snapshot, ticket);
      if (ticket.stepId !== previousOperationStepId) throw conflict('Local retry cannot change the underlying local operation step');
      return Object.freeze({
        state: 'WAITING_FOR_LOCAL_RESULT',
        currentStepId: continuationStepId,
        outstandingLocal: logicalTicketBinding(continuationStepId, ticket),
        completedSteps: snapshot.completedSteps,
      });
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
      if (snapshot.state === 'RUNNING_INTERNAL' && snapshot.currentStepId === stepId) return snapshot;
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
      const latest = snapshot.completedSteps.at(-1);
      if (!latest?.artifactIds.includes(terminalArtifactId)) throw conflict('Terminal Artifact is not bound to the latest completed workflow step');
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

  private async assertRecoveryTicket(client: PoolClient, snapshot: WorkflowContinuationSnapshot, ticket: WorkflowLocalTicketBinding): Promise<Record<string, unknown>> {
    const result = await client.query(`SELECT ticket_id,tenant_id,user_id,project_id,workflow_id,step_id,ticket_json,consumed_at,finalized_status
      FROM local_execution_tickets WHERE ticket_id=$1`, [ticket.ticketId]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw conflict('Recovery local execution ticket is not durable');
    if (row.tenant_id !== snapshot.scope.tenantId || row.user_id !== snapshot.scope.userId || row.project_id !== snapshot.scope.projectId || row.workflow_id !== snapshot.executionId || row.step_id !== ticket.stepId) {
      throw conflict('Local execution ticket scope/workflow/operation binding does not match the continuation');
    }
    const durable = row.ticket_json as Record<string, unknown>;
    if (String(durable.version) !== ticket.ticketVersion || durable.nonce !== ticket.nonce || toIsoTimestamp(durable.expiresAt) !== ticket.expiresAt) throw conflict('Local execution ticket identity does not match its durable ledger');
    if (durable.policy !== 'LOCAL_ONLY') throw conflict('Composite continuation only admits LOCAL_ONLY execution tickets');
    const cost = durable.cost as Record<string, unknown> | undefined;
    if (cost?.providerCalls !== 0 || cost?.paidCloudCredits !== 0) throw conflict('Local composite step contains forbidden provider or paid-credit authority');
    assertTicketInputsBound(snapshot, durable.inputs);
    return row;
  }

  private async assertOutstandingTicket(client: PoolClient, snapshot: WorkflowContinuationSnapshot, ticket: WorkflowLocalTicketBinding): Promise<void> {
    const row = await this.assertRecoveryTicket(client, snapshot, ticket);
    if (row.consumed_at) throw conflict('Consumed local execution ticket cannot be issued as outstanding work');
    if (Date.parse(ticket.expiresAt) <= this.now()) throw conflict('Expired local execution ticket cannot become outstanding work');
  }

  private async assertRetryablePreviousTicket(client: PoolClient, snapshot: WorkflowContinuationSnapshot, ticket: WorkflowLocalTicketBinding): Promise<string> {
    const result = await client.query(`SELECT ticket_id,tenant_id,user_id,project_id,workflow_id,step_id,ticket_json,consumed_at,finalized_status
      FROM local_execution_tickets WHERE ticket_id=$1`, [ticket.ticketId]);
    const row = result.rows[0];
    if (!row) throw conflict('Previous local execution ticket is not durable');
    if (row.tenant_id !== snapshot.scope.tenantId || row.user_id !== snapshot.scope.userId || row.project_id !== snapshot.scope.projectId || row.workflow_id !== snapshot.executionId) {
      throw conflict('Previous local execution ticket no longer matches workflow scope authority');
    }
    const operationStepId = requireToken(row.step_id, 'previous ticket operation step');
    const durable = row.ticket_json as Record<string, unknown>;
    if (String(durable.version) !== ticket.ticketVersion || durable.nonce !== ticket.nonce || toIsoTimestamp(durable.expiresAt) !== ticket.expiresAt) {
      throw conflict('Previous local execution ticket identity no longer matches its durable ledger');
    }
    if (row.consumed_at) {
      if (row.finalized_status === 'FAILED') return operationStepId;
      if (row.finalized_status === 'SUCCESS') throw conflict('Successful local execution ticket must be reconciled instead of retried');
      throw conflict('Consumed local execution ticket without deterministic FAILED finalization cannot be retried');
    }
    if (Date.parse(ticket.expiresAt) > this.now()) throw conflict('Unexpired outstanding local execution ticket cannot be duplicated by retry');
    return operationStepId;
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
  if (stored.executionId !== candidate.executionId || stored.clientRequestId !== candidate.clientRequestId || !sameScope(stored.scope, candidate.scope) || !samePlanBinding(stored.plan, candidate.plan) || !sameInputArtifactBindings(stored.inputArtifacts, candidate.inputArtifacts)) {
    throw conflict('Scoped client request id is already bound to another workflow continuation');
  }
  return stored;
}

function snapshotFromRow(row: Record<string, unknown>): WorkflowContinuationSnapshot {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Workflow continuation revision is invalid');
  const state = String(row.state) as WorkflowContinuationState;
  if (!['READY','WAITING_FOR_LOCAL_RESULT','RUNNING_INTERNAL','SUCCESS','FAILED','CANCELLED','UNKNOWN'].includes(state)) throw new Error('Workflow continuation state is invalid');
  const inputRaw = row.input_artifacts_json;
  if (!Array.isArray(inputRaw)) throw new Error('Workflow continuation input Artifact binding is invalid');
  const inputArtifacts = normalizeInputArtifactBindings(inputRaw as readonly WorkflowInputArtifactBinding[]);
  const planParameters = normalizeWorkflowPlanParameters(row.plan_parameters_json);
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
    plan: Object.freeze({
      planId: requireToken(row.plan_id, 'plan_id'),
      planRevision: requireToken(row.plan_revision, 'plan_revision'),
      planDigest: requireSha256(row.plan_digest, 'plan_digest'),
      ...(planParameters === undefined ? {} : { parameters: planParameters }),
    }),
    inputArtifacts,
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
  if (!snapshot.inputArtifacts.length) throw new Error('Workflow continuation has no immutable canonical input Artifact bindings');
  const stepIds = snapshot.completedSteps.map(step => step.stepId);
  if (new Set(stepIds).size !== stepIds.length) throw new Error('Workflow continuation contains duplicate completed step ids');
  if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
    if (!snapshot.currentStepId || !snapshot.outstandingLocal || snapshot.currentStepId !== snapshot.outstandingLocal.stepId) throw new Error('WAITING_FOR_LOCAL_RESULT snapshot is missing its exact local ticket binding');
  } else if (snapshot.outstandingLocal) throw new Error('Non-waiting workflow continuation retains a local ticket binding');
  if (snapshot.state === 'RUNNING_INTERNAL' && !snapshot.currentStepId) throw new Error('RUNNING_INTERNAL snapshot is missing current step identity');
  if (snapshot.state === 'SUCCESS' && !snapshot.terminalArtifactId) throw new Error('SUCCESS workflow continuation is missing terminal Artifact identity');
}

function assertTicketInputsBound(snapshot: WorkflowContinuationSnapshot, value: unknown): void {
  if (!Array.isArray(value) || value.length < 1) throw conflict('Local execution ticket has no durable canonical input bindings');
  const roots = new Map(snapshot.inputArtifacts.map(binding => [binding.artifactId, binding]));
  const allowed = new Set([
    ...roots.keys(),
    ...snapshot.completedSteps.flatMap(step => step.artifactIds),
  ]);
  const seen = new Set<string>();
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object') throw conflict(`Local execution ticket input ${index} is invalid`);
    const binding = raw as Record<string, unknown>;
    const artifactId = requireToken(binding.artifactId, `ticket.inputs[${index}].artifactId`);
    if (seen.has(artifactId)) throw conflict('Local execution ticket contains duplicate canonical input bindings');
    seen.add(artifactId);
    if (!allowed.has(artifactId)) throw conflict('Local execution ticket input is not bound to a workflow root or completed dependency');
    const root = roots.get(artifactId);
    if (root) {
      if (binding.kind !== root.kind || binding.role !== root.role || requireSha256(binding.sha256, `ticket.inputs[${index}].sha256`) !== root.sha256) {
        throw conflict('Local execution ticket root input integrity does not match the durable workflow binding');
      }
    }
  }
}

async function assertTicketFinalizedSuccess(client: PoolClient, ticketId: string): Promise<void> {
  const result = await client.query('SELECT consumed_at,finalized_status FROM local_execution_tickets WHERE ticket_id=$1', [ticketId]);
  const row = result.rows[0];
  if (!row?.consumed_at || row.finalized_status !== 'SUCCESS') throw conflict('Local execution ticket must be durably finalized SUCCESS before workflow binding');
}

function logicalTicketBinding(continuationStepId: string, ticket: WorkflowLocalTicketBinding): WorkflowLocalTicketBinding {
  return Object.freeze({
    stepId: continuationStepId,
    ticketId: ticket.ticketId,
    ticketVersion: ticket.ticketVersion,
    nonce: ticket.nonce,
    expiresAt: ticket.expiresAt,
  });
}

function normalizeProjectSourceGuard(value: WorkflowCurrentProjectSourceGuard): WorkflowCurrentProjectSourceGuard {
  const storageId = requireToken(value?.storageId, 'sourceGuard.storageId');
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) throw new Error('sourceGuard geometry is invalid');
  return Object.freeze({ storageId, width, height });
}

function assertMutable(snapshot: WorkflowContinuationSnapshot): void {
  if (isTerminalWorkflowState(snapshot.state)) throw conflict(`Terminal workflow continuation ${snapshot.state} cannot advance`);
}

function sameOutstandingTicket(a: WorkflowLocalTicketBinding | undefined, ticket: WorkflowLocalTicketBinding, continuationStepId: string): boolean {
  return Boolean(a
    && a.stepId === continuationStepId
    && a.ticketId === ticket.ticketId
    && a.ticketVersion === ticket.ticketVersion
    && a.nonce === ticket.nonce
    && a.expiresAt === ticket.expiresAt);
}

function isSnapshot(value: WorkflowContinuationSnapshot | MutableContinuation): value is WorkflowContinuationSnapshot {
  return 'executionId' in value && 'revision' in value;
}

function lockKey(scope: Scope, executionId: string): string {
  return JSON.stringify(['workflow-continuation-v1', scope.tenantId, scope.userId, scope.projectId, executionId]);
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { code: 'WORKFLOW_CONTINUATION_CONFLICT' });
}

function requireToken(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
function optionalToken(value: unknown): string | undefined { if (value === undefined || value === null || value === '') return undefined; return requireToken(value, 'optional token'); }
function requireSha256(value: unknown, field: string): string { const normalized = requireToken(value, field).toLowerCase(); if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`${field} must be a SHA-256 digest`); return normalized; }
function toIsoTimestamp(value: unknown): string { const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : String(value)); if (!Number.isFinite(date.getTime())) throw new Error('Workflow continuation timestamp is invalid'); return date.toISOString(); }
