import { immutable } from "./immutable";
import type { DecisionGeneration, EvolutionStatistics } from "./types";

export interface EvolutionDependencies { readonly now: () => number }
export class DecisionEvolution {
  private generations: readonly DecisionGeneration[] = immutable([]);
  constructor(private readonly dependencies: EvolutionDependencies) {}
  add(decisionId: string, parentDecisionId?: string): DecisionGeneration { const parent = parentDecisionId ? this.generations.find((item) => item.decisionId === parentDecisionId) : undefined;
    if (parentDecisionId && !parent) throw new Error("Unknown parent decision"); const generation = immutable({ decisionId, parentDecisionId, generation: (parent?.generation ?? -1) + 1, createdAt: this.dependencies.now() });
    this.generations = immutable([...this.generations, generation]); return generation; }
  lineage(decisionId: string): readonly DecisionGeneration[] { const result: DecisionGeneration[] = []; let current = this.generations.find((item) => item.decisionId === decisionId);
    while (current) { result.push(current); current = current.parentDecisionId ? this.generations.find((item) => item.decisionId === current?.parentDecisionId) : undefined; } return immutable(result.map((item) => ({ ...item }))); }
  statistics(): EvolutionStatistics { return immutable({ decisions: this.generations.length, roots: this.generations.filter((item) => !item.parentDecisionId).length,
    maximumGeneration: Math.max(0, ...this.generations.map(({ generation }) => generation)) }); }
}
