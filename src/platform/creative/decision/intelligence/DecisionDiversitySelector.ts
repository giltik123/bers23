import { immutable } from "./immutable";
import type { DiversityResult } from "./refinementTypes";
import type { ScoredStrategy } from "./advancedTypes";

const distance = (left: ScoredStrategy, right: ScoredStrategy) => {
  const union = new Set([...left.candidate.operations, ...right.candidate.operations]);
  const shared = left.candidate.operations.filter((operation) => right.candidate.operations.includes(operation)).length;
  return 1 - (union.size ? shared / union.size : 1);
};
export class DecisionDiversitySelector {
  select(candidates: readonly ScoredStrategy[], limit = 5): DiversityResult {
    if (!candidates.length || limit <= 0) return immutable({ selected: [], averageDiversity: 0 });
    const remaining = [...candidates].sort((left, right) => right.utility - left.utility); const selected = [remaining.shift()!];
    while (remaining.length && selected.length < limit) {
      remaining.sort((left, right) => Math.min(...selected.map((item) => distance(right, item))) - Math.min(...selected.map((item) => distance(left, item))) || right.utility - left.utility);
      selected.push(remaining.shift()!);
    }
    const pairs = selected.flatMap((left, index) => selected.slice(index + 1).map((right) => distance(left, right)));
    return immutable({ selected, averageDiversity: pairs.length ? pairs.reduce((sum, value) => sum + value, 0) / pairs.length : 0 });
  }
}
