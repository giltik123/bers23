const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const AGENT_EXECUTION_NOT_WIRED = 'AGENT_EXECUTION_NOT_WIRED';

// Compatibility plan-state facade only. Image-producing Agent execution must run
// through the canonical server Execution Fabric; the browser cannot own provider,
// billing, artifact or multi-step lineage authority.
class ExecutionQueue {
  constructor() {
    this.tasks = [];
    this.running = false;
    this.paused = false;
    this.cancelled = false;
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.snapshot()); return () => this.listeners.delete(fn); }
  snapshot() { return { tasks: this.tasks.map((task) => ({ ...task })), running: this.running, paused: this.paused }; }
  emit() { const state = this.snapshot(); this.listeners.forEach((fn) => fn(state)); }

  load(tasks) { this.tasks = tasks.map((task) => ({ ...task })); this.emit(); }
  clear() { this.tasks = []; this.running = false; this.paused = false; this.cancelled = false; this.emit(); }
  add(task) { this.tasks = [...this.tasks, { ...task }]; this.emit(); }
  updateTask(id, patch) { this.tasks = this.tasks.map((task) => task.id === id ? { ...task, ...patch } : task); this.emit(); }
  setEnabled(id, enabled) { this.updateTask(id, { enabled }); }
  skip(id) { this.updateTask(id, { status: 'skipped' }); }
  retry(id) { this.updateTask(id, { status: 'pending', error: null }); }

  move(id, direction) {
    const index = this.tasks.findIndex((task) => task.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= this.tasks.length) return;
    const next = this.tasks.map((task) => ({ ...task }));
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    this.tasks = next;
    this.emit();
  }

  pause() { this.paused = true; this.emit(); }
  resume() { this.paused = false; this.emit(); }
  cancel() { this.cancelled = true; this.paused = false; this.running = false; this.emit(); }
  async waitIfPaused() { while (this.paused && !this.cancelled) await sleep(300); }

  async run() {
    const error = new Error('AI Agent image execution is not wired to the canonical server Execution Fabric.');
    error.code = AGENT_EXECUTION_NOT_WIRED;
    error.retryable = false;
    throw error;
  }
}

export const executionQueue = new ExecutionQueue();
