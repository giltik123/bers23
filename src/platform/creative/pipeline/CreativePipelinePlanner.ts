import type { CreativePipeline, CreativePipelineStep } from './types';

const step = (operation: CreativePipelineStep['operation'], source: CreativePipelineStep['source'], reason: string, estimatedCost = 0, dependsOn: CreativePipelineStep['dependsOn'] = []): CreativePipelineStep => ({ operation, source, reason, estimatedCost, dependsOn });

export class CreativePipelinePlanner {
  plan(prompt: string): CreativePipeline {
    const normalized = prompt.toLowerCase();
    const intent = /(одежд|clothes|fashion)/i.test(normalized) ? 'fashion_catalog' : /(каталог|товар|product|catalog)/i.test(normalized) ? 'product_catalog' : 'creative_enhancement';
    const steps = this.stepsForIntent(intent);
    return { pipelineId: `pipeline-${intent}`, intent, steps, totalCost: steps.reduce((sum, item) => sum + item.estimatedCost, 0), confidence: intent === 'creative_enhancement' ? 0.72 : 0.84 };
  }

  private stepsForIntent(intent: string): CreativePipelineStep[] {
    if (intent === 'fashion_catalog') return [step('color_correction', 'LOCAL', 'Free catalog color cleanup'), step('lighting_adjustment', 'LOCAL', 'Free lighting normalization'), step('virtual_try_on', 'AI', 'AI is required to generate clothing on the model', 15), step('final_enhancement', 'LOCAL', 'Free finishing pass'), step('quality_check', 'QUALITY_GATE', 'Verify catalog quality')];
    if (intent === 'product_catalog') return [step('color_correction', 'LOCAL', 'Free product color cleanup'), step('lighting_adjustment', 'LOCAL', 'Free product lighting'), step('background_check', 'QUALITY_GATE', 'Check whether the background is acceptable'), step('final_enhancement', 'LOCAL', 'Free sharpening and detail')];
    return [step('color_correction', 'LOCAL', 'Free color improvement'), step('lighting_adjustment', 'LOCAL', 'Free light improvement'), step('final_enhancement', 'LOCAL', 'Free final polish'), step('quality_check', 'QUALITY_GATE', 'Verify quality before AI')];
  }
}
