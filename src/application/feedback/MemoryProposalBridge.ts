import {
  createMemoryProposalId,
  immutable,
  type FeedbackAnalysis,
  type FeedbackRecord,
  type FeedbackSignal,
  type MemoryProposalCategory,
  type MemoryUpdateProposal,
} from './FeedbackModel';

export class MemoryProposalBridge {
  propose(records: readonly FeedbackRecord[], analysis: FeedbackAnalysis): readonly MemoryUpdateProposal[] {
    const proposals: MemoryUpdateProposal[] = [];

    for (const signal of analysis.repeatedCorrections) {
      proposals.push(this.#proposal(
        signal.key.includes('style') ? 'STYLE_MEMORY' : 'PREFERENCE_MEMORY',
        signal,
        signal.reason,
        records.map((record) => record.id),
      ));
    }

    if (analysis.qualityIssues.length > 0) {
      proposals.push(immutable({
        id: createMemoryProposalId(),
        category: 'QUALITY_MEMORY' as const,
        key: `workflow_quality:${analysis.workflowId}`,
        value: analysis.qualityIssues,
        reason: 'Quality issues should inform future recommendations without direct persistence writes.',
        confidence: Math.min(0.95, 0.5 + analysis.qualityIssues.length * 0.1),
        evidence: records.map((record) => record.id),
      }));
    }

    return immutable(proposals);
  }

  #proposal(category: MemoryProposalCategory, signal: FeedbackSignal, reason: string, evidence: readonly string[]): MemoryUpdateProposal {
    return immutable({
      id: createMemoryProposalId(),
      category,
      key: signal.key,
      value: signal.value,
      reason,
      confidence: Math.min(0.95, 0.7 + signal.confidenceDelta),
      evidence: [...evidence],
    });
  }
}
