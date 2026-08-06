import type { PipelineExperimentPlan } from './types';

export class CreativeExperimentPlanner {
  plan(): PipelineExperimentPlan {
    const variants = [{ name: 'A', source: 'LOCAL' as const, operations: ['color_correction' as const], cost: 0, recommended: true }, { name: 'B', source: 'LOCAL' as const, operations: ['lighting_adjustment' as const], cost: 0, recommended: true }, { name: 'C', source: 'AI' as const, operations: ['style_generation' as const], cost: 15, recommended: false }];
    return { variants, totalCost: variants.filter((variant) => variant.recommended).reduce((sum, variant) => sum + variant.cost, 0), reason: 'Use cheap local variants before optional AI transformation.' };
  }
}
