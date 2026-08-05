import type { ProviderExecutionResult } from '../providers/runtime/ProviderExecutionResult';
import { ProviderTimeoutError } from '../providers/runtime/ProviderTimeout';
import type { WorkerHealthSnapshot, WorkerHealthStatus, WorkerMetrics } from './WorkerTypes';

interface MutableMetrics { executions: number; successes: number; failures: number; totalLatency: number; totalCost: number; tokens: number; images: number; retryCount: number; timeouts: number; }
const empty = (): MutableMetrics => ({ executions: 0, successes: 0, failures: 0, totalLatency: 0, totalCost: 0, tokens: 0, images: 0, retryCount: 0, timeouts: 0 });

/** Tracks health signals and execution metrics used for fallback selection. */
export class WorkerHealthMonitor {
  private readonly health = new Map<string, WorkerHealthSnapshot>(); private readonly metrics = new Map<string, MutableMetrics>();
  register(workerId: string): void { this.metrics.set(workerId, empty()); this.update(workerId, { status: 'ONLINE', latency: 0, errorRate: 0, timeoutRate: 0 }); }
  update(workerId: string, signal: Partial<Omit<WorkerHealthSnapshot, 'workerId' | 'checkedAt'>>): WorkerHealthSnapshot {
    const current = this.health.get(workerId); const status = signal.status ?? deriveStatus(signal.latency ?? current?.latency ?? 0, signal.errorRate ?? current?.errorRate ?? 0, signal.timeoutRate ?? current?.timeoutRate ?? 0, signal.quotaRemaining ?? current?.quotaRemaining);
    const snapshot = Object.freeze({ workerId, status, latency: signal.latency ?? current?.latency ?? 0, errorRate: signal.errorRate ?? current?.errorRate ?? 0, timeoutRate: signal.timeoutRate ?? current?.timeoutRate ?? 0, quotaRemaining: signal.quotaRemaining ?? current?.quotaRemaining, checkedAt: new Date().toISOString(), reason: signal.reason }); this.health.set(workerId, snapshot); return snapshot;
  }
  get(workerId: string): WorkerHealthSnapshot { return this.health.get(workerId) ?? this.update(workerId, { status: 'OFFLINE', reason: 'Worker is not monitored.' }); }
  setStatus(workerId: string, status: WorkerHealthStatus, reason?: string): WorkerHealthSnapshot { return this.update(workerId, { status, reason }); }
  recordSuccess(workerId: string, result: ProviderExecutionResult): void { const value = this.requireMetrics(workerId); value.executions += 1; value.successes += 1; value.totalLatency += result.duration; value.totalCost += result.cost; value.tokens += result.usage.tokens ?? 0; value.images += result.usage.images ?? 0; value.retryCount += result.retryCount; this.refresh(workerId, value); }
  recordFailure(workerId: string, error: unknown, latency: number): void { const value = this.requireMetrics(workerId); value.executions += 1; value.failures += 1; value.totalLatency += latency; if (error instanceof ProviderTimeoutError) value.timeouts += 1; this.refresh(workerId, value); }
  getMetrics(workerId: string): WorkerMetrics { const value = this.requireMetrics(workerId); return Object.freeze({ executions: value.executions, successes: value.successes, failures: value.failures, successRate: ratio(value.successes, value.executions), failureRate: ratio(value.failures, value.executions), averageLatency: ratio(value.totalLatency, value.executions), averageCost: ratio(value.totalCost, value.successes), tokens: value.tokens, images: value.images, retryCount: value.retryCount }); }
  private requireMetrics(id: string): MutableMetrics { const value = this.metrics.get(id) ?? empty(); this.metrics.set(id, value); return value; }
  private refresh(id: string, value: MutableMetrics): void { this.update(id, { latency: ratio(value.totalLatency, value.executions), errorRate: ratio(value.failures, value.executions), timeoutRate: ratio(value.timeouts, value.executions) }); }
}
function ratio(value: number, total: number): number { return total === 0 ? 0 : value / total; }
function deriveStatus(latency: number, errors: number, timeouts: number, quota?: number): WorkerHealthStatus { if (quota === 0 || errors >= 0.8 || timeouts >= 0.8) return 'OFFLINE'; if (latency > 5000 || errors >= 0.25 || timeouts >= 0.25 || (quota !== undefined && quota < 10)) return 'DEGRADED'; return 'ONLINE'; }
