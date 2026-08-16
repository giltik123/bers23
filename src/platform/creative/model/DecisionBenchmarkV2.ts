import { immutable, round } from './immutable';
import type { ProductBenchmarkMetrics } from './DecisionGovernanceV2';
import type { DecisionCandidate, DecisionContext } from './types';
import type { V2DecisionPrediction } from './v2-types';

export interface BenchmarkOutcomeV2 { readonly prediction: V2DecisionPrediction; readonly actualQuality: number; readonly accepted: boolean; readonly satisfied: number; readonly unnecessaryAI: boolean; readonly actualCost: number; readonly actualLatency: number; readonly bestUtility: number }
export interface BenchmarkScenarioV2 { readonly id: string; readonly context: DecisionContext; readonly candidates: readonly DecisionCandidate[] }

export class DecisionBenchmarkV2 {
  readonly version = 'decision-benchmark-v2';
  evaluate(outcomes: readonly BenchmarkOutcomeV2[]): ProductBenchmarkMetrics {
    const mean = (fn: (item: BenchmarkOutcomeV2) => number) => outcomes.length ? outcomes.reduce((sum, item) => sum + fn(item), 0) / outcomes.length : 0;
    return immutable({
      safety: round(mean((item) => Number(item.prediction.explanation.constraintExclusions.length === 0 || item.prediction.expectedUtility === -1))),
      ranking: round(1 - mean((item) => Math.max(0, item.bestUtility - item.prediction.expectedUtility))),
      acceptance: round(mean((item) => Number(item.accepted))), satisfaction: round(mean((item) => item.satisfied)),
      unnecessaryAI: round(mean((item) => Number(item.unnecessaryAI))), calibrationError: round(mean((item) => Math.abs(item.prediction.outcomes.acceptanceProbability - Number(item.accepted)))),
      privacyViolations: outcomes.filter((item) => item.prediction.explanation.constraintExclusions.includes('CLOUD_FORBIDDEN') && item.prediction.expectedUtility !== -1).length,
      cost: round(mean((item) => item.actualCost)), latency: round(mean((item) => item.actualLatency)), quality: round(mean((item) => item.actualQuality)),
      regret: round(mean((item) => Math.max(0, item.bestUtility - item.prediction.expectedUtility))),
      cloudAvoidance: round(mean((item) => Number(item.prediction.candidate.executionTarget !== 'CLOUD'))),
      oodSafety: round(mean((item) => Number(!item.prediction.ood || item.prediction.action !== 'EXECUTE'))),
      stability: round(1 - mean((item) => item.prediction.uncertaintyV2.epistemic)),
    });
  }

  compare(heuristic: ProductBenchmarkMetrics, v1: ProductBenchmarkMetrics, v2: ProductBenchmarkMetrics) {
    const delta = (candidate: ProductBenchmarkMetrics, baseline: ProductBenchmarkMetrics) => immutable(Object.fromEntries(Object.keys(candidate).map((key) => [key, round(candidate[key as keyof ProductBenchmarkMetrics] - baseline[key as keyof ProductBenchmarkMetrics])] as const)));
    return immutable({ v1VsHeuristic: delta(v1, heuristic), v2VsV1: delta(v2, v1), v2VsHeuristic: delta(v2, heuristic) });
  }
}
