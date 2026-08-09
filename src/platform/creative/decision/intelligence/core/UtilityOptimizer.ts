import { clamp, immutable } from "./immutable";
import type { ConstraintGraph, CoreCandidate, OptimizationWeights, UtilityOptimization, UtilityScore } from "./types";

export interface CandidateConstraintPolicy { allows(candidate: CoreCandidate, graph: ConstraintGraph): boolean }
export interface UtilityFunction { evaluate(candidate: CoreCandidate, weights: OptimizationWeights): UtilityScore }
export class WeightedUtilityFunction implements UtilityFunction {
  evaluate(candidate: CoreCandidate, weights: OptimizationWeights): UtilityScore {
    const components = { quality: clamp(candidate.expectedQuality), cost: clamp(1 - candidate.estimatedCost / 50),
      speed: clamp(1 - candidate.estimatedLatencyMs / 30_000), risk: clamp(1 - candidate.risk), creativity: clamp(candidate.creativity),
      success: clamp(candidate.successProbability), preference: clamp(candidate.preferenceMatch) };
    const denominator = Object.values(weights).reduce((sum, value) => sum + value, 0);
    if (denominator <= 0) throw new Error("Optimization weights require a positive sum");
    const utility = (Object.keys(components) as (keyof OptimizationWeights)[])
      .reduce((sum, key) => sum + components[key] * weights[key], 0) / denominator;
    return immutable({ candidateId: candidate.id, utility: clamp(utility), components });
  }
}
export class UtilityOptimizer {
  constructor(private readonly utility: UtilityFunction, private readonly constraints: CandidateConstraintPolicy) {}
  optimize(candidates: readonly CoreCandidate[], graph: ConstraintGraph, weights: OptimizationWeights): UtilityOptimization {
    const feasibleCandidates = candidates.filter((candidate) => this.constraints.allows(candidate, graph));
    if (!feasibleCandidates.length) throw new Error("No candidate satisfies decision constraints");
    const scores = feasibleCandidates.map((candidate) => this.utility.evaluate(candidate, weights));
    const best = [...scores].sort((left, right) => right.utility - left.utility || left.candidateId.localeCompare(right.candidateId))[0];
    return immutable({ selected: feasibleCandidates.find(({ id }) => id === best.candidateId)!, scores, feasibleCandidates });
  }
}
