export interface WorkflowExecutionRecord {
  readonly workflowId: string;
  readonly status: 'completed' | 'failed' | 'cancelled' | 'rejected' | string;
  readonly durationMs?: number;
  readonly cost?: { readonly credits?: number; readonly providerCostUsd?: number };
  readonly providerFailures?: readonly string[];
  readonly qualitySignals?: Record<string, number>;
}

export interface ProviderMetricsRecord { readonly workflowId?: string; readonly provider: string; readonly failures?: number; readonly latencyMs?: number; }

export interface WorkflowAnalyticsSnapshot {
  readonly workflowId: string;
  readonly executions: number;
  readonly successRate: number;
  readonly failureRate: number;
  readonly averageDuration: number;
  readonly averageCost: number;
  readonly providerFailures: Record<string, number>;
  readonly qualitySignals: Record<string, number>;
}

const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export class WorkflowAnalytics {
  summarize(workflowId: string, executions: readonly WorkflowExecutionRecord[] = [], providerMetrics: readonly ProviderMetricsRecord[] = []): WorkflowAnalyticsSnapshot {
    const records = executions.filter((record) => record.workflowId === workflowId);
    const success = records.filter((record) => record.status === 'completed').length;
    const failures = records.filter((record) => record.status === 'failed').length;
    const providerFailures = this.providerFailures(records, providerMetrics.filter((metric) => !metric.workflowId || metric.workflowId === workflowId));
    return Object.freeze({
      workflowId,
      executions: records.length,
      successRate: records.length ? success / records.length : 0,
      failureRate: records.length ? failures / records.length : 0,
      averageDuration: Math.round(average(records.map((record) => record.durationMs || 0))),
      averageCost: average(records.map((record) => record.cost?.credits || record.cost?.providerCostUsd || 0)),
      providerFailures: Object.freeze(providerFailures),
      qualitySignals: Object.freeze(this.qualitySignals(records)),
    });
  }

  summarizeAll(workflowIds: readonly string[], executions: readonly WorkflowExecutionRecord[] = [], providerMetrics: readonly ProviderMetricsRecord[] = []): WorkflowAnalyticsSnapshot[] {
    return workflowIds.map((workflowId) => this.summarize(workflowId, executions, providerMetrics));
  }

  private providerFailures(records: readonly WorkflowExecutionRecord[], providerMetrics: readonly ProviderMetricsRecord[]): Record<string, number> {
    const failures: Record<string, number> = {};
    for (const record of records) for (const provider of record.providerFailures || []) failures[provider] = (failures[provider] || 0) + 1;
    for (const metric of providerMetrics) if (metric.failures) failures[metric.provider] = (failures[metric.provider] || 0) + metric.failures;
    return failures;
  }

  private qualitySignals(records: readonly WorkflowExecutionRecord[]): Record<string, number> {
    const buckets: Record<string, number[]> = {};
    for (const record of records) for (const [key, value] of Object.entries(record.qualitySignals || {})) buckets[key] = [...(buckets[key] || []), value];
    return Object.fromEntries(Object.entries(buckets).map(([key, values]) => [key, average(values)]));
  }
}
