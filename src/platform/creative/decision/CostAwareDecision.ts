import { DecisionRules } from './DecisionRules';
import type { DecisionReason } from './types';

export class CostAwareDecision {
  private readonly rules = new DecisionRules();

  optimize(operations: string[], reasons: DecisionReason[]): { operations: string[]; estimatedCredits: number; savedCredits: number } {
    const originalCost = operations.includes('background_generation') && operations.includes('virtual_try_on') ? 40 : operations.reduce((sum, operation) => sum + this.rules.cost(operation), 0);
    const optimized = operations.includes('virtual_try_on') && operations.includes('background_generation') ? operations.filter((operation) => operation !== 'background_generation') : operations.filter((operation) => !['ai_color', 'ai_lighting'].includes(operation));
    const estimatedCredits = optimized.reduce((sum, operation) => sum + this.rules.cost(operation), 0);
    const savedCredits = Math.max(0, originalCost - estimatedCredits);
    if (savedCredits > 0) reasons.push({ id: 'cost-optimized', category: 'COST', message: `Optimized cost from ${originalCost} to ${estimatedCredits} credits.` });
    return { operations: optimized, estimatedCredits, savedCredits };
  }
}
