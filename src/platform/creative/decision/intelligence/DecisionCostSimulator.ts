import { immutable } from "./immutable";
import type { DecisionCandidate, DecisionCostSimulation } from "./types";

export class DecisionCostSimulator {
  simulate(candidate: DecisionCandidate, originalCost = 40): DecisionCostSimulation {
    const optimizedCost = candidate.estimatedCredits;
    return immutable({ originalCost, optimizedCost, savedCredits: Math.max(0, originalCost - optimizedCost),
      optionalAI: [...candidate.optionalAI], requiredAI: [...candidate.requiredAI] });
  }
}
