import type { CreativeDecision, DecisionHistoryEvent } from './types';

export class DecisionHistory {
  private readonly events: DecisionHistoryEvent[] = [];

  record(decision: CreativeDecision, scope: { userId: string; tenantId: string; projectId: string }): readonly DecisionHistoryEvent[] {
    const base = { decisionId: decision.id, userId: scope.userId, tenantId: scope.tenantId, projectId: scope.projectId, createdAt: decision.createdAt };
    const selected = decision.mode === 'LOCAL' ? 'decision.local_selected' : decision.mode === 'AI' ? 'decision.ai_selected' : decision.mode === 'HYBRID' ? 'decision.hybrid_selected' : 'decision.confirmation_required';
    this.events.push(Object.freeze({ ...base, type: 'decision.created', message: 'Decision created.' }));
    this.events.push(Object.freeze({ ...base, type: selected, message: `${decision.mode} selected.` }));
    if (decision.savedCredits > 0) this.events.push(Object.freeze({ ...base, type: 'decision.optimized', message: `Saved ${decision.savedCredits} credits.` }));
    if (decision.requiresConfirmation) this.events.push(Object.freeze({ ...base, type: 'decision.confirmation_required', message: 'User confirmation is required.' }));
    return this.all();
  }

  all(): readonly DecisionHistoryEvent[] { return Object.freeze([...this.events]); }
  forDecision(decisionId: string): readonly DecisionHistoryEvent[] { return Object.freeze(this.events.filter((event) => event.decisionId === decisionId)); }
}
