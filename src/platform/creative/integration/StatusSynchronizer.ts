import { deepFreeze } from './immutable';
import type { ExecutionStatus } from '../execution';
import type { WorkflowStatus } from './types';

const executionToWorkflow: Record<ExecutionStatus, WorkflowStatus> = {
  pending: 'pending', ready: 'pending', blocked: 'paused', completed: 'completed',
  failed: 'failed', skipped: 'cancelled',
};

export class StatusSynchronizer {
  toWorkflow(status: ExecutionStatus): WorkflowStatus { return executionToWorkflow[status]; }
  toExecution(status: WorkflowStatus): ExecutionStatus {
    const mapping: Record<WorkflowStatus, ExecutionStatus> = {
      pending: 'pending', running: 'ready', paused: 'blocked', retrying: 'ready',
      completed: 'completed', cancelled: 'skipped', failed: 'failed',
    };
    return mapping[status];
  }
  synchronize(status: WorkflowStatus) { return deepFreeze({ workflow: status, execution: this.toExecution(status) }); }
}
