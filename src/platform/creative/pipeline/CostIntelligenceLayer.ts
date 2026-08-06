import type { CreativePipeline, CostIntelligenceReport } from './types';

export class CostIntelligenceLayer {
  analyze(pipeline: CreativePipeline): CostIntelligenceReport {
    const localOperations = pipeline.steps.filter((step) => step.source === 'LOCAL').map((step) => step.operation);
    const aiOperations = pipeline.steps.filter((step) => step.source === 'AI').map((step) => ({ operation: step.operation, credits: step.estimatedCost }));
    const fullCost = aiOperations.reduce((sum, operation) => sum + operation.credits, 0) + 12;
    const almostSameCost = aiOperations.slice(0, 1).reduce((sum, operation) => sum + operation.credits, 0);
    return { localOperations, aiOperations, recommendations: [{ option: 'Professional quality', quality: 'High', credits: fullCost, saveCredits: 0, recommended: false }, { option: 'Almost same quality', quality: 'High-', credits: almostSameCost, saveCredits: Math.max(0, fullCost - almostSameCost), recommended: true }] };
  }
}
