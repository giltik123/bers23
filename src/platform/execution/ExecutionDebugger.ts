import type { ExecutionPlan } from './ExecutionPlan';

/** One explainable line in an execution-plan debug view. */
export interface ExecutionDebugStep { readonly id: string; readonly label: string; readonly provider?: string; readonly status: string; readonly marker: '✔' | '⏳' | '⬜' | '✖'; }
export interface ExecutionDebugSnapshot { readonly planId: string; readonly routeId: string; readonly status: string; readonly steps: readonly ExecutionDebugStep[]; readonly text: string; }

/** Produces immutable audit/debug information without executing the plan. */
export class ExecutionDebugger {
  inspect(plan: ExecutionPlan, states: Readonly<Record<string, string>> = {}): ExecutionDebugSnapshot {
    const steps = plan.executionOrder.map((id) => {
      const node = plan.nodes.find((candidate) => candidate.id === id)!;
      const status = states[id] ?? node.status;
      const marker = status === 'completed' ? '✔' : status === 'running' ? '⏳' : status === 'failed' ? '✖' : '⬜';
      return Object.freeze({ id, label: node.name, provider: node.provider, status, marker } satisfies ExecutionDebugStep);
    });
    return Object.freeze({ planId: plan.id, routeId: plan.routeId, status: plan.status, steps: Object.freeze(steps), text: steps.map((step) => `${step.marker} ${step.label}${step.provider ? ` [${step.provider}]` : ''}`).join('\n') });
  }
}
