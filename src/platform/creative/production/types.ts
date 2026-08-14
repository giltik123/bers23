import type { PrivacyMode } from '../local-ai';
import type { ImageArtifact, VerticalSliceResult } from '../vertical-slice';

export type ProductionStatus = 'CREATED' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'RECOVERING' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'UNKNOWN';
export type RecoveryAction = 'RETRY' | 'FALLBACK' | 'REPLAN' | 'RESUME' | 'ESCALATE' | 'ABORT' | 'MARK_UNKNOWN';
export type ErrorCategory = 'VALIDATION_ERROR' | 'POLICY_ERROR' | 'RESOURCE_ERROR' | 'LOCAL_RUNTIME_ERROR' | 'PROVIDER_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'ARTIFACT_ERROR' | 'RECOVERY_ERROR' | 'UNKNOWN_EXECUTION' | 'SECURITY_ERROR' | 'BUDGET_ERROR';
export type RetrySemantics = 'SAFE_TO_RETRY' | 'UNSAFE_TO_RETRY' | 'REQUIRES_DEDUPLICATION';
export type ArtifactLifecycle = 'CREATED' | 'VALIDATING' | 'READY' | 'IN_USE' | 'SUPERSEDED' | 'FAILED' | 'QUARANTINED' | 'EXPIRED' | 'DELETED';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type SecurityEventType = 'SECRET_ACCESS_ATTEMPT' | 'INVALID_MODEL' | 'INVALID_SIGNATURE' | 'CROSS_SCOPE_ARTIFACT' | 'POLICY_BYPASS_ATTEMPT' | 'UNTRUSTED_EXECUTOR' | 'OUTBOUND_DATA_BLOCKED';
export type ProductionEventType = 'ExecutionStarted' | 'NodeStarted' | 'NodeCompleted' | 'NodeFailed' | 'ProviderSelected' | 'ProviderCalled' | 'LocalModelLoaded' | 'LocalInferenceCompleted' | 'FallbackTriggered' | 'EscalationTriggered' | 'VerificationPassed' | 'VerificationFailed' | 'ExecutionRecovered' | 'ExecutionCompleted' | 'ExecutionAborted';
export type ProductionReadinessLevel = 'BLOCKED' | 'EXPERIMENTAL' | 'BETA' | 'PRODUCTION_READY';

