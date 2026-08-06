import { immutable } from "./immutable";
import type { DecisionDatasetRecord, ScenarioOverrides, ScenarioResult } from "./advancedTypes";
import type { DecisionIntelligenceContext } from "./types";

export interface ScenarioRunner { simulate(context: DecisionIntelligenceContext, overrides: ScenarioOverrides): ScenarioResult }
export class DecisionReplayEngine {
  constructor(private readonly runner: ScenarioRunner) {}
  replay(record: DecisionDatasetRecord, context: DecisionIntelligenceContext, overrides: ScenarioOverrides = {}): {
    readonly previousDecision: string; readonly current: ScenarioResult; readonly changes: readonly string[];
  } {
    const current = this.runner.simulate(context, overrides);
    const changes = [record.credits !== (current.context.availableCredits ?? 0) ? "BUDGET_CHANGED" : "BUDGET_UNCHANGED",
      current.candidates.some(({ strategy }) => strategy === record.strategy) ? "STRATEGY_AVAILABLE" : "STRATEGY_CHANGED"];
    return immutable({ previousDecision: record.decision, current, changes });
  }
}
