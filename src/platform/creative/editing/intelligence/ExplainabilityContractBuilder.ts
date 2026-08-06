import type { AIExplainabilityContract, EditOperation } from './types';

export class ExplainabilityContractBuilder {
  build(operation: EditOperation): AIExplainabilityContract | undefined {
    if (operation.mode !== 'AI') return undefined;
    return {
      operation: operation.type,
      whyAI: operation.reason,
      whyNotLocal: 'Local tools can adjust pixels, color, light, and detail, but cannot reliably create new semantic content or objects.',
      estimatedCost: operation.credits,
      expectedBenefit: operation.type.includes('background') || operation.type === 'scene_generation' ? '+30% composition improvement' : '+25% creative transformation quality',
    };
  }
}
