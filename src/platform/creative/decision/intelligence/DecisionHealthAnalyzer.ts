import { clamp, immutable } from "./immutable";
import type { DecisionHealth } from "./refinementTypes";

export interface DecisionHealthInput { readonly stability: number; readonly risk: number; readonly explainability: number; readonly costEfficiency: number; readonly quality: number; readonly historyReliability: number }
export class DecisionHealthAnalyzer {
  analyze(input: DecisionHealthInput): DecisionHealth {
    const dimensions = { stability: clamp(input.stability), risk: clamp(1 - input.risk), explainability: clamp(input.explainability),
      cost: clamp(input.costEfficiency), quality: clamp(input.quality), history: clamp(input.historyReliability) };
    const score = Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length;
    const grade = score < .45 ? "POOR" : score < .65 ? "FAIR" : score < .85 ? "GOOD" : "EXCELLENT";
    const warnings = Object.entries(dimensions).filter(([, value]) => value < .5).map(([key]) => `Низкий показатель: ${key}`);
    return immutable({ score, grade, dimensions, warnings });
  }
}
