// TaskHistory — per-task before/after snapshots for the current agent run,
// enabling rollback of a single task or the whole chain.
class TaskHistory {
  constructor() { this.snapshots = []; }

  startRun() { this.snapshots = []; }

  record({ taskId, label, beforeUrl, afterUrl, credits = 0 }) {
    this.snapshots.push({ taskId, label, beforeUrl, afterUrl, credits, created_at: new Date().toISOString() });
  }

  list() { return [...this.snapshots]; }

  // Rolling back one task reverts to the state just before it ran (later tasks depend on it).
  forTask(taskId) { return this.snapshots.find((s) => s.taskId === taskId) || null; }

  chainStartUrl() { return this.snapshots[0]?.beforeUrl || null; }

  clear() { this.snapshots = []; }
}

export const taskHistory = new TaskHistory();