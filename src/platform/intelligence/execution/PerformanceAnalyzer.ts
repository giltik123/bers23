import type { ExecutionMetricsStore } from './ExecutionMetricsStore';
import type { ProviderPerformance } from './ExecutionMetricsTypes';

/** Calculates reliability, speed, timeout, and retry performance. */
export class PerformanceAnalyzer {
  constructor(private readonly store: ExecutionMetricsStore) {}
  analyzeProvider(provider: string): ProviderPerformance {
    return this.analyze(provider);
  }
  analyze(provider: string, capability?: string): ProviderPerformance {
    const metrics = this.store.getByProvider(provider).filter((metric) => !capability || metric.capability === capability); const total = metrics.length;
    return Object.freeze({ provider, executions: total, averageLatency: average(metrics.map((metric) => metric.duration)), successRate: ratio(metrics.filter((metric) => metric.status === 'SUCCESS').length, total), failureRate: ratio(metrics.filter((metric) => metric.status === 'FAILED').length, total), timeoutRate: ratio(metrics.filter((metric) => metric.status === 'TIMEOUT').length, total), averageRetries: average(metrics.map((metric) => metric.retryCount)) });
  }
  analyzeAll(): readonly ProviderPerformance[] { return Object.freeze([...new Set(this.store.getAll().map((metric) => metric.provider))].map((provider) => this.analyzeProvider(provider))); }
}
function ratio(value: number, total: number): number { return total === 0 ? 0 : value / total; }
function average(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
