import type { ImageArtifact } from '../vertical-slice';
import type { ArtifactLifecycle, ArtifactRecord, BudgetPolicy, CircuitState, CostPreflight, ErrorCategory, ProductionError, ProductionMetrics, ProductionReadinessLevel, ProductionScope, RateLimitPolicy, ReadinessDimensions, RecoveryAction, RetrySemantics, StateStore, ProductionExecutionState } from './types';

export const deepFreeze = <T>(value: T): Readonly<T> => { if (value && typeof value === 'object' && !Object.isFrozen(value) && !ArrayBuffer.isView(value)) { Object.freeze(value); for (const child of Object.values(value as object)) deepFreeze(child); } return value as Readonly<T>; };
export const immutable = <T>(value: T): Readonly<T> => deepFreeze(structuredClone(value));
export const scopeKey = (scope: ProductionScope) => { if (!scope?.tenantId || !scope.projectId || !scope.userId || !scope.deviceId) throw productionError('VALIDATION_ERROR', 'INVALID_SCOPE', false, 'Complete production scope is required'); return `${scope.tenantId}\0${scope.projectId}\0${scope.userId}\0${scope.deviceId}`; };
export const productionError = (category: ErrorCategory, code: string, retryable: boolean, message: string, details: Record<string, unknown> = {}): ProductionError => immutable({ category, code, retryable, message, details: sanitize(details) }) as ProductionError;
export function sanitize(value: unknown): unknown { if (Array.isArray(value)) return value.map(sanitize); if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !/(secret|token|key|authorization|cookie|credential|raw|bytes)/i.test(key)).map(([key, child]) => [key, sanitize(child)])); return value; }

