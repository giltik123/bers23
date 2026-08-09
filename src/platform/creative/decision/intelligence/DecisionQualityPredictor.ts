import { clamp, immutable } from "./immutable";
import type { DecisionCandidate, DecisionIntelligenceContext, DecisionQualityPrediction } from "./types";

export class DecisionQualityPredictor {
  predict(candidate: DecisionCandidate, context: DecisionIntelligenceContext): DecisionQualityPrediction {
    const expectedQuality = clamp((context.currentQuality ?? 0.5) + candidate.expectedQualityGain);
    const minimum = context.minimumQuality ?? 0.75;
    const shouldEscalate = expectedQuality < minimum && candidate.mode === "LOCAL";
    return immutable({ expectedQuality, confidence: candidate.successProbability, shouldEscalate,
      reason: shouldEscalate ? "Локального улучшения недостаточно для требуемого качества." : "Ожидаемое качество соответствует порогу." });
  }
}
