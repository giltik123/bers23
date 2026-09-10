import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { DurableResolvedArtifact } from '../artifacts/durableArtifactLineageResolver.ts';
import type { PostgresProjectStore } from '../projects/postgresProjectStore.ts';
import {
  BOUNDED_AGENT_PLAN_ID,
  type BoundedAgentDeterministicWorkflowService,
} from '../workflow/BoundedAgentDeterministicWorkflowService.ts';
import type {
  BoundedAgentExecutionPort,
  BoundedAgentStartCommand,
  BoundedAgentWorkflowView,
} from '../workflow/BoundedAgentExecutionPort.ts';
import {
  normalizeScope,
  type WorkflowContinuationSnapshot,
  type WorkflowContinuationStore,
} from '../workflow/WorkflowContinuationStore.ts';
import {
  assertBoundedAgentAeeCompatibilityReplayV1,
  compileBoundedAgentAeeCompatibilityV1,
} from './BoundedAgentAeeCompatibilityCompilerV1.ts';
import {
  AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID,
  type AeeSerialAdmittedGraphDriverV1,
  type AeeSerialAdmittedGraphViewV1,
} from './AeeSerialAdmittedGraphDriverV1.ts';
import type { PostgresAeeAdmittedPlanStore } from './PostgresAeeAdmittedPlanStore.ts';
import type { PostgresBoundedAgentCompatibilityAdmissionLock } from './PostgresBoundedAgentCompatibilityAdmissionLock.ts';

type ContinuationReader = Pick<WorkflowContinuationStore, 'get' | 'getByClientRequestId'>;
type PlanStore = Pick<PostgresAeeAdmittedPlanStore, 'get' | 'put'>;
type AeeDriver = Pick<AeeSerialAdmittedGraphDriverV1, 'start' | 'resume' | 'submitLocalResult' | 'retry' | 'cancel'>;
type LegacyDriver = Pick<BoundedAgentDeterministicWorkflowService, 'start' | 'resume' | 'submitLocalResult' | 'retry' | 'cancel'>;
type ProjectSourceReader = Pick<PostgresProjectStore, 'currentSourceContext'>;
type ArtifactResolver = Readonly<{ resolve(scope: Scope, artifactId: string): Promise<DurableResolvedArtifact> }>;
type AdmissionLock = Pick<PostgresBoundedAgentCompatibilityAdmissionLock, 'withClientRequestLock'>;

export type BoundedAgentAeeCompatibilityFacadeDependencies = Readonly<{
  continuations: ContinuationReader;
  plans: PlanStore;
  aee: AeeDriver;
  legacy: LegacyDriver;
  projects: ProjectSourceReader;
  artifacts: ArtifactResolver;
  admission: AdmissionLock;
}>;

/**
 * AE-4c.2 compatibility boundary.
 *
 * New clientRequestIds are single-write AEE only. Durable pre-cutover fixed
 * continuations remain dual-read through the legacy delegate. No caller field
 * selects the route; immutable WorkflowContinuation.plan identity does.
 */
export class BoundedAgentAeeCompatibilityFacade implements BoundedAgentExecutionPort {
  private readonly dependencies: BoundedAgentAeeCompatibilityFacadeDependencies;

  constructor(dependencies: BoundedAgentAeeCompatibilityFacadeDependencies) {
    this.dependencies = dependencies;
  }

  async start(commandInput: BoundedAgentStartCommand, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const auth = normalizeAuth(authInput);
    const projectId = token(commandInput?.projectId, 'projectId');
    const clientRequestId = token(commandInput?.clientRequestId, 'clientRequestId');
    const scope = normalizeScope({ ...auth, projectId });

    // Durable continuation wins before consulting today's Project row. This is
    // required for true replay: an admitted AEE execution remains bound to its
    // immutable graph/source revision even if the Project later moves or closes.
    const existing = await this.dependencies.continuations.getByClientRequestId(scope, clientRequestId);
    if (existing) return this.startExisting(existing, commandInput, auth);

    return this.dependencies.admission.withClientRequestLock(scope, clientRequestId, async () => {
      // Re-read after acquiring the scoped admission mutex. Two concurrent first
      // starts may both miss the fast path, but only one may compile/persist.
      const racedExisting = await this.dependencies.continuations.getByClientRequestId(scope, clientRequestId);
      if (racedExisting) return this.startExisting(racedExisting, commandInput, auth);

      const project = await this.dependencies.projects.currentSourceContext(auth, projectId);
      if (!project) throw notFound('bounded_agent_project_not_found', 'Project not found');
      const sourceArtifactId = token(commandInput?.sourceArtifactId, 'sourceArtifactId');
      const source = await this.dependencies.artifacts.resolve(scope, sourceArtifactId);
      const graph = compileBoundedAgentAeeCompatibilityV1(commandInput, project, source);
      const durable = await this.dependencies.plans.put(scope, graph);
      if (durable.graph.digest !== graph.digest) {
        throw conflict('bounded_aee_plan_persistence_mismatch', 'Persisted admitted graph differs from compatibility compiler output');
      }
      const view = await this.dependencies.aee.start({ clientRequestId, projectId, graphDigest: graph.digest }, auth);
      return boundedView(view);
    });
  }

