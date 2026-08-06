import type { QualityPrediction, QualityPredictionInput } from './types';

export class QualityPredictionModel {
  predict(input: QualityPredictionInput): QualityPrediction {
    const score = input.imageQuality * 0.35 + input.faceVisibility * 0.2 + (1 - input.maskComplexity) * 0.25 + (1 - input.transformationComplexity) * 0.2;
    const probability = Math.max(0, Math.min(0.99, Number(score.toFixed(2))));
    const expectedQuality = probability >= 0.8 ? 'High' : probability >= 0.6 ? 'Medium' : 'Low';
    return { aiSuccessProbability: probability, expectedQuality, recommendation: probability < 0.6 ? 'Лучше сначала улучшить освещение и маску перед дорогим AI вызовом.' : 'AI вызов выглядит достаточно надежным.' };
  }
}