export class MemoryProductionStateStore implements StateStore {
  #states = new Map<string, ProductionExecutionState>(); #keys = new Map<string, string>();
  async getByIdempotency(scope: ProductionScope, key: string) { const id = this.#keys.get(`${scopeKey(scope)}\0${key}`); return id ? this.get(id) : undefined; }
  async get(id: string) { const value = this.#states.get(id); return value ? immutable(value) as ProductionExecutionState : undefined; }
  async save(state: ProductionExecutionState) { scopeKey(state.scope); this.#states.set(state.executionId, immutable(state) as ProductionExecutionState); this.#keys.set(`${scopeKey(state.scope)}\0${state.idempotencyKey}`, state.executionId); }
}

export class CostProtection {
  preflight(estimated: number, maxRetries: number, maxFallbackCost: number, policy: BudgetPolicy): CostPreflight {
    const safeEstimate = Math.max(0, estimated), worstCaseCredits = safeEstimate * (maxRetries + 1) + Math.max(0, maxFallbackCost);
    const limits = [policy.remainingCredits, policy.operationCostCeiling, policy.dailyLimitRemaining, policy.projectLimitRemaining, policy.userLimitRemaining];
    const reasons = limits.map((limit, index) => worstCaseCredits > limit ? ['remaining budget', 'operation ceiling', 'daily limit', 'project limit', 'user limit'][index] : '').filter(Boolean);
    return immutable({ estimatedCredits: safeEstimate, worstCaseCredits, maxRetries, maxFallbackCost, decision: reasons.length ? policy.exceedAction : 'ALLOW', reasons }) as CostPreflight;
  }
}

export class SlidingWindowRateLimiter {
  #events = new Map<string, number[]>(); #active = new Map<string, number>();
  constructor(private readonly policy: RateLimitPolicy, private readonly now: () => number) {}
  acquire(key: string, kind: 'request' | 'ai' | 'local', concurrent = false) { const limit = kind === 'request' ? this.policy.requestsPerMinute : kind === 'ai' ? this.policy.aiCallsPerMinute : this.policy.localInferencePerMinute; const cutoff = this.now() - 60_000; const events = (this.#events.get(`${key}:${kind}`) ?? []).filter(at => at > cutoff); if (events.length >= limit) return false; if (concurrent && (this.#active.get(key) ?? 0) >= this.policy.concurrentExecutions) return false; events.push(this.now()); this.#events.set(`${key}:${kind}`, events); if (concurrent) this.#active.set(key, (this.#active.get(key) ?? 0) + 1); return true; }
  release(key: string) { this.#active.set(key, Math.max(0, (this.#active.get(key) ?? 0) - 1)); }
  bandwidth(key: string, bytes: number) { const bucket = `${key}:bytes`; const events = this.#events.get(bucket) ?? []; const used = events.reduce((sum, value) => sum + value, 0); if (used + bytes > this.policy.downloadBytesPerMinute) return false; events.push(bytes); this.#events.set(bucket, events); return true; }
}

export class ConcurrencyGate {
  #active = new Map<string, number>();
  async run<T>(resource: string, limit: number, task: () => Promise<T>): Promise<T> { if ((this.#active.get(resource) ?? 0) >= limit) throw productionError('RESOURCE_ERROR', 'CONCURRENCY_LIMIT', true, `Concurrency limit reached for ${resource}`); this.#active.set(resource, (this.#active.get(resource) ?? 0) + 1); try { return await task(); } finally { this.#active.set(resource, Math.max(0, (this.#active.get(resource) ?? 1) - 1)); } }
  active(resource: string) { return this.#active.get(resource) ?? 0; }
}
export async function withTimeout<T>(milliseconds: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> { const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([task(controller.signal), new Promise<T>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(productionError('TIMEOUT', 'OPERATION_TIMEOUT', true, 'Operation exceeded its structured timeout', { milliseconds })); }, milliseconds); })]); } finally { if (timer) clearTimeout(timer); } }

export class DependencyCircuitBreaker {
  #state: CircuitState = 'CLOSED'; #failures = 0; #openedAt = 0;
  constructor(private readonly threshold: number, private readonly resetAfterMs: number, private readonly now: () => number) {}
  allow() { if (this.#state === 'OPEN' && this.now() - this.#openedAt >= this.resetAfterMs) this.#state = 'HALF_OPEN'; return this.#state !== 'OPEN'; }
  success() { this.#state = 'CLOSED'; this.#failures = 0; }
  failure() { this.#failures += 1; if (this.#failures >= this.threshold) { this.#state = 'OPEN'; this.#openedAt = this.now(); } }
  snapshot() { return immutable({ state: this.#state, failures: this.#failures, openedAt: this.#openedAt }); }
}

const transitions: Readonly<Record<ArtifactLifecycle, readonly ArtifactLifecycle[]>> = { CREATED: ['VALIDATING', 'DELETED'], VALIDATING: ['READY', 'FAILED', 'QUARANTINED'], READY: ['IN_USE', 'EXPIRED', 'DELETED'], IN_USE: ['READY', 'SUPERSEDED', 'FAILED'], SUPERSEDED: ['EXPIRED', 'DELETED'], FAILED: ['QUARANTINED', 'DELETED'], QUARANTINED: ['DELETED'], EXPIRED: ['DELETED'], DELETED: [] };
export class ArtifactLifecycleManager {
  create(artifact: ImageArtifact, scope: ProductionScope, ownerId: string, now: number, retentionMs: number): ArtifactRecord { scopeKey(scope); return immutable({ artifact, state: 'CREATED', scope, checksum: artifact.hash, retentionUntil: now + retentionMs, expiresAt: now + retentionMs, ownerId }) as ArtifactRecord; }
  transition(record: ArtifactRecord, state: ArtifactLifecycle) { if (!transitions[record.state].includes(state)) throw productionError('ARTIFACT_ERROR', 'INVALID_ARTIFACT_TRANSITION', false, `Cannot transition ${record.state} to ${state}`); return immutable({ ...record, state }) as ArtifactRecord; }
  assertUsable(record: ArtifactRecord, scope: ProductionScope, now: number) { if (scopeKey(record.scope) !== scopeKey(scope)) throw productionError('SECURITY_ERROR', 'CROSS_SCOPE_ARTIFACT', false, 'Artifact belongs to another scope'); if (record.checksum !== record.artifact.hash) throw productionError('ARTIFACT_ERROR', 'CHECKSUM_MISMATCH', false, 'Artifact checksum mismatch'); if (now >= record.expiresAt || !['READY', 'IN_USE'].includes(record.state)) throw productionError('ARTIFACT_ERROR', 'ARTIFACT_NOT_READY', false, 'Artifact cannot be used'); return true; }
}

export class RecoveryPolicyEngine {
  decide(input: { category: ErrorCategory; semantics: RetrySemantics; fallbackAvailable: boolean; checkpoint: boolean; providerResultUnknown: boolean }): RecoveryAction { if (input.providerResultUnknown) return 'MARK_UNKNOWN'; if (input.checkpoint) return 'RESUME'; if (input.semantics === 'SAFE_TO_RETRY' && ['NETWORK_ERROR', 'TIMEOUT', 'LOCAL_RUNTIME_ERROR'].includes(input.category)) return 'RETRY'; if (input.fallbackAvailable) return 'FALLBACK'; if (input.category === 'POLICY_ERROR' || input.category === 'SECURITY_ERROR' || input.semantics === 'UNSAFE_TO_RETRY') return 'ABORT'; return 'REPLAN'; }
}

export class MetricsAggregator {
  calculate(states: readonly ProductionExecutionState[]): ProductionMetrics { const completed = states.filter(x => x.status === 'COMPLETED'), attempts = states.flatMap(x => x.attempts), local = attempts.filter(x => !x.providerExecutionId), cloud = attempts.filter(x => x.providerExecutionId), latencies = states.map(x => x.latencyMs).sort((a, b) => a - b), failures = attempts.filter(x => x.outcome === 'FAILED'); const percentile = (p: number) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)] : 0; return immutable({ cloudAvoidanceRate: local.length / Math.max(1, attempts.length), localSuccessRate: local.filter(x => x.outcome === 'SUCCEEDED').length / Math.max(1, local.length), cloudEscalationRate: cloud.length / Math.max(1, attempts.length), averageCreditsPerCompletedEdit: completed.reduce((s, x) => s + x.credits, 0) / Math.max(1, completed.length), averageAICost: states.reduce((s, x) => s + x.cost, 0) / Math.max(1, states.length), averageLocalTime: states.reduce((s, x) => s + (x.attempts.some(a => !a.providerExecutionId) ? x.latencyMs : 0), 0) / Math.max(1, local.length), p50Latency: percentile(.5), p95Latency: percentile(.95), p99Latency: percentile(.99), providerFailureRate: failures.filter(x => x.providerExecutionId).length / Math.max(1, cloud.length), retryRate: Math.max(0, attempts.length - states.length) / Math.max(1, attempts.length), recoveryRate: states.filter(x => x.recovery.length).length / Math.max(1, states.length), unknownResultRate: states.filter(x => x.status === 'UNKNOWN').length / Math.max(1, states.length), qualityAcceptanceRate: completed.length / Math.max(1, states.filter(x => ['COMPLETED', 'FAILED'].includes(x.status)).length) }) as ProductionMetrics; }
}

export class ProductionReadinessScore {
  calculate(dimensions: ReadinessDimensions) { const values = Object.values(dimensions).map(value => Math.max(0, Math.min(1, value))); const score = values.reduce((sum, value) => sum + value, 0) / values.length; const blocking = dimensions.security < .8 || dimensions.privacy < .8 || dimensions.artifactIntegrity < .8 || dimensions.costSafety < .8; const level: ProductionReadinessLevel = blocking ? 'BLOCKED' : score >= .9 ? 'PRODUCTION_READY' : score >= .7 ? 'BETA' : score >= .45 ? 'EXPERIMENTAL' : 'BLOCKED'; return immutable({ score, level, dimensions }); }
}

export class ProductionLoadContract {
  scenarios() { return immutable([10, 50, 100].map(concurrent => ({ concurrent, externalAI: false, deterministic: true, batches: Math.ceil(concurrent / 10) }))); }
  plan(concurrent: 10 | 50 | 100, maximumActive: number) { if (maximumActive < 1) throw productionError('VALIDATION_ERROR', 'INVALID_LOAD_LIMIT', false, 'maximumActive must be positive'); return immutable({ concurrent, maximumActive, waves: Math.ceil(concurrent / maximumActive), externalAI: false }); }
}
