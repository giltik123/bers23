import { immutable } from "./immutable";
import type { AdvancedDecisionCandidate } from "./advancedTypes";
import type { DecisionOpportunity } from "./refinementTypes";

const freeEnhancements = ["lighting", "contrast", "color_balance", "white_balance"];
export class OpportunityDetector {
  detect(candidate: AdvancedDecisionCandidate, availableOperations: readonly string[]): readonly DecisionOpportunity[] {
    const opportunities = freeEnhancements.filter((operation) => availableOperations.includes(operation) && !candidate.operations.includes(operation))
      .map((operation, index) => ({ id: `opportunity-${index + 1}`, operation, expectedGain: .04,
        additionalCredits: 0, reason: "Локальное улучшение повышает качество без увеличения стоимости." }));
    if (candidate.mode !== "LOCAL" && candidate.expectedQualityGain <= .15) opportunities.push({ id: "opportunity-local-first",
      operation: "local_enhancement", expectedGain: .1, additionalCredits: -candidate.estimatedCredits, reason: "AI можно заменить локальной обработкой." });
    return immutable(opportunities);
  }
}
