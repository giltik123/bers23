import { immutable } from "./immutable";
import type { DecisionCandidate, DecisionIntelligenceContext } from "./types";

export interface CandidateIdFactory { createId(): string }

export class DecisionCandidateGenerator {
  constructor(private readonly ids: CandidateIdFactory) {}

  generate(context: DecisionIntelligenceContext): readonly DecisionCandidate[] {
    const local = context.availableOperations.filter((operation) => !operation.startsWith("ai:"));
    const ai = context.availableOperations.filter((operation) => operation.startsWith("ai:"));
    const candidates: DecisionCandidate[] = [{
      id: this.ids.createId(), mode: "LOCAL", operations: local,
      estimatedCredits: 0, expectedQualityGain: 0.12, speed: 1, successProbability: 0.95,
      optionalAI: [], requiredAI: [],
    }];
    if (ai.length) candidates.push({
      id: this.ids.createId(), mode: "HYBRID", operations: [...local, ai[0]],
      estimatedCredits: 5, expectedQualityGain: 0.35, speed: 0.7, successProbability: 0.85,
      optionalAI: ai.slice(1), requiredAI: [ai[0]],
    });
    candidates.push({
      id: this.ids.createId(), mode: "AI", operations: ["ai:complete_regeneration"],
      estimatedCredits: 20, expectedQualityGain: 0.5, speed: 0.4, successProbability: 0.75,
      optionalAI: [], requiredAI: ["ai:complete_regeneration"],
    });
    return immutable(candidates);
  }
}
