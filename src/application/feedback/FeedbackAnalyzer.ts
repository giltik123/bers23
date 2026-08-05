import { immutable, type FeedbackAnalysis, type FeedbackRecord, type FeedbackSignal } from './FeedbackModel';
import { LearningSignalProcessor } from './LearningSignalProcessor';

export class FeedbackAnalyzer {
  readonly #signals = new LearningSignalProcessor();

  analyze(records: readonly FeedbackRecord[], workflowId?: string): FeedbackAnalysis {
    const scoped = workflowId ? records.filter((record) => record.workflowId === workflowId) : records;
    const total = scoped.length;
    const successes = scoped.filter((record) => record.type === 'SUCCESS').length;
    const failures = scoped.filter((record) => record.type === 'FAILURE').length;
    const qualityIssues = scoped
      .filter((record) => record.type === 'QUALITY_ISSUE' || (record.rating !== null && record.rating <= 2))
      .map((record) => record.comment)
      .filter(Boolean);
    const rejectionReasons = scoped
      .filter((record) => record.type === 'USER_REJECTED')
      .map((record) => record.comment || 'unspecified');
    const repeatedCorrections = this.#signals.aggregate(scoped).filter((signal) => signal.type === 'preference' || signal.type === 'correction');
    const dissatisfactionPatterns = this.#dissatisfactionPatterns(scoped, repeatedCorrections);

    return immutable({
      workflowId: workflowId || 'all',
      total,
      successes,
      failures,
      rejectionReasons,
      repeatedCorrections,
      dissatisfactionPatterns,
      qualityIssues,
      successRate: total === 0 ? 0 : successes / total,
    });
  }

  #dissatisfactionPatterns(records: readonly FeedbackRecord[], repeatedCorrections: readonly FeedbackSignal[]): readonly string[] {
    const patterns: string[] = [];
    const lowRatings = records.filter((record) => record.rating !== null && record.rating <= 2).length;

    if (lowRatings >= 2) {
      patterns.push('Repeated low ratings indicate user dissatisfaction.');
    }

    if (repeatedCorrections.length > 0) {
      patterns.push('Repeated corrections indicate unmet user preferences.');
    }

    return immutable(patterns);
  }
}
