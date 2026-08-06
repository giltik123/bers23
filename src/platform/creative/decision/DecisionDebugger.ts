import type { CreativeDecision, DecisionContext } from './types';

export class DecisionDebugger {
  debug(context: DecisionContext, decision: CreativeDecision): string {
    return [`User:${context.userId}`, '↓', `Prompt:${context.prompt}`, '↓', `Detected Operations:${decision.operations.join(', ')}`, '↓', `Preferences:${context.preferences?.styles.join(', ') ?? 'none'}`, '↓', `Budget:${context.budget?.availableCredits ?? 'none'}`, '↓', `Quality:${context.quality ? `${context.quality.expectedQuality}/${context.quality.minimumQuality}` : 'none'}`, '↓', `Decision:${decision.mode}`, '↓', `Reasons:${decision.reasons.map((reason) => reason.message).join(' | ')}`].join('\n');
  }
}
