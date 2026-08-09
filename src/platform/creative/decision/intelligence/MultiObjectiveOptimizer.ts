import { immutable } from "./immutable";
import type { DecisionScoringModel, ParetoOptimizationResult, ScoredStrategy, ScoringProfile } from "./advancedTypes";
import type { DecisionIntelligenceContext } from "./types";
import type { AdvancedDecisionCandidate } from "./advancedTypes";

const dominates = (left: ScoredStrategy, right: ScoredStrategy): boolean => {
  const l = left.objectives; const r = right.objectives;
  const noWorse = l.quality >= r.quality && l.credits <= r.credits && l.latency <= r.latency && l.probability >= r.probability
    && l.preference >= r.preference && l.creativity >= r.creativity && l.risk <= r.risk;
  const better = l.quality > r.quality || l.credits < r.credits || l.latency < r.latency || l.probability > r.probability
    || l.preference > r.preference || l.creativity > r.creativity || l.risk < r.risk;
  return noWorse && better;
};

export class MultiObjectiveOptimizer {
  constructor(private readonly model: DecisionScoringModel) {}
  optimize(candidates: readonly AdvancedDecisionCandidate[], context: DecisionIntelligenceContext, profile: ScoringProfile): ParetoOptimizationResult {
    if (!candidates.length) throw new Error("At least one candidate is required");
    const scored = candidates.map((candidate) => this.model.evaluate(candidate, context, profile));
    const frontier = scored.filter((candidate, index) => !scored.some((other, otherIndex) => index !== otherIndex && dominates(other, candidate)));
    const dominated = scored.filter((candidate) => !frontier.includes(candidate));
    const recommended = [...frontier].sort((left, right) => right.utility - left.utility)[0];
    return immutable({ frontier, dominated, recommended });
  }
}
