export interface RankingWeights { readonly reliability: number; readonly speed: number; readonly costEfficiency: number; }
export interface ProviderRankingCandidate { readonly provider: string; readonly capability?: string; readonly quality?: number; }
export interface ProviderRankingResult { readonly provider: string; readonly score: number; readonly reliability: number; readonly speed: number; readonly costEfficiency: number; readonly averageLatency: number; readonly averageCost: number; readonly sampleSize: number; }