export interface ProductionScope { readonly tenantId: string; readonly projectId: string; readonly userId: string; readonly deviceId: string }
export interface TraceCorrelation { readonly requestId: string; readonly sessionId: string; readonly executionId: string; readonly nodeId?: string; readonly providerExecutionId?: string; readonly artifactId?: string }
export interface ProductionError { readonly category: ErrorCategory; readonly code: string; readonly retryable: boolean; readonly message: string; readonly details: Readonly<Record<string, unknown>> }
export interface AttemptState { readonly attemptId: string; readonly nodeId: string; readonly startedAt: number; readonly completedAt?: number; readonly outcome: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; readonly providerExecutionId?: string }
export interface ArtifactRecord { readonly artifact: ImageArtifact; readonly state: ArtifactLifecycle; readonly scope: ProductionScope; readonly checksum: string; readonly retentionUntil: number; readonly expiresAt: number; readonly ownerId: string }
export interface RecoveryRecord { readonly action: RecoveryAction; readonly nodeId?: string; readonly reason: ErrorCategory; readonly timestamp: number; readonly outcome: 'PLANNED' | 'COMPLETED' | 'FAILED' }
export interface ProductionExecutionState {
  readonly executionId: string; readonly requestId: string; readonly sessionId: string; readonly idempotencyKey: string; readonly scope: ProductionScope;
  readonly status: ProductionStatus; readonly currentNode?: string; readonly completedNodes: readonly string[]; readonly failedNodes: readonly string[];
  readonly attempts: readonly AttemptState[]; readonly artifacts: readonly ArtifactRecord[]; readonly cost: number; readonly credits: number; readonly latencyMs: number;
  readonly recovery: readonly RecoveryRecord[]; readonly checkpoint: number; readonly createdAt: number; readonly updatedAt: number; readonly error?: ProductionError;
}
export interface CostPreflight { readonly estimatedCredits: number; readonly worstCaseCredits: number; readonly maxRetries: number; readonly maxFallbackCost: number; readonly decision: 'ALLOW' | 'BLOCK' | 'ASK_USER'; readonly reasons: readonly string[] }
export interface BudgetPolicy { readonly remainingCredits: number; readonly operationCostCeiling: number; readonly dailyLimitRemaining: number; readonly projectLimitRemaining: number; readonly userLimitRemaining: number; readonly exceedAction: 'BLOCK' | 'ASK_USER' }
export interface TimeoutPolicy { readonly localInferenceMs: number; readonly networkMs: number; readonly providerJobMs: number; readonly artifactDownloadMs: number; readonly verificationMs: number; readonly recoveryMs: number }
export interface RateLimitPolicy { readonly requestsPerMinute: number; readonly concurrentExecutions: number; readonly aiCallsPerMinute: number; readonly localInferencePerMinute: number; readonly downloadBytesPerMinute: number }
export interface ConcurrencyPolicy { readonly localInference: number; readonly cloudCalls: number; readonly highMemoryOperations: number; readonly downloads: number; readonly largeArtifacts: number }
export interface PrivacyAudit { readonly didImageLeaveDevice: boolean; readonly cloudProvider?: string; readonly cloudOperation?: string; readonly privacyPolicy: PrivacyMode; readonly userConsent: boolean; readonly dataMinimizationMode: boolean }
export interface ProductionTelemetryEvent { readonly id: string; readonly type: ProductionEventType; readonly timestamp: number; readonly correlation: TraceCorrelation; readonly data: Readonly<Record<string, unknown>> }
export interface SecurityEvent { readonly id: string; readonly type: SecurityEventType; readonly timestamp: number; readonly correlation: TraceCorrelation; readonly data: Readonly<Record<string, unknown>> }
export interface ProductionRequest {
  readonly idempotencyKey: string; readonly requestId: string; readonly sessionId: string; readonly scope: ProductionScope; readonly operation: string; readonly prompt: string;
  readonly artifact: ImageArtifact; readonly privacyMode: PrivacyMode; readonly userConsent: boolean; readonly billable: boolean; readonly estimatedCredits: number;
  readonly maxRetries?: number; readonly maxFallbackCost?: number; readonly provider?: string; readonly retrySemantics?: RetrySemantics; readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface ExecutionOutcome { readonly result: VerticalSliceResult; readonly providerExecutionId?: string; readonly provider?: string; readonly local: boolean; readonly qualityAccepted: boolean }
export interface ProductionExecutor { execute(request: ProductionRequest, context: Readonly<{ executionId: string; attemptId: string; signal: AbortSignal }>): Promise<ExecutionOutcome> }
export interface StateStore { getByIdempotency(scope: ProductionScope, key: string): Promise<ProductionExecutionState | undefined>; get(executionId: string): Promise<ProductionExecutionState | undefined>; save(state: ProductionExecutionState): Promise<void> }
export interface ProductionDependencies { readonly executor: ProductionExecutor; readonly store?: StateStore; readonly now?: () => number; readonly id?: () => string; readonly hash?: (bytes: Uint8Array) => Promise<string>; readonly timeout?: Partial<TimeoutPolicy>; readonly rateLimits?: Partial<RateLimitPolicy>; readonly concurrency?: Partial<ConcurrencyPolicy>; readonly budget: BudgetPolicy }
export interface ProductionMetrics { readonly cloudAvoidanceRate: number; readonly localSuccessRate: number; readonly cloudEscalationRate: number; readonly averageCreditsPerCompletedEdit: number; readonly averageAICost: number; readonly averageLocalTime: number; readonly p50Latency: number; readonly p95Latency: number; readonly p99Latency: number; readonly providerFailureRate: number; readonly retryRate: number; readonly recoveryRate: number; readonly unknownResultRate: number; readonly qualityAcceptanceRate: number }
export interface HealthReport { readonly status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'; readonly components: Readonly<Record<'provider' | 'localRuntime' | 'model' | 'workflow' | 'execution' | 'queue' | 'artifact', 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'>>; readonly checkedAt: number }
export interface ReadinessDimensions { readonly reliability: number; readonly security: number; readonly observability: number; readonly recovery: number; readonly costSafety: number; readonly privacy: number; readonly determinism: number; readonly artifactIntegrity: number; readonly providerStability: number; readonly localRuntimeStability: number }
