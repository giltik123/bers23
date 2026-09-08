import { createHash } from 'node:crypto';
import type { LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import {
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_STEP_ID,
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
  type OrthogonalTransformMode,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_CAPABILITY, RESIZE_STEP_ID, normalizeResizeDimensions } from '../../../src/platform/creative/deterministic/Resize.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { DurableResolvedArtifact } from '../artifacts/durableArtifactLineageResolver.ts';
import type { ExecutionRun, ExecutionRunRegistry } from '../execution/executionRunRegistry.ts';
import type { DeterministicWorkflowStepFinalRecoveryAuthority } from '../localExecution/DeterministicWorkflowStepFinalRecoveryAuthority.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import type { LocalOrthogonalTransformExecutionService } from '../localExecution/LocalOrthogonalTransformExecutionService.ts';
import type { LocalResizeExecutionService } from '../localExecution/LocalResizeExecutionService.ts';
import type { PostgresProjectStore } from '../projects/postgresProjectStore.ts';
import {
  normalizeScope,
  sameInputArtifactBindings,
  samePlanBinding,
  type WorkflowContinuationSnapshot,
  type WorkflowContinuationStore,
  type WorkflowInputArtifactBinding,
  type WorkflowPlanBinding,
} from './WorkflowContinuationStore.ts';
import { projectWorkflowLocalExecutionAttempt } from './WorkflowLocalExecutionAttemptRunProjection.ts';
import type { WorkflowBoundLocalExecutionTicketV2Issuer } from './WorkflowBoundLocalExecutionTicketV2Issuer.ts';

export const BOUNDED_AGENT_PLAN_ID = 'bounded-agent-deterministic-orthogonal-resize' as const;
export const BOUNDED_AGENT_PLAN_REVISION = '1' as const;
export const BOUNDED_AGENT_VERIFY_STEP_ID = 'agent-deterministic-03-verify' as const;
export const BOUNDED_AGENT_LOCAL_STEPS = Object.freeze([ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID] as const);

const PLAN_DIGEST_DOMAIN = 'bers:bounded-agent-deterministic:plan:v1\0';
const EXECUTION_ID_DOMAIN = 'bers:bounded-agent-deterministic:execution:v1\0';
const CHILD_REQUEST_DOMAIN = 'bers:bounded-agent-deterministic:child:v1\0';
const RETRY_REQUEST_DOMAIN = 'bers:bounded-agent-deterministic:retry:v1\0';
const INTERNAL_CHILD_PREFIX = 'workflow-internal';
const RUN_CHILD_LIMIT = 64;

type LocalStepId = typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID;
type PlanParameters = Readonly<{ mode: OrthogonalTransformMode; width: number; height: number }>;

export type BoundedAgentStartCommand = Readonly<{
  clientRequestId: string;
  projectId: string;
  sourceArtifactId: string;
  mode: OrthogonalTransformMode;
  width: number;
  height: number;
}>;

export type BoundedAgentLocalAction = Readonly<{
  type: 'LOCAL_EXECUTION';
  operation: 'ORTHOGONAL_TRANSFORM' | 'RESIZE';
  ticket: LocalExecutionTicketV2;
}>;

export type BoundedAgentWorkflowView = Readonly<{
  executionId: string;
  revision: number;
  state: WorkflowContinuationSnapshot['state'];
  nextAction?: BoundedAgentLocalAction;
  retryAvailable?: boolean;
  attemptStatus?: 'FAILED' | 'EXPIRED';
  terminalArtifactId?: string;
  failureCode?: string;
}>;

type TicketReader = Pick<LocalExecutionLedgerV2, 'getV2' | 'getByIdempotencyKeyV2' | 'getFinalization'>;
type OrthogonalPort = Pick<LocalOrthogonalTransformExecutionService, 'prepare' | 'submit'>;
type ResizePort = Pick<LocalResizeExecutionService, 'prepare' | 'submit'>;
type ProjectReader = Pick<PostgresProjectStore, 'get'>;
type ArtifactResolver = Readonly<{ resolve(scope: Scope, artifactId: string): Promise<DurableResolvedArtifact> }>;
type FinalRecovery = Pick<DeterministicWorkflowStepFinalRecoveryAuthority, 'recover'>;

export type BoundedAgentDeterministicWorkflowDependencies = Readonly<{
  continuations: WorkflowContinuationStore;
  tickets: TicketReader;
  workflowTickets: WorkflowBoundLocalExecutionTicketV2Issuer;
  orthogonal: OrthogonalPort;
  resize: ResizePort;
  finalRecovery: FinalRecovery;
  artifacts: ArtifactResolver;
  projects: ProjectReader;
  runs: ExecutionRunRegistry;
  now?: () => number;
}>;

/**
 * Fixed, server-owned Agent v1: ORTHOGONAL_TRANSFORM -> RESIZE -> INTERNAL verify.
 * Browser callers never select step ids, capabilities, executors, ticket identity,
 * retry identity or intermediate Artifact ids. Project mutation remains outside
 * this service and requires the existing explicit Accept FINAL path.
 */
export class BoundedAgentDeterministicWorkflowService {
  private readonly dependencies: BoundedAgentDeterministicWorkflowDependencies;
  private readonly now: () => number;

  constructor(dependencies: BoundedAgentDeterministicWorkflowDependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? Date.now;
  }

  async start(commandInput: BoundedAgentStartCommand, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const preliminary = normalizeStartShape(commandInput);
    const scope = normalizeScope({ ...auth, projectId: preliminary.projectId });
    const root = await this.dependencies.artifacts.resolve(scope, preliminary.sourceArtifactId);
    assertImage(root, 'bounded_agent_root_contract', 'Bounded Agent source must be a durable canonical IMAGE');
    const command = normalizeStartGeometry(preliminary, root);
    const executionId = executionIdFor(scope, command.clientRequestId);
    const createInput = Object.freeze({
      executionId,
      clientRequestId: command.clientRequestId,
      scope,
      plan: planBinding(root, command),
      inputArtifacts: Object.freeze([workflowBinding(root)]),
    });

    const existing = await this.dependencies.continuations.getByClientRequestId(scope, command.clientRequestId);
    if (existing) {
      const reconciled = await this.dependencies.continuations.create(createInput);
      await this.assertSnapshotAuthority(reconciled);
      return this.advance(reconciled, auth);
    }

    await this.assertCurrentProjectSource(auth, scope, root);
    // Ticket first: a process crash after issuance but before continuation insert
    // is recovered by the deterministic idempotency key on the next start call.
    const firstTicket = await this.loadOrIssueTicket(executionId, scope, createInput.plan, root, ORTHOGONAL_TRANSFORM_STEP_ID, undefined, auth);
    let snapshot = await this.dependencies.continuations.create(createInput);
    await this.ensureParentRunning(snapshot);
    if (snapshot.state === 'READY' && snapshot.completedSteps.length === 0) {
      snapshot = await this.dependencies.continuations.waitForLocalResult({
        executionId,
        scope,
        expectedRevision: snapshot.revision,
        ticket: ticketBinding(firstTicket),
      });
    }
    await this.reconcileRuns(snapshot);
    return this.advance(snapshot, auth);
  }

  async resume(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    const snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    await this.assertSnapshotAuthority(snapshot);
    return this.advance(snapshot, auth);
  }

  async submitLocalResult(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope, result: unknown): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    let snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    await this.assertSnapshotAuthority(snapshot);
    const ticketId = resultTicketId(result);

    const completed = snapshot.completedSteps.find(step => step.ticketId === ticketId);
    if (completed) {
      const ticket = await this.requireTicket(ticketId, snapshot, completed.stepId);
      const recovery = await this.recoverTicket(snapshot, ticket, auth);
      if (recovery.status !== 'SUCCESS' || !completed.artifactIds.includes(recovery.artifactId)) {
        throw serviceError(409, 'bounded_agent_result_replay_mismatch', 'Completed Agent result replay does not match durable SUCCESS');
      }
      await this.validateStepArtifact(snapshot, requireLocalStep(completed.stepId), recovery.artifactId);
      return this.advance(snapshot, auth);
    }

    if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || snapshot.outstandingLocal.ticketId !== ticketId) {
      throw serviceError(409, 'bounded_agent_result_not_outstanding', 'Submitted local result is not the Core-selected outstanding Agent step');
    }
    const stepId = requireLocalStep(snapshot.currentStepId);
    const ticket = await this.requireTicket(ticketId, snapshot, stepId);
    const recovered = await this.recoverTicket(snapshot, ticket, auth);
    if (recovered.status === 'SUCCESS') {
      snapshot = await this.completeRecoveredSuccess(snapshot, ticket, recovered.artifactId);
      await this.reconcileRuns(snapshot);
      return this.advance(snapshot, auth);
    }
    if (recovered.status === 'UNKNOWN') return this.terminalizeUnknown(snapshot, stepId);
    if (recovered.status === 'FAILED') return retryView(snapshot, 'FAILED');
    if (this.now() >= ticket.expiresAt) return retryView(snapshot, 'EXPIRED');

    const submission = stepId === ORTHOGONAL_TRANSFORM_STEP_ID
      ? await this.dependencies.orthogonal.submit({ ticketId, projectId: scope.projectId, result }, auth)
      : await this.dependencies.resize.submit({ ticketId, projectId: scope.projectId, result }, auth);
    if (submission.status === 'FAILED') return retryView(snapshot, 'FAILED');
    if (submission.status === 'UNKNOWN') return this.terminalizeUnknown(snapshot, stepId);
    if (submission.status !== 'SUCCESS' || !submission.artifactId) {
      throw serviceError(409, 'bounded_agent_local_submission_incomplete', 'Deterministic Agent step did not produce a canonical SUCCESS Artifact');
    }
    await this.validateStepArtifact(snapshot, stepId, submission.artifactId);
    snapshot = await this.dependencies.continuations.completeLocalStep({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      stepId,
      ticketId,
      artifactIds: Object.freeze([submission.artifactId]),
    });
    await this.reconcileRuns(snapshot);
    return this.advance(snapshot, auth);
  }

  async retry(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    let snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    await this.assertSnapshotAuthority(snapshot);
    if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal) {
      throw serviceError(409, 'bounded_agent_retry_state', 'Bounded Agent can retry only the exact outstanding local step');
    }
    const stepId = requireLocalStep(snapshot.currentStepId);
    const previous = await this.requireTicket(snapshot.outstandingLocal.ticketId, snapshot, stepId);
    const recovery = await this.recoverTicket(snapshot, previous, auth);
    if (recovery.status === 'SUCCESS') {
      snapshot = await this.completeRecoveredSuccess(snapshot, previous, recovery.artifactId);
      await this.reconcileRuns(snapshot);
      return this.advance(snapshot, auth);
    }
    if (recovery.status === 'UNKNOWN') return this.terminalizeUnknown(snapshot, stepId);
    if (recovery.status === 'PENDING' && this.now() < previous.expiresAt) {
      throw serviceError(409, 'bounded_agent_retry_not_available', 'Current Agent local attempt is still active');
    }

    const source = await this.sourceForStep(snapshot, stepId);
    const replacement = await this.loadOrIssueTicket(snapshot.executionId, snapshot.scope, snapshot.plan, source, stepId, previous.ticketId, auth);
    snapshot = await this.dependencies.continuations.retryLocalResult({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      previousTicketId: previous.ticketId,
      ticket: ticketBinding(replacement),
    });
    await this.reconcileRuns(snapshot);
    return this.advance(snapshot, auth);
  }

  async cancel(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    let snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    await this.assertSnapshotAuthority(snapshot);
    if (snapshot.state === 'CANCELLED') return terminalView(snapshot);
    if (isTerminal(snapshot.state)) throw serviceError(409, 'bounded_agent_cancel_terminal', `Bounded Agent workflow is already ${snapshot.state}`);
    await this.reconcileRuns(snapshot);
    snapshot = await this.dependencies.continuations.cancel({ executionId: snapshot.executionId, scope, expectedRevision: snapshot.revision });
    await this.reconcileRuns(snapshot);
    return terminalView(snapshot);
  }

  private async advance(initial: WorkflowContinuationSnapshot, auth: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    let snapshot = initial;
    for (let guard = 0; guard < 10; guard += 1) {
      await this.assertSnapshotAuthority(snapshot);
      if (isTerminal(snapshot.state)) {
        await this.reconcileRuns(snapshot);
        return terminalView(snapshot);
      }
      if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
        if (!snapshot.outstandingLocal) throw serviceError(409, 'bounded_agent_ticket_binding_missing', 'Waiting Agent workflow has no durable local ticket binding');
        const stepId = requireLocalStep(snapshot.currentStepId);
        const ticket = await this.requireTicket(snapshot.outstandingLocal.ticketId, snapshot, stepId);
        await this.reconcileRuns(snapshot);
        const recovery = await this.recoverTicket(snapshot, ticket, auth);
        if (recovery.status === 'SUCCESS') {
          snapshot = await this.completeRecoveredSuccess(snapshot, ticket, recovery.artifactId);
          await this.reconcileRuns(snapshot);
          continue;
        }
        if (recovery.status === 'UNKNOWN') {
          snapshot = await this.markUnknown(snapshot, stepId);
          await this.reconcileRuns(snapshot);
          continue;
        }
        if (recovery.status === 'FAILED') return retryView(snapshot, 'FAILED');
        if (this.now() >= ticket.expiresAt) return retryView(snapshot, 'EXPIRED');
        return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, nextAction: Object.freeze({ type: 'LOCAL_EXECUTION' as const, operation: operationFor(stepId), ticket }) });
      }
      if (snapshot.state === 'RUNNING_INTERNAL') {
        if (snapshot.currentStepId !== BOUNDED_AGENT_VERIFY_STEP_ID) throw serviceError(409, 'bounded_agent_internal_step_contract', 'Unsupported bounded Agent internal step');
        await this.reconcileRuns(snapshot);
        const terminalArtifactId = completedArtifactId(snapshot, RESIZE_STEP_ID);
        await this.verifyTerminalArtifact(snapshot, terminalArtifactId);
        snapshot = await this.dependencies.continuations.completeInternalStep({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, stepId: BOUNDED_AGENT_VERIFY_STEP_ID, artifactIds: Object.freeze([terminalArtifactId]) });
        await this.reconcileRuns(snapshot);
        continue;
      }
      if (snapshot.state !== 'READY') throw serviceError(409, 'bounded_agent_state_contract', `Unsupported bounded Agent state ${snapshot.state}`);

      const steps = snapshot.completedSteps.map(step => step.stepId);
      if (steps.length === 0) {
        const root = await this.resolveImmutableRoot(snapshot);
        const ticket = await this.loadOrIssueTicket(snapshot.executionId, snapshot.scope, snapshot.plan, root, ORTHOGONAL_TRANSFORM_STEP_ID, undefined, auth);
        snapshot = await this.dependencies.continuations.waitForLocalResult({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, ticket: ticketBinding(ticket) });
        await this.reconcileRuns(snapshot);
        continue;
      }
      if (sameSteps(steps, [ORTHOGONAL_TRANSFORM_STEP_ID])) {
        const source = await this.sourceForStep(snapshot, RESIZE_STEP_ID);
        const ticket = await this.loadOrIssueTicket(snapshot.executionId, snapshot.scope, snapshot.plan, source, RESIZE_STEP_ID, undefined, auth);
        snapshot = await this.dependencies.continuations.waitForLocalResult({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, ticket: ticketBinding(ticket) });
        await this.reconcileRuns(snapshot);
        continue;
      }
      if (sameSteps(steps, [ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID])) {
        snapshot = await this.dependencies.continuations.runInternalStep({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, stepId: BOUNDED_AGENT_VERIFY_STEP_ID });
        await this.reconcileRuns(snapshot);
        continue;
      }
      if (sameSteps(steps, [ORTHOGONAL_TRANSFORM_STEP_ID, RESIZE_STEP_ID, BOUNDED_AGENT_VERIFY_STEP_ID])) {
        const terminalArtifactId = completedArtifactId(snapshot, BOUNDED_AGENT_VERIFY_STEP_ID);
        snapshot = await this.dependencies.continuations.succeed({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, terminalArtifactId });
        await this.reconcileRuns(snapshot);
        continue;
      }
      throw serviceError(409, 'bounded_agent_step_order', 'Durable Agent step order does not match the fixed v1 plan');
    }
    throw serviceError(500, 'bounded_agent_advance_guard', 'Bounded Agent workflow exceeded the fixed advance loop');
  }

  private async loadOrIssueTicket(workflowId: string, scope: Scope, plan: WorkflowPlanBinding, source: DurableResolvedArtifact, stepId: LocalStepId, retryOfTicketId: string | undefined, auth: AuthenticatedScope): Promise<LocalExecutionTicketV2> {
    const parameters = requirePlanParameters(plan);
    const childClientRequestId = childRequestIdFor(workflowId, stepId, retryOfTicketId);
    const idempotencyKey = deterministicTicketIdempotencyKey(childClientRequestId, stepId);
    const durable = await this.dependencies.tickets.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.assertTicketAuthority(durable, workflowId, scope, stepId, idempotencyKey, source, parameters, auth);
      return durable;
    }
    const prepared = await this.dependencies.workflowTickets.withWorkflowBinding({ scope, workflowId, allowedStepIds: [stepId] }, async () => {
      if (stepId === ORTHOGONAL_TRANSFORM_STEP_ID) {
        return this.dependencies.orthogonal.prepare({ projectId: scope.projectId, sourceArtifactId: source.artifactId, clientRequestId: childClientRequestId, mode: parameters.mode }, auth);
      }
      return this.dependencies.resize.prepare({ projectId: scope.projectId, sourceArtifactId: source.artifactId, clientRequestId: childClientRequestId, width: parameters.width, height: parameters.height }, auth);
    });
    if (prepared.executionId !== childExecutionIdFor(scope, childClientRequestId, stepId)) throw serviceError(500, 'bounded_agent_child_execution_identity', 'Deterministic child service returned an unexpected execution identity');
    await this.assertTicketAuthority(prepared.ticket, workflowId, scope, stepId, idempotencyKey, source, parameters, auth);
    return prepared.ticket;
  }

  private async assertTicketAuthority(ticket: LocalExecutionTicketV2, workflowId: string, scope: Scope, stepId: LocalStepId, idempotencyKey: string, source: DurableResolvedArtifact, parameters: PlanParameters, auth: AuthenticatedScope): Promise<void> {
    if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.workflowId !== workflowId || ticket.stepId !== stepId || ticket.idempotencyKey !== idempotencyKey
      || ticket.scope.tenantId !== scope.tenantId || ticket.scope.userId !== scope.userId || ticket.scope.projectId !== scope.projectId
      || ticket.policy !== 'LOCAL_ONLY' || ticket.cost.providerCalls !== 0 || ticket.cost.paidCloudCredits !== 0) {
      throw serviceError(409, 'bounded_agent_ticket_contract', 'Deterministic child ticket does not match bounded Agent authority');
    }
    if (ticket.idempotencyKey !== deterministicTicketIdempotencyKey(ticket.requestId.replace(/^agent-child-[^-]+-/, ticket.requestId.startsWith(`agent-child-${stepId}-`) ? `agent-child-${stepId}-` : ''), stepId)) {
      // The exact canonical service key is asserted independently below through
      // the expected idempotencyKey argument. This guard only rejects empty or
      // malformed request identity before terminal recovery.
      if (!ticket.requestId.trim()) throw serviceError(409, 'bounded_agent_ticket_request_contract', 'Deterministic child ticket request identity is invalid');
    }
    const recovery = await this.dependencies.finalRecovery.recover(recoveryBinding(workflowId, ticket, source, parameters, stepId), auth);
    if (recovery.status === 'SUCCESS') await this.validateArtifact(scope, stepId, source, recovery.artifactId, parameters);
  }

  private async recoverTicket(snapshot: WorkflowContinuationSnapshot, ticket: LocalExecutionTicketV2, auth: AuthenticatedScope) {
    const stepId = requireLocalStep(ticket.stepId);
    const source = await this.sourceForStep(snapshot, stepId);
    return this.dependencies.finalRecovery.recover(recoveryBinding(snapshot.executionId, ticket, source, requirePlanParameters(snapshot.plan), stepId), auth);
  }

  private async requireTicket(ticketId: string, snapshot: WorkflowContinuationSnapshot, stepIdInput: string): Promise<LocalExecutionTicketV2> {
    const stepId = requireLocalStep(stepIdInput);
    const ticket = await this.dependencies.tickets.getV2(ticketId);
    if (!ticket) throw serviceError(409, 'bounded_agent_ticket_unavailable', 'Durable Agent local ticket is unavailable');
    const outstanding = snapshot.outstandingLocal?.ticketId === ticketId ? snapshot.outstandingLocal : undefined;
    const completed = snapshot.completedSteps.find(step => step.ticketId === ticketId);
    if (!outstanding && !completed) throw serviceError(409, 'bounded_agent_ticket_binding_mismatch', 'Ticket is not bound to this durable Agent workflow');
    if (ticket.workflowId !== snapshot.executionId || ticket.stepId !== stepId || ticket.scope.tenantId !== snapshot.scope.tenantId || ticket.scope.userId !== snapshot.scope.userId || ticket.scope.projectId !== snapshot.scope.projectId) {
      throw serviceError(409, 'bounded_agent_ticket_binding_mismatch', 'Durable ticket scope/workflow/step binding changed');
    }
    if (outstanding && (outstanding.ticketVersion !== ticket.version || outstanding.nonce !== ticket.nonce || outstanding.expiresAt !== new Date(ticket.expiresAt).toISOString())) {
      throw serviceError(409, 'bounded_agent_ticket_identity_mismatch', 'Outstanding ticket identity changed after continuation persistence');
    }
    return ticket;
  }

  private async completeRecoveredSuccess(snapshot: WorkflowContinuationSnapshot, ticket: LocalExecutionTicketV2, artifactId: string): Promise<WorkflowContinuationSnapshot> {
    const stepId = requireLocalStep(ticket.stepId);
    await this.validateStepArtifact(snapshot, stepId, artifactId);
    return this.dependencies.continuations.completeLocalStep({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, stepId, ticketId: ticket.ticketId, artifactIds: Object.freeze([artifactId]) });
  }

  private async validateStepArtifact(snapshot: WorkflowContinuationSnapshot, stepId: LocalStepId, artifactId: string): Promise<void> {
    const source = await this.sourceForStep(snapshot, stepId);
    await this.validateArtifact(snapshot.scope, stepId, source, artifactId, requirePlanParameters(snapshot.plan));
  }

  private async validateArtifact(scope: Scope, stepId: LocalStepId, source: DurableResolvedArtifact, artifactId: string, parameters: PlanParameters): Promise<void> {
    const artifact = await this.dependencies.artifacts.resolve(scope, artifactId);
    assertImage(artifact, 'bounded_agent_result_artifact_contract', 'Agent result is not a durable canonical IMAGE');
    const geometry = stepId === ORTHOGONAL_TRANSFORM_STEP_ID
      ? orthogonalTransformOutputGeometry(source.width, source.height, parameters.mode)
      : Object.freeze({ width: parameters.width, height: parameters.height });
    if (artifact.role !== 'COMPOSITE' || artifact.width !== geometry.width || artifact.height !== geometry.height
      || artifact.parentArtifactIds.length !== 1 || artifact.parentArtifactIds[0] !== source.artifactId) {
      throw serviceError(409, 'bounded_agent_result_lineage', 'Agent result does not match exact source lineage and output geometry');
    }
  }

  private async sourceForStep(snapshot: WorkflowContinuationSnapshot, stepId: LocalStepId): Promise<DurableResolvedArtifact> {
    if (stepId === ORTHOGONAL_TRANSFORM_STEP_ID) return this.resolveImmutableRoot(snapshot);
    const artifactId = completedArtifactId(snapshot, ORTHOGONAL_TRANSFORM_STEP_ID);
    const intermediate = await this.dependencies.artifacts.resolve(snapshot.scope, artifactId);
    const root = await this.resolveImmutableRoot(snapshot);
    const geometry = orthogonalTransformOutputGeometry(root.width, root.height, requirePlanParameters(snapshot.plan).mode);
    assertImage(intermediate, 'bounded_agent_intermediate_contract', 'Resize source must be the durable Orthogonal Transform FINAL');
    if (intermediate.role !== 'COMPOSITE' || intermediate.width !== geometry.width || intermediate.height !== geometry.height
      || intermediate.parentArtifactIds.length !== 1 || intermediate.parentArtifactIds[0] !== root.artifactId) {
      throw serviceError(409, 'bounded_agent_intermediate_lineage', 'Resize source does not match exact Orthogonal Transform lineage');
    }
    return intermediate;
  }

  private async resolveImmutableRoot(snapshot: WorkflowContinuationSnapshot): Promise<DurableResolvedArtifact> {
    if (snapshot.inputArtifacts.length !== 1) throw serviceError(409, 'bounded_agent_root_binding', 'Bounded Agent workflow must have exactly one immutable IMAGE root binding');
    const binding = snapshot.inputArtifacts[0];
    const root = await this.dependencies.artifacts.resolve(snapshot.scope, binding.artifactId);
    assertImage(root, 'bounded_agent_root_contract', 'Bounded Agent durable root is not a canonical IMAGE');
    assertSameArtifact(root, binding, 'bounded_agent_root_binding', 'Bounded Agent durable root no longer matches workflow binding');
    return root;
  }

  private async verifyTerminalArtifact(snapshot: WorkflowContinuationSnapshot, artifactId: string): Promise<void> {
    const source = await this.sourceForStep(snapshot, RESIZE_STEP_ID);
    await this.validateArtifact(snapshot.scope, RESIZE_STEP_ID, source, artifactId, requirePlanParameters(snapshot.plan));
  }

  private async assertSnapshotAuthority(snapshot: WorkflowContinuationSnapshot): Promise<void> {
    const root = await this.resolveImmutableRoot(snapshot);
    const parameters = requirePlanParameters(snapshot.plan);
    const expectedPlan = planBinding(root, { clientRequestId: snapshot.clientRequestId, projectId: snapshot.scope.projectId, sourceArtifactId: root.artifactId, ...parameters });
    if (!samePlanBinding(snapshot.plan, expectedPlan) || !sameInputArtifactBindings(snapshot.inputArtifacts, [workflowBinding(root)])) {
      throw serviceError(409, 'bounded_agent_plan_binding_mismatch', 'Durable Agent plan no longer matches canonical root and parameters');
    }
    if (executionIdFor(snapshot.scope, snapshot.clientRequestId) !== snapshot.executionId) throw serviceError(409, 'bounded_agent_execution_identity_mismatch', 'Durable Agent execution identity is invalid');
  }

  private async assertCurrentProjectSource(auth: AuthenticatedScope, scope: Scope, root: DurableResolvedArtifact): Promise<void> {
    const project = await this.dependencies.projects.get(auth, scope.projectId);
    if (!project) throw serviceError(404, 'project_not_found', 'Project not found');
    if (project.current_image_storage_id !== root.storageId || Number(project.width) !== root.width || Number(project.height) !== root.height) {
      throw serviceError(409, 'bounded_agent_project_source_conflict', 'Bounded Agent source is not the current canonical Project IMAGE');
    }
  }

  private async requireSnapshot(executionId: string, scope: Scope): Promise<WorkflowContinuationSnapshot> {
    const snapshot = await this.dependencies.continuations.get(executionId, scope);
    if (!snapshot) throw serviceError(404, 'bounded_agent_not_found', 'Bounded Agent workflow was not found in authenticated Project scope');
    return snapshot;
  }

  private async terminalizeUnknown(snapshot: WorkflowContinuationSnapshot, stepId: LocalStepId): Promise<BoundedAgentWorkflowView> {
    const unknown = await this.markUnknown(snapshot, stepId);
    await this.reconcileRuns(unknown);
    return terminalView(unknown);
  }

  private markUnknown(snapshot: WorkflowContinuationSnapshot, stepId: LocalStepId): Promise<WorkflowContinuationSnapshot> {
    return this.dependencies.continuations.markUnknown({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, failureCode: `${stepFailurePrefix(stepId)}_UNKNOWN` });
  }

  private async ensureParentRunning(snapshot: WorkflowContinuationSnapshot): Promise<ExecutionRun> {
    const issued = await this.dependencies.runs.issue({ scope: snapshot.scope, capability: 'WORKFLOW_CONTINUATION', idempotencyKey: snapshot.clientRequestId, authorityKind: 'WORKFLOW_CONTINUATION', authorityRef: snapshot.executionId });
    if (issued.run.status === 'RUNNING') return issued.run;
    if (issued.run.status !== 'QUEUED') throw serviceError(409, 'bounded_agent_run_parent_conflict', `Bounded Agent parent run is ${issued.run.status}`);
    return this.dependencies.runs.start(issued.run.scope, issued.run.runId);
  }

  private async reconcileRuns(snapshot: WorkflowContinuationSnapshot): Promise<void> {
    let parent = await this.dependencies.runs.getByAuthority(snapshot.scope, 'WORKFLOW_CONTINUATION', snapshot.executionId);
    if (!parent) parent = await this.ensureParentRunning(snapshot);

    if (isTerminal(snapshot.state) && terminalRunMatches(parent, snapshot.state)) return;
    if (parent.status === 'QUEUED') parent = await this.dependencies.runs.start(parent.scope, parent.runId);
    if (parent.status !== 'RUNNING') throw serviceError(409, 'bounded_agent_run_parent_conflict', `Bounded Agent parent run is ${parent.status}`);

    for (const completed of snapshot.completedSteps) {
      if (completed.stepId === ORTHOGONAL_TRANSFORM_STEP_ID || completed.stepId === RESIZE_STEP_ID) {
        if (!completed.ticketId) throw serviceError(409, 'bounded_agent_run_ticket_missing', `Completed local step ${completed.stepId} has no ticket binding`);
        await projectWorkflowLocalExecutionAttempt({ runs: this.dependencies.runs, parent, acceptedStepIds: BOUNDED_AGENT_LOCAL_STEPS, stepId: completed.stepId, ticketId: completed.ticketId, target: 'SUCCEEDED' });
      }
    }
    if (snapshot.outstandingLocal) {
      await projectWorkflowLocalExecutionAttempt({ runs: this.dependencies.runs, parent, acceptedStepIds: BOUNDED_AGENT_LOCAL_STEPS, stepId: snapshot.outstandingLocal.stepId, ticketId: snapshot.outstandingLocal.ticketId, target: 'RUNNING' });
    }
    await this.reconcileInternalRun(parent, snapshot);

    if (!isTerminal(snapshot.state)) return;
    await this.terminalizeOpenChildren(parent, snapshot);
    const reason = snapshot.failureCode ?? (snapshot.state === 'CANCELLED' ? 'WORKFLOW_CANCELLED' : `BOUNDED_AGENT_${snapshot.state}`);
    if (snapshot.state === 'SUCCESS') await this.dependencies.runs.succeed(parent.scope, parent.runId);
    else if (snapshot.state === 'CANCELLED') await this.dependencies.runs.cancel(parent.scope, parent.runId, reason);
    else if (snapshot.state === 'UNKNOWN') await this.dependencies.runs.markUnknown(parent.scope, parent.runId, reason);
    else await this.dependencies.runs.fail(parent.scope, parent.runId, reason);
  }

  private async reconcileInternalRun(parent: ExecutionRun, snapshot: WorkflowContinuationSnapshot): Promise<void> {
    const completed = snapshot.completedSteps.find(step => step.stepId === BOUNDED_AGENT_VERIFY_STEP_ID);
    const children = await this.dependencies.runs.listChildren(parent.scope, parent.runId, RUN_CHILD_LIMIT);
    let child = children.find(value => value.capability === 'WORKFLOW_STEP' && value.authorityKind === 'WORKFLOW_INTERNAL_STEP' && value.authorityRef === internalAuthorityRef(snapshot.executionId));
    if (!completed && snapshot.state !== 'RUNNING_INTERNAL' && !child) return;
    if (!child) {
      child = (await this.dependencies.runs.issue({ scope: parent.scope, capability: 'WORKFLOW_STEP', idempotencyKey: `${INTERNAL_CHILD_PREFIX}:${parent.runId}:${BOUNDED_AGENT_VERIFY_STEP_ID}`, authorityKind: 'WORKFLOW_INTERNAL_STEP', authorityRef: internalAuthorityRef(snapshot.executionId), parentRunId: parent.runId })).run;
    }
    if (completed) {
      if (completed.ticketId) throw serviceError(409, 'bounded_agent_internal_run_contract', 'Internal verify cannot carry a local ticket');
      if (child.status === 'SUCCEEDED') return;
      if (child.status === 'QUEUED') child = await this.dependencies.runs.start(child.scope, child.runId);
      if (child.status !== 'RUNNING') throw serviceError(409, 'bounded_agent_internal_run_conflict', `Internal verify child is ${child.status}`);
      await this.dependencies.runs.succeed(child.scope, child.runId);
      return;
    }
    if (snapshot.state === 'RUNNING_INTERNAL') {
      if (snapshot.currentStepId !== BOUNDED_AGENT_VERIFY_STEP_ID) throw serviceError(409, 'bounded_agent_internal_run_contract', 'RUNNING_INTERNAL is not the Agent verify step');
      if (child.status === 'QUEUED') await this.dependencies.runs.start(child.scope, child.runId);
      else if (child.status !== 'RUNNING') throw serviceError(409, 'bounded_agent_internal_run_conflict', `Internal verify child is ${child.status}`);
    }
  }

  private async terminalizeOpenChildren(parent: ExecutionRun, snapshot: WorkflowContinuationSnapshot): Promise<void> {
    if (snapshot.state === 'SUCCESS') return;
    const reason = snapshot.failureCode ?? (snapshot.state === 'CANCELLED' ? 'WORKFLOW_CANCELLED' : `BOUNDED_AGENT_${snapshot.state}`);
    for (const child of await this.dependencies.runs.listChildren(parent.scope, parent.runId, RUN_CHILD_LIMIT)) {
      if (child.status !== 'QUEUED' && child.status !== 'RUNNING') continue;
      if (snapshot.state === 'CANCELLED') await this.dependencies.runs.cancel(child.scope, child.runId, reason);
      else {
        const running = child.status === 'QUEUED' ? await this.dependencies.runs.start(child.scope, child.runId) : child;
        if (snapshot.state === 'UNKNOWN') await this.dependencies.runs.markUnknown(running.scope, running.runId, reason);
        else await this.dependencies.runs.fail(running.scope, running.runId, reason);
      }
    }
  }
}

