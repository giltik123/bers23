/** Cooperative cancellation signal passed to provider-neutral workers. */
export class ExecutionCancellation {
  private cancelled = false;
  private readonly listeners = new Set<() => void>();
  get isCancelled(): boolean { return this.cancelled; }
  cancel(): void { if (this.cancelled) return; this.cancelled = true; for (const listener of this.listeners) listener(); this.listeners.clear(); }
  throwIfCancelled(): void { if (this.cancelled) throw new ExecutionCancelledError(); }
  onCancel(listener: () => void): () => void {
    if (this.cancelled) { listener(); return () => undefined; }
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
}
export class ExecutionCancelledError extends Error { constructor() { super('Execution was cancelled.'); this.name = 'ExecutionCancelledError'; } }
