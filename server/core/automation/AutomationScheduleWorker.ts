import type { AutomationManualExecutionService, AutomationManualExecutionView } from './AutomationManualExecutionService.ts';
import type { AutomationOwnerScope } from './PostgresAutomationDefinitionStore.ts';
import type { PostgresAutomationInvocationStore } from './PostgresAutomationInvocationStore.ts';
import type {
  AutomationScheduleClaim,
  AutomationScheduleRecoveryCursor,
  AutomationTriggerOccurrence,
  PostgresAutomationScheduleStore,
} from './PostgresAutomationScheduleStore.ts';

const TERMINAL_STATES = new Set(['SUCCESS','FAILED','CANCELLED']);
const CONFIGURATION_FAILURE_CODES = new Set([
  'automation_not_found',
  'automation_revision_conflict',
  'automation_not_active',
  'project_not_found',
  'automation_project_source_invalid',
  'automation_project_source_geometry_conflict',
]);

type SchedulePort = Pick<PostgresAutomationScheduleStore,
  'claimDue' | 'latestExecuteBefore' | 'commitOccurrence' | 'listLatestExecuteOccurrences'>;
type InvocationPort = Pick<PostgresAutomationInvocationStore, 'bind'>;
type ExecutionPort = Pick<AutomationManualExecutionService, 'resume'>;

export type AutomationScheduleWorkerResult =
  | Readonly<{ status: 'NO_DUE' }>
  | Readonly<{ status: 'SKIPPED_ACTIVE'; occurrence: AutomationTriggerOccurrence; priorInvocationId: string }>
  | Readonly<{ status: 'SKIPPED_CONFIGURATION'; occurrence: AutomationTriggerOccurrence; failureCode: string }>
  | Readonly<{ status: 'DELEGATED'; occurrence: AutomationTriggerOccurrence; execution: AutomationManualExecutionView }>
  | Readonly<{ status: 'RECOVERY_REQUIRED'; occurrence: AutomationTriggerOccurrence; failureCode: string }>;

export type AutomationScheduleRecoveryAttempt = Readonly<{
  occurrenceId: string;
  invocationId: string;
  state?: AutomationManualExecutionView['state'];
  failureCode?: string;
}>;

export type AutomationScheduleRecoveryPageResult = Readonly<{
  attempts: readonly AutomationScheduleRecoveryAttempt[];
  nextCursor?: AutomationScheduleRecoveryCursor;
  failureCount: number;
}>;

/**
 * C3d scheduler owns timing/claim/idempotency only. It creates the accepted immutable C3b
 * invocation binding before persisting EXECUTE, then delegates exclusively through the existing
 * AutomationManualExecutionService.resume seam. WorkflowContinuation + ExecutionRun remain truth.
 */
export class AutomationScheduleWorker {
  constructor(private readonly dependencies: Readonly<{
    schedules: SchedulePort;
    invocations: InvocationPort;
    execution: ExecutionPort;
  }>) {}

  async runOnce(): Promise<AutomationScheduleWorkerResult> {
    const claim = await this.dependencies.schedules.claimDue();
    if (!claim) return Object.freeze({ status: 'NO_DUE' as const });
    const scope = ownerScope(claim);

    try {
      const previous = await this.dependencies.schedules.latestExecuteBefore(claim);
      if (previous?.invocationId) {
        const previousView = await this.dependencies.execution.resume(previous.invocationId, scope);
        if (!TERMINAL_STATES.has(previousView.state)) {
          const occurrence = await this.dependencies.schedules.commitOccurrence(claim, 'SKIPPED_ACTIVE');
          return Object.freeze({ status: 'SKIPPED_ACTIVE' as const, occurrence, priorInvocationId: previous.invocationId });
        }
      }

      let binding;
      try {
        binding = await this.dependencies.invocations.bind(scope, Object.freeze({
          automationId: claim.schedule.automationId,
          definitionRevision: claim.schedule.definitionRevision,
          projectId: claim.schedule.projectId,
          clientRequestId: claim.clientRequestId,
        }));
      } catch (error) {
        const code = errorCode(error);
        if (!CONFIGURATION_FAILURE_CODES.has(code)) throw error;
        const occurrence = await this.dependencies.schedules.commitOccurrence(claim, 'SKIPPED_CONFIGURATION');
        return Object.freeze({ status: 'SKIPPED_CONFIGURATION' as const, occurrence, failureCode: code });
      }

      const occurrence = await this.dependencies.schedules.commitOccurrence(claim, 'EXECUTE', binding.invocationId);
      try {
        const execution = await this.dependencies.execution.resume(binding.invocationId, scope);
        return Object.freeze({ status: 'DELEGATED' as const, occurrence, execution });
      } catch (error) {
        // Occurrence + invocation binding are already durable and replay-safe. Do not manufacture
        // scheduler execution state; the recovery sweep re-enters canonical execution by invocation.
        return Object.freeze({
          status: 'RECOVERY_REQUIRED' as const,
          occurrence,
          failureCode: errorCode(error) || 'automation_schedule_delegation_failed',
        });
      }
    } catch (error) {
      // Preserve the already-issued PostgreSQL lease on unexpected pre-occurrence failure. This is
      // intentionally the same recovery contract as a worker crash: the lease expires naturally,
      // bounding retry frequency and allowing later due schedules to make progress meanwhile.
      throw error;
    }
  }

  /**
   * Bounded crash recovery page. The store selects only the latest EXECUTE per schedule and owns
   * keyset pagination; this worker merely re-enters accepted C3b execution by immutable invocation.
   */
  async recoverPage(
    limit = 50,
    cursor?: AutomationScheduleRecoveryCursor,
  ): Promise<AutomationScheduleRecoveryPageResult> {
    const page = await this.dependencies.schedules.listLatestExecuteOccurrences(limit, cursor);
    const attempts: AutomationScheduleRecoveryAttempt[] = [];
    let failureCount = 0;
    for (const occurrence of page.occurrences) {
      if (!occurrence.invocationId) throw new Error('EXECUTE Automation occurrence is missing immutable invocation binding');
      try {
        const view = await this.dependencies.execution.resume(
          occurrence.invocationId,
          Object.freeze({ tenantId: occurrence.tenantId, userId: occurrence.userId }),
        );
        attempts.push(Object.freeze({ occurrenceId: occurrence.occurrenceId, invocationId: occurrence.invocationId, state: view.state }));
      } catch (error) {
        failureCount += 1;
        attempts.push(Object.freeze({
          occurrenceId: occurrence.occurrenceId,
          invocationId: occurrence.invocationId,
          failureCode: errorCode(error) || 'automation_schedule_recovery_failed',
        }));
      }
    }
    return Object.freeze({
      attempts: Object.freeze(attempts),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      failureCount,
    });
  }
}

function ownerScope(claim: AutomationScheduleClaim): AutomationOwnerScope {
  return Object.freeze({ tenantId: claim.schedule.tenantId, userId: claim.schedule.userId });
}
function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' && value.length <= 160 ? value : '';
}
