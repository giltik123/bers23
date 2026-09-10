import { createHash } from 'node:crypto';
import type { LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import {
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_STEP_ID,
  normalizeOrthogonalTransformMode,
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
  countWorkflowLocalExecutionRetries,
  projectWorkflowLocalExecutionAttempt,
} from '../workflow/WorkflowLocalExecutionAttemptRunProjection.ts';
import type { WorkflowBoundLocalExecutionTicketV2Issuer } from '../workflow/WorkflowBoundLocalExecutionTicketV2Issuer.ts';
import {
  normalizeScope,
  sameInputArtifactBindings,
  samePlanBinding,
  type WorkflowContinuationSnapshot,
  type WorkflowContinuationStore,
  type WorkflowInputArtifactBinding,
  type WorkflowPlanBinding,
} from '../workflow/WorkflowContinuationStore.ts';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import { requireAeeAdmittedNodeExecutionAdapterV1 } from './AeeCapabilityExecutionAdapterRegistryV1.ts';
import type { AdmittedPlanGraphV1, AeeAdmittedPlanNodeV1 } from './AeePlanCompilerV1.ts';
import type { PostgresAeeAdmittedPlanStore } from './PostgresAeeAdmittedPlanStore.ts';

export const AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID = 'aee-admitted-plan-v1' as const;
export const AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION = '1' as const;

const EXECUTION_ID_DOMAIN = 'bers:aee:serial-execution:v1\0';
const CHILD_REQUEST_DOMAIN = 'bers:aee:serial-child:v1\0';
const RETRY_REQUEST_DOMAIN = 'bers:aee:serial-retry:v1\0';
const RUN_CHILD_LIMIT = 200;

type PlanReader = Pick<PostgresAeeAdmittedPlanStore, 'get'>;
type TicketReader = Pick<LocalExecutionLedgerV2, 'getV2'>;
type OrthogonalPort = Pick<LocalOrthogonalTransformExecutionService, 'prepare' | 'submit'>;
type ResizePort = Pick<LocalResizeExecutionService, 'prepare' | 'submit'>;
type ProjectReader = Pick<PostgresProjectStore, 'get'>;
type ArtifactResolver = Readonly<{ resolve(scope: Scope, artifactId: string): Promise<DurableResolvedArtifact> }>;
type FinalRecovery = Pick<DeterministicWorkflowStepFinalRecoveryAuthority, 'recover'>;

type LocalOperation = 'ORTHOGONAL_TRANSFORM' | 'RESIZE';
type AttemptStatus = 'FAILED' | 'EXPIRED';

type NodeExecution = Readonly<{
  operation: LocalOperation;
  stepId: typeof ORTHOGONAL_TRANSFORM_STEP_ID | typeof RESIZE_STEP_ID;
  toolCapability: string;
}>;

export type AeeSerialAdmittedGraphStartCommandV1 = Readonly<{
  clientRequestId: string;
  projectId: string;
  graphDigest: string;
}>;

export type AeeSerialAdmittedGraphLocalActionV1 = Readonly<{
  type: 'LOCAL_EXECUTION';
  nodeId: string;
  operation: LocalOperation;
  ticket: LocalExecutionTicketV2;
}>;

export type AeeSerialAdmittedGraphViewV1 = Readonly<{
  executionId: string;
  revision: number;
  state: WorkflowContinuationSnapshot['state'];
  graphDigest: string;
  nextAction?: AeeSerialAdmittedGraphLocalActionV1;
  retryAvailable?: boolean;
  attemptStatus?: AttemptStatus;
  terminalArtifactId?: string;
  failureCode?: string;
}>;

export type AeeSerialAdmittedGraphDriverV1Dependencies = Readonly<{
  plans: PlanReader;
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

type Authority = Readonly<{
  graph: AdmittedPlanGraphV1;
  root: DurableResolvedArtifact;
}>;

/**
 * AE-4b V1 execution coordinator for an already admitted immutable graph.
 *
 * It is deliberately not a planner, provider/model router, ticket issuer,
 * Artifact writer, Project mutator or second scheduler. Graph bytes remain in
 * AeeAdmittedPlanStore; WorkflowContinuation + ExecutionRun remain execution
 * state authority; local deterministic services remain the execution/evidence
 * authority for every node.
 */
export class AeeSerialAdmittedGraphDriverV1 {
  private readonly dependencies: AeeSerialAdmittedGraphDriverV1Dependencies;
  private readonly now: () => number;

  constructor(dependencies: AeeSerialAdmittedGraphDriverV1Dependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? Date.now;
  }

  async start(commandInput: AeeSerialAdmittedGraphStartCommandV1, authInput: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    const auth = normalizeAuth(authInput);
    const command = normalizeStart(commandInput);
    const scope = normalizeScope({ ...auth, projectId: command.projectId });
    const admitted = await this.requireGraph(scope, command.graphDigest);
    const root = await this.resolveGraphRoot(scope, admitted);
    const executionId = executionIdFor(scope, command.clientRequestId);
    const createInput = Object.freeze({
      executionId,
      clientRequestId: command.clientRequestId,
      scope,
      plan: planBinding(admitted),
      inputArtifacts: Object.freeze([workflowBinding(root)]),
    });

    const existing = await this.dependencies.continuations.getByClientRequestId(scope, command.clientRequestId);
    if (!existing) await this.assertCurrentProjectSource(auth, scope, root);

    // Continuation first: READY is a complete durable state. A crash after this
    // insert but before ticket preparation is recovered by resume/start replay.
    // This avoids orphaning a local ticket if a scoped clientRequestId races with
    // a different admitted graph digest.
    const snapshot = await this.dependencies.continuations.create(createInput);
    await this.ensureParentRunning(snapshot);
    return this.advance(snapshot, auth);
  }

  async resume(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    const snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    return this.advance(snapshot, auth);
  }

  async submitLocalResult(
    executionIdInput: string,
    projectIdInput: string,
    authInput: AuthenticatedScope,
    result: unknown,
  ): Promise<AeeSerialAdmittedGraphViewV1> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    let snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    const authority = await this.assertSnapshotAuthority(snapshot);
    const ticketId = resultTicketId(result);

    const completed = snapshot.completedSteps.find(step => step.ticketId === ticketId);
    if (completed) {
      const index = authority.graph.nodes.findIndex(node => node.nodeId === completed.stepId);
      if (index < 0 || completed.artifactIds.length !== 1) throw conflict('aee_serial_completed_binding_invalid', 'Completed AEE ticket is not bound to an admitted graph node');
      const node = authority.graph.nodes[index];
      const source = await this.sourceForNode(authority.graph, snapshot, authority.root, node, index);
      const ticket = await this.requireNodeTicket(snapshot, node, source, ticketId);
      const recovery = await this.recoverNodeTicket(snapshot, node, source, ticket, auth);
      if (recovery.status !== 'SUCCESS' || recovery.artifactId !== completed.artifactIds[0]) {
        throw conflict('aee_serial_result_replay_mismatch', 'Completed AEE result replay differs from durable canonical SUCCESS');
      }
      await this.validateNodeArtifact(snapshot.scope, node, source, recovery.artifactId);
      return this.advance(snapshot, auth);
    }

    if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || !snapshot.currentStepId
      || snapshot.outstandingLocal.ticketId !== ticketId) {
      throw conflict('aee_serial_result_not_outstanding', 'Submitted local result is not the exact outstanding AEE node attempt');
    }
    const nodeIndex = snapshot.completedSteps.length;
    const node = authority.graph.nodes[nodeIndex];
    if (!node || node.nodeId !== snapshot.currentStepId) throw conflict('aee_serial_step_order_invalid', 'Outstanding AEE node is not the next admitted graph node');
    const source = await this.sourceForNode(authority.graph, snapshot, authority.root, node, nodeIndex);
    const ticket = await this.requireNodeTicket(snapshot, node, source, ticketId);
    const recovered = await this.recoverNodeTicket(snapshot, node, source, ticket, auth);
    if (recovered.status === 'SUCCESS') {
      snapshot = await this.completeRecoveredSuccess(snapshot, node, source, ticket, recovered.artifactId);
      await this.reconcileRuns(snapshot, authority.graph);
      return this.advance(snapshot, auth);
    }
    if (recovered.status === 'UNKNOWN') return this.terminalizeUnknown(snapshot, authority.graph, node);
    if (recovered.status === 'FAILED') return this.retryOrBudgetTerminal(snapshot, authority.graph, node, 'FAILED');
    if (this.now() >= ticket.expiresAt) return this.retryOrBudgetTerminal(snapshot, authority.graph, node, 'EXPIRED');
    if (this.wallClockExceeded(snapshot, authority.graph)) return this.terminalizeBudget(snapshot, authority.graph, 'AEE_WALL_CLOCK_BUDGET_EXCEEDED');

    const execution = executionFor(node);
    const submission = execution.operation === 'ORTHOGONAL_TRANSFORM'
      ? await this.dependencies.orthogonal.submit({ ticketId, projectId: scope.projectId, result }, auth)
      : await this.dependencies.resize.submit({ ticketId, projectId: scope.projectId, result }, auth);
    if (submission.status === 'FAILED') return this.retryOrBudgetTerminal(snapshot, authority.graph, node, 'FAILED');
    if (submission.status === 'UNKNOWN') return this.terminalizeUnknown(snapshot, authority.graph, node);
    if (submission.status !== 'SUCCESS' || !submission.artifactId) {
      throw conflict('aee_serial_local_submission_incomplete', 'Admitted deterministic node did not produce one canonical SUCCESS Artifact');
    }
    await this.validateNodeArtifact(snapshot.scope, node, source, submission.artifactId);
    snapshot = await this.dependencies.continuations.completeLocalStep({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      stepId: node.nodeId,
      ticketId,
      artifactIds: Object.freeze([submission.artifactId]),
    });
    await this.reconcileRuns(snapshot, authority.graph);
    return this.advance(snapshot, auth);
  }

  async retry(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    let snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    const authority = await this.assertSnapshotAuthority(snapshot);
    if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || !snapshot.currentStepId) {
      throw conflict('aee_serial_retry_state', 'AEE retry is allowed only for the exact outstanding local node');
    }
    const nodeIndex = snapshot.completedSteps.length;
    const node = authority.graph.nodes[nodeIndex];
    if (!node || node.nodeId !== snapshot.currentStepId) throw conflict('aee_serial_step_order_invalid', 'Outstanding AEE retry node is not the next admitted graph node');
    const source = await this.sourceForNode(authority.graph, snapshot, authority.root, node, nodeIndex);
    const previous = await this.requireNodeTicket(snapshot, node, source, snapshot.outstandingLocal.ticketId);
    const recovery = await this.recoverNodeTicket(snapshot, node, source, previous, auth);
    if (recovery.status === 'SUCCESS') {
      snapshot = await this.completeRecoveredSuccess(snapshot, node, source, previous, recovery.artifactId);
      await this.reconcileRuns(snapshot, authority.graph);
      return this.advance(snapshot, auth);
    }
    if (recovery.status === 'UNKNOWN') return this.terminalizeUnknown(snapshot, authority.graph, node);
    if (recovery.status === 'PENDING' && this.now() < previous.expiresAt) {
      throw conflict('aee_serial_retry_not_available', 'Current AEE local attempt is still active');
    }
    if (this.wallClockExceeded(snapshot, authority.graph)) return this.terminalizeBudget(snapshot, authority.graph, 'AEE_WALL_CLOCK_BUDGET_EXCEEDED');
    if (!await this.retryAvailable(snapshot, authority.graph)) return this.terminalizeBudget(snapshot, authority.graph, 'AEE_RETRY_BUDGET_EXHAUSTED');

    const replacement = await this.prepareNodeTicket(snapshot, node, source, previous.ticketId, auth);
    snapshot = await this.dependencies.continuations.retryLocalResult({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      continuationStepId: node.nodeId,
      previousTicketId: previous.ticketId,
      ticket: ticketBinding(replacement),
    });
    await this.reconcileRuns(snapshot, authority.graph);
    return this.advance(snapshot, auth);
  }

  async cancel(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    const auth = normalizeAuth(authInput);
    const scope = normalizeScope({ ...auth, projectId: token(projectIdInput, 'projectId') });
    let snapshot = await this.requireSnapshot(token(executionIdInput, 'executionId'), scope);
    const authority = await this.assertSnapshotAuthority(snapshot);
    if (snapshot.state === 'CANCELLED') {
      await this.reconcileRuns(snapshot, authority.graph);
      return terminalView(snapshot);
    }
    if (isTerminal(snapshot.state)) throw conflict('aee_serial_cancel_terminal', `AEE workflow is already ${snapshot.state}`);
    await this.reconcileRuns(snapshot, authority.graph);
    snapshot = await this.dependencies.continuations.cancel({ executionId: snapshot.executionId, scope, expectedRevision: snapshot.revision });
    await this.reconcileRuns(snapshot, authority.graph);
    return terminalView(snapshot);
  }

  private async advance(initial: WorkflowContinuationSnapshot, auth: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    let snapshot = initial;
    for (let guard = 0; guard < 72; guard += 1) {
      const authority = await this.assertSnapshotAuthority(snapshot);
      const graph = authority.graph;
      if (isTerminal(snapshot.state)) {
        await this.reconcileRuns(snapshot, graph);
        return terminalView(snapshot);
      }
      if (snapshot.state === 'RUNNING_INTERNAL') {
        throw conflict('aee_serial_internal_state_forbidden', 'AE-4b has no internal workflow step; evaluator/replanning semantics belong to AE-5');
      }
      if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
        const nodeIndex = snapshot.completedSteps.length;
        const node = graph.nodes[nodeIndex];
        if (!node || node.nodeId !== snapshot.currentStepId || !snapshot.outstandingLocal) {
          throw conflict('aee_serial_step_order_invalid', 'Waiting AEE continuation is not bound to the next admitted graph node');
        }
        const source = await this.sourceForNode(graph, snapshot, authority.root, node, nodeIndex);
        const ticket = await this.requireNodeTicket(snapshot, node, source, snapshot.outstandingLocal.ticketId);
        await this.reconcileRuns(snapshot, graph);
        const recovery = await this.recoverNodeTicket(snapshot, node, source, ticket, auth);
        if (recovery.status === 'SUCCESS') {
          snapshot = await this.completeRecoveredSuccess(snapshot, node, source, ticket, recovery.artifactId);
          await this.reconcileRuns(snapshot, graph);
          continue;
        }
        if (recovery.status === 'UNKNOWN') return this.terminalizeUnknown(snapshot, graph, node);
        if (recovery.status === 'FAILED') return this.retryOrBudgetTerminal(snapshot, graph, node, 'FAILED');
        if (this.now() >= ticket.expiresAt) return this.retryOrBudgetTerminal(snapshot, graph, node, 'EXPIRED');
        if (this.wallClockExceeded(snapshot, graph)) return this.terminalizeBudget(snapshot, graph, 'AEE_WALL_CLOCK_BUDGET_EXCEEDED');
        return Object.freeze({
          executionId: snapshot.executionId,
          revision: snapshot.revision,
          state: snapshot.state,
          graphDigest: graph.digest,
          nextAction: Object.freeze({ type: 'LOCAL_EXECUTION' as const, nodeId: node.nodeId, operation: executionFor(node).operation, ticket }),
        });
      }
      if (snapshot.state !== 'READY') throw conflict('aee_serial_state_invalid', `Unsupported AEE continuation state ${snapshot.state}`);

      if (snapshot.completedSteps.length === graph.nodes.length) {
        const terminal = snapshot.completedSteps.at(-1);
        if (!terminal || terminal.stepId !== graph.terminal.nodeId || terminal.artifactIds.length !== 1) {
          throw conflict('aee_serial_terminal_binding_invalid', 'Completed AEE graph does not expose the exact admitted terminal node Artifact');
        }
        snapshot = await this.dependencies.continuations.succeed({
          executionId: snapshot.executionId,
          scope: snapshot.scope,
          expectedRevision: snapshot.revision,
          terminalArtifactId: terminal.artifactIds[0],
        });
        await this.reconcileRuns(snapshot, graph);
        continue;
      }

      if (this.wallClockExceeded(snapshot, graph)) return this.terminalizeBudget(snapshot, graph, 'AEE_WALL_CLOCK_BUDGET_EXCEEDED');
      const nodeIndex = snapshot.completedSteps.length;
      const node = graph.nodes[nodeIndex];
      if (!node) throw conflict('aee_serial_step_order_invalid', 'AEE continuation has no admitted next node');
      const source = await this.sourceForNode(graph, snapshot, authority.root, node, nodeIndex);
      const ticket = await this.prepareNodeTicket(snapshot, node, source, undefined, auth);
      snapshot = await this.dependencies.continuations.waitForLocalResult({
        executionId: snapshot.executionId,
        scope: snapshot.scope,
        expectedRevision: snapshot.revision,
        continuationStepId: node.nodeId,
        ticket: ticketBinding(ticket),
      });
      await this.reconcileRuns(snapshot, graph);
    }
    throw conflict('aee_serial_advance_guard', 'AEE serial driver exceeded its bounded advance loop');
  }

  private async assertSnapshotAuthority(snapshot: WorkflowContinuationSnapshot): Promise<Authority> {
    const expectedExecutionId = executionIdFor(snapshot.scope, snapshot.clientRequestId);
    if (snapshot.executionId !== expectedExecutionId) throw conflict('aee_serial_execution_identity_mismatch', 'AEE continuation execution identity is invalid');
    const graph = await this.requireGraph(snapshot.scope, snapshot.plan.planDigest);
    if (!samePlanBinding(snapshot.plan, planBinding(graph))) throw conflict('aee_serial_plan_binding_mismatch', 'Workflow plan binding differs from immutable admitted graph authority');
    const root = await this.resolveGraphRoot(snapshot.scope, graph);
    if (!sameInputArtifactBindings(snapshot.inputArtifacts, [workflowBinding(root)])) {
      throw conflict('aee_serial_root_binding_mismatch', 'Workflow root binding differs from immutable admitted graph source');
    }
    if (snapshot.completedSteps.length > graph.nodes.length) throw conflict('aee_serial_completed_prefix_invalid', 'AEE continuation completed more nodes than admitted by the graph');

    for (let index = 0; index < snapshot.completedSteps.length; index += 1) {
      const completed = snapshot.completedSteps[index];
      const node = graph.nodes[index];
      if (!node || completed.stepId !== node.nodeId || !completed.ticketId || completed.artifactIds.length !== 1) {
        throw conflict('aee_serial_completed_prefix_invalid', 'AEE completed steps are not the exact admitted topological prefix');
      }
      const source = await this.sourceForNode(graph, snapshot, root, node, index);
      const ticket = await this.requireNodeTicket(snapshot, node, source, completed.ticketId);
      const recovery = await this.recoverNodeTicket(snapshot, node, source, ticket, { tenantId: snapshot.scope.tenantId, userId: snapshot.scope.userId });
      if (recovery.status !== 'SUCCESS' || recovery.artifactId !== completed.artifactIds[0]) {
        throw conflict('aee_serial_completed_recovery_mismatch', `Completed AEE node ${node.nodeId} no longer reproduces durable SUCCESS evidence`);
      }
      await this.validateNodeArtifact(snapshot.scope, node, source, completed.artifactIds[0]);
    }

    if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
      const node = graph.nodes[snapshot.completedSteps.length];
      if (!node || !snapshot.currentStepId || snapshot.currentStepId !== node.nodeId || snapshot.outstandingLocal?.stepId !== node.nodeId) {
        throw conflict('aee_serial_waiting_binding_invalid', 'AEE waiting state is not bound to the exact next admitted node');
      }
    } else if (!isTerminal(snapshot.state) && snapshot.state !== 'READY' && snapshot.state !== 'RUNNING_INTERNAL') {
      throw conflict('aee_serial_state_invalid', `Unsupported AEE continuation state ${snapshot.state}`);
    }

    if (snapshot.state === 'SUCCESS') {
      const terminal = snapshot.completedSteps.at(-1);
      if (!terminal || terminal.stepId !== graph.terminal.nodeId || terminal.artifactIds.length !== 1 || snapshot.terminalArtifactId !== terminal.artifactIds[0]) {
        throw conflict('aee_serial_terminal_binding_invalid', 'AEE SUCCESS is not bound to the admitted terminal Artifact');
      }
    }
    return Object.freeze({ graph, root });
  }

  private async requireGraph(scope: Scope, digestInput: string): Promise<AdmittedPlanGraphV1> {
    const digest = sha256(digestInput, 'graphDigest');
    const record = await this.dependencies.plans.get(scope, digest);
    if (!record) throw notFound('aee_serial_graph_not_found', 'Admitted graph was not found in authenticated Project scope');
    if (record.graph.digest !== digest || record.graph.source.projectId !== scope.projectId) {
      throw conflict('aee_serial_graph_binding_invalid', 'Durable admitted graph binding differs from requested scope/digest');
    }
    return record.graph;
  }

  private async resolveGraphRoot(scope: Scope, graph: AdmittedPlanGraphV1): Promise<DurableResolvedArtifact> {
    const root = await this.dependencies.artifacts.resolve(scope, graph.source.sourceRef);
    assertImage(root, 'aee_serial_root_invalid', 'Admitted AEE source is not a durable canonical IMAGE');
    if (root.artifactId !== graph.source.sourceRef || root.role !== graph.source.artifactRole
      || root.width !== graph.source.width || root.height !== graph.source.height || graph.source.projectId !== scope.projectId) {
      throw conflict('aee_serial_root_binding_invalid', 'Durable canonical source differs from admitted graph source authority');
    }
    return root;
  }

  private async sourceForNode(
    graph: AdmittedPlanGraphV1,
    snapshot: WorkflowContinuationSnapshot,
    root: DurableResolvedArtifact,
    node: AeeAdmittedPlanNodeV1,
    nodeIndex: number,
  ): Promise<DurableResolvedArtifact> {
    if (node.inputs.length !== 1 || node.inputs[0].name !== 'source') {
      throw conflict('aee_serial_input_surface_unsupported', 'AE-4b V1 executes only the accepted single-source deterministic capability surface');
    }
    const input = node.inputs[0];
    if (input.source.kind === 'INTENT_SOURCE') {
      if (node.dependsOn.length !== 0 || input.artifactRole !== root.role) throw conflict('aee_serial_source_binding_invalid', `AEE node ${node.nodeId} has an invalid admitted root binding`);
      return root;
    }
    const dependencyId = input.source.nodeId;
    if (node.dependsOn.length !== 1 || node.dependsOn[0] !== dependencyId) {
      throw conflict('aee_serial_dependency_binding_invalid', `AEE node ${node.nodeId} dependency differs from its admitted input`);
    }
    const dependencyIndex = graph.nodes.findIndex(candidate => candidate.nodeId === dependencyId);
    if (dependencyIndex < 0 || dependencyIndex >= nodeIndex) throw conflict('aee_serial_dependency_binding_invalid', `AEE node ${node.nodeId} dependency is not a prior admitted node`);
    const completed = snapshot.completedSteps[dependencyIndex];
    const upstream = graph.nodes[dependencyIndex];
    if (!completed || completed.stepId !== dependencyId || completed.artifactIds.length !== 1) {
      throw conflict('aee_serial_dependency_unavailable', `AEE node ${node.nodeId} dependency has no durable completed Artifact`);
    }
    const artifact = await this.dependencies.artifacts.resolve(snapshot.scope, completed.artifactIds[0]);
    assertImage(artifact, 'aee_serial_dependency_invalid', `AEE dependency ${dependencyId} is not a canonical IMAGE`);
    if (artifact.role !== upstream.output.artifactRole || artifact.width !== upstream.output.width || artifact.height !== upstream.output.height
      || input.artifactRole !== artifact.role) {
      throw conflict('aee_serial_dependency_binding_invalid', `AEE dependency ${dependencyId} differs from admitted output authority`);
    }
    return artifact;
  }

  private async prepareNodeTicket(
    snapshot: WorkflowContinuationSnapshot,
    node: AeeAdmittedPlanNodeV1,
    source: DurableResolvedArtifact,
    retryOfTicketId: string | undefined,
    auth: AuthenticatedScope,
  ): Promise<LocalExecutionTicketV2> {
    const execution = executionFor(node);
    const childClientRequestId = childRequestIdFor(snapshot.executionId, node.nodeId, retryOfTicketId);
    const prepared = await this.dependencies.workflowTickets.withWorkflowBinding({
      scope: snapshot.scope,
      workflowId: snapshot.executionId,
      allowedStepIds: [execution.stepId],
    }, async () => {
      if (execution.operation === 'ORTHOGONAL_TRANSFORM') {
        const mode = orthogonalMode(node);
        return this.dependencies.orthogonal.prepare({ projectId: snapshot.scope.projectId, sourceArtifactId: source.artifactId, clientRequestId: childClientRequestId, mode }, auth);
      }
      const target = resizeTarget(node, source);
      return this.dependencies.resize.prepare({ projectId: snapshot.scope.projectId, sourceArtifactId: source.artifactId, clientRequestId: childClientRequestId, width: target.width, height: target.height }, auth);
    });
    if (prepared.executionId !== prepared.ticket.requestId) throw conflict('aee_serial_child_execution_identity_invalid', 'Deterministic local service returned inconsistent child execution identity');
    await this.assertNodeTicket(snapshot, node, source, prepared.ticket, childClientRequestId);
    const recovery = await this.recoverNodeTicket(snapshot, node, source, prepared.ticket, auth);
    if (recovery.status !== 'PENDING') {
      throw conflict('aee_serial_prepared_ticket_not_pending', 'New/replayed AEE node ticket is already terminal before continuation binding');
    }
    return prepared.ticket;
  }

  private async requireNodeTicket(
    snapshot: WorkflowContinuationSnapshot,
    node: AeeAdmittedPlanNodeV1,
    source: DurableResolvedArtifact,
    ticketId: string,
  ): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.tickets.getV2(token(ticketId, 'ticketId'));
    if (!ticket) throw conflict('aee_serial_ticket_unavailable', 'Durable AEE local ticket is unavailable');
    await this.assertNodeTicket(snapshot, node, source, ticket);
    const outstanding = snapshot.outstandingLocal?.ticketId === ticket.ticketId ? snapshot.outstandingLocal : undefined;
    const completed = snapshot.completedSteps.find(step => step.ticketId === ticket.ticketId);
    if (!outstanding && !completed) throw conflict('aee_serial_ticket_binding_invalid', 'Local ticket is not bound to this AEE continuation');
    if (outstanding && (outstanding.stepId !== node.nodeId || outstanding.ticketVersion !== ticket.version
      || outstanding.nonce !== ticket.nonce || outstanding.expiresAt !== new Date(ticket.expiresAt).toISOString())) {
      throw conflict('aee_serial_ticket_identity_mismatch', 'Outstanding AEE ticket identity changed after continuation persistence');
    }
    return ticket;
  }

  private async assertNodeTicket(
    snapshot: WorkflowContinuationSnapshot,
    node: AeeAdmittedPlanNodeV1,
    source: DurableResolvedArtifact,
    ticket: LocalExecutionTicketV2,
    childClientRequestId?: string,
  ): Promise<void> {
    const execution = executionFor(node);
    const adapter = requireAeeAdmittedNodeExecutionAdapterV1(node);
    if (adapter.toolCapability !== execution.toolCapability) throw conflict('aee_serial_adapter_binding_invalid', `AEE adapter for ${node.nodeId} differs from deterministic tool authority`);
    if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.workflowId !== snapshot.executionId || ticket.stepId !== execution.stepId
      || ticket.scope.tenantId !== snapshot.scope.tenantId || ticket.scope.userId !== snapshot.scope.userId || ticket.scope.projectId !== snapshot.scope.projectId
      || ticket.policy !== 'LOCAL_ONLY' || ticket.cost.providerCalls !== 0 || ticket.cost.paidCloudCredits !== 0
      || ticket.operation.capability !== execution.toolCapability) {
      throw conflict('aee_serial_ticket_contract_invalid', `Local ticket for ${node.nodeId} differs from admitted AE-4b authority`);
    }
    if (childClientRequestId) {
      const expectedIdempotencyKey = `${childClientRequestId}:${execution.stepId}:local-v2`;
      if (ticket.idempotencyKey !== expectedIdempotencyKey) throw conflict('aee_serial_ticket_idempotency_invalid', `Local ticket for ${node.nodeId} has an unexpected deterministic idempotency binding`);
    }
    if (ticket.inputs.length !== 1) throw conflict('aee_serial_ticket_input_invalid', `Local ticket for ${node.nodeId} must consume exactly one canonical source`);
    const input = ticket.inputs[0];
    if (input.artifactId !== source.artifactId || input.kind !== source.kind || input.role !== source.role || input.sha256.toLowerCase() !== source.sha256.toLowerCase()) {
      throw conflict('aee_serial_ticket_input_invalid', `Local ticket for ${node.nodeId} differs from its admitted canonical source`);
    }
  }

  private async recoverNodeTicket(
    snapshot: WorkflowContinuationSnapshot,
    node: AeeAdmittedPlanNodeV1,
    source: DurableResolvedArtifact,
    ticket: LocalExecutionTicketV2,
    auth: AuthenticatedScope,
  ) {
    return this.dependencies.finalRecovery.recover(recoveryBinding(snapshot.executionId, ticket, source, node), auth);
  }

  private async completeRecoveredSuccess(
    snapshot: WorkflowContinuationSnapshot,
    node: AeeAdmittedPlanNodeV1,
    source: DurableResolvedArtifact,
    ticket: LocalExecutionTicketV2,
    artifactId: string,
  ): Promise<WorkflowContinuationSnapshot> {
    await this.validateNodeArtifact(snapshot.scope, node, source, artifactId);
    return this.dependencies.continuations.completeLocalStep({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      stepId: node.nodeId,
      ticketId: ticket.ticketId,
      artifactIds: Object.freeze([artifactId]),
    });
  }

  private async validateNodeArtifact(scope: Scope, node: AeeAdmittedPlanNodeV1, source: DurableResolvedArtifact, artifactId: string): Promise<void> {
    const artifact = await this.dependencies.artifacts.resolve(scope, artifactId);
    assertImage(artifact, 'aee_serial_result_artifact_invalid', `AEE node ${node.nodeId} result is not a durable canonical IMAGE`);
    if (artifact.role !== node.output.artifactRole || artifact.width !== node.output.width || artifact.height !== node.output.height
      || artifact.parentArtifactIds.length !== 1 || artifact.parentArtifactIds[0] !== source.artifactId) {
      throw conflict('aee_serial_result_lineage_invalid', `AEE node ${node.nodeId} result differs from admitted output geometry/lineage`);
    }
  }

  private async assertCurrentProjectSource(auth: AuthenticatedScope, scope: Scope, root: DurableResolvedArtifact): Promise<void> {
    const project = await this.dependencies.projects.get(auth, scope.projectId);
    if (!project) throw notFound('project_not_found', 'Project not found');
    if (project.current_image_storage_id !== root.storageId || Number(project.width) !== root.width || Number(project.height) !== root.height) {
      throw conflict('aee_serial_project_source_conflict', 'New AEE execution source is not the current canonical Project IMAGE');
    }
  }

  private async requireSnapshot(executionId: string, scope: Scope): Promise<WorkflowContinuationSnapshot> {
    const snapshot = await this.dependencies.continuations.get(executionId, scope);
    if (!snapshot) throw notFound('aee_serial_not_found', 'AEE workflow was not found in authenticated Project scope');
    return snapshot;
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
    if (issued.run.status !== 'QUEUED') throw conflict('aee_serial_run_parent_conflict', `AEE workflow parent run is ${issued.run.status}`);
    return this.dependencies.runs.start(issued.run.scope, issued.run.runId);
  }

  private async requireRunningParent(snapshot: WorkflowContinuationSnapshot): Promise<ExecutionRun> {
    const parent = await this.dependencies.runs.getByAuthority(snapshot.scope, 'WORKFLOW_CONTINUATION', snapshot.executionId);
    if (!parent) return this.ensureParentRunning(snapshot);
    if (parent.status === 'QUEUED') return this.dependencies.runs.start(parent.scope, parent.runId);
    if (parent.status !== 'RUNNING') throw conflict('aee_serial_run_parent_conflict', `AEE workflow parent run is ${parent.status}`);
    return parent;
  }

  private async reconcileRuns(snapshot: WorkflowContinuationSnapshot, graph: AdmittedPlanGraphV1): Promise<void> {
    let parent = await this.dependencies.runs.getByAuthority(snapshot.scope, 'WORKFLOW_CONTINUATION', snapshot.executionId);
    if (!parent) parent = await this.ensureParentRunning(snapshot);
    if (isTerminal(snapshot.state) && terminalRunMatches(parent, snapshot.state)) return;
    if (parent.status === 'QUEUED') parent = await this.dependencies.runs.start(parent.scope, parent.runId);
    if (parent.status !== 'RUNNING') throw conflict('aee_serial_run_parent_conflict', `AEE workflow parent run is ${parent.status}`);
    const admittedNodeIds = graph.nodes.map(node => node.nodeId);

    for (const completed of snapshot.completedSteps) {
      if (!completed.ticketId || !admittedNodeIds.includes(completed.stepId)) throw conflict('aee_serial_run_completed_binding_invalid', 'AEE completed node cannot be projected without exact local ticket authority');
      await projectWorkflowLocalExecutionAttempt({
        runs: this.dependencies.runs,
        parent,
        acceptedStepIds: admittedNodeIds,
        stepId: completed.stepId,
        ticketId: completed.ticketId,
        target: 'SUCCEEDED',
      });
    }
    if (snapshot.outstandingLocal) {
      await projectWorkflowLocalExecutionAttempt({
        runs: this.dependencies.runs,
        parent,
        acceptedStepIds: admittedNodeIds,
        stepId: snapshot.outstandingLocal.stepId,
        ticketId: snapshot.outstandingLocal.ticketId,
        target: 'RUNNING',
      });
    }
    if (!isTerminal(snapshot.state)) return;

    const reason = snapshot.failureCode ?? (snapshot.state === 'CANCELLED' ? 'WORKFLOW_CANCELLED' : `AEE_SERIAL_${snapshot.state}`);
    if (snapshot.state !== 'SUCCESS') {
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
    if (snapshot.state === 'SUCCESS') await this.dependencies.runs.succeed(parent.scope, parent.runId);
    else if (snapshot.state === 'CANCELLED') await this.dependencies.runs.cancel(parent.scope, parent.runId, reason);
    else if (snapshot.state === 'UNKNOWN') await this.dependencies.runs.markUnknown(parent.scope, parent.runId, reason);
    else await this.dependencies.runs.fail(parent.scope, parent.runId, reason);
  }

  private async retryAvailable(snapshot: WorkflowContinuationSnapshot, graph: AdmittedPlanGraphV1): Promise<boolean> {
    const parent = await this.requireRunningParent(snapshot);
    const retries = await countWorkflowLocalExecutionRetries({
      runs: this.dependencies.runs,
      parent,
      acceptedStepIds: graph.nodes.map(candidate => candidate.nodeId),
    });
    return retries < graph.effectiveExecution.maxRetries;
  }

  private async retryOrBudgetTerminal(
    snapshot: WorkflowContinuationSnapshot,
    graph: AdmittedPlanGraphV1,
    node: AeeAdmittedPlanNodeV1,
    status: AttemptStatus,
  ): Promise<AeeSerialAdmittedGraphViewV1> {
    await this.reconcileRuns(snapshot, graph);
    if (this.wallClockExceeded(snapshot, graph)) return this.terminalizeBudget(snapshot, graph, 'AEE_WALL_CLOCK_BUDGET_EXCEEDED');
    if (!await this.retryAvailable(snapshot, graph)) return this.terminalizeBudget(snapshot, graph, 'AEE_RETRY_BUDGET_EXHAUSTED');
    return retryView(snapshot, status);
  }

  private async terminalizeUnknown(snapshot: WorkflowContinuationSnapshot, graph: AdmittedPlanGraphV1, node: AeeAdmittedPlanNodeV1): Promise<AeeSerialAdmittedGraphViewV1> {
    const unknown = await this.dependencies.continuations.markUnknown({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      failureCode: `AEE_NODE_${node.nodeId}_UNKNOWN`,
    });
    await this.reconcileRuns(unknown, graph);
    return terminalView(unknown);
  }

  private async terminalizeBudget(snapshot: WorkflowContinuationSnapshot, graph: AdmittedPlanGraphV1, code: string): Promise<AeeSerialAdmittedGraphViewV1> {
    const failed = await this.dependencies.continuations.fail({
      executionId: snapshot.executionId,
      scope: snapshot.scope,
      expectedRevision: snapshot.revision,
      failureCode: code,
    });
    await this.reconcileRuns(failed, graph);
    return terminalView(failed);
  }

  private wallClockExceeded(snapshot: WorkflowContinuationSnapshot, graph: AdmittedPlanGraphV1): boolean {
    const startedAt = Date.parse(snapshot.createdAt);
    if (!Number.isFinite(startedAt)) throw conflict('aee_serial_timestamp_invalid', 'AEE continuation creation timestamp is invalid');
    return this.now() - startedAt >= graph.effectiveExecution.maxWallClockMs;
  }
}

