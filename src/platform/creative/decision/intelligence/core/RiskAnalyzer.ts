import { clamp, immutable } from "./immutable";
import type { CoreCandidate, CreativeRisk, RiskScore } from "./types";

export class RiskAnalyzer {
  analyze(candidate: CoreCandidate, features: readonly string[], budget?: number): RiskScore {
    const risks: CreativeRisk[] = [];
    const add = (category: CreativeRisk["category"], score: number, reason: string, mitigation: string) => risks.push({ category, score, reason, mitigation });
    if (features.some((item) => ["face", "identity"].includes(item))) add("IDENTITY", .75, "Изменение идентичности требует контроля.", "Показать preview и запросить подтверждение.");
    if (features.includes("copyright")) add("COPYRIGHT", .7, "Возможна имитация защищённого стиля.", "Использовать нейтральное стилевое направление.");
    if (candidate.mode !== "LOCAL") add("PROVIDER", .25, "Внешняя генерация может быть нестабильна.", "Сохранить локальную альтернативу.");
    if (budget !== undefined && candidate.estimatedCost > budget) add("BUDGET", 1, "Оценка превышает бюджет.", "Выбрать LOCAL или более дешёвый HYBRID.");
    if (candidate.operations.length >= 6) add("LARGE_EDIT", .55, "Большое число изменений снижает предсказуемость.", "Разделить обработку на стадии.");
    if (features.includes("unsafe")) add("UNSAFE_WORKFLOW", 1, "Запрошена небезопасная операция.", "Остановить выполнение.");
    const total = risks.length ? clamp(1 - risks.reduce((remaining, risk) => remaining * (1 - risk.score), 1)) : 0;
    return immutable({ total, level: total >= .7 ? "HIGH" : total >= .35 ? "MEDIUM" : "LOW", risks, mitigations: risks.map(({ mitigation }) => mitigation) });
  }
}
