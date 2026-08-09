import { immutable } from "./immutable";
import type { AdvancedDecisionCandidate } from "./advancedTypes";
import type { DecisionStory } from "./refinementTypes";

export class DecisionStoryBuilder {
  build(candidate: AdvancedDecisionCandidate, qualityThreshold: number): DecisionStory {
    const local = candidate.operations.filter((operation) => !operation.startsWith("ai:"));
    const ai = candidate.requiredAI;
    const steps = [...(local.length ? [`Сначала бесплатно выполним: ${local.join(", ")}.`] : []),
      `Затем оценим результат относительно порога качества ${Math.round(qualityThreshold * 100)}%.`,
      ...(ai.length ? [`Если качества недостаточно, предложим AI для: ${ai.join(", ")}.`] : ["При достаточном качестве AI не понадобится."])];
    return immutable({ headline: "Безопасный путь к творческой цели", steps, userMessage: steps.join(" ") });
  }
}
