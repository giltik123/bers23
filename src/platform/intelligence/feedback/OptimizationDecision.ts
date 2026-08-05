import type { ProviderRankingResult } from '../ranking/RankingTypes';
export interface OptimizationDecision {
  readonly capability: string; readonly currentProvider?: string; readonly recommendedProvider?: string;
  readonly changed: boolean; readonly confidence: number; readonly reason: string; readonly ranking: readonly ProviderRankingResult[];
}
