import type { CreativeEditIntent, EditOperation, EditStrategy, EditStrategyPlan } from './types';

const operation = (type: EditOperation['type'], mode: EditOperation['mode'], label: string, credits = 0, reason = 'Selected for this edit strategy', workflow?: string): EditOperation => ({ type, mode, label, credits, reason, workflow });

export class EditStrategyPlanner {
  plan(intent: CreativeEditIntent): EditStrategyPlan {
    const local = this.localStrategy(intent);
    const studio = this.studioStrategy(intent);
    const fullCreative = this.fullCreativeStrategy(intent);
    const recommendedStrategy = intent.requiresAI ? fullCreative : local;
    const alternatives = intent.requiresAI ? [studio, local] : [studio, fullCreative];

    return {
      recommended: recommendedStrategy.id,
      recommendedStrategy,
      alternatives,
      confidence: recommendedStrategy.confidence,
      reason: recommendedStrategy.reason,
    };
  }

  private localStrategy(intent: CreativeEditIntent): EditStrategy {
    return {
      id: 'LOCAL_ENHANCEMENT',
      name: 'Natural Enhancement',
      mode: 'LOCAL',
      cost: 0,
      confidence: intent.requiresAI ? 0.42 : 0.78,
      reason: 'local improvements can achieve target quality',
      operations: [
        operation('brightness', 'LOCAL', 'Brightness', 0, 'Free local brightness edit'),
        operation('contrast', 'LOCAL', 'Contrast', 0, 'Free local contrast edit'),
        operation('color', 'LOCAL', 'Color correction', 0, 'Free local color edit'),
        operation('sharpness', 'LOCAL', 'Sharpness', 0, 'Free local detail edit'),
      ],
    };
  }

  private studioStrategy(intent: CreativeEditIntent): EditStrategy {
    return {
      id: 'STUDIO_AI',
      name: 'Studio Look',
      mode: 'MIXED',
      cost: 10,
      confidence: intent.intent === 'premium_enhancement' || intent.intent === 'product_photo' ? 0.72 : 0.64,
      reason: 'Use local color and lighting, then AI only when background improvement is needed.',
      operations: [
        operation('color', 'LOCAL', 'Color correction', 0, 'Free local color polish'),
        operation('lighting', 'LOCAL', 'Lighting improvement', 0, 'Free local lighting polish'),
        operation('background_improvement', 'AI', 'Background improvement', 10, 'AI improves or replaces the background', 'background-enhancement'),
      ],
    };
  }

  private fullCreativeStrategy(intent: CreativeEditIntent): EditStrategy {
    const operations = intent.intent === 'fashion_style'
      ? [operation('virtual_try_on', 'AI', 'Virtual try-on', 15, 'AI changes clothing', 'virtual-try-on'), operation('style_transformation', 'AI', 'Style transformation', 10, 'AI changes fashion mood')]
      : [operation('style_transformation', 'AI', 'Style transformation', 10, 'AI transforms visual style'), operation('scene_generation', 'AI', 'Scene generation', 15, 'AI generates a new scene')];

    return {
      id: 'FULL_CREATIVE',
      name: 'Full Creative Transformation',
      mode: 'AI',
      cost: operations.reduce((sum, item) => sum + item.credits, 0),
      confidence: intent.requiresAI ? 0.82 : 0.55,
      reason: 'AI creates a new scene or transforms the visual style when local edits are not enough.',
      operations,
    };
  }
}
