import type { RoutingDecision } from '../router';
import { ExecutionPlanRejected } from './ExecutionErrors';
import { ExecutionGraphBuilder } from './ExecutionGraphBuilder';
import type { ExecutionPlan } from './ExecutionPlan';
import type { ExecutionPlanHistorySink } from './ExecutionHistory';

/** Converts a routing decision into an immutable, explainable execution plan. */
export class ExecutionPlanner {
  constructor(private readonly builder = new ExecutionGraphBuilder(), private readonly history?: ExecutionPlanHistorySink) {}

  createPlan(decision: RoutingDecision): ExecutionPlan {
    if (!decision.validation.valid || !decision.policy.allowed || decision.fallback.required) {
      throw new ExecutionPlanRejected([...decision.validation.errors, ...decision.policy.violations, decision.fallback.reason].filter((reason): reason is string => Boolean(reason)));
    }
    const { graph, durations } = this.builder.build(decision);
    const validation = graph.validate();
    if (!validation.valid) throw new ExecutionPlanRejected(validation.errors);
    const executionOrder = graph.getExecutionOrder();
    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    const plan = Object.freeze({
      id: `exec-${decision.route.routeId.slice('route-'.length)}`,
      routeId: decision.route.routeId,
      version: decision.route.version,
      status: 'ready',
      nodes,
      edges,
      steps: nodes,
      executionOrder,
      estimatedCost: decision.cost.totalCredits,
      estimatedDuration: executionOrder.reduce((total, id) => total + (durations.get(id) ?? 0), 0),
      riskLevel: decision.risk.overall >= 0.7 ? 'high' : decision.risk.overall >= 0.4 ? 'medium' : 'low',
      createdAt: new Date().toISOString(),
    } satisfies ExecutionPlan);
    this.history?.recordPlanEvent('planCreated', plan.id);
    return plan;
  }
}
