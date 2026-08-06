import type { CreativeSandboxPlan } from './types';

export class CreativeSandbox {
  create(originalImage: string): CreativeSandboxPlan {
    return { originalImage, finalGenerationRequiresConfirmation: true, versions: [{ name: 'Version A', mode: 'LOCAL_ONLY', previewOnly: true, operations: ['color_correction', 'lighting_adjustment'], estimatedFinalCost: 0 }, { name: 'Version B', mode: 'LOCAL_PLUS_CHEAP_AI', previewOnly: true, operations: ['color_correction', 'background_replacement'], estimatedFinalCost: 10 }, { name: 'Version C', mode: 'FULL_AI', previewOnly: true, operations: ['style_generation', 'background_replacement'], estimatedFinalCost: 25 }] };
  }
}