function executionFor(node: AeeAdmittedPlanNodeV1): NodeExecution {
  const adapter = requireAeeAdmittedNodeExecutionAdapterV1(node);
  if (node.capabilityId === AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1) {
    if (adapter.toolCapability !== ORTHOGONAL_TRANSFORM_CAPABILITY) throw conflict('aee_serial_adapter_binding_invalid', 'Orthogonal-transform AEE adapter differs from canonical deterministic tool');
    return Object.freeze({ operation: 'ORTHOGONAL_TRANSFORM' as const, stepId: ORTHOGONAL_TRANSFORM_STEP_ID, toolCapability: ORTHOGONAL_TRANSFORM_CAPABILITY });
  }
  if (node.capabilityId === AEE_CAPABILITY_RESIZE_V1) {
    if (adapter.toolCapability !== RESIZE_CAPABILITY) throw conflict('aee_serial_adapter_binding_invalid', 'Resize AEE adapter differs from canonical deterministic tool');
    return Object.freeze({ operation: 'RESIZE' as const, stepId: RESIZE_STEP_ID, toolCapability: RESIZE_CAPABILITY });
  }
  throw conflict('aee_serial_capability_unsupported', `AE-4b V1 has no execution path for ${node.capabilityId}`);
}

function orthogonalMode(node: AeeAdmittedPlanNodeV1) {
  if (Object.keys(node.parameters).length !== 1 || !Object.prototype.hasOwnProperty.call(node.parameters, 'mode')) {
    throw conflict('aee_serial_node_parameters_invalid', `AEE node ${node.nodeId} does not have the exact orthogonal-transform parameter contract`);
  }
  try { return normalizeOrthogonalTransformMode(node.parameters.mode); }
  catch (error) { throw conflict('aee_serial_node_parameters_invalid', error instanceof Error ? error.message : 'Orthogonal-transform mode is invalid'); }
}

