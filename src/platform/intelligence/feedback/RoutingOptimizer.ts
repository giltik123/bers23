import type { ProviderRankingEngine } from '../ranking/ProviderRankingEngine';
import type { ProviderRankingCandidate } from '../ranking/RankingTypes';
import type { OptimizationDecision } from './OptimizationDecision';

/** Produces advisory provider feedback without mutating CapabilityRouter. */
export class RoutingOptimizer {
  constructor(private readonly ranking: ProviderRankingEngine) {}
  optimize(capability: string, providers: readonly string[], currentProvider?: string): OptimizationDecision {
    const ranking = this.ranking.rank(providers.map((provider): ProviderRankingCandidate => ({ provider, capability })));
    const recommended = ranking[0]; const current = ranking.find((value) => value.provider === currentProvider);
    const changed = Boolean(recommended && currentProvider && recommended.provider !== currentProvider);
    const confidence = recommended ? Math.min(1, recommended.sampleSize / 20) * recommended.score : 0;
    return Object.freeze({ capability, currentProvider, recommendedProvider: recommended?.provider, changed, confidence, reason: changed ? `${recommended.provider} has a stronger historical reliability, speed, and cost score than ${currentProvider}.` : current ? `${currentProvider} remains the strongest observed route.` : recommended ? `${recommended.provider} is the strongest observed route.` : 'No execution history is available.', ranking });
  }
}
