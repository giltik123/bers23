import { immutable } from "./immutable";
import type { AdvancedDecisionCandidate } from "./advancedTypes";
import type { StabilityResult } from "./refinementTypes";

export class DecisionStabilityAnalyzer {
  compare(original: AdvancedDecisionCandidate, perturbed: AdvancedDecisionCandidate): StabilityResult {
    const union = new Set([...original.operations, ...perturbed.operations]);
    const shared = original.operations.filter((operation) => perturbed.operations.includes(operation)).length;
    const changedOperations = [...union].filter((operation) => !original.operations.includes(operation) || !perturbed.operations.includes(operation));
    const operationSimilarity = union.size ? shared / union.size : 1;
    const score = operationSimilarity * .75 + Number(original.mode === perturbed.mode) * .25;
    return immutable({ score, stable: score >= .75, changedOperations });
  }
}