  async resume(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const route = await this.routeExecution(executionIdInput, projectIdInput, authInput);
    if (route.kind === 'AEE') return boundedView(await this.dependencies.aee.resume(route.executionId, route.scope.projectId, route.auth));
    return this.dependencies.legacy.resume(route.executionId, route.scope.projectId, route.auth);
  }

  async submitLocalResult(
    executionIdInput: string,
    projectIdInput: string,
    authInput: AuthenticatedScope,
    result: unknown,
  ): Promise<BoundedAgentWorkflowView> {
    const route = await this.routeExecution(executionIdInput, projectIdInput, authInput);
    if (route.kind === 'AEE') {
      return boundedView(await this.dependencies.aee.submitLocalResult(route.executionId, route.scope.projectId, route.auth, result));
    }
    return this.dependencies.legacy.submitLocalResult(route.executionId, route.scope.projectId, route.auth, result);
  }

  async retry(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const route = await this.routeExecution(executionIdInput, projectIdInput, authInput);
    if (route.kind === 'AEE') return boundedView(await this.dependencies.aee.retry(route.executionId, route.scope.projectId, route.auth));
    return this.dependencies.legacy.retry(route.executionId, route.scope.projectId, route.auth);
  }

  async cancel(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope): Promise<BoundedAgentWorkflowView> {
    const route = await this.routeExecution(executionIdInput, projectIdInput, authInput);
    if (route.kind === 'AEE') return boundedView(await this.dependencies.aee.cancel(route.executionId, route.scope.projectId, route.auth));
    return this.dependencies.legacy.cancel(route.executionId, route.scope.projectId, route.auth);
  }

  private async startExisting(
    snapshot: WorkflowContinuationSnapshot,
    command: BoundedAgentStartCommand,
    auth: AuthenticatedScope,
  ): Promise<BoundedAgentWorkflowView> {
    if (snapshot.plan.planId === BOUNDED_AGENT_PLAN_ID) {
      return this.dependencies.legacy.start(command, auth);
    }
    if (snapshot.plan.planId !== AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID) {
      throw conflict('bounded_agent_plan_unsupported', 'Durable bounded execution has an unsupported immutable plan identity');
    }
    const durable = await this.dependencies.plans.get(snapshot.scope, snapshot.plan.planDigest);
    if (!durable) throw conflict('bounded_aee_plan_unavailable', 'Durable bounded AEE continuation has no admitted graph authority');
    assertBoundedAgentAeeCompatibilityReplayV1(durable.graph, command);
    const view = await this.dependencies.aee.start({
      clientRequestId: snapshot.clientRequestId,
      projectId: snapshot.scope.projectId,
      graphDigest: snapshot.plan.planDigest,
    }, auth);
    return boundedView(view);
  }

  private async routeExecution(executionIdInput: string, projectIdInput: string, authInput: AuthenticatedScope) {
    const auth = normalizeAuth(authInput);
    const executionId = token(executionIdInput, 'executionId');
    const projectId = token(projectIdInput, 'projectId');
    const scope = normalizeScope({ ...auth, projectId });
    const snapshot = await this.dependencies.continuations.get(executionId, scope);
    if (!snapshot) throw notFound('bounded_agent_not_found', 'Bounded Agent workflow was not found in authenticated Project scope');
    if (snapshot.plan.planId === AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID) return Object.freeze({ kind: 'AEE' as const, executionId, scope, auth });
    if (snapshot.plan.planId === BOUNDED_AGENT_PLAN_ID) return Object.freeze({ kind: 'LEGACY' as const, executionId, scope, auth });
    throw conflict('bounded_agent_plan_unsupported', 'Durable bounded execution has an unsupported immutable plan identity');
  }
}

function boundedView(view: AeeSerialAdmittedGraphViewV1): BoundedAgentWorkflowView {
  const nextAction = view.nextAction
    ? Object.freeze({ type: view.nextAction.type, operation: view.nextAction.operation, ticket: view.nextAction.ticket })
    : undefined;
  return Object.freeze({
    executionId: view.executionId,
    revision: view.revision,
    state: view.state,
    ...(nextAction ? { nextAction } : {}),
    ...(view.retryAvailable === undefined ? {} : { retryAvailable: view.retryAvailable }),
    ...(view.attemptStatus === undefined ? {} : { attemptStatus: view.attemptStatus }),
    ...(view.terminalArtifactId === undefined ? {} : { terminalArtifactId: view.terminalArtifactId }),
    ...(view.failureCode === undefined ? {} : { failureCode: view.failureCode }),
  });
}

function normalizeAuth(auth: AuthenticatedScope): AuthenticatedScope {
  return Object.freeze({ tenantId: token(auth?.tenantId, 'tenantId'), userId: token(auth?.userId, 'userId') });
}

function token(value: unknown, path: string): string {
  if (typeof value !== 'string') throw badRequest('bounded_agent_invalid_request', `${path} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized !== value || Buffer.byteLength(normalized, 'utf8') > 256 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw badRequest('bounded_agent_invalid_request', `${path} is invalid`);
  }
  return normalized;
}

function badRequest(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 400, code });
}
function notFound(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 404, code });
}
function conflict(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 409, code });
}
