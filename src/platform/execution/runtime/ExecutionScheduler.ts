import type { ExecutionPlan } from '../ExecutionPlan';
import type { StepExecutionState } from './ExecutionResult';

/** Deterministically selects runnable steps while honoring plan dependencies. */
export class ExecutionScheduler {
  constructor(private readonly plan: ExecutionPlan) {}

  next(states: ReadonlyMap<string, StepExecutionState>): string | undefined {
    for (const stepId of this.plan.executionOrder) {
      const step = this.plan.steps.find((candidate) => candidate.id === stepId);
      if (!step || states.get(stepId)?.status !== 'pending') continue;
      if (step.dependencies.every((dependency) => states.get(dependency)?.status === 'completed')) return stepId;
    }
    return undefined;
  }

  blocked(states: ReadonlyMap<string, StepExecutionState>): readonly string[] {
    return Object.freeze(this.plan.steps
      .filter((step) => states.get(step.id)?.status === 'pending'
        && step.dependencies.some((dependency) => ['failed', 'cancelled', 'skipped'].includes(states.get(dependency)?.status ?? 'pending')))
      .map((step) => step.id));
  }
}
