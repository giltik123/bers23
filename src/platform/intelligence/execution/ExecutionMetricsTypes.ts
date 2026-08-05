export type ExecutionMetricStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
/** Provider-neutral observation produced after an execution attempt. */
export interface ExecutionMetric {
  readonly executionId: string; readonly routeId: string; readonly capability: string; readonly provider: string; readonly worker: string;
  readonly duration: number; readonly cost: number; readonly status: ExecutionMetricStatus; readonly retryCount: number;
  readonly timestamp: string; readonly metadata: Readonly<Record<string, unknown>>;
}
export interface MetricTimeRange { readonly from?: string; readonly to?: string; }
export interface ProviderPerformance { readonly provider: string; readonly executions: number; readonly averageLatency: number; readonly successRate: number; readonly failureRate: number; readonly timeoutRate: number; readonly averageRetries: number; }
export interface CostSummary { readonly executions: number; readonly totalCost: number; readonly averageCost: number; readonly trend: 'UP' | 'DOWN' | 'STABLE'; }
export type FailureRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export interface FailureInsight { readonly provider?: string; readonly capability?: string; readonly risk: FailureRisk; readonly failureRate: number; readonly timeoutRate: number; readonly reason: string; }
