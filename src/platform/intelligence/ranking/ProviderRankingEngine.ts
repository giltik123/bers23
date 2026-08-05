import type { CostAnalyzer } from '../execution/CostAnalyzer';
import type { PerformanceAnalyzer } from '../execution/PerformanceAnalyzer';
import { DEFAULT_RANKING_WEIGHTS, rankingScore } from './RankingScore';
import type { ProviderRankingCandidate, ProviderRankingResult, RankingWeights } from './RankingTypes';

/** Ranks providers from historical reliability, relative speed, and cost efficiency. */
export class ProviderRankingEngine {
  constructor(private readonly performance: PerformanceAnalyzer, private readonly cost: CostAnalyzer, private readonly weights: RankingWeights = DEFAULT_RANKING_WEIGHTS) {}
  rank(candidates: readonly ProviderRankingCandidate[]): readonly ProviderRankingResult[] {
    const observations = candidates.map(({ provider, capability }) => ({ performance: this.performance.analyze(provider, capability), cost: capability ? this.cost.byProviderCapability(provider, capability) : this.cost.byProvider(provider) }));
    const positiveLatency = observations.map((value) => value.performance.averageLatency).filter((value) => value > 0); const positiveCost = observations.map((value) => value.cost.averageCost).filter((value) => value > 0);
    const fastest = positiveLatency.length ? Math.min(...positiveLatency) : 0; const cheapest = positiveCost.length ? Math.min(...positiveCost) : 0;
    return Object.freeze(observations.map(({ performance, cost }) => {
      const speed = performance.averageLatency <= 0 ? 0 : fastest / performance.averageLatency; const costEfficiency = cost.averageCost <= 0 ? 1 : cheapest / cost.averageCost;
      return Object.freeze({ provider: performance.provider, score: rankingScore(performance.successRate, speed, costEfficiency, this.weights), reliability: performance.successRate, speed, costEfficiency, averageLatency: performance.averageLatency, averageCost: cost.averageCost, sampleSize: performance.executions });
    }).sort((left, right) => right.score - left.score || right.sampleSize - left.sampleSize || left.provider.localeCompare(right.provider)));
  }
  recommend(candidates: readonly ProviderRankingCandidate[]): ProviderRankingResult | undefined { return this.rank(candidates)[0]; }
}
