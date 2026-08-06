import type { DecisionContext, DecisionReason } from './types';

export class QualityAwareDecision {
  apply(context: DecisionContext, operations: string[], reasons: DecisionReason[]): string[] {
    if (!context.quality) return operations;
    if (context.quality.expectedQuality >= context.quality.minimumQuality) {
      reasons.push({ id: 'quality-sufficient', category: 'QUALITY', message: 'LOCAL quality is sufficient, AI can be skipped.' });
      return operations.filter((operation) => operation !== 'background_generation' && operation !== 'object_removal' && operation !== 'generative_fill');
    }
    if (!operations.includes('background_generation')) operations.push('background_generation');
    reasons.push({ id: 'quality-escalation', category: 'QUALITY', message: 'LOCAL quality is below required quality, AI escalation is recommended.' });
    return operations;
  }
}
