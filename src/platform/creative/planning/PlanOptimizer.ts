import { clamp, deepFreeze } from './immutable';
import type { CreativePlan, OptimizationWeights, PlanOptimization, PlanStrategy } from './types';

const weights: Record<PlanStrategy, OptimizationWeights> = {
  balanced: { quality: 0.25, cost: 0.15, latency: 0.15, risk: 0.15, dependencies: 0.15, parallelism: 0.15 },
  cheap: { quality: 0.15, cost: 0.4, latency: 0.1, risk: 0.1, dependencies: 0.1, parallelism: 0.15 },
  fast: { quality: 0.15, cost: 0.1, latency: 0.4, risk: 0.1, dependencies: 0.1, parallelism: 0.15 },
  luxury: { quality: 0.5, cost: 0.05, latency: 0.05, risk: 0.15, dependencies: 0.1, parallelism: 0.15 },
  creative: { quality: 0.3, cost: 0.05, latency: 0.05, risk: 0.1, dependencies: 0.1, parallelism: 0.4 },
  safe: { quality: 0.25, cost: 0.1, latency: 0.1, risk: 0.4, dependencies: 0.1, parallelism: 0.05 },
};

export class PlanOptimizer {
  optimize(plan: CreativePlan, strategy: PlanStrategy = plan.strategy): PlanOptimization {
    const selected = weights[strategy];
    const operations = plan.graph.nodes.filter((node) => node.type === 'operation');
    const quality = operations.length ? operations.reduce((sum, node) => sum + node.quality, 0) / operations.length : 1;
    const cost = clamp(1 - operations.reduce((sum, node) => sum + node.cost, 0) / 100);
    const latency = clamp(1 - operations.reduce((sum, node) => sum + node.latency, 0) / 100);
    const risk = clamp(1 - (operations.length ? operations.reduce((sum, node) => sum + node.risk, 0) / operations.length : 0));
    const dependency = clamp(1 - plan.graph.edges.length / Math.max(1, plan.graph.nodes.length * 2));
    const parallel = clamp(plan.graph.parallelGroups.reduce((sum, group) => sum + Math.max(0, group.length - 1), 0) / Math.max(1, plan.graph.nodes.length));
    const score = quality * selected.quality + cost * selected.cost + latency * selected.latency + risk * selected.risk + dependency * selected.dependencies + parallel * selected.parallelism;
    return deepFreeze({ plan, score: clamp(score), weights: selected, changes: [`Applied ${strategy} optimization`, `Parallel groups: ${plan.graph.parallelGroups.length}`] });
  }
}
