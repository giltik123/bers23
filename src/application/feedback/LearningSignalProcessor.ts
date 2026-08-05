import {
  createFeedbackSignalId,
  immutable,
  type FeedbackRecord,
  type FeedbackRequest,
  type FeedbackSignal,
} from './FeedbackModel';

export class LearningSignalProcessor {
  fromRequest(request: FeedbackRequest): readonly FeedbackSignal[] {
    const signals: FeedbackSignal[] = [];

    if (request.rating !== undefined && request.rating <= 2) {
      signals.push(this.#signal('quality', 'low_rating', request.rating, -0.2, 'Low user rating indicates dissatisfaction.'));
    }

    if (request.type === 'SUCCESS') {
      signals.push(this.#signal('quality', 'workflow_success', request.context.workflowId, 0.1, 'User marked execution as successful.'));
    }

    if (request.type === 'USER_REJECTED') {
      signals.push(this.#signal('rejection', 'rejection_reason', request.comment || 'unspecified', -0.15, 'User rejected the result.'));
    }

    for (const [key, value] of Object.entries(request.corrections || {})) {
      const signalType = key.includes('style') ? 'preference' : 'correction';
      signals.push(this.#signal(signalType, key, value, 0.12, `User corrected ${key}.`));
    }

    if (request.type === 'WORKFLOW_IMPROVEMENT') {
      signals.push(this.#signal('workflow', 'workflow_improvement', request.context.workflowId, 0.08, 'User suggested workflow improvement.'));
    }

    return immutable(signals);
  }

  aggregate(records: readonly FeedbackRecord[]): readonly FeedbackSignal[] {
    const grouped = new Map<string, FeedbackRecord[]>();

    for (const record of records) {
      for (const signal of record.signals) {
        const key = `${signal.key}:${String(signal.value)}`;
        grouped.set(key, [...(grouped.get(key) || []), record]);
      }
    }

    const repeatedSignals: FeedbackSignal[] = [];

    for (const [compoundKey, group] of grouped.entries()) {
      if (group.length < 3) {
        continue;
      }

      const [key, value] = compoundKey.split(':');
      repeatedSignals.push(this.#signal(
        key.includes('background') ? 'preference' : 'correction',
        key.startsWith('background') ? 'preferred_background' : key,
        value,
        0.12,
        `Repeated correction detected from ${group.length} feedback records.`,
      ));
    }

    return immutable(repeatedSignals);
  }

  #signal(type: FeedbackSignal['type'], key: string, value: unknown, confidenceDelta: number, reason: string): FeedbackSignal {
    return immutable({ id: createFeedbackSignalId(), type, key, value, confidenceDelta, reason });
  }
}
