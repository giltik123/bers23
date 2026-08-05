import type { CreativeIntelligenceConfig as CreativeIntelligenceConfigShape } from './types';

export const defaultCreativeIntelligenceConfig: CreativeIntelligenceConfigShape = Object.freeze({
  qualityThreshold: 0.75,
  aiEscalationConfidence: 0.8,
  maxOptionalCost: 20,
});

export class CreativeIntelligenceConfig {
  create(overrides: Partial<CreativeIntelligenceConfigShape> = {}): CreativeIntelligenceConfigShape {
    return { ...defaultCreativeIntelligenceConfig, ...overrides };
  }

  forPlan(plan: 'Free' | 'Studio' | 'Pro' | string): CreativeIntelligenceConfigShape {
    if (plan.toLowerCase() === 'free') return this.create({ qualityThreshold: 0.85, maxOptionalCost: 10 });
    if (plan.toLowerCase() === 'studio') return this.create({ qualityThreshold: 0.65, maxOptionalCost: 25 });
    return this.create();
  }
}
