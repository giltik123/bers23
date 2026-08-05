/** Lifecycle status of a planned execution. */
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface ExecutionHistoryEntry {
  readonly executionId: string;
  readonly planId: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly status: ExecutionStatus;
  readonly stepsCompleted: readonly string[];
  readonly failedStep?: string;
  readonly duration?: number;
}
export interface ExecutionPlanHistoryEvent { readonly type: import('./ExecutionTypes').ExecutionPlanEventType; readonly planId: string; readonly executionId?: string; readonly timestamp: string; readonly error?: string; }
export interface ExecutionPlanHistorySink { recordPlanEvent(type: import('./ExecutionTypes').ExecutionPlanEventType, planId: string, executionId?: string, error?: string): void; }

/** Bounded in-memory execution audit log with immutable snapshots. */
export class ExecutionHistory {
  private readonly entries = new Map<string, ExecutionHistoryEntry>();
  private readonly planEvents: ExecutionPlanHistoryEvent[] = [];
  constructor(private readonly limit = 500) { if (!Number.isInteger(limit) || limit < 1) throw new Error('Execution history limit must be a positive integer.'); }

  queue(executionId: string, planId: string): ExecutionHistoryEntry {
    if (this.entries.has(executionId)) throw new Error(`Execution "${executionId}" already exists.`);
    this.recordPlanEvent('planCreated', planId, executionId);
    return this.save({ executionId, planId, status: 'queued', stepsCompleted: Object.freeze([]) });
  }

  start(executionId: string): ExecutionHistoryEntry { const entry = this.require(executionId); this.recordPlanEvent('planStarted', entry.planId, executionId); return this.transition(executionId, 'running', { startedAt: new Date().toISOString() }); }

  completeStep(executionId: string, stepId: string): ExecutionHistoryEntry {
    const entry = this.require(executionId);
    if (entry.status !== 'running') throw new Error(`Execution "${executionId}" is not running.`);
    return this.save({ ...entry, stepsCompleted: Object.freeze([...new Set([...entry.stepsCompleted, stepId])]) });
  }

  finish(executionId: string, status: Extract<ExecutionStatus, 'completed' | 'failed' | 'cancelled'>, failedStep?: string): ExecutionHistoryEntry {
    const entry = this.require(executionId);
    const finishedAt = new Date().toISOString();
    const duration = entry.startedAt ? Math.max(0, Date.parse(finishedAt) - Date.parse(entry.startedAt)) : undefined;
    this.recordPlanEvent(status === 'completed' ? 'planCompleted' : 'planFailed', entry.planId, executionId, failedStep);
    return this.transition(executionId, status, { finishedAt, failedStep, duration });
  }

  get(executionId: string): ExecutionHistoryEntry | undefined { return this.entries.get(executionId); }
  getAll(): readonly ExecutionHistoryEntry[] { return Object.freeze([...this.entries.values()]); }
  getPlanEvents(): readonly ExecutionPlanHistoryEvent[] { return Object.freeze([...this.planEvents]); }
  recordPlanEvent(type: import('./ExecutionTypes').ExecutionPlanEventType, planId: string, executionId?: string, error?: string): void {
    this.planEvents.push(Object.freeze({ type, planId, executionId, timestamp: new Date().toISOString(), error }));
    while (this.planEvents.length > this.limit * 4) this.planEvents.shift();
  }

  private transition(executionId: string, status: ExecutionStatus, changes: Partial<ExecutionHistoryEntry>): ExecutionHistoryEntry {
    return this.save({ ...this.require(executionId), ...changes, status });
  }
  private require(executionId: string): ExecutionHistoryEntry {
    const entry = this.entries.get(executionId); if (!entry) throw new Error(`Execution "${executionId}" does not exist.`); return entry;
  }
  private save(entry: ExecutionHistoryEntry): ExecutionHistoryEntry {
    const snapshot = Object.freeze({ ...entry, stepsCompleted: Object.freeze([...entry.stepsCompleted]) });
    this.entries.set(entry.executionId, snapshot);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    return snapshot;
  }
}
