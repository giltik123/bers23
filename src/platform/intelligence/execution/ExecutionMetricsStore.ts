import type { ExecutionMetric, ExecutionMetricStatus, MetricTimeRange } from './ExecutionMetricsTypes';

/** Bounded immutable in-memory metric history with indexed query helpers. */
export class ExecutionMetricsStore {
  private readonly records: ExecutionMetric[] = [];
  constructor(private readonly limit = 10000) { if (!Number.isInteger(limit) || limit < 1) throw new Error('Metrics store limit must be a positive integer.'); }
  record(metric: ExecutionMetric): ExecutionMetric { const snapshot = freezeMetric(metric); this.records.push(snapshot); while (this.records.length > this.limit) this.records.shift(); return snapshot; }
  getByProvider(provider: string, range?: MetricTimeRange): readonly ExecutionMetric[] { return this.query((metric) => metric.provider === provider, range); }
  getByCapability(capability: string, range?: MetricTimeRange): readonly ExecutionMetric[] { return this.query((metric) => metric.capability === capability, range); }
  getByStatus(status: ExecutionMetricStatus, range?: MetricTimeRange): readonly ExecutionMetric[] { return this.query((metric) => metric.status === status, range); }
  getFailures(range?: MetricTimeRange): readonly ExecutionMetric[] { return this.query((metric) => metric.status === 'FAILED' || metric.status === 'TIMEOUT', range); }
  getRecent(count: number, range?: MetricTimeRange): readonly ExecutionMetric[] { if (count < 0) throw new Error('Recent metric count cannot be negative.'); return Object.freeze(this.query(() => true, range).slice(-count)); }
  getAll(range?: MetricTimeRange): readonly ExecutionMetric[] { return this.query(() => true, range); }
  clear(): void { this.records.length = 0; }
  private query(predicate: (metric: ExecutionMetric) => boolean, range?: MetricTimeRange): readonly ExecutionMetric[] {
    const from = range?.from ? Date.parse(range.from) : Number.NEGATIVE_INFINITY; const to = range?.to ? Date.parse(range.to) : Number.POSITIVE_INFINITY;
    return Object.freeze(this.records.filter((metric) => { const timestamp = Date.parse(metric.timestamp); return timestamp >= from && timestamp <= to && predicate(metric); }));
  }
}
function freezeMetric(metric: ExecutionMetric): ExecutionMetric { return Object.freeze({ ...metric, metadata: Object.freeze({ ...metric.metadata }) }); }
