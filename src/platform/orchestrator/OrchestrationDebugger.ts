import type { ExecutionPlan } from '../execution';
import type { ManagedExecutionResult } from '../runtime';
import type { RoutingDecision } from '../router';
import type { OrchestrationContext } from './OrchestrationContext';
import type { OrchestrationSession } from './OrchestrationSession';
export interface OrchestrationDebugSnapshot { readonly session: OrchestrationSession; readonly context: OrchestrationContext; readonly route?: { readonly routeId: string; readonly capabilities: readonly string[]; readonly providers: readonly string[] }; readonly plan?: { readonly planId: string; readonly nodes: readonly string[]; readonly order: readonly string[] }; readonly runtime?: { readonly executionId: string; readonly state: string; readonly steps: readonly string[] }; }

/** Builds inspectable orchestration debug snapshots without exposing mutable internals. */
export class OrchestrationDebugger {
  snapshot(session: OrchestrationSession, context: OrchestrationContext, route?: RoutingDecision, plan?: ExecutionPlan, runtime?: ManagedExecutionResult): OrchestrationDebugSnapshot {
    return Object.freeze({ session, context, route: route ? Object.freeze({ routeId: route.route.routeId, capabilities: route.capabilities, providers: route.providers }) : undefined, plan: plan ? Object.freeze({ planId: plan.id, nodes: Object.freeze(plan.nodes.map((node) => node.id)), order: plan.executionOrder }) : undefined, runtime: runtime ? Object.freeze({ executionId: runtime.executionId, state: runtime.state, steps: Object.freeze(Object.keys(runtime.steps)) }) : undefined });
  }
}
