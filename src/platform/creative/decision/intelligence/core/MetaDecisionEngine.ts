import { immutable } from "./immutable";
import type { DecisionUncertainty, MetaDecision, MetaDecisionReason, RiskScore } from "./types";

export class MetaDecisionEngine {
  decide(input: { readonly uncertainty: DecisionUncertainty; readonly risk: RiskScore; readonly estimatedCost: number; readonly budget?: number; readonly localQualitySufficient: boolean }): MetaDecision {
    const reasons: MetaDecisionReason[] = [];
    if (input.risk.level === "HIGH") reasons.push({ category: "RISK", message: "Высокий риск требует остановки и уточнения." });
    if (input.uncertainty.level === "HIGH") reasons.push({ category: "CONFIDENCE", message: "Недостаточно уверенности для автоматического решения." });
    if (input.budget !== undefined && input.estimatedCost > input.budget) reasons.push({ category: "COST", message: "Оценка превышает бюджет." });
    if (input.localQualitySufficient) reasons.push({ category: "QUALITY", message: "Локальная обработка достигает целевого качества." });
    const action = input.risk.level === "HIGH" || input.uncertainty.recommendedAction === "ASK_USER" ? "ASK_USER"
      : input.localQualitySufficient ? "SKIP_AI" : input.uncertainty.recommendedAction === "SHOW_PREVIEW" ? "SHOW_PREVIEW"
        : input.budget !== undefined && input.estimatedCost > input.budget ? "LOCAL_FIRST" : "EXECUTE";
    return immutable({ action, reasons, requiresConfirmation: ["ASK_USER", "SHOW_PREVIEW", "EXECUTE"].includes(action) && input.estimatedCost > 0 });
  }
}
