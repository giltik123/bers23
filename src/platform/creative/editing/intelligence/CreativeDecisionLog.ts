import type { CreativeDecisionKind, CreativeDecisionLogEntry, EditOperation } from './types';

export class CreativeDecisionLog {
  private readonly entries: CreativeDecisionLogEntry[] = [];

  record(operation: EditOperation, decision: CreativeDecisionKind, confidence: number, createdAt = Date.now()): CreativeDecisionLogEntry {
    const entry = Object.freeze({ operation: operation.type, decision, reason: operation.reason, estimatedCost: operation.credits, confidence, createdAt });
    this.entries.push(entry);
    return entry;
  }

  all(): CreativeDecisionLogEntry[] {
    return [...this.entries];
  }

  byDecision(decision: CreativeDecisionKind): CreativeDecisionLogEntry[] {
    return this.entries.filter((entry) => entry.decision === decision);
  }

  aiRequired(): CreativeDecisionLogEntry[] {
    return this.byDecision('AI_REQUIRED');
  }
}
