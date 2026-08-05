import type { RankingWeights } from './RankingTypes';
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = Object.freeze({ reliability: 0.5, speed: 0.3, costEfficiency: 0.2 });
export function rankingScore(reliability: number, speed: number, costEfficiency: number, weights: RankingWeights = DEFAULT_RANKING_WEIGHTS): number {
  const total = weights.reliability + weights.speed + weights.costEfficiency; if (total <= 0) throw new Error('Ranking weights must have a positive sum.');
  return (reliability * weights.reliability + speed * weights.speed + costEfficiency * weights.costEfficiency) / total;
}
