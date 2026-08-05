import type { ExecutionMetricsStore } from './ExecutionMetricsStore';
import type { ExecutionMetric, FailureInsight } from './ExecutionMetricsTypes';

/** Finds unstable providers and problematic capabilities from observed failures. */
export class FailureAnalyzer {
  constructor(private readonly store: ExecutionMetricsStore) {}
  analyzeProvider(provider: string): FailureInsight { return insight(this.store.getByProvider(provider), { provider }); }
  analyzeCapability(capability: string): FailureInsight { return insight(this.store.getByCapability(capability), { capability }); }
  unstableProviders(minimumExecutions = 5): readonly FailureInsight[] {
    const providers = [...new Set(this.store.getAll().map((metric) => metric.provider))];
    return Object.freeze(providers.filter((provider) => this.store.getByProvider(provider).length >= minimumExecutions).map((provider) => this.analyzeProvider(provider)).filter((value) => value.risk !== 'LOW'));
  }
}
function insight(metrics: readonly ExecutionMetric[], identity: { readonly provider?: string; readonly capability?: string }): FailureInsight {
  const total = metrics.length; const failures = metrics.filter((metric) => metric.status === 'FAILED' || metric.status === 'TIMEOUT').length; const timeouts = metrics.filter((metric) => metric.status === 'TIMEOUT').length;
  const failureRate = total === 0 ? 0 : failures / total; const timeoutRate = total === 0 ? 0 : timeouts / total; const risk = failureRate >= 0.25 || timeoutRate >= 0.15 ? 'HIGH' : failureRate >= 0.1 || timeoutRate >= 0.05 ? 'MEDIUM' : 'LOW';
  return Object.freeze({ ...identity, risk, failureRate, timeoutRate, reason: risk === 'HIGH' ? 'Provider instability detected from repeated failures or timeouts.' : risk === 'MEDIUM' ? 'Elevated failure pattern detected.' : 'No significant failure pattern detected.' });
}
