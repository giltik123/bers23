import { clamp, immutable } from "./immutable";
import type { AdaptiveWeights, DecisionPersona, DecisionPersonaName, LearningStatistics, OptimizationWeights, WeightEvolution } from "./types";

const weights = (quality: number, cost: number, speed: number, risk: number, creativity: number, success: number, preference: number): OptimizationWeights => ({ quality, cost, speed, risk, creativity, success, preference });
const personas: Record<DecisionPersonaName, DecisionPersona> = {
  ECONOMY: { name: "ECONOMY", weights: weights(.15, .4, .12, .1, .05, .1, .08), riskTolerance: .3, description: "Минимальная стоимость" },
  PROFESSIONAL: { name: "PROFESSIONAL", weights: weights(.32, .08, .08, .15, .08, .2, .09), riskTolerance: .4, description: "Надёжное качество" },
  CREATIVE: { name: "CREATIVE", weights: weights(.18, .05, .05, .08, .38, .14, .12), riskTolerance: .7, description: "Креативность" },
  LUXURY: { name: "LUXURY", weights: weights(.4, .03, .04, .12, .18, .13, .1), riskTolerance: .45, description: "Премиальная подача" },
  MARKETING: { name: "MARKETING", weights: weights(.24, .1, .12, .08, .16, .16, .14), riskTolerance: .55, description: "Маркетинговый эффект" },
  CATALOG: { name: "CATALOG", weights: weights(.3, .14, .1, .13, .05, .2, .08), riskTolerance: .35, description: "Каталожная точность" },
  PORTRAIT: { name: "PORTRAIT", weights: weights(.3, .05, .08, .24, .08, .16, .09), riskTolerance: .25, description: "Безопасный портрет" },
  SOCIAL_MEDIA: { name: "SOCIAL_MEDIA", weights: weights(.16, .18, .25, .06, .17, .1, .08), riskTolerance: .55, description: "Быстрая публикация" },
};
export class AdaptivePersonas {
  get(name: DecisionPersonaName): DecisionPersona { return immutable(structuredClone(personas[name])); }
  select(goalCategory: string, requested?: DecisionPersonaName): DecisionPersona {
    if (requested) return this.get(requested); return this.get((goalCategory in personas ? goalCategory : "PROFESSIONAL") as DecisionPersonaName);
  }
}
export class OnlineWeightAdapter {
  adapt(current: AdaptiveWeights, reaction: "ACCEPTED" | "REJECTED", winningComponents: Partial<OptimizationWeights>): WeightEvolution {
    const direction = reaction === "ACCEPTED" ? 1 : -1; const learningRate = Math.max(.005, .05 / Math.sqrt(current.sampleSize + 1));
    const adjusted = Object.fromEntries(Object.entries(current.weights).map(([key, value]) => [key, clamp(value + direction * learningRate * (winningComponents[key as keyof OptimizationWeights] ?? 0))])) as unknown as OptimizationWeights;
    const total = Object.values(adjusted).reduce((sum, value) => sum + value, 0);
    const normalized = Object.fromEntries(Object.entries(adjusted).map(([key, value]) => [key, value / total])) as unknown as OptimizationWeights;
    const after = immutable({ persona: current.persona, weights: normalized, version: current.version + 1, sampleSize: current.sampleSize + 1 });
    return immutable({ before: structuredClone(current), after, reason: `Статистическая адаптация после ${reaction}.` });
  }
  statistics(state: AdaptiveWeights, accepted: number, rejected: number): LearningStatistics { const samples = accepted + rejected;
    return immutable({ samples, accepted, rejected, acceptanceRate: samples ? accepted / samples : 0, weightVersion: state.version }); }
}
