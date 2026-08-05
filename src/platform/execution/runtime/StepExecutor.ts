import type { ExecutionContext } from '../ExecutionContext';
import type { ExecutionStep } from '../ExecutionStep';

/** Provider-neutral result returned by a step adapter. */
export interface StepResult {
  readonly output?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Adapter boundary between the runtime and existing execution engines. */
export interface StepExecutor {
  execute(step: ExecutionStep, context: ExecutionContext): Promise<StepResult>;
}
