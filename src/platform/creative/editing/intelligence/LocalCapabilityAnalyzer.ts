import type { CreativeEditIntent, LocalCapabilityDecision } from './types';

export class LocalCapabilityAnalyzer {
  analyze(intent: CreativeEditIntent): LocalCapabilityDecision {
    if (intent.intent === 'fashion_style') return { mode: 'AI', workflow: 'virtual-try-on', cost: 15, credits: 15, estimatedCredits: 15, reason: 'changing clothes requires AI generation' };
    if (intent.intent === 'background_change') return { mode: 'AI', workflow: 'background-replacement', cost: 10, credits: 10, estimatedCredits: 10, reason: intent.reason };
    if (intent.intent === 'object_removal') return { mode: 'AI', workflow: 'object-removal', cost: 10, credits: 10, estimatedCredits: 10, reason: intent.reason };
    if (intent.intent === 'artistic_transformation') return { mode: 'AI', workflow: 'style-transformation', cost: 25, credits: 25, estimatedCredits: 25, reason: intent.reason };
    return { mode: 'LOCAL', cost: 0, credits: 0, estimatedCredits: 0, reason: 'request can be handled by local editing operations' };
  }
}
