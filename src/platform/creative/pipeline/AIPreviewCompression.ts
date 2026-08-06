import type { AIPreviewCompressionPlan, CompressedPreviewOption } from './types';

export class AIPreviewCompression {
  plan(requestedVariants: number, selectedOptionId?: string): AIPreviewCompressionPlan {
    const localPreviewCount = Math.max(0, requestedVariants);
    const options: CompressedPreviewOption[] = Array.from({ length: localPreviewCount }, (_, index) => ({ id: `variant-${index + 1}`, source: 'LOCAL_PREVIEW', operations: index % 2 === 0 ? ['color_correction'] : ['lighting_adjustment'], cost: 0, selectedForFinalGeneration: selectedOptionId === `variant-${index + 1}` }));
    if (selectedOptionId) options.push({ id: `${selectedOptionId}-final`, source: 'AI_FINAL', operations: ['style_generation'], cost: 15, selectedForFinalGeneration: true });
    return { localPreviewCount, aiCallsAvoided: selectedOptionId ? Math.max(0, requestedVariants - 1) : requestedVariants, finalAICalls: selectedOptionId ? 1 : 0, options, savedCredits: Math.max(0, requestedVariants - (selectedOptionId ? 1 : 0)) * 15 };
  }
}
