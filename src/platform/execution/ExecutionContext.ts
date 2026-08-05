/** Read-only snapshot of values exchanged between execution steps. */
export type ExecutionContextSnapshot = Readonly<Record<string, unknown>>;

/** Isolated data channel shared by steps belonging to one execution. */
export class ExecutionContext {
  private readonly values = new Map<string, unknown>();

  get<T = unknown>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  set<T>(key: string, value: T): void { this.values.set(key, value); }
  has(key: string): boolean { return this.values.has(key); }
  snapshot(): ExecutionContextSnapshot { return Object.freeze(Object.fromEntries(this.values)); }
}
