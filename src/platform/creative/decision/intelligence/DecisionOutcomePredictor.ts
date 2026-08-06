import { clamp, immutable } from "./immutable";
import type { DecisionOutcomePrediction, ScoredStrategy, SimilarDecision } from "./advancedTypes";

export class DecisionOutcomePredictor {
  predict(strategy: ScoredStrategy, history: readonly SimilarDecision[] = []): DecisionOutcomePrediction {
    const historicalAcceptance = history.length ? history.filter(({ record }) => record.accepted).length / history.length : .5;
    const acceptanceProbability = clamp(strategy.objectives.probability * .5 + historicalAcceptance * .3 + strategy.objectives.preference * .2);
    const failureProbability = clamp((1 - strategy.objectives.probability) * .7 + strategy.objectives.risk * .3);
    return immutable({ acceptanceProbability, undoProbability: clamp((1 - acceptanceProbability) * .45),
      retryProbability: clamp(failureProbability * .55), correctionProbability: clamp(strategy.objectives.risk * .4), failureProbability });
  }
}
