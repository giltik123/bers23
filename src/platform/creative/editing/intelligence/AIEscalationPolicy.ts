import { defaultCreativeIntelligenceConfig } from './CreativeIntelligenceConfig';
import type { AIEscalationDecision, CreativeIntelligenceConfig, LocalCapabilityDecision, QualityEstimate } from './types';

export class AIEscalationPolicy {
  decide(quality: QualityEstimate, capability: LocalCapabilityDecision, config: Partial<CreativeIntelligenceConfig> = {}): AIEscalationDecision {
    const resolved = { ...defaultCreativeIntelligenceConfig, ...config };
    const confidenceAllowsAI = quality.confidence >= resolved.aiEscalationConfidence || capability.mode === 'AI';
    const costAllowsAI = capability.estimatedCredits <= resolved.maxOptionalCost || capability.mode === 'AI';
    const allowAI = confidenceAllowsAI && costAllowsAI;
    const escalateToAI = allowAI && quality.afterQuality < resolved.qualityThreshold;
    return {
      tryLocal: true,
      qualityThreshold: resolved.qualityThreshold,
      allowAI,
      escalateToAI,
      reason: escalateToAI ? 'Local quality is below threshold; AI can be offered after confirmation.' : 'Local result is good enough or AI policy limits optional escalation.',
    };
  }
}
