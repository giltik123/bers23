import type { ProviderExecutionContext } from '../providers/runtime/ProviderExecutionContext';
import type { ProviderExecutionResult } from '../providers/runtime/ProviderExecutionResult';

export type WorkerHealthStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE';
export type WorkerLifecycleState = 'REGISTERED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED';
export interface WorkerHealthSnapshot { readonly workerId: string; readonly status: WorkerHealthStatus; readonly latency: number; readonly errorRate: number; readonly timeoutRate: number; readonly quotaRemaining?: number; readonly checkedAt: string; readonly reason?: string; }
export interface WorkerMetrics { readonly executions: number; readonly successes: number; readonly failures: number; readonly successRate: number; readonly failureRate: number; readonly averageLatency: number; readonly averageCost: number; readonly tokens: number; readonly images: number; readonly retryCount: number; }
export interface WorkerDefinition {
  readonly id: string; readonly capabilities: readonly string[]; readonly maxConcurrency: number;
  readonly execute: (request: ProviderExecutionContext) => Promise<ProviderExecutionResult>;
  readonly healthCheck?: () => Promise<Partial<Omit<WorkerHealthSnapshot, 'workerId' | 'checkedAt'>>>;
  readonly start?: () => void | Promise<void>; readonly stop?: () => void | Promise<void>;
}
