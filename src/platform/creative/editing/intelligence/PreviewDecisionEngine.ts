import { ExplainabilityContractBuilder } from './ExplainabilityContractBuilder';
import type { EditStrategyPlan, PreviewDecision } from './types';

export class PreviewDecisionEngine {
  private readonly explainability = new ExplainabilityContractBuilder();

  decide(plan: EditStrategyPlan): PreviewDecision {
    const operations = plan.recommendedStrategy.operations.map((operation) => ({ name: operation.label, source: operation.mode, cost: operation.credits, explainability: this.explainability.build(operation) }));
    const freeOperations = operations.filter((operation) => operation.source === 'LOCAL').map((operation) => operation.name);
    const aiOperations = operations.filter((operation) => operation.source === 'AI').map((operation) => operation.name);
    const totalCost = operations.reduce((sum, operation) => sum + operation.cost, 0);

    return { operations, freeOperations, aiOperations, totalCost, estimatedCredits: totalCost, requiresConfirmation: totalCost > 0, beforeExecution: true };
  }
}
