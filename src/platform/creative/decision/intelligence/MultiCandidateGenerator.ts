import { immutable } from "./immutable";
import type { AdvancedDecisionCandidate } from "./advancedTypes";
import type { DecisionIntelligenceContext } from "./types";

export interface MultiCandidateGeneratorConfig { readonly maxCandidates: number; readonly aiCreditCost: number }
export interface AdvancedCandidateIdFactory { createId(): string }

export class MultiCandidateGenerator {
  constructor(private readonly ids: AdvancedCandidateIdFactory,
    private readonly config: MultiCandidateGeneratorConfig = { maxCandidates: 32, aiCreditCost: 5 }) {}

  generate(context: DecisionIntelligenceContext): readonly AdvancedDecisionCandidate[] {
    const local = context.availableOperations.filter((item) => !item.startsWith("ai:"));
    const ai = context.availableOperations.filter((item) => item.startsWith("ai:"));
    const operationSets: string[][] = [];
    for (let size = 1; size <= local.length; size += 1) {
      for (let start = 0; start + size <= local.length; start += 1) operationSets.push(local.slice(start, start + size));
    }
    const localDefinitions = operationSets.map((operations) => ({ mode: "LOCAL" as const, operations }));
    const hybridDefinitions = operationSets.flatMap((operations) => ai.map((operation) => ({ mode: "HYBRID" as const, operations: [...operations, operation] })));
    const aiDefinitions = [...ai.map((operation) => ({ mode: "AI" as const, operations: [operation] })),
      { mode: "AI" as const, operations: ["ai:complete_regeneration"] }];
    const seeds = [localDefinitions[0], hybridDefinitions[0], aiDefinitions[0]].filter(Boolean);
    const definitions = [...seeds, ...localDefinitions.slice(1), ...hybridDefinitions.slice(1), ...aiDefinitions.slice(1)]
      .slice(0, this.config.maxCandidates);
    return immutable(definitions.map(({ mode, operations }, index) => {
      const aiOperations = operations.filter((item) => item.startsWith("ai:"));
      const qualityGain = Math.min(.65, .08 * operations.length + .22 * aiOperations.length);
      return { id: this.ids.createId(), mode, operations, strategy: `${mode}_${index + 1}`,
        estimatedCredits: aiOperations.length * this.config.aiCreditCost, expectedQualityGain: qualityGain,
        speed: Math.max(.2, 1 - operations.length * .08 - aiOperations.length * .15),
        latency: operations.length * 100 + aiOperations.length * 900, creativity: Math.min(1, .12 * operations.length + .3 * aiOperations.length),
        risk: Math.min(1, .05 * operations.length + .18 * aiOperations.length), successProbability: Math.max(.4, .97 - .06 * operations.length - .08 * aiOperations.length),
        optionalAI: [], requiredAI: aiOperations };
    }));
  }
}