function resizeTarget(node: AeeAdmittedPlanNodeV1, source: DurableResolvedArtifact) {
  if (Object.keys(node.parameters).length !== 2 || !Object.prototype.hasOwnProperty.call(node.parameters, 'width') || !Object.prototype.hasOwnProperty.call(node.parameters, 'height')) {
    throw conflict('aee_serial_node_parameters_invalid', `AEE node ${node.nodeId} does not have the exact Resize parameter contract`);
  }
  try {
    const target = normalizeResizeDimensions({ width: Number(node.parameters.width), height: Number(node.parameters.height) }, source.width, source.height);
    if (target.width !== node.output.width || target.height !== node.output.height) throw new Error('Resize target differs from admitted output geometry');
    return target;
  } catch (error) { throw conflict('aee_serial_node_parameters_invalid', error instanceof Error ? error.message : 'Resize parameters are invalid'); }
}

function recoveryBinding(workflowId: string, ticket: LocalExecutionTicketV2, source: DurableResolvedArtifact, node: AeeAdmittedPlanNodeV1) {
  if (source.role !== 'ORIGINAL' && source.role !== 'COMPOSITE') throw conflict('aee_serial_recovery_source_invalid', 'AE-4b deterministic recovery source must be ORIGINAL or COMPOSITE');
  const common = {
    projectId: ticket.scope.projectId,
    workflowId,
    executionId: ticket.requestId,
    idempotencyKey: ticket.idempotencyKey,
    ticket: Object.freeze({ ticketId: ticket.ticketId, ticketVersion: '2' as const, nonce: ticket.nonce, expiresAt: new Date(ticket.expiresAt).toISOString() }),
    source: Object.freeze({ artifactId: source.artifactId, role: source.role, sha256: source.sha256, storageId: source.storageId, width: source.width, height: source.height }),
  };
  if (node.capabilityId === AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1) return Object.freeze({ ...common, operation: 'ORTHOGONAL_TRANSFORM' as const, mode: orthogonalMode(node) });
  if (node.capabilityId === AEE_CAPABILITY_RESIZE_V1) {
    const target = resizeTarget(node, source);
    return Object.freeze({ ...common, operation: 'RESIZE' as const, width: target.width, height: target.height });
  }
  throw conflict('aee_serial_capability_unsupported', `AE-4b V1 cannot recover ${node.capabilityId}`);
}

