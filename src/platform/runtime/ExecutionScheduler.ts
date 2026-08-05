import type { ExecutionPlan } from '../execution/ExecutionPlan';

export type ScheduledStepState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';

/** Selects every currently runnable independent node for parallel execution. */
export class ExecutionScheduler {
  getRunnable(plan: ExecutionPlan, states: ReadonlyMap<string, ScheduledStepState>): readonly string[] {
    return Object.freeze(plan.executionOrder.filter((id) => {
      if (states.get(id) !== 'pending') return false;
      const node = plan.nodes.find((candidate) => candidate.id === id);
      return Boolean(node?.dependencies.every((dependency) => states.get(dependency) === 'completed'));
    }));
  }
  getBlocked(plan: ExecutionPlan, states: ReadonlyMap<string, ScheduledStepState>): readonly string[] {
    return Object.freeze(plan.nodes.filter((node) => states.get(node.id) === 'pending' && node.dependencies.some((dependency) => ['failed', 'cancelled', 'skipped'].includes(states.get(dependency) ?? 'pending'))).map((node) => node.id));
  }
}
