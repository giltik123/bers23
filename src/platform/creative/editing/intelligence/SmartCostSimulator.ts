import type { EditStrategyPlan, SmartCostSimulation } from './types';

export class SmartCostSimulator {
  simulate(plan: EditStrategyPlan): SmartCostSimulation {
    const localOperations = plan.recommendedStrategy.operations.filter((operation) => operation.mode === 'LOCAL').length;
    const aiOperations = plan.recommendedStrategy.operations.filter((operation) => operation.mode === 'AI').length;
    const estimatedCost = plan.recommendedStrategy.cost;
    const potentialAICost = Math.max(...[plan.recommendedStrategy, ...plan.alternatives].map((strategy) => strategy.cost));
    return { localOperations, aiOperations, estimatedCost, savedCredits: Math.max(0, potentialAICost - estimatedCost), currentCost: estimatedCost, potentialAICost };
  }
}
