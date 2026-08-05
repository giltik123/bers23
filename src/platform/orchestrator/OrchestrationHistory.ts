import type { ExecutionPlan } from '../execution';
import type { ManagedExecutionResult, RuntimeInspection } from '../runtime';
import type { RoutingDecision } from '../router';
import type { OrchestrationSession } from './OrchestrationSession';
export interface OrchestrationHistoryRecord { readonly request: string; readonly session: OrchestrationSession; readonly route?: RoutingDecision; readonly plan?: ExecutionPlan; readonly runtime?: ManagedExecutionResult; readonly duration: number; readonly status: OrchestrationSession['state']; readonly provider: readonly string[]; readonly cost: number; readonly result?: unknown; readonly createdAt: string; }
export interface OrchestrationStatistics { readonly total: number; readonly successful: number; readonly failed: number; readonly cancelled: number; readonly averageDuration: number; readonly totalCost: number; }

/** Bounded immutable orchestration history used for audit, analytics feedback, and debugging. */
export class OrchestrationHistory {
  private readonly records: OrchestrationHistoryRecord[] = [];
  constructor(private readonly limit = 1000) {}
  record(input: Omit<OrchestrationHistoryRecord, 'createdAt'>): OrchestrationHistoryRecord { const record = deepFreeze({ ...input, createdAt: new Date().toISOString() }); this.records.push(record); while (this.records.length > this.limit) this.records.shift(); return record; }
  recent(count = 20): readonly OrchestrationHistoryRecord[] { return Object.freeze(this.records.slice(-count)); }
  successful(): readonly OrchestrationHistoryRecord[] { return this.byStatus('COMPLETED'); }
  failed(): readonly OrchestrationHistoryRecord[] { return Object.freeze(this.records.filter((record) => record.status === 'FAILED' || record.status === 'CANCELLED')); }
  statistics(): OrchestrationStatistics { const total = this.records.length; const successful = this.records.filter((record) => record.status === 'COMPLETED').length; const failed = this.records.filter((record) => record.status === 'FAILED').length; const cancelled = this.records.filter((record) => record.status === 'CANCELLED').length; const duration = this.records.reduce((sum, record) => sum + record.duration, 0); const cost = this.records.reduce((sum, record) => sum + record.cost, 0); return Object.freeze({ total, successful, failed, cancelled, averageDuration: total ? duration / total : 0, totalCost: cost }); }
  clear(): void { this.records.length = 0; }
  private byStatus(status: OrchestrationSession['state']): readonly OrchestrationHistoryRecord[] { return Object.freeze(this.records.filter((record) => record.status === status)); }
}
export interface OrchestrationRuntimeInspection { readonly currentSessions: number; readonly activeRuntime?: RuntimeInspection; readonly memoryUsage: number; readonly executionGraph?: readonly string[]; readonly workerStatus: unknown; readonly providerStatus: unknown; readonly routingSummary: unknown; readonly analyticsSummary: unknown; }
function deepFreeze<Value>(value: Value, seen = new WeakSet<object>()): Value { if (value && typeof value === 'object' && !seen.has(value)) { seen.add(value); Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen); } return value; }
