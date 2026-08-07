import { deepFreeze } from './immutable';
import type { IntegrationDebugSnapshot, VerificationComparison, RecoveryDirective, WorkflowExecutionPlan, WorkflowStatus } from './types';
import type { ExecutionGraphSnapshot } from '../execution';

export class IntegrationDebugger {
  debug(goal: string, planId: string, execution: ExecutionGraphSnapshot, workflow: WorkflowExecutionPlan, status: WorkflowStatus, verification: readonly VerificationComparison[], recovery: readonly RecoveryDirective[]): IntegrationDebugSnapshot {
    const completed = status === 'completed' ? 100 : status === 'cancelled' || status === 'failed' ? 0 : 50;
    return deepFreeze({ goal, planId, executionGraphId: execution.id, workflowGraphId: workflow.id, currentState: status, verification, recovery, completion: completed });
  }
}
