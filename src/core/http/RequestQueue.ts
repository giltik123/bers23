/** Limits concurrent asynchronous HTTP work. */
export class RequestQueue {
  private active = 0;
  private readonly pending: Array<() => void> = [];
  constructor(private readonly concurrency = Number.POSITIVE_INFINITY) {}
  /** Schedules an operation according to the concurrency limit. */
  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((resolve) => this.pending.push(resolve));
    this.active += 1;
    try { return await operation(); } finally { this.active -= 1; this.pending.shift()?.(); }
  }
  /** Number of operations waiting to start. */
  get size(): number { return this.pending.length; }
}
