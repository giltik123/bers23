import { clamp, immutable } from "./immutable";
import type { DecisionCandidate, DecisionIntelligenceContext, DecisionScore, DecisionScoreWeights } from "./types";

export const DEFAULT_SCORE_WEIGHTS: DecisionScoreWeights = immutable({
  quality: 0.3, cost: 0.25, preference: 0.15, speed: 0.1, successProbability: 0.2,
});

export class DecisionScoreModel {
  constructor(private readonly weights: DecisionScoreWeights = DEFAULT_SCORE_WEIGHTS) {
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) throw new Error("Decision score weights must have a positive sum");
  }

  score(candidate: DecisionCandidate, context: DecisionIntelligenceContext): DecisionScore {
    const maxCost = Math.max(context.availableCredits ?? 20, 1);
    const preferred = context.preferredOperations ?? [];
    const matches = candidate.operations.filter((operation) => preferred.includes(operation)).length;
    const preferenceScore = preferred.length ? matches / preferred.length : 0.5;
    const parts = {
      qualityScore: clamp(candidate.expectedQualityGain / 0.5),
      costScore: clamp(1 - candidate.estimatedCredits / maxCost),
      preferenceScore: clamp(preferenceScore),
      speedScore: clamp(candidate.speed),
      executionProbability: clamp(candidate.successProbability),
    };
    const denominator = Object.values(this.weights).reduce((sum, weight) => sum + weight, 0);
    const finalScore = (parts.qualityScore * this.weights.quality + parts.costScore * this.weights.cost
      + parts.preferenceScore * this.weights.preference + parts.speedScore * this.weights.speed
      + parts.executionProbability * this.weights.successProbability) / denominator;
    return immutable({ ...parts, finalScore: clamp(finalScore) });
  }
}