function planBinding(graph: AdmittedPlanGraphV1): WorkflowPlanBinding {
  return Object.freeze({ planId: AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID, planRevision: AEE_SERIAL_ADMITTED_GRAPH_PLAN_REVISION, planDigest: graph.digest });
}

function workflowBinding(artifact: DurableResolvedArtifact): WorkflowInputArtifactBinding {
  return Object.freeze({
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    role: artifact.role,
    sha256: artifact.sha256.toLowerCase(),
    parentArtifactIds: Object.freeze([...artifact.parentArtifactIds].sort()),
  });
}

function executionIdFor(scope: Scope, clientRequestId: string): string {
  const digest = createHash('sha256').update(EXECUTION_ID_DOMAIN).update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32);
  return `aee-serial-${digest}`;
}

function childRequestIdFor(workflowId: string, nodeId: string, retryOfTicketId: string | undefined): string {
  const domain = retryOfTicketId ? RETRY_REQUEST_DOMAIN : CHILD_REQUEST_DOMAIN;
  const material = retryOfTicketId ? `${workflowId}\0${nodeId}\0${retryOfTicketId}` : `${workflowId}\0${nodeId}`;
  const digest = createHash('sha256').update(domain).update(material).digest('hex').slice(0, 32);
  return `aee-child-${nodeId}-${digest}`;
}

