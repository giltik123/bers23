import { ExecutionContext } from '../execution/ExecutionContext';
import type { ExecutionCheckpoint, ExecutionCheckpointStore } from './ExecutionCheckpoint';

/** State restored from the latest successful checkpoint. */
export interface ExecutionRecoveryState { readonly checkpoint?: ExecutionCheckpoint; readonly completedSteps: ReadonlySet<string>; readonly context: ExecutionContext; }

/** Recovery foundation that restores completed nodes and context without executing them again. */
export class ExecutionRecovery {
  constructor(private readonly checkpoints: ExecutionCheckpointStore) {}
  async restore(executionId: string): Promise<ExecutionRecoveryState> {
    const checkpoint = await this.checkpoints.latest(executionId);
    const context = new ExecutionContext();
    for (const [key, value] of Object.entries(checkpoint?.context ?? {})) context.set(key, value);
    return Object.freeze({ checkpoint, completedSteps: new Set(checkpoint?.completedSteps ?? []), context });
  }
}
