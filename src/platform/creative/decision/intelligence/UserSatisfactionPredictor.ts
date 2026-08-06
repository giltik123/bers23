import { clamp } from "./immutable";
import type { DecisionOutcomePrediction, ScoredStrategy } from "./advancedTypes";

export class UserSatisfactionPredictor {
  predict(strategy: ScoredStrategy, outcome: DecisionOutcomePrediction): number {
    return Math.round(clamp(outcome.acceptanceProbability * .55 + strategy.objectives.quality * .3
      + strategy.objectives.preference * .15) * 100);
  }
}