function ticketBinding(ticket: LocalExecutionTicketV2) {
  return Object.freeze({ stepId: ticket.stepId, ticketId: ticket.ticketId, ticketVersion: ticket.version, nonce: ticket.nonce, expiresAt: new Date(ticket.expiresAt).toISOString() });
}

function normalizeStart(command: AeeSerialAdmittedGraphStartCommandV1): AeeSerialAdmittedGraphStartCommandV1 {
  return Object.freeze({
    clientRequestId: token(command?.clientRequestId, 'clientRequestId'),
    projectId: token(command?.projectId, 'projectId'),
    graphDigest: sha256(command?.graphDigest, 'graphDigest'),
  });
}

function normalizeAuth(auth: AuthenticatedScope): AuthenticatedScope {
  return Object.freeze({ tenantId: token(auth?.tenantId, 'auth.tenantId'), userId: token(auth?.userId, 'auth.userId') });
}

function resultTicketId(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw requestError('aee_serial_result_shape_invalid', 'AEE local result payload must be an object');
  return token((result as LocalExecutionResultV2).ticketId, 'result.ticketId');
}

function retryView(snapshot: WorkflowContinuationSnapshot, status: AttemptStatus): AeeSerialAdmittedGraphViewV1 {
  return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, graphDigest: snapshot.plan.planDigest, retryAvailable: true, attemptStatus: status });
}

