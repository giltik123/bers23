import type { ExecutionContextSnapshot } from '../ExecutionContext';
import type { StepResult } from './StepExecutor';

/** Complete lifecycle states supported for every execution step. */
export type StepExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export interface StepExecutionState {
  readonly stepId: string;
  readonly status: StepExecutionStatus;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly durationMs?: number;
  readonly result?: StepResult;
  readonly error?: string;
}
export type ExecutionResultStatus = 'completed' | 'failed' | 'cancelled';

/** Immutable terminal result returned by ExecutionRuntime. */
export interface ExecutionResult {
  readonly executionId: string;
  readonly planId: string;
  readonly status: ExecutionResultStatus;
  readonly steps: readonly StepExecutionState[];
  readonly context: ExecutionContextSnapshot;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly error?: string;
}
