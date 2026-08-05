import { ExecutionContext } from '../ExecutionContext';
import type { ExecutionPlan } from '../ExecutionPlan';
import type { ExecutionStep } from '../ExecutionStep';
import { ExecutionEventEmitter } from './ExecutionEventEmitter';
import type { ExecutionResult, StepExecutionState, StepExecutionStatus } from './ExecutionResult';
import { ExecutionScheduler } from './ExecutionScheduler';
import type { StepExecutor, StepResult } from './StepExecutor';

/** Cooperative cancellation primitive owned by one runtime execution. */
export class ExecutionCancellation {
  private cancelled = false;
  private resolveCancellation!: () => void;
  readonly signal = new Promise<void>((resolve) => { this.resolveCancellation = resolve; });
  get isCancelled(): boolean { return this.cancelled; }
  cancel(): void { if (!this.cancelled) { this.cancelled = true; this.resolveCancellation(); } }
}

class StepTimeoutError extends Error {}
class ExecutionCancelledError extends Error {}

/** Runs one validated execution plan in deterministic dependency order. */
export class ExecutionRunner {
  constructor(private readonly executor: StepExecutor, private readonly events: ExecutionEventEmitter) {}

  async run(executionId: string, plan: ExecutionPlan, cancellation: ExecutionCancellation): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const context = new ExecutionContext();
    const states = new Map<string, StepExecutionState>(plan.steps.map((step) => [step.id, freezeState(step.id, 'pending')]));
    const scheduler = new ExecutionScheduler(plan);
    await this.events.emit('execution.started', Object.freeze({ executionId, planId: plan.id }));

    let executionError: string | undefined;
    while (true) {
      if (cancellation.isCancelled) { cancelPending(states); break; }
      const stepId = scheduler.next(states);
      if (!stepId) break;
      const step = plan.steps.find((candidate) => candidate.id === stepId)!;
      const running = freezeState(step.id, 'running', { startedAt: new Date().toISOString() });
      states.set(step.id, running);
      await this.events.emit('execution.step.started', Object.freeze({ executionId, step: running }));
      try {
        const result = await this.executeStep(step, context, cancellation);
        const completed = finishState(running, 'completed', { result: freezeStepResult(result) });
        states.set(step.id, completed);
        await this.events.emit('execution.step.completed', Object.freeze({ executionId, step: completed }));
      } catch (error) {
        const cancelled = error instanceof ExecutionCancelledError;
        const failed = finishState(running, cancelled ? 'cancelled' : 'failed', { error: errorMessage(error) });
        states.set(step.id, failed);
        executionError = failed.error;
        if (!cancelled) await this.events.emit('execution.step.failed', Object.freeze({ executionId, step: failed }));
        if (cancelled) cancelPending(states);
        else for (const blockedId of scheduler.blocked(states)) states.set(blockedId, freezeState(blockedId, 'skipped'));
        break;
      }
    }

    for (const blockedId of scheduler.blocked(states)) states.set(blockedId, freezeState(blockedId, 'skipped'));
    const status = cancellation.isCancelled || [...states.values()].some((state) => state.status === 'cancelled')
      ? 'cancelled' : [...states.values()].some((state) => state.status === 'failed') ? 'failed' : 'completed';
    const finishedAt = new Date().toISOString();
    const result = Object.freeze({
      executionId, planId: plan.id, status, steps: Object.freeze([...states.values()]), context: context.snapshot(),
      startedAt, finishedAt, durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)), error: executionError,
    } satisfies ExecutionResult);
    await this.events.emit(status === 'completed' ? 'execution.completed' : status === 'failed' ? 'execution.failed' : 'execution.cancelled', result);
    return result;
  }

  private async executeStep(step: ExecutionStep, sharedContext: ExecutionContext, cancellation: ExecutionCancellation): Promise<StepResult> {
    const isolatedContext = new ExecutionContext();
    for (const [key, value] of Object.entries(sharedContext.snapshot())) isolatedContext.set(key, value);
    const execution = this.executor.execute(step, isolatedContext);
    const timeout = step.timeout === undefined ? new Promise<never>(() => undefined) : new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new StepTimeoutError(`Step "${step.id}" timed out after ${step.timeout}ms.`)), step.timeout);
      void execution.finally(() => clearTimeout(timer)).catch(() => undefined);
    });
    const cancelled = cancellation.signal.then(() => { throw new ExecutionCancelledError(`Step "${step.id}" was cancelled.`); });
    const result = await Promise.race([execution, timeout, cancelled]);
    for (const [key, value] of Object.entries(isolatedContext.snapshot())) sharedContext.set(key, value);
    return result;
  }
}

function freezeState(stepId: string, status: StepExecutionStatus, details: Partial<StepExecutionState> = {}): StepExecutionState {
  return Object.freeze({ ...details, stepId, status });
}
function finishState(state: StepExecutionState, status: StepExecutionStatus, details: Partial<StepExecutionState>): StepExecutionState {
  const finishedAt = new Date().toISOString();
  return freezeState(state.stepId, status, { ...state, ...details, finishedAt, durationMs: state.startedAt ? Math.max(0, Date.parse(finishedAt) - Date.parse(state.startedAt)) : undefined });
}
function freezeStepResult(result: StepResult): StepResult { return Object.freeze({ ...result, metadata: result.metadata && Object.freeze({ ...result.metadata }) }); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function cancelPending(states: Map<string, StepExecutionState>): void {
  for (const [id, state] of states) if (state.status === 'pending') states.set(id, freezeState(id, 'cancelled'));
}