function terminalView(snapshot: WorkflowContinuationSnapshot): AeeSerialAdmittedGraphViewV1 {
  return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, graphDigest: snapshot.plan.planDigest, terminalArtifactId: snapshot.terminalArtifactId, failureCode: snapshot.failureCode });
}

function isTerminal(state: WorkflowContinuationSnapshot['state']): boolean {
  return state === 'SUCCESS' || state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN';
}

function terminalRunMatches(run: ExecutionRun, state: WorkflowContinuationSnapshot['state']): boolean {
  return (state === 'SUCCESS' && run.status === 'SUCCEEDED') || (state === 'FAILED' && run.status === 'FAILED')
    || (state === 'CANCELLED' && run.status === 'CANCELLED') || (state === 'UNKNOWN' && run.status === 'UNKNOWN');
}

function assertImage(value: DurableResolvedArtifact, code: string, message: string): void {
  if (value.kind !== 'image' || (value.role !== 'ORIGINAL' && value.role !== 'COMPOSITE') || !value.storageId
    || !/^[a-f0-9]{64}$/i.test(value.sha256) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width < 1 || value.height < 1) throw conflict(code, message);
}

function token(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw requestError('aee_serial_request_invalid', `${field} is required`);
  const normalized = value.trim();
  if (normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw requestError('aee_serial_request_invalid', `${field} is invalid`);
  return normalized;
}

function sha256(value: unknown, field: string): string {
  const normalized = token(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw requestError('aee_serial_digest_invalid', `${field} must be SHA-256 hex`);
  return normalized;
}

function requestError(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 400, code });
}
function notFound(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 404, code });
}
function conflict(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 409, code });
}
