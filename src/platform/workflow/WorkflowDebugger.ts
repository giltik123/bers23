import type { WorkflowInspection } from './WorkflowDefinition';
import type { WorkflowRun } from './WorkflowExecution';
import type { WorkflowStepExecutionResult } from './WorkflowStep';

export interface WorkflowDebugSnapshot { readonly workflowId: string; readonly graphOrder: readonly string[]; readonly events: readonly { readonly type: string; readonly at: number; readonly payload?: unknown }[]; readonly latestRun?: WorkflowRun; }

export class WorkflowDebugger {
  private events: Array<{ type: string; workflowId: string; at: number; payload?: unknown }> = [];
  private latestRuns = new Map<string, WorkflowRun>();

  inspect(inspection: WorkflowInspection): WorkflowDebugSnapshot { return Object.freeze({ workflowId: inspection.definition.id, graphOrder: inspection.graph.order, events: this.eventsFor(inspection.definition.id), latestRun: this.latestRuns.get(inspection.definition.id) }); }
  workflowStarted(workflowId: string): void { this.emit(workflowId, 'workflow_started'); }
  stepCompleted(workflowId: string, result: WorkflowStepExecutionResult): void { this.emit(workflowId, 'step_completed', result); }
  stepFailed(workflowId: string, result: WorkflowStepExecutionResult): void { this.emit(workflowId, 'step_failed', result); }
  workflowFinished(run: WorkflowRun): void { this.latestRuns.set(run.workflowId, run); this.emit(run.workflowId, `workflow_${run.status}`, run); }
  snapshot(workflowId: string): WorkflowDebugSnapshot { return Object.freeze({ workflowId, graphOrder: [], events: this.eventsFor(workflowId), latestRun: this.latestRuns.get(workflowId) }); }
  clear(): void { this.events = []; this.latestRuns.clear(); }

  private emit(workflowId: string, type: string, payload?: unknown): void { this.events.push(Object.freeze({ workflowId, type, payload, at: Date.now() })); }
  private eventsFor(workflowId: string) { return Object.freeze(this.events.filter((event) => event.workflowId === workflowId).map(({ type, at, payload }) => Object.freeze({ type, at, payload }))); }
}
