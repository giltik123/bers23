import { immutable } from "./immutable";
import type { DecisionEvolutionRecord } from "./advancedTypes";

export interface EvolutionClock { now(): number }
export class DecisionEvolution {
  private records: readonly DecisionEvolutionRecord[] = immutable([]);
  constructor(private readonly clock: EvolutionClock) {}
  record(decisionId: string, parentDecisionId?: string): DecisionEvolutionRecord {
    const parent = parentDecisionId ? this.records.find((item) => item.decisionId === parentDecisionId) : undefined;
    if (parentDecisionId && !parent) throw new Error("Parent decision does not exist");
    const item = immutable({ decisionId, parentDecisionId, generation: (parent?.generation ?? -1) + 1, createdAt: this.clock.now() });
    this.records = immutable([...this.records, item]); return item;
  }
  lineage(decisionId: string): readonly DecisionEvolutionRecord[] {
    const lineage: DecisionEvolutionRecord[] = []; let current = this.records.find((item) => item.decisionId === decisionId);
    while (current) { lineage.push(current); current = current.parentDecisionId ? this.records.find((item) => item.decisionId === current?.parentDecisionId) : undefined; }
    return immutable(lineage.map((item) => ({ ...item })));
  }
}
