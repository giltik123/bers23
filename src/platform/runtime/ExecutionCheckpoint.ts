import type { ExecutionContextSnapshot } from '../execution/ExecutionContext';

/** Durable-shaped snapshot captured after each successful step. */
export interface ExecutionCheckpoint {
  readonly id: string; readonly executionId: string; readonly planId: string; readonly completedSteps: readonly string[];
  readonly context: ExecutionContextSnapshot; readonly createdAt: string;
}
export interface ExecutionCheckpointStore { save(checkpoint: ExecutionCheckpoint): void | Promise<void>; latest(executionId: string): ExecutionCheckpoint | undefined | Promise<ExecutionCheckpoint | undefined>; getAll(executionId: string): readonly ExecutionCheckpoint[] | Promise<readonly ExecutionCheckpoint[]>; }

/** Default in-memory checkpoint store; persistence can be injected later. */
export class MemoryExecutionCheckpointStore implements ExecutionCheckpointStore {
  private readonly checkpoints = new Map<string, ExecutionCheckpoint[]>();
  save(checkpoint: ExecutionCheckpoint): void { const entries = this.checkpoints.get(checkpoint.executionId) ?? []; entries.push(checkpoint); this.checkpoints.set(checkpoint.executionId, entries); }
  latest(executionId: string): ExecutionCheckpoint | undefined { return this.checkpoints.get(executionId)?.at(-1); }
  getAll(executionId: string): readonly ExecutionCheckpoint[] { return Object.freeze([...(this.checkpoints.get(executionId) ?? [])]); }
}
