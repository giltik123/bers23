import { immutable } from "./immutable";
import type { CoreCandidate, PairwiseComparison, TournamentBracket, UtilityScore } from "./types";

export interface PairwiseComparisonPolicy { compare(left: CoreCandidate, right: CoreCandidate, scores: ReadonlyMap<string, UtilityScore>): PairwiseComparison }
export class UtilityPairwiseComparison implements PairwiseComparisonPolicy {
  compare(left: CoreCandidate, right: CoreCandidate, scores: ReadonlyMap<string, UtilityScore>): PairwiseComparison { const l = scores.get(left.id)?.utility ?? 0; const r = scores.get(right.id)?.utility ?? 0;
    const winnerId = l === r ? [left.id, right.id].sort()[0] : l > r ? left.id : right.id;
    return immutable({ leftId: left.id, rightId: right.id, winnerId, margin: Math.abs(l - r), reason: "Попарное сравнение полезности." }); }
}
export class DecisionTournament {
  constructor(private readonly comparison: PairwiseComparisonPolicy) {}
  run(candidates: readonly CoreCandidate[], scores: readonly UtilityScore[]): TournamentBracket {
    if (!candidates.length) throw new Error("Tournament requires candidates"); const scoreMap = new Map(scores.map((score) => [score.candidateId, score]));
    let active = [...candidates]; const rounds: PairwiseComparison[][] = [];
    while (active.length > 1) { const comparisons: PairwiseComparison[] = []; const winners: CoreCandidate[] = [];
      for (let index = 0; index < active.length; index += 2) { const left = active[index]; const right = active[index + 1];
        if (!right) { winners.push(left); continue; } const result = this.comparison.compare(left, right, scoreMap); comparisons.push(result); winners.push(result.winnerId === left.id ? left : right); }
      rounds.push(comparisons); active = winners; }
    return immutable({ rounds, winner: active[0] });
  }
}