function normalizeStartShape(command: BoundedAgentStartCommand) {
  return Object.freeze({ clientRequestId: token(command?.clientRequestId, 'clientRequestId'), projectId: token(command?.projectId, 'projectId'), sourceArtifactId: token(command?.sourceArtifactId, 'sourceArtifactId'), mode: normalizeMode(command?.mode), width: positiveInteger(command?.width, 'width'), height: positiveInteger(command?.height, 'height') });
}
function normalizeStartGeometry(command: ReturnType<typeof normalizeStartShape>, root: DurableResolvedArtifact) {
  const geometry = orthogonalTransformOutputGeometry(root.width, root.height, command.mode);
  try {
    const target = normalizeResizeDimensions({ width: command.width, height: command.height }, geometry.width, geometry.height);
    return Object.freeze({ ...command, width: target.width, height: target.height });
  } catch (error) { throw serviceError(400, 'bounded_agent_resize_invalid', error instanceof Error ? error.message : 'Resize geometry is invalid'); }
}
function planBinding(root: DurableResolvedArtifact, command: Readonly<{ mode: OrthogonalTransformMode; width: number; height: number }>): WorkflowPlanBinding {
  const parameters = Object.freeze({ height: command.height, mode: command.mode, width: command.width });
  const authority = Object.freeze({ planId: BOUNDED_AGENT_PLAN_ID, revision: BOUNDED_AGENT_PLAN_REVISION, steps: Object.freeze([
    Object.freeze({ id: ORTHOGONAL_TRANSFORM_STEP_ID, capability: ORTHOGONAL_TRANSFORM_CAPABILITY }),
    Object.freeze({ id: RESIZE_STEP_ID, capability: RESIZE_CAPABILITY }),
    Object.freeze({ id: BOUNDED_AGENT_VERIFY_STEP_ID, capability: 'INTERNAL_VERIFY' }),
  ]), root: workflowBinding(root), parameters });
  return Object.freeze({ planId: BOUNDED_AGENT_PLAN_ID, planRevision: BOUNDED_AGENT_PLAN_REVISION, planDigest: createHash('sha256').update(PLAN_DIGEST_DOMAIN).update(canonicalJson(authority)).digest('hex'), parameters });
}
function workflowBinding(artifact: DurableResolvedArtifact): WorkflowInputArtifactBinding { return Object.freeze({ artifactId: artifact.artifactId, kind: artifact.kind, role: artifact.role, sha256: artifact.sha256.toLowerCase(), parentArtifactIds: Object.freeze([...artifact.parentArtifactIds].sort()) }); }
function requirePlanParameters(plan: WorkflowPlanBinding): PlanParameters {
  if (plan.planId !== BOUNDED_AGENT_PLAN_ID || plan.planRevision !== BOUNDED_AGENT_PLAN_REVISION || !plan.parameters || Object.keys(plan.parameters).length !== 3) throw serviceError(409, 'bounded_agent_plan_contract', 'Durable workflow is not the accepted bounded Agent plan');
  return Object.freeze({ mode: normalizeMode(plan.parameters.mode), width: positiveInteger(plan.parameters.width, 'plan.parameters.width'), height: positiveInteger(plan.parameters.height, 'plan.parameters.height') });
}
function executionIdFor(scope: Scope, clientRequestId: string): string { return `agent-deterministic-${createHash('sha256').update(EXECUTION_ID_DOMAIN).update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`; }
function childRequestIdFor(workflowId: string, stepId: LocalStepId, retryOfTicketId: string | undefined): string {
  const domain = retryOfTicketId ? RETRY_REQUEST_DOMAIN : CHILD_REQUEST_DOMAIN;
  const material = retryOfTicketId ? `${workflowId}\0${stepId}\0${retryOfTicketId}` : `${workflowId}\0${stepId}`;
  return `agent-child-${stepId}-${createHash('sha256').update(domain).update(material).digest('hex').slice(0, 32)}`;
}
function childExecutionIdFor(scope: Scope, clientRequestId: string, stepId: LocalStepId): string {
  const domain = stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'local-orthogonal-transform-' : 'local-resize-';
  return `${domain}${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function deterministicTicketIdempotencyKey(clientRequestId: string, stepId: LocalStepId): string { return `${clientRequestId}:${stepId}:local-v2`; }
function recoveryBinding(workflowId: string, ticket: LocalExecutionTicketV2, source: DurableResolvedArtifact, parameters: PlanParameters, stepId: LocalStepId) {
  const common = { projectId: ticket.scope.projectId, workflowId, executionId: ticket.requestId, idempotencyKey: ticket.idempotencyKey, ticket: Object.freeze({ ticketId: ticket.ticketId, ticketVersion: '2' as const, nonce: ticket.nonce, expiresAt: new Date(ticket.expiresAt).toISOString() }), source: Object.freeze({ artifactId: source.artifactId, role: source.role as 'ORIGINAL' | 'COMPOSITE', sha256: source.sha256, storageId: source.storageId, width: source.width, height: source.height }) };
  return stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? Object.freeze({ ...common, operation: 'ORTHOGONAL_TRANSFORM' as const, mode: parameters.mode }) : Object.freeze({ ...common, operation: 'RESIZE' as const, width: parameters.width, height: parameters.height });
}
function ticketBinding(ticket: LocalExecutionTicketV2) { return Object.freeze({ stepId: ticket.stepId, ticketId: ticket.ticketId, ticketVersion: ticket.version, nonce: ticket.nonce, expiresAt: new Date(ticket.expiresAt).toISOString() }); }
function operationFor(stepId: LocalStepId): BoundedAgentLocalAction['operation'] { return stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'ORTHOGONAL_TRANSFORM' : 'RESIZE'; }
function requireLocalStep(stepId: string | undefined): LocalStepId { if (stepId === ORTHOGONAL_TRANSFORM_STEP_ID || stepId === RESIZE_STEP_ID) return stepId; throw serviceError(409, 'bounded_agent_step_contract', 'Workflow step is not admitted by bounded Agent v1'); }
function completedArtifactId(snapshot: WorkflowContinuationSnapshot, stepId: string): string { const completed = snapshot.completedSteps.find(step => step.stepId === stepId); if (!completed || completed.artifactIds.length !== 1) throw serviceError(409, 'bounded_agent_completed_artifact', `Workflow step ${stepId} does not have exactly one canonical Artifact`); return completed.artifactIds[0]; }
function retryView(snapshot: WorkflowContinuationSnapshot, status: 'FAILED' | 'EXPIRED'): BoundedAgentWorkflowView { return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, retryAvailable: true, attemptStatus: status }); }
function terminalView(snapshot: WorkflowContinuationSnapshot): BoundedAgentWorkflowView { return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, terminalArtifactId: snapshot.terminalArtifactId, failureCode: snapshot.failureCode }); }
function sameSteps(actual: readonly string[], expected: readonly string[]): boolean { return actual.length === expected.length && actual.every((value, index) => value === expected[index]); }
function isTerminal(state: WorkflowContinuationSnapshot['state']): boolean { return state === 'SUCCESS' || state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN'; }
function terminalRunMatches(run: ExecutionRun, state: WorkflowContinuationSnapshot['state']): boolean { return (state === 'SUCCESS' && run.status === 'SUCCEEDED') || (state === 'FAILED' && run.status === 'FAILED') || (state === 'CANCELLED' && run.status === 'CANCELLED') || (state === 'UNKNOWN' && run.status === 'UNKNOWN'); }
function stepFailurePrefix(stepId: LocalStepId): string { return stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'LOCAL_ORTHOGONAL_TRANSFORM' : 'LOCAL_RESIZE'; }
function internalAuthorityRef(executionId: string): string { return `${executionId}:${BOUNDED_AGENT_VERIFY_STEP_ID}`; }
function resultTicketId(result: unknown): string { if (!result || typeof result !== 'object' || Array.isArray(result)) throw serviceError(400, 'bounded_agent_result_shape', 'Local Agent result payload must be an object'); return token((result as LocalExecutionResultV2).ticketId, 'result.ticketId'); }
function assertImage(value: DurableResolvedArtifact, code: string, message: string): void { if (value.kind !== 'image' || (value.role !== 'ORIGINAL' && value.role !== 'COMPOSITE') || !value.storageId || !/^[a-f0-9]{64}$/i.test(value.sha256) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1) throw serviceError(409, code, message); }
function assertSameArtifact(actual: DurableResolvedArtifact, expected: WorkflowInputArtifactBinding, code: string, message: string): void { const parents = [...actual.parentArtifactIds].sort(); const expectedParents = [...expected.parentArtifactIds].sort(); if (actual.artifactId !== expected.artifactId || actual.kind !== expected.kind || actual.role !== expected.role || actual.sha256.toLowerCase() !== expected.sha256.toLowerCase() || parents.length !== expectedParents.length || parents.some((value, index) => value !== expectedParents[index])) throw serviceError(409, code, message); }
function normalizeMode(value: unknown): OrthogonalTransformMode { try { return normalizeOrthogonalTransformMode(value); } catch (error) { throw serviceError(400, 'bounded_agent_mode_invalid', error instanceof Error ? error.message : 'Orthogonal-transform mode is invalid'); } }
function positiveInteger(value: unknown, field: string): number { if (!Number.isSafeInteger(value) || Number(value) < 1) throw serviceError(400, 'bounded_agent_geometry_invalid', `${field} must be a positive safe integer`); return Number(value); }
function normalizeAuth(auth: AuthenticatedScope): AuthenticatedScope { return Object.freeze({ tenantId: token(auth?.tenantId, 'auth.tenantId'), userId: token(auth?.userId, 'auth.userId') }); }
function token(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw serviceError(400, 'bounded_agent_request_invalid', `${field} is required`); return value.trim(); }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
