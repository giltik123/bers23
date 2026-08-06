import type { PipelineDecisionKind, PipelineDecisionLogEntry } from './types';

export class PipelineDecisionLog {
  private readonly entries: PipelineDecisionLogEntry[] = [];

  record(decision: PipelineDecisionKind, reason: string, savedCredits = 0, createdAt = Date.now()): PipelineDecisionLogEntry {
    const entry = Object.freeze({ decision, reason, savedCredits, createdAt });
    this.entries.push(entry);
    return entry;
  }

  all(): PipelineDecisionLogEntry[] { return [...this.entries]; }
}
