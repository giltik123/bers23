import { clamp, deepFreeze } from './immutable';
import type { CreativePlan, PlanSimulation } from './types';

export class PlanningSimulator {
  simulate(plan: CreativePlan): PlanSimulation {
    const operations = plan.graph.nodes.filter((node) => node.type === 'operation');
    const cost = operations.reduce((sum, node) => sum + node.cost, 0);
    const quality = operations.length ? operations.reduce((sum, node) => sum + node.quality, 0) / operations.length : 1;
    const risk = operations.length ? operations.reduce((sum, node) => sum + node.risk, 0) / operations.length : 0;
    const time = plan.graph.parallelGroups.reduce((sum, group) => sum + Math.max(...group.map((id) => plan.graph.nodes.find((node) => node.id === id)?.latency ?? 0)), 0);
    const risks = [
      ...(risk > 0.25 ? ['high operation risk'] : []),
      ...(!plan.resources.feasible ? [`resource shortage: ${plan.resources.shortages.join(', ')}`] : []),
      ...(plan.graph.nodes.some((node) => node.ai) ? ['AI variability'] : []),
    ];
    return deepFreeze({ cost, quality: clamp(quality), successProbability: clamp(quality * (1 - risk) * (plan.resources.feasible ? 1 : 0.6)), time, risks });
  }
}
