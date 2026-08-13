/** Deterministic bounded-concurrency coordinator with budget and timeout guards. */
export class ExecutionCoordinator {
  async run<T>(tasks: readonly (() => Promise<T>)[], options: Readonly<{ concurrency?: number; budget?: number; estimate?: number; timeout?: number }> = {}): Promise<readonly T[]> {
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
    if ((options.estimate ?? 0) > (options.budget ?? Infinity)) throw new Error('AI execution budget exceeded.');
    const results = new Array<T>(tasks.length); let cursor = 0; let timeout: ReturnType<typeof setTimeout> | undefined;
    const execution = Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => { while (cursor < tasks.length) { const index = cursor++; results[index] = await tasks[index](); } }));
    if (!options.timeout) { await execution; return Object.freeze(results); }
    try { await Promise.race([execution, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('AI execution timed out.')), options.timeout); })]); return Object.freeze(results); } finally { if (timeout) clearTimeout(timeout); }
  }
}
