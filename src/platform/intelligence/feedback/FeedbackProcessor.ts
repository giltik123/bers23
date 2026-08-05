import type { ExecutionAnalytics } from '../execution/ExecutionAnalytics';
import type { ExecutionMetric, ExecutionMetricStatus } from '../execution/ExecutionMetricsTypes';

export interface ExecutionFeedback {
  readonly executionId: string; readonly routeId: string; readonly capability: string; readonly provider: string; readonly worker: string;
  readonly duration: number; readonly cost: number; readonly status: ExecutionMetricStatus; readonly retryCount?: number;
  readonly timestamp?: string; readonly metadata?: Readonly<Record<string, unknown>>;
}
/** Normalizes runtime feedback into immutable analytics observations. */
export class FeedbackProcessor {
  constructor(private readonly analytics: ExecutionAnalytics) {}
  process(feedback: ExecutionFeedback): ExecutionMetric { return this.analytics.record({ ...feedback, retryCount: feedback.retryCount ?? 0, timestamp: feedback.timestamp ?? new Date().toISOString(), metadata: feedback.metadata ?? {} }); }
}
