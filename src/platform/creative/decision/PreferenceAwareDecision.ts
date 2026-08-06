import type { DecisionContext, DecisionReason } from './types';

export class PreferenceAwareDecision {
  apply(context: DecisionContext, operations: string[], reasons: DecisionReason[]): string[] {
    if (!context.preferences || context.preferences.confidence < 0.7) return operations;
    const next = [...operations];
    if (context.preferences.styles.includes('luxury') && !next.includes('luxury_catalog_direction')) next.push('luxury_catalog_direction');
    reasons.push({ id: 'preference-luxury', category: 'PREFERENCE', message: 'Luxury preference influenced the recommendation but did not automatically change user settings.' });
    return next;
  }
}
