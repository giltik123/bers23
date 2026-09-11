import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { normalizeScope, type WorkflowContinuationStore } from '../workflow/WorkflowContinuationStore.ts';
import {
  AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID,
  type AeeSerialAdmittedGraphDriverV1,
  type AeeSerialAdmittedGraphStartCommandV1,
  type AeeSerialAdmittedGraphViewV1,
} from './AeeSerialAdmittedGraphDriverV1.ts';
import { assertAeeAdmittedGraphMemoryBudgetV1 } from './AeeExecutionResourceBudgetV1.ts';
import type { PostgresAeeAdmittedPlanStore } from './PostgresAeeAdmittedPlanStore.ts';

type Delegate = Pick<AeeSerialAdmittedGraphDriverV1, 'start' | 'resume' | 'submitLocalResult' | 'retry' | 'cancel'>;
type PlanReader = Pick<PostgresAeeAdmittedPlanStore, 'get'>;
type ContinuationReader = Pick<WorkflowContinuationStore, 'get'>;

export type AeeResourceBudgetedSerialDriverV1Dependencies = Readonly<{
  delegate: Delegate;
  plans: PlanReader;
  continuations: ContinuationReader;
}>;

/**
 * #548 admission guard around the accepted AE-4b driver.
 *
 * The delegate remains the execution-state coordinator. This guard owns no run,
 * continuation, ticket or Artifact state: it only proves that the immutable
 * admitted graph fits the Core-owned exact executor resource profiles before a
 * call may create or continue a local attempt. Cancellation is always allowed.
 */
export class AeeResourceBudgetedSerialDriverV1 {
  constructor(private readonly dependencies: AeeResourceBudgetedSerialDriverV1Dependencies) {}

  async start(command: AeeSerialAdmittedGraphStartCommandV1, auth: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    const scope = normalizeScope({ ...auth, projectId: command.projectId });
    const durable = await this.dependencies.plans.get(scope, command.graphDigest);
    if (durable) assertAeeAdmittedGraphMemoryBudgetV1(durable.graph);
    return this.dependencies.delegate.start(command, auth);
  }

  async resume(executionId: string, projectId: string, auth: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    await this.assertExistingExecutionBudget(executionId, projectId, auth);
    return this.dependencies.delegate.resume(executionId, projectId, auth);
  }

  async submitLocalResult(
    executionId: string,
    projectId: string,
    auth: AuthenticatedScope,
    result: unknown,
  ): Promise<AeeSerialAdmittedGraphViewV1> {
    await this.assertExistingExecutionBudget(executionId, projectId, auth);
    return this.dependencies.delegate.submitLocalResult(executionId, projectId, auth, result);
  }

  async retry(executionId: string, projectId: string, auth: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    await this.assertExistingExecutionBudget(executionId, projectId, auth);
    return this.dependencies.delegate.retry(executionId, projectId, auth);
  }

  async cancel(executionId: string, projectId: string, auth: AuthenticatedScope): Promise<AeeSerialAdmittedGraphViewV1> {
    return this.dependencies.delegate.cancel(executionId, projectId, auth);
  }

  private async assertExistingExecutionBudget(executionId: string, projectId: string, auth: AuthenticatedScope): Promise<void> {
    const scope = normalizeScope({ ...auth, projectId });
    const snapshot = await this.dependencies.continuations.get(executionId, scope);
    if (!snapshot || snapshot.plan.planId !== AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID) return;
    const durable = await this.dependencies.plans.get(scope, snapshot.plan.planDigest);
    if (!durable) return;
    assertAeeAdmittedGraphMemoryBudgetV1(durable.graph);
  }
}
