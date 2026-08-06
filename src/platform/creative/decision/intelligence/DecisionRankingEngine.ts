import { immutable } from "./immutable";
import type { DecisionCandidate, DecisionIntelligenceContext, DecisionRanking, RankedCandidate } from "./types";

export interface CandidateScorer { score(candidate: DecisionCandidate, context: DecisionIntelligenceContext): RankedCandidate["score"] }

export class DecisionRankingEngine {
  constructor(private readonly scorer: CandidateScorer) {}

  rank(candidates: readonly DecisionCandidate[], context: DecisionIntelligenceContext): DecisionRanking {
    if (!candidates.length) throw new Error("At least one decision candidate is required");
    const ranked = candidates.map((candidate) => ({ candidate, score: this.scorer.score(candidate, context) }))
      .sort((left, right) => right.score.finalScore - left.score.finalScore);
    const gap = ranked[0].score.finalScore - (ranked[1]?.score.finalScore ?? 0);
    return immutable({
      bestCandidate: ranked[0].candidate,
      score: ranked[0].score.finalScore,
      confidence: Math.min(1, 0.6 + Math.max(0, gap)),
      explanation: `${ranked[0].candidate.mode} имеет лучший баланс качества, стоимости и вероятности успеха.`,
      candidates: ranked,
    });
  }
}
