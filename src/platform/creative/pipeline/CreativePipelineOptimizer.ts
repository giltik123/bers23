import type { CreativePipeline, PipelineOptimizationResult } from './types';

export class CreativePipelineOptimizer {
  optimize(pipeline: CreativePipeline, originalCost = pipeline.totalCost): PipelineOptimizationResult {
    const aiSteps = pipeline.steps.filter((step) => step.source === 'AI');
    const keepAI = aiSteps.slice(0, 1);
    const optimizedSteps = [...pipeline.steps.filter((step) => step.source !== 'AI'), ...keepAI].sort((left, right) => (left.source === 'LOCAL' ? -1 : 1) - (right.source === 'LOCAL' ? -1 : 1));
    const optimizedCost = optimizedSteps.reduce((sum, step) => sum + step.estimatedCost, 0);
    return { originalCost, optimizedCost, savedCredits: Math.max(0, originalCost - optimizedCost), changes: ['Prefer LOCAL color and lighting before AI', 'Keep only AI step with unique semantic value', 'Add LOCAL finishing after AI'], pipeline: { ...pipeline, steps: optimizedSteps, totalCost: optimizedCost } };
  }
}
