import type { WorkflowRun } from './WorkflowExecution';

export interface WorkflowHistoryEvent { readonly type: string; readonly workflowId: string; readonly runId?: string; readonly at: number; readonly payload?: unknown; }

export class WorkflowHistory {
  private runs = new Map<string, WorkflowRun>();
  private events: WorkflowHistoryEvent[] = [];

  recordRun(run: WorkflowRun): void { this.runs.set(run.id, run); this.record({ type: `workflow_${run.status}`, workflowId: run.workflowId, runId: run.id, payload: { durationMs: run.durationMs, steps: run.stepResults.length, error: run.error } }); }
  record(event: Omit<WorkflowHistoryEvent, 'at'>): void { this.events.push(Object.freeze({ ...event, at: Date.now() })); }
  getRun(runId: string): WorkflowRun | null { return this.runs.get(runId) ?? null; }
  listRuns(workflowId?: string): WorkflowRun[] { return Array.from(this.runs.values()).filter((run) => !workflowId || run.workflowId === workflowId); }
  timeline(workflowId?: string): WorkflowHistoryEvent[] { return this.events.filter((event) => !workflowId || event.workflowId === workflowId); }
  clear(): void { this.runs.clear(); this.events = []; }
}
