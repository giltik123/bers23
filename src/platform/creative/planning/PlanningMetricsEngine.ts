import { clamp, deepFreeze } from './immutable';
import type { CreativePlan, PlanningMetrics } from './types';

export class PlanningMetricsEngine {
  calculate(plan: CreativePlan): PlanningMetrics {
    const operations = plan.graph.nodes.filter((node) => node.type === 'operation');
    const quality = operations.length ? operations.reduce((sum, node) => sum + node.quality, 0) / operations.length : 1;
    const complexity = clamp((plan.graph.nodes.length + plan.graph.edges.length) / 30);
    const totalCost = operations.reduce((sum, node) => sum + node.cost, 0);
    const risk = operations.length ? operations.reduce((sum, node) => sum + node.risk, 0) / operations.length : 0;
    const parallel = plan.graph.parallelGroups.some((group) => group.length > 1);
    return deepFreeze({
      quality: clamp(quality), complexity, efficiency: clamp(quality / (1 + totalCost / 20)),
      robustness: clamp(1 - risk), flexibility: clamp((parallel ? 0.3 : 0) + 1 / Math.max(1, plan.graph.edges.length)),
      explainability: clamp(plan.graph.nodes.filter((node) => node.title.length > 0).length / Math.max(1, plan.graph.nodes.length)),
    });
  }
}
