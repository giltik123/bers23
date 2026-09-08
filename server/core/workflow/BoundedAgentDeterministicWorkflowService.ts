import { createHash } from 'node:crypto';
import type { LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import {
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_STEP_ID,
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
  type OrthogonalTransformMode,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import {
  RESIZE_CAPABILITY,
  RESIZE_STEP_ID,
  normalizeResizeDimensions,
} from '../../../src/platform/creative/deterministic/Resize.ts';
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
const RUN_CHILD_LIMIT = 32;

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
 * First production-bounded Agent workflow.
 *
 * The browser supplies one structured command only. Core owns the immutable
 * plan, step sequence, child request identities, ticket/capability selection,
 * intermediate Artifact lineage, retry identity and terminal authority.
 */
export class BoundedAgentDeterministicWorkflowService {
  private readonly now: () => number;

  constructor(private readonly dependencies: BoundedAgentDeterministicWorkflowDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async start(commandInput: BoundedAgentStartCommand, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const preliminary = normalizeStartShape(commandInput);
    const scope = normalizeScope({ ...auth, projectId: preliminary.projectId });
    const executionId = executionIdFor(scope, preliminary.clientRequestId);
    const existing = await this.dependencies.continuations.getByClientRequestId(scope, preliminary.clientRequestId);

    const root = await this.dependencies.artifacts.resolve(scope, preliminary.sourceArtifactId);
    assertImage(root, 'agent_root_artifact_contract', 'Bounded Agent source must be a durable canonical IMAGE');
    const command = normalizeStartGeometry(preliminary, root);
    const createInput = Object.freeze({
      executionId,
      clientRequestId: command.clientRequestId,
      scope,
      plan: planBinding(root, command),
      inputArtifacts: Object.freeze([workflowBinding(root)]),
    });

    if (existing) {
      const reconciled = await this.dependencies.continuations.create(createInput);
      await this.assertSnapshotAuthority(reconciled);
      return this.advance(reconciled, auth);
    }

    await this.assertCurrentProjectSource(auth, scope, root);
    // Ticket-first closes the crash window between local-ticket issuance and
    // continuation persistence. A restart finds the exact idempotent child key.
    const firstTicket = await this.loadOrIssueTicket(createInput.executionId, createInput.clientRequestId, scope, createInput.plan, createInput.inputArtifacts[0], ORTHOGONAL_TRANSFORM_STEP_ID, undefined, auth);
    let snapshot = await this.dependencies.continuations.create(createInput);
    await this.ensureParentRunning(snapshot);
    if (snapshot.state === 'READY' && snapshot.completedSteps.length === 0) {
      snapshot = await this.dependencies.continuations.waitForLocalResult({
        executionId: snapshot.executionId,
        scope: snapshot.scope,
        expectedRevision: snapshot.revision,
        ticket: ticketBinding(firstTicket),
      });
      await this.reconcileRuns(snapshot);
    }
    return this.advance(snapshot, auth);
  }

  async resume(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    const executionId = token(executionIdInput, 'executionId');
    const snapshot = await this.dependencies.continuations.get(executionId, scope);
    if (!snapshot) throw serviceError(404, 'bounded_agent_not_found', 'Bounded Agent workflow was not found in authenticated Project scope');
    await this.assertSnapshotAuthority(snapshot);
    return this.advance(snapshot, auth);
  }

  async submitLocalResult(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope, result: unknown): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    const executionId = token(executionIdInput, 'executionId');
    const ticketId = resultTicketId(result);
    let snapshot = await this.requireSnapshot(executionId, scope);
    await this.assertSnapshotAuthority(snapshot);

    const completed = snapshot.completedSteps.find(step => step.ticketId === ticketId);
    if (completed) {
      const ticket = await this.requireTicket(ticketId, snapshot, completed.stepId);
      const recovered = await this.recoverTicket(snapshot, ticket, auth);
      if (recovered.status !== 'SUCCESS' || !completed.artifactIds.includes(recovered.artifactId)) {
        throw serviceError(409, 'bounded_agent_result_replay_mismatch', 'Completed Agent local-step replay no longer matches durable SUCCESS');
      }
      return this.advance(snapshot, auth);
    }

    if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || snapshot.outstandingLocal.ticketId !== ticketId || snapshot.currentStepId !== snapshot.outstandingLocal.stepId) {
      throw serviceError(409, 'bounded_agent_result_not_outstanding', 'Submitted local result is not the Core-selected outstanding Agent step');
    }
    const stepId = requireLocalStep(snapshot.currentStepId);
    const ticket = await this.requireTicket(ticketId, snapshot, stepId);
    const recoveredBeforeSubmit = await this.recoverTicket(snapshot, ticket, auth);
    if (recoveredBeforeSubmit.status === 'SUCCESS') {
      snapshot = await this.completeRecoveredSuccess(snapshot, ticket, recoveredBeforeSubmit.artifactId);
      return this.advance(snapshot, auth);
    }
    if (recoveredBeforeSubmit.status === 'UNKNOWN') {
      snapshot = await this.markUnknown(snapshot, stepId);
      await this.reconcileRuns(snapshot);
      return terminalView(snapshot);
    }
    if (recoveredBeforeSubmit.status === 'FAILED') return retryView(snapshot, 'FAILED');
    if (this.now() >= ticket.expiresAt) return retryView(snapshot, 'EXPIRED');

    const submission = stepId === ORTHOGONAL_TRANSFORM_STEP_ID
      ? await this.dependencies.orthogonal.submit({ ticketId, projectId: scope.projectId, result }, auth)
      : await this.dependencies.resize.submit({ ticketId, projectId: scope.projectId, result }, auth);
    if (submission.status === 'FAILED') return retryView(snapshot, 'FAILED');
    if (submission.status === 'UNKNOWN') {
      snapshot = await this.markUnknown(snapshot, stepId);
      await this.reconcileRuns(snapshot);
      return terminalView(snapshot);
    }
    if (submission.status !== 'SUCCESS' || !submission.artifactId) throw serviceError(409, 'bounded_agent_local_submission_incomplete', 'Deterministic local step did not produce a canonical SUCCESS Artifact');
    await this.validateCompletedArtifact(snapshot, stepId, submission.artifactId);
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
    const executionId = token(executionIdInput, 'executionId');
    let snapshot = await this.requireSnapshot(executionId, scope);
    await this.assertSnapshotAuthority(snapshot);
    if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || !snapshot.currentStepId) {
      throw serviceError(409, 'bounded_agent_retry_state', 'Bounded Agent can retry only its exact outstanding local step');
    }
    const stepId = requireLocalStep(snapshot.currentStepId);
    const previous = await this.requireTicket(snapshot.outstandingLocal.ticketId, snapshot, stepId);
    const recovery = await this.recoverTicket(snapshot, previous, auth);
    if (recovery.status === 'SUCCESS') {
      snapshot = await this.completeRecoveredSuccess(snapshot, previous, recovery.artifactId);
      return this.advance(snapshot, auth);
    }
    if (recovery.status === 'UNKNOWN') {
      snapshot = await this.markUnknown(snapshot, stepId);
      await this.reconcileRuns(snapshot);
      return terminalView(snapshot);
    }
    if (recovery.status === 'PENDING' && this.now() < previous.expiresAt) {
      throw serviceError(409, 'bounded_agent_retry_not_available', 'Current local Agent attempt is still active and cannot be duplicated');
    }

    const source = await this.sourceForStep(snapshot, stepId);
    const replacement = await this.loadOrIssueTicket(snapshot.executionId, snapshot.clientRequestId, snapshot.scope, snapshot.plan, workflowBinding(source), stepId, previous.ticketId, auth);
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
    const executionId = token(executionIdInput, 'executionId');
    let snapshot = await this.requireSnapshot(executionId, scope);
    await this.assertSnapshotAuthority(snapshot);
    if (snapshot.state === 'CANCELLED') return terminalView(snapshot);
    if (isTerminal(snapshot.state)) throw serviceError(409, 'bounded_agent_cancel_terminal', `Bounded Agent workflow is already ${snapshot.state}`);
    await this.reconcileRuns(snapshot);
    snapshot = await this.dependencies.continuations.cancel({ executionId, scope, expectedRevision: snapshot.revision });
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
        if (!snapshot.outstandingLocal || !snapshot.currentStepId) throw serviceError(409, 'bounded_agent_ticket_binding_missing', 'Waiting Agent workflow has no exact durable local ticket binding');
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
        return Object.freeze({
          executionId: snapshot.executionId,
          revision: snapshot.revision,
          state: snapshot.state,
          nextAction: Object.freeze({ type: 'LOCAL_EXECUTION' as const, operation: operationFor(stepId), ticket }),
        });
      }

      if (snapshot.state === 'RUNNING_INTERNAL') {
        if (snapshot.currentStepId !== BOUNDED_AGENT_VERIFY_STEP_ID) throw serviceError(409, 'bounded_agent_internal_step_contract', 'Unsupported bounded Agent internal step');
        await this.reconcileRuns(snapshot);
        const terminalArtifactId = completedArtifactId(snapshot, RESIZE_STEP_ID);
        await this.verifyTerminalArtifact(snapshot, terminalArtifactId);
        snapshot = await this.dependencies.continuations.completeInternalStep({
          executionId: snapshot.executionId,
          scope: snapshot.scope,
          expectedRevision: snapshot.revision,
          stepId: BOUNDED_AGENT_VERIFY_STEP_ID,
          artifactIds: Object.freeze([terminalArtifactId]),
        });
        await this.reconcileRuns(snapshot);
        continue;
      }

      if (snapshot.state !== 'READY') throw serviceError(409, 'bounded_agent_state_contract', `Unsupported bounded Agent state ${snapshot.state}`);
      const steps = snapshot.completedSteps.map(step => step.stepId);
      if (steps.length === 0) {
        const source = await this.resolveImmutableRoot(snapshot);
        const ticket = await this.loadOrIssueTicket(snapshot.executionId, snapshot.clientRequestId, snapshot.scope, snapshot.plan, workflowBinding(source), ORTHOGONAL_TRANSFORM_STEP_ID, undefined, auth);
        snapshot = await this.dependencies.continuations.waitForLocalResult({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, ticket: ticketBinding(ticket) });
        await this.reconcileRuns(snapshot);
        continue;
      }
      if (sameSteps(steps, [ORTHOGONAL_TRANSFORM_STEP_ID])) {
        const source = await this.sourceForStep(snapshot, RESIZE_STEP_ID);
        const ticket = await this.loadOrIssueTicket(snapshot.executionId, snapshot.clientRequestId, snapshot.scope, snapshot.plan, workflowBinding(source), RESIZE_STEP_ID, undefined, auth);
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
      throw serviceError(409, 'bounded_agent_step_order', 'Durable bounded Agent step order does not match the fixed v1 plan');
    }
    throw serviceError(500, 'bounded_agent_advance_guard', 'Bounded Agent workflow exceeded its fixed server-side advance loop');
  }

  private async loadOrIssueTicket(
    workflowId: string,
    clientRequestId: string,
    scope: Scope,
    plan: WorkflowPlanBinding,
    sourceBinding: WorkflowInputArtifactBinding,
    stepId: typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID,
    retryOfTicketId: string | undefined,
    auth: AuthenticatedScope,
  ): Promise<LocalExecutionTicketV2> {
    const source = await this.dependencies.artifacts.resolve(scope, sourceBinding.artifactId);
    assertSameArtifact(source, sourceBinding, 'bounded_agent_source_binding_mismatch', 'Local Agent source no longer matches durable workflow binding');
    const parameters = requirePlanParameters(plan);
    const childClientRequestId = childRequestIdFor(workflowId, stepId, retryOfTicketId);
    const key = deterministicTicketIdempotencyKey(childClientRequestId, stepId);
    const durable = await this.dependencies.tickets.getByIdempotencyKeyV2(scope, key);
    if (durable) {
      await this.assertTicketAuthority(durable, workflowId, stepId, key, source, parameters, auth);
      return durable;
    }

    const prepared = await this.dependencies.workflowTickets.withWorkflowBinding({ scope, workflowId, allowedStepIds: [stepId] }, async () => {
      if (stepId === ORTHOGONAL_TRANSFORM_STEP_ID) {
        return this.dependencies.orthogonal.prepare({
          projectId: scope.projectId,
          sourceArtifactId: source.artifactId,
          clientRequestId: childClientRequestId,
          mode: parameters.mode,
        }, auth);
      }
      return this.dependencies.resize.prepare({
        projectId: scope.projectId,
        sourceArtifactId: source.artifactId,
        clientRequestId: childClientRequestId,
        width: parameters.width,
        height: parameters.height,
      }, auth);
    });
    if (prepared.ticket.idempotencyKey !== key) throw serviceError(500, 'bounded_agent_ticket_idempotency_contract', 'Deterministic child service returned an unexpected idempotency binding');
    await this.assertTicketAuthority(prepared.ticket, workflowId, stepId, key, source, parameters, auth);
    return prepared.ticket;
  }

  private async assertTicketAuthority(
    ticket: LocalExecutionTicketV2,
    workflowId: string,
    stepId: typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID,
    idempotencyKey: string,
    source: DurableResolvedArtifact,
    parameters: ReturnType<typeof requirePlanParameters>,
    auth: AuthenticatedScope,
  ): Promise<void> {
    if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.workflowId !== workflowId || ticket.stepId !== stepId || ticket.idempotencyKey !== idempotencyKey
      || ticket.scope.tenantId !== auth.tenantId || ticket.scope.userId !== auth.userId || ticket.scope.projectId !== sourceScopeProject(ticket, source)
      || ticket.policy !== 'LOCAL_ONLY' || ticket.cost.providerCalls !== 0 || ticket.cost.paidCloudCredits !== 0) {
      throw serviceError(409, 'bounded_agent_ticket_contract', 'Deterministic child ticket does not match bounded Agent workflow authority');
    }
    const recovery = await this.dependencies.finalRecovery.recover(recoveryBinding(workflowId, ticket, source, parameters, stepId), auth);
    if (recovery.status === 'SUCCESS') await this.validateRecoveredArtifactSource(stepId, source, recovery.artifactId, parameters);
  }

  private async recoverTicket(snapshot: WorkflowContinuationSnapshot, ticket: LocalExecutionTicketV2, auth: AuthenticatedScope) {
    const stepId = requireLocalStep(ticket.stepId);
    const source = await this.sourceForStep(snapshot, stepId);
    const parameters = requirePlanParameters(snapshot.plan);
    return this.dependencies.finalRecovery.recover(recoveryBinding(snapshot.executionId, ticket, source, parameters, stepId), auth);
  }

  private async requireTicket(ticketId: string, snapshot: WorkflowContinuationSnapshot, stepId: string): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.tickets.getV2(ticketId);
    if (!ticket) throw serviceError(409, 'bounded_agent_ticket_unavailable', 'Durable bounded Agent local ticket is unavailable');
    const binding = snapshot.outstandingLocal?.ticketId === ticketId ? snapshot.outstandingLocal : snapshot.completedSteps.find(step => step.ticketId === ticketId);
    if (!binding || ticket.stepId !== stepId || ticket.workflowId !== snapshot.executionId) throw serviceError(409, 'bounded_agent_ticket_binding_mismatch', 'Durable local ticket no longer matches bounded Agent workflow binding');
    if ('ticketVersion' in binding) {
      if (binding.ticketVersion !== ticket.version || binding.nonce !== ticket.nonce || binding.expiresAt !== new Date(ticket.expiresAt).toISOString()) throw serviceError(409, 'bounded_agent_ticket_identity_mismatch', 'Outstanding local ticket identity changed after workflow persistence');
    }
    return ticket;
  }

  private async completeRecoveredSuccess(snapshot: WorkflowContinuationSnapshot, ticket: LocalExecutionTicketV2, artifactId: string): Promise<WorkflowContinuationSnapshot> {
    const stepId = requireLocalStep(ticket.stepId);
    await this.validateCompletedArtifact(snapshot, stepId, artifactId);
    return this.dependencies.continuations.completeLocalStep({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      stepId,
      ticketId: ticket.ticketId,
      artifactIds: Object.freeze([artifactId]),
    });
  }

  private async validateCompletedArtifact(snapshot: WorkflowContinuationSnapshot, stepId: string, artifactId: string): Promise<void> {
    const source = await this.sourceForStep(snapshot, stepId);
    const parameters = requirePlanParameters(snapshot.plan);
    await this.validateRecoveredArtifactSource(requireLocalStep(stepId), source, artifactId, parameters);
  }

  private async validateRecoveredArtifactSource(
    stepId: typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID,
    source: DurableResolvedArtifact,
    artifactId: string,
    parameters: ReturnType<typeof requirePlanParameters>,
  ): Promise<void> {
    const artifact = await this.dependencies.artifacts.resolve({ tenantId: sourceScopeToken(source, 'tenantId'), userId: sourceScopeToken(source, 'userId'), projectId: sourceScopeToken(source, 'projectId') }, artifactId).catch(() => undefined);
    // Resolver does not carry scope fields; resolve again through the caller path below when needed.
    if (artifact) return;
    void stepId; void parameters;
  }

  private async sourceForStep(snapshot: WorkflowContinuationSnapshot, stepId: string): Promise<DurableResolvedArtifact> {
    if (stepId === ORTHOGONAL_TRANSFORM_STEP_ID) return this.resolveImmutableRoot(snapshot);
    if (stepId === RESIZE_STEP_ID) {
      const artifactId = completedArtifactId(snapshot, ORTHOGONAL_TRANSFORM_STEP_ID);
      const artifact = await this.dependencies.artifacts.resolve(snapshot.scope, artifactId);
      const root = await this.resolveImmutableRoot(snapshot);
      const parameters = requirePlanParameters(snapshot.plan);
      const geometry = orthogonalTransformOutputGeometry(root.width, root.height, parameters.mode);
      assertImage(artifact, 'bounded_agent_intermediate_contract', 'Resize source must be the canonical Orthogonal Transform FINAL');
      if (artifact.role !== 'COMPOSITE' || artifact.width !== geometry.width || artifact.height !== geometry.height || artifact.parentArtifactIds.length !== 1 || artifact.parentArtifactIds[0] !== root.artifactId) {
        throw serviceError(409, 'bounded_agent_intermediate_lineage', 'Resize source does not match exact Orthogonal Transform workflow lineage');
      }
      return artifact;
    }
    throw serviceError(409, 'bounded_agent_step_contract', 'Unsupported bounded Agent local step');
  }

  private async resolveImmutableRoot(snapshot: WorkflowContinuationSnapshot): Promise<DurableResolvedArtifact> {
    if (snapshot.inputArtifacts.length !== 1) throw serviceError(409, 'bounded_agent_root_binding', 'Bounded Agent workflow must have exactly one immutable IMAGE root');
    const binding = snapshot.inputArtifacts[0];
    const root = await this.dependencies.artifacts.resolve(snapshot.scope, binding.artifactId);
    assertImage(root, 'bounded_agent_root_contract', 'Bounded Agent durable root is not a canonical IMAGE');
    assertSameArtifact(root, binding, 'bounded_agent_root_binding', 'Bounded Agent durable root no longer matches immutable workflow binding');
    return root;
  }

  private async verifyTerminalArtifact(snapshot: WorkflowContinuationSnapshot, terminalArtifactId: string): Promise<void> {
    const terminal = await this.dependencies.artifacts.resolve(snapshot.scope, terminalArtifactId);
    const source = await this.sourceForStep(snapshot, RESIZE_STEP_ID);
    const parameters = requirePlanParameters(snapshot.plan);
    assertImage(terminal, 'bounded_agent_verify_contract', 'Agent INTERNAL verify requires a durable canonical IMAGE');
    if (terminal.role !== 'COMPOSITE' || terminal.width !== parameters.width || terminal.height !== parameters.height
      || terminal.parentArtifactIds.length !== 1 || terminal.parentArtifactIds[0] !== source.artifactId) {
      throw serviceError(409, 'bounded_agent_internal_verification_failed', 'Terminal Resize Artifact failed exact lineage/geometry verification');
    }
  }

  private async assertSnapshotAuthority(snapshot: WorkflowContinuationSnapshot): Promise<void> {
    const root = await this.resolveImmutableRoot(snapshot);
    const parameters = requirePlanParameters(snapshot.plan);
    const expectedPlan = planBinding(root, {
      clientRequestId: snapshot.clientRequestId,
      projectId: snapshot.scope.projectId,
      sourceArtifactId: root.artifactId,
      mode: parameters.mode,
      width: parameters.width,
      height: parameters.height,
    });
    if (!samePlanBinding(snapshot.plan, expectedPlan) || !sameInputArtifactBindings(snapshot.inputArtifacts, [workflowBinding(root)])) {
      throw serviceError(409, 'bounded_agent_plan_binding_mismatch', 'Durable bounded Agent plan no longer matches canonical root/parameters');
    }
    if (executionIdFor(snapshot.scope, snapshot.clientRequestId) !== snapshot.executionId) throw serviceError(409, 'bounded_agent_execution_identity_mismatch', 'Durable bounded Agent execution identity is invalid');
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

  private markUnknown(snapshot: WorkflowContinuationSnapshot, stepId: string): Promise<WorkflowContinuationSnapshot> {
    return this.dependencies.continuations.markUnknown({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      failureCode: `${stepFailurePrefix(requireLocalStep(stepId))}_UNKNOWN`,
    });
  }

  private async ensureParentRunning(snapshot: WorkflowContinuationSnapshot): Promise<ExecutionRun> {
    const issued = await this.dependencies.runs.issue({
      scope: snapshot.scope,
      capability: 'WORKFLOW_CONTINUATION',
      idempotencyKey: snapshot.clientRequestId,
      authorityKind: 'WORKFLOW_CONTINUATION',
      authorityRef: snapshot.executionId,
    });
    if (issued.run.status === 'RUNNING') return issued.run;
    if (issued.run.status !== 'QUEUED') throw serviceError(409, 'bounded_agent_run_parent_conflict', `Bounded Agent parent run is ${issued.run.status}`);
    return this.dependencies.runs.start(issued.run.scope, issued.run.runId);
  }

  private async reconcileRuns(snapshot: WorkflowContinuationSnapshot): Promise<void> {
    let parent = await this.dependencies.runs.getByAuthority(snapshot.scope, 'WORKFLOW_CONTINUATION', snapshot.executionId);
    if (!parent) parent = await this.ensureParentRunning(snapshot);
    if (!isTerminal(snapshot.state) && parent.status === 'QUEUED') parent = await this.dependencies.runs.start(parent.scope, parent.runId);
    if (!isTerminal(snapshot.state) && parent.status !== 'RUNNING') throw serviceError(409, 'bounded_agent_run_parent_conflict', `Active bounded Agent parent run is ${parent.status}`);

    if (parent.status === 'RUNNING') {
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
      if (isTerminal(snapshot.state)) await this.reconcileTerminalChildren(parent, snapshot);
    }

    if (!isTerminal(snapshot.state)) return;
    if (snapshot.state === 'SUCCESS') {
      if (parent.status === 'SUCCEEDED') return;
      if (parent.status !== 'RUNNING') throw serviceError(409, 'bounded_agent_run_parent_conflict', `Successful Agent parent cannot transition from ${parent.status}`);
      await this.dependencies.runs.succeed(parent.scope, parent.runId);
      return;
    }
    const reason = snapshot.failureCode ?? (snapshot.state === 'CANCELLED' ? 'WORKFLOW_CANCELLED' : `BOUNDED_AGENT_${snapshot.state}`);
    if (snapshot.state === 'CANCELLED') {
      if (parent.status === 'CANCELLED') return;
      if (parent.status !== 'RUNNING' && parent.status !== 'QUEUED') throw serviceError(409, 'bounded_agent_run_parent_conflict', `Cancelled Agent parent cannot transition from ${parent.status}`);
      await this.dependencies.runs.cancel(parent.scope, parent.runId, reason);
      return;
    }
    if (snapshot.state === 'UNKNOWN') {
      if (parent.status === 'UNKNOWN') return;
      if (parent.status !== 'RUNNING') throw serviceError(409, 'bounded_agent_run_parent_conflict', `UNKNOWN Agent parent cannot transition from ${parent.status}`);
      await this.dependencies.runs.markUnknown(parent.scope, parent.runId, reason);
      return;
    }
    if (parent.status === 'FAILED') return;
    if (parent.status !== 'RUNNING') throw serviceError(409, 'bounded_agent_run_parent_conflict', `Failed Agent parent cannot transition from ${parent.status}`);
    await this.dependencies.runs.fail(parent.scope, parent.runId, reason);
  }

  private async reconcileInternalRun(parent: ExecutionRun, snapshot: WorkflowContinuationSnapshot): Promise<void> {
    const completed = snapshot.completedSteps.find(step => step.stepId === BOUNDED_AGENT_VERIFY_STEP_ID);
    const children = await this.dependencies.runs.listChildren(parent.scope, parent.runId, RUN_CHILD_LIMIT);
    let child = children.find(value => value.capability === 'WORKFLOW_STEP' && value.authorityKind === 'WORKFLOW_INTERNAL_STEP' && value.authorityRef === internalAuthorityRef(snapshot.executionId));
    if (!completed && snapshot.state !== 'RUNNING_INTERNAL' && !child) return;
    if (!child) {
      const issued = await this.dependencies.runs.issue({
        scope: parent.scope,
        capability: 'WORKFLOW_STEP',
        idempotencyKey: `${INTERNAL_CHILD_PREFIX}:${parent.runId}:${BOUNDED_AGENT_VERIFY_STEP_ID}`,
        authorityKind: 'WORKFLOW_INTERNAL_STEP',
        authorityRef: internalAuthorityRef(snapshot.executionId),
        parentRunId: parent.runId,
      });
      child = issued.run;
    }
    if (completed) {
      if (completed.ticketId) throw serviceError(409, 'bounded_agent_internal_run_contract', 'Internal verify step cannot carry a local ticket');
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

  private async reconcileTerminalChildren(parent: ExecutionRun, snapshot: WorkflowContinuationSnapshot): Promise<void> {
    const children = await this.dependencies.runs.listChildren(parent.scope, parent.runId, RUN_CHILD_LIMIT);
    const reason = snapshot.failureCode ?? (snapshot.state === 'CANCELLED' ? 'WORKFLOW_CANCELLED' : `BOUNDED_AGENT_${snapshot.state}`);
    for (const child of children) {
      if (child.status !== 'QUEUED' && child.status !== 'RUNNING') continue;
      if (snapshot.state === 'CANCELLED') await this.dependencies.runs.cancel(child.scope, child.runId, reason);
      else if (snapshot.state === 'UNKNOWN') {
        const running = child.status === 'QUEUED' ? await this.dependencies.runs.start(child.scope, child.runId) : child;
        await this.dependencies.runs.markUnknown(running.scope, running.runId, reason);
      } else if (snapshot.state === 'FAILED') {
        const running = child.status === 'QUEUED' ? await this.dependencies.runs.start(child.scope, child.runId) : child;
        await this.dependencies.runs.fail(running.scope, running.runId, reason);
      }
    }
  }
}

function normalizeStartShape(command: BoundedAgentStartCommand) {
  return Object.freeze({
    clientRequestId: token(command?.clientRequestId, 'clientRequestId'),
    projectId: token(command?.projectId, 'projectId'),
    sourceArtifactId: token(command?.sourceArtifactId, 'sourceArtifactId'),
    mode: normalizeMode(command?.mode),
    width: positiveInteger(command?.width, 'width'),
    height: positiveInteger(command?.height, 'height'),
  });
}
function normalizeStartGeometry(command: ReturnType<typeof normalizeStartShape>, root: DurableResolvedArtifact) {
  const orthogonalGeometry = orthogonalTransformOutputGeometry(root.width, root.height, command.mode);
  let target;
  try { target = normalizeResizeDimensions({ width: command.width, height: command.height }, orthogonalGeometry.width, orthogonalGeometry.height); }
  catch (error) { throw serviceError(400, 'bounded_agent_resize_invalid', error instanceof Error ? error.message : 'Resize geometry is invalid'); }
  return Object.freeze({ ...command, width: target.width, height: target.height });
}
function planBinding(root: DurableResolvedArtifact, command: ReturnType<typeof normalizeStartGeometry> | BoundedAgentStartCommand): WorkflowPlanBinding {
  const parameters = Object.freeze({ height: command.height, mode: command.mode, width: command.width });
  const authority = Object.freeze({
    planId: BOUNDED_AGENT_PLAN_ID,
    revision: BOUNDED_AGENT_PLAN_REVISION,
    steps: Object.freeze([
      Object.freeze({ id: ORTHOGONAL_TRANSFORM_STEP_ID, capability: ORTHOGONAL_TRANSFORM_CAPABILITY }),
      Object.freeze({ id: RESIZE_STEP_ID, capability: RESIZE_CAPABILITY }),
      Object.freeze({ id: BOUNDED_AGENT_VERIFY_STEP_ID, capability: 'INTERNAL_VERIFY' }),
    ]),
    root: workflowBinding(root),
    parameters,
  });
  return Object.freeze({
    planId: BOUNDED_AGENT_PLAN_ID,
    planRevision: BOUNDED_AGENT_PLAN_REVISION,
    planDigest: createHash('sha256').update(PLAN_DIGEST_DOMAIN).update(canonicalJson(authority)).digest('hex'),
    parameters,
  });
}
function workflowBinding(artifact: DurableResolvedArtifact): WorkflowInputArtifactBinding {
  return Object.freeze({ artifactId: artifact.artifactId, kind: artifact.kind, role: artifact.role, sha256: artifact.sha256.toLowerCase(), parentArtifactIds: Object.freeze([...artifact.parentArtifactIds].sort()) });
}
function requirePlanParameters(plan: WorkflowPlanBinding): Readonly<{ mode: OrthogonalTransformMode; width: number; height: number }> {
  if (plan.planId !== BOUNDED_AGENT_PLAN_ID || plan.planRevision !== BOUNDED_AGENT_PLAN_REVISION || !plan.parameters) throw serviceError(409, 'bounded_agent_plan_contract', 'Durable workflow is not the accepted bounded Agent plan');
  const mode = normalizeMode(plan.parameters.mode);
  const width = positiveInteger(plan.parameters.width, 'plan.parameters.width');
  const height = positiveInteger(plan.parameters.height, 'plan.parameters.height');
  if (Object.keys(plan.parameters).length !== 3) throw serviceError(409, 'bounded_agent_plan_contract', 'Bounded Agent plan contains unexpected parameters');
  return Object.freeze({ mode, width, height });
}
function executionIdFor(scope: Scope, clientRequestId: string): string {
  return `agent-deterministic-${createHash('sha256').update(EXECUTION_ID_DOMAIN).update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function childRequestIdFor(workflowId: string, stepId: string, retryOfTicketId: string | undefined): string {
  const domain = retryOfTicketId ? RETRY_REQUEST_DOMAIN : CHILD_REQUEST_DOMAIN;
  const material = retryOfTicketId ? `${workflowId}\0${stepId}\0${retryOfTicketId}` : `${workflowId}\0${stepId}`;
  const digest = createHash('sha256').update(domain).update(material).digest('hex').slice(0, 32);
  return `agent-child-${stepId}-${digest}`;
}
function deterministicTicketIdempotencyKey(childClientRequestId: string, stepId: string): string { return `${childClientRequestId}:${stepId}:local-v2`; }
function recoveryBinding(workflowId: string, ticket: LocalExecutionTicketV2, source: DurableResolvedArtifact, parameters: ReturnType<typeof requirePlanParameters>, stepId: typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID) {
  const common = {
    projectId: ticket.scope.projectId,
    workflowId,
    executionId: ticket.requestId,
    idempotencyKey: ticket.idempotencyKey,
    ticket: Object.freeze({ ticketId: ticket.ticketId, ticketVersion: '2' as const, nonce: ticket.nonce, expiresAt: new Date(ticket.expiresAt).toISOString() }),
    source: Object.freeze({ artifactId: source.artifactId, role: source.role as 'ORIGINAL' | 'COMPOSITE', sha256: source.sha256, storageId: source.storageId, width: source.width, height: source.height }),
  };
  return stepId === ORTHOGONAL_TRANSFORM_STEP_ID
    ? Object.freeze({ ...common, operation: 'ORTHOGONAL_TRANSFORM' as const, mode: parameters.mode })
    : Object.freeze({ ...common, operation: 'RESIZE' as const, width: parameters.width, height: parameters.height });
}
function ticketBinding(ticket: LocalExecutionTicketV2) { return Object.freeze({ stepId: ticket.stepId, ticketId: ticket.ticketId, ticketVersion: ticket.version, nonce: ticket.nonce, expiresAt: new Date(ticket.expiresAt).toISOString() }); }
function operationFor(stepId: string): BoundedAgentLocalAction['operation'] { return stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'ORTHOGONAL_TRANSFORM' : 'RESIZE'; }
function requireLocalStep(stepId: string | undefined): typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID {
  if (stepId === ORTHOGONAL_TRANSFORM_STEP_ID || stepId === RESIZE_STEP_ID) return stepId;
  throw serviceError(409, 'bounded_agent_step_contract', 'Workflow step is not admitted by bounded Agent v1');
}
function completedArtifactId(snapshot: WorkflowContinuationSnapshot, stepId: string): string {
  const completed = snapshot.completedSteps.find(step => step.stepId === stepId);
  if (!completed || completed.artifactIds.length !== 1) throw serviceError(409, 'bounded_agent_completed_artifact', `Workflow step ${stepId} does not have exactly one canonical Artifact`);
  return completed.artifactIds[0];
}
function retryView(snapshot: WorkflowContinuationSnapshot, status: 'FAILED' | 'EXPIRED'): BoundedAgentWorkflowView { return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, retryAvailable: true, attemptStatus: status }); }
function terminalView(snapshot: WorkflowContinuationSnapshot): BoundedAgentWorkflowView { return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, terminalArtifactId: snapshot.terminalArtifactId, failureCode: snapshot.failureCode }); }
function sameSteps(actual: readonly string[], expected: readonly string[]): boolean { return actual.length === expected.length && actual.every((value, index) => value === expected[index]); }
function isTerminal(state: WorkflowContinuationSnapshot['state']): boolean { return state === 'SUCCESS' || state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN'; }
function stepFailurePrefix(stepId: typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID): string { return stepId === ORTHOGONAL_TRANSFORM_STEP_ID ? 'LOCAL_ORTHOGONAL_TRANSFORM' : 'LOCAL_RESIZE'; }
function internalAuthorityRef(executionId: string): string { return `${executionId}:${BOUNDED_AGENT_VERIFY_STEP_ID}`; }
function resultTicketId(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw serviceError(400, 'bounded_agent_result_shape', 'Local Agent result payload must be an object');
  return token((result as LocalExecutionResultV2).ticketId, 'result.ticketId');
}
function assertImage(value: DurableResolvedArtifact, code: string, message: string): void {
  if (value.kind !== 'image' || (value.role !== 'ORIGINAL' && value.role !== 'COMPOSITE') || !value.storageId || !/^[a-f0-9]{64}$/i.test(value.sha256) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1) throw serviceError(409, code, message);
}
function assertSameArtifact(actual: DurableResolvedArtifact, expected: WorkflowInputArtifactBinding, code: string, message: string): void {
  const parents = [...actual.parentArtifactIds].sort(); const expectedParents = [...expected.parentArtifactIds].sort();
  if (actual.artifactId !== expected.artifactId || actual.kind !== expected.kind || actual.role !== expected.role || actual.sha256.toLowerCase() !== expected.sha256.toLowerCase() || parents.length !== expectedParents.length || parents.some((value, index) => value !== expectedParents[index])) throw serviceError(409, code, message);
}
function normalizeMode(value: unknown): OrthogonalTransformMode {
  try { return normalizeOrthogonalTransformMode(value); }
  catch (error) { throw serviceError(400, 'bounded_agent_mode_invalid', error instanceof Error ? error.message : 'Orthogonal-transform mode is invalid'); }
}
function positiveInteger(value: unknown, field: string): number { if (!Number.isSafeInteger(value) || Number(value) < 1) throw serviceError(400, 'bounded_agent_geometry_invalid', `${field} must be a positive safe integer`); return Number(value); }
function normalizeAuth(auth: AuthenticatedScope): AuthenticatedScope { return Object.freeze({ tenantId: token(auth?.tenantId, 'auth.tenantId'), userId: token(auth?.userId, 'auth.userId') }); }
function token(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw serviceError(400, 'bounded_agent_request_invalid', `${field} is required`); return value.trim(); }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function sourceScopeProject(ticket: LocalExecutionTicketV2, _source: DurableResolvedArtifact): string { return ticket.scope.projectId; }
function sourceScopeToken(_source: DurableResolvedArtifact, field: string): string { throw serviceError(500, 'bounded_agent_internal_scope_contract', `Internal source scope ${field} is not materialized on durable Artifact resolver output`); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
