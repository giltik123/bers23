import { immutable } from "./immutable";
import type { DecisionCandidate, DecisionCostSimulation, DecisionExplanationResult, DecisionQualityPrediction } from "./types";

export class DecisionExplanationEngine {
  explain(candidate: DecisionCandidate, quality: DecisionQualityPrediction, cost: DecisionCostSimulation): DecisionExplanationResult {
    const reasons = candidate.mode === "LOCAL"
      ? ["Локальные изменения бесплатны.", "AI не нужен при достаточном ожидаемом качестве."]
      : [`AI добавлен для операций: ${candidate.requiredAI.join(", ")}.`, "Локальные инструменты не могут выполнить генеративные изменения."];
    return immutable({ candidateId: candidate.id,
      summary: `Выбран режим ${candidate.mode}. Ожидаемое качество: ${Math.round(quality.expectedQuality * 100)}%. Экономия: ${cost.savedCredits} кредитов.`,
      reasons });
  }
}
