import { immutable } from "./immutable";
import type { CounterfactualInput, CounterfactualReason } from "./refinementTypes";
import type { CandidateMode } from "./types";

export class DecisionCounterfactualAnalyzer {
  analyze(input: CounterfactualInput): readonly CounterfactualReason[] {
    const modes: readonly CandidateMode[] = ["LOCAL", "HYBRID", "AI"];
    return immutable(modes.map((mode) => {
      const candidate = [input.selected, ...input.alternatives].find((item) => item.mode === mode);
      if (mode === input.selected.mode) return { mode, selected: true, reason: "Лучший баланс цели, качества и ограничений.", tradeoff: "Выбранный путь." };
      if (!candidate) return { mode, selected: false, reason: "Подходящий кандидат отсутствует.", tradeoff: "Стратегия недоступна." };
      if (mode === "AI" && (input.localQualitySufficient || candidate.estimatedCredits > input.budget)) return { mode, selected: false,
        reason: input.localQualitySufficient ? "Локального качества достаточно." : "AI превышает бюджет.", tradeoff: "Больше стоимость при ограниченной пользе." };
      if (mode === "LOCAL" && !input.localQualitySufficient) return { mode, selected: false, reason: "Локальная обработка не достигает цели.", tradeoff: "Ниже ожидаемое качество." };
      return { mode, selected: false, reason: "Другой кандидат лучше соответствует приоритетам.", tradeoff: "Альтернативный баланс качества и стоимости." };
    }));
  }
}
