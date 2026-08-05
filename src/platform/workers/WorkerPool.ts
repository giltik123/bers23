import type { WorkerDefinition } from './WorkerTypes';

interface PoolState { active: number; readonly waiting: Array<() => void>; }
/** Per-worker semaphore enforcing declared parallelism limits. */
export class WorkerPool {
  private readonly states = new Map<string, PoolState>();
  async run<Result>(worker: WorkerDefinition, operation: () => Promise<Result>): Promise<Result> {
    const state = this.states.get(worker.id) ?? { active: 0, waiting: [] }; this.states.set(worker.id, state);
    if (state.active >= worker.maxConcurrency) await new Promise<void>((resolve) => state.waiting.push(resolve));
    state.active += 1;
    try { return await operation(); } finally { state.active -= 1; state.waiting.shift()?.(); }
  }
  active(workerId: string): number { return this.states.get(workerId)?.active ?? 0; }
  queued(workerId: string): number { return this.states.get(workerId)?.waiting.length ?? 0; }
}
