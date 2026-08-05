import type { ExecutionMetricsStore } from './ExecutionMetricsStore';
import type { CostSummary, ExecutionMetric } from './ExecutionMetricsTypes';

/** Aggregates cost by execution, capability, provider, and recent trend. */
export class CostAnalyzer {
  constructor(private readonly store: ExecutionMetricsStore) {}
  byProvider(provider: string): CostSummary { return summarize(this.store.getByProvider(provider)); }
  byProviderCapability(provider: string, capability: string): CostSummary { return summarize(this.store.getByProvider(provider).filter((metric) => metric.capability === capability)); }
  byCapability(capability: string): CostSummary { return summarize(this.store.getByCapability(capability)); }
  perExecution(executionId: string): number { return this.store.getAll().filter((metric) => metric.executionId === executionId).reduce((sum, metric) => sum + metric.cost, 0); }
}
function summarize(metrics: readonly ExecutionMetric[]): CostSummary {
  const totalCost = metrics.reduce((sum, metric) => sum + metric.cost, 0); const middle = Math.floor(metrics.length / 2);
  const before = average(metrics.slice(0, middle).map((metric) => metric.cost)); const after = average(metrics.slice(middle).map((metric) => metric.cost));
  return Object.freeze({ executions: metrics.length, totalCost, averageCost: metrics.length === 0 ? 0 : totalCost / metrics.length, trend: metrics.length < 2 ? 'STABLE' : after > before * 1.05 ? 'UP' : before > after * 1.05 ? 'DOWN' : 'STABLE' });
}
function average(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
