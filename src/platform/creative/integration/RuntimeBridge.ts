import { deepFreeze, sameScope } from './immutable';
import { ExecutionEventLog } from './ExecutionEventLog';
import type {
  ExecutionEvent, WorkflowExecutionPlan, WorkflowExecutor, WorkflowResult, WorkflowStatus,
} from './types';

export class RuntimeBridge {
  private readonly plans = new Map<string, WorkflowExecutionPlan>();
  private readonly results = new Map<string, WorkflowResult>();
  private readonly statuses = new Map<string, WorkflowStatus>();

  constructor(
    private readonly executor: WorkflowExecutor,
    private readonly events: ExecutionEventLog,
  ) {}

  async execute(plan: WorkflowExecutionPlan): Promise<WorkflowResult> {
    this.plans.set(plan.id, plan);
    this.statuses.set(plan.id, 'running');
    for (const step of plan.steps) this.events.append(plan.scope, plan.id, 'OperationStarted', `Started ${step.operation}`, step.executionNodeId);
    const result = await this.executor.execute(plan);
    this.results.set(plan.id, deepFreeze(result) as WorkflowResult);
    this.statuses.set(plan.id, result.status);
    for (const operation of result.operations) {
      const step = plan.steps.find((item) => item.id === operation.stepId);
      if (!step) continue;
      const type = operation.status === 'completed' ? 'OperationCompleted' : operation.status === 'cancelled' ? 'OperationSkipped' : operation.status === 'failed' ? 'OperationFailed' : undefined;
      if (type) this.events.append(plan.scope, plan.id, type, operation.error ?? `${step.operation}: ${operation.status}`, step.executionNodeId);
    }
    return this.results.get(plan.id)!;
  }

  async cancel(id: string): Promise<void> { await this.executor.cancel(id); this.statuses.set(id, 'cancelled'); }
  async pause(id: string): Promise<void> { await this.executor.pause(id); this.statuses.set(id, 'paused'); }
  async resume(id: string): Promise<void> { await this.executor.resume(id); this.statuses.set(id, 'running'); }
  async status(id: string): Promise<WorkflowStatus> { const status = await this.executor.status(id); this.statuses.set(id, status); return status; }
  result(id: string): WorkflowResult | undefined { return this.results.get(id); }
  plan(id: string): WorkflowExecutionPlan | undefined { return this.plans.get(id); }
  synchronizedStatus(id: string): WorkflowStatus { return this.statuses.get(id) ?? 'pending'; }
  eventList(plan: WorkflowExecutionPlan): readonly ExecutionEvent[] {
    const stored = this.plans.get(plan.id);
    if (stored && !sameScope(stored.scope, plan.scope)) throw new Error('Scope isolation violation');
    return this.events.list(plan.scope, plan.id);
  }
}
