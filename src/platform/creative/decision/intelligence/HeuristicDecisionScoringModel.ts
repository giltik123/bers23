import { clamp, immutable } from "./immutable";
import type { AdvancedDecisionCandidate, DecisionScoringModel, ScoredStrategy, ScoringProfile } from "./advancedTypes";
import type { DecisionIntelligenceContext } from "./types";

export class HeuristicDecisionScoringModel implements DecisionScoringModel {
  evaluate(candidate: AdvancedDecisionCandidate, context: DecisionIntelligenceContext, profile: ScoringProfile): ScoredStrategy {
    const preferred = context.preferredOperations ?? [];
    const preference = preferred.length ? candidate.operations.filter((item) => preferred.includes(item)).length / preferred.length : .5;
    const objectives = { quality: clamp((context.currentQuality ?? .5) + candidate.expectedQualityGain),
      credits: candidate.estimatedCredits, latency: candidate.latency, probability: candidate.successProbability,
      preference: clamp(preference), creativity: candidate.creativity, risk: candidate.risk };
    const budget = Math.max(context.availableCredits ?? 20, 1);
    const utility = objectives.quality * profile.qualityWeight + candidate.speed * profile.speedWeight
      + clamp(1 - objectives.credits / budget) * profile.costWeight + objectives.creativity * profile.creativityWeight
      + objectives.preference * profile.preferenceWeight + (1 - objectives.risk) * profile.riskWeight
      + objectives.probability * profile.successWeight;
    return immutable({ candidate, objectives, utility: clamp(utility) });
  }
}
