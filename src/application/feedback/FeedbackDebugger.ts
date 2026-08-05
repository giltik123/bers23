import { immutable, type FeedbackDebugSnapshot, type FeedbackRecord, type MemoryUpdateProposal } from './FeedbackModel';

export class FeedbackDebugger {
  snapshot(record: FeedbackRecord, memoryProposals: readonly MemoryUpdateProposal[]): FeedbackDebugSnapshot {
    return immutable({
      userAction: record.comment || record.type,
      feedback: record,
      signals: [...record.signals],
      recommendation: this.#recommend(record, memoryProposals),
      memoryProposals: [...memoryProposals],
    });
  }

  #recommend(record: FeedbackRecord, memoryProposals: readonly MemoryUpdateProposal[]): string {
    if (record.type === 'SUCCESS') {
      return 'Prefer similar workflow settings in future recommendations.';
    }

    if (memoryProposals.length > 0) {
      return 'Review generated memory proposals before updating memory or intelligence systems.';
    }

    return 'Collect more feedback before changing recommendations.';
  }
}
