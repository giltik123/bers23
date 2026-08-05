import type { EditCapabilityDecision, LocalAdjustmentType } from './LocalEditingTypes';

const localOperations = new Set<LocalAdjustmentType>(['BRIGHTNESS', 'CONTRAST', 'SATURATION', 'HUE', 'TEMPERATURE', 'SHADOWS', 'HIGHLIGHTS', 'EXPOSURE', 'SHARPEN', 'BLUR', 'NOISE_REDUCTION', 'CROP', 'ROTATE', 'RESIZE', 'FLIP']);
const aiPhrases = [/замени/i, /replace/i, /generate/i, /создай/i, /париж/i, /paris/i, /комнат/i, /room/i, /object/i, /style transfer/i];

export class EditCapabilityResolver {
  resolve(input: { operation?: LocalAdjustmentType; prompt?: string }): EditCapabilityDecision {
    if (input.operation && localOperations.has(input.operation)) return Object.freeze({ mode: 'LOCAL', credits: 0, creditsRequired: false, reason: 'Operation can be resolved locally' });
    if (input.prompt && !aiPhrases.some((pattern) => pattern.test(input.prompt))) return Object.freeze({ mode: 'LOCAL', credits: 0, creditsRequired: false, reason: 'Prompt maps to local adjustment' });
    return Object.freeze({ mode: 'AI', provider: 'REVE', credits: 1, creditsRequired: true, reason: 'Operation requires generative AI rendering' });
  }
}
