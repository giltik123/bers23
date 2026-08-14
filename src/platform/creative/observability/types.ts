import type { ProductionExecutionState, ProductionScope, ProductionTelemetryEvent, SecurityEvent } from '../production';

export type ObservabilityEventKind = 'REQUEST' | 'EXECUTION' | 'OPERATION' | 'LOCAL_INFERENCE' | 'CLOUD_INFERENCE' | 'PROVIDER_SELECTION' | 'PROVIDER_EXECUTION' | 'ARTIFACT' | 'VERIFICATION' | 'RECOVERY' | 'FALLBACK' | 'ESCALATION' | 'COMPLETION';
export type ExecutionTarget = 'LOCAL' | 'CLOUD' | 'BLOCKED' | 'UNKNOWN';
export type EventOutcome = 'STARTED' | 'SUCCESS' | 'FAILED' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED' | 'UNKNOWN';
export interface ObservabilityScope { readonly tenantId: string; readonly projectId: string; readonly userId?: string }
export interface UnifiedTelemetryEvent {
  readonly id: string; readonly timestamp: number; readonly kind: ObservabilityEventKind; readonly requestId: string; readonly executionId: string;
  readonly nodeId: string; readonly operationId: string; readonly target: ExecutionTarget; readonly model?: string; readonly provider?: string;
  readonly durationMs: number; readonly outcome: EventOutcome; readonly actualCost: number; readonly estimatedCloudCost: number; readonly localDeviceCost: number;
  readonly credits: number; readonly creditsSaved: number; readonly energyWh: number; readonly quality: number; readonly baselineQuality: number;
  readonly scope: ObservabilityScope; readonly deviceClass: string; readonly platform: string; readonly policy: string; readonly reason?: 'QUALITY' | 'LATENCY' | 'FAILURE' | 'RESOURCE' | 'PRIVACY' | 'AVAILABILITY' | 'UNKNOWN';
  readonly retryCount: number; readonly attempt: number; readonly coldStart: boolean; readonly ramMb: number; readonly vramMb: number;
  readonly userAccepted?: boolean; readonly undone?: boolean; readonly corrected?: boolean; readonly recovered?: boolean; readonly metadata: Readonly<Record<string, unknown>>;
}
export interface TelemetryInput extends Partial<Omit<UnifiedTelemetryEvent, 'id' | 'timestamp' | 'kind' | 'requestId' | 'executionId' | 'nodeId' | 'operationId' | 'target' | 'durationMs' | 'outcome' | 'actualCost' | 'estimatedCloudCost' | 'localDeviceCost' | 'credits' | 'creditsSaved' | 'energyWh' | 'quality' | 'baselineQuality' | 'scope' | 'deviceClass' | 'platform' | 'policy' | 'retryCount' | 'attempt' | 'coldStart' | 'ramMb' | 'vramMb' | 'metadata'>> {
  readonly id: string; readonly timestamp: number; readonly kind: ObservabilityEventKind; readonly requestId: string; readonly executionId: string;
  readonly nodeId?: string; readonly operationId: string; readonly target: ExecutionTarget; readonly durationMs?: number; readonly outcome: EventOutcome;
  readonly actualCost?: number; readonly estimatedCloudCost?: number; readonly localDeviceCost?: number; readonly credits?: number; readonly creditsSaved?: number;
  readonly energyWh?: number; readonly quality?: number; readonly baselineQuality?: number; readonly scope: ObservabilityScope; readonly deviceClass?: string;
  readonly platform?: string; readonly policy?: string; readonly retryCount?: number; readonly attempt?: number; readonly coldStart?: boolean;
  readonly ramMb?: number; readonly vramMb?: number; readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface EconomicsSummary { readonly actualCloudCost: number; readonly estimatedCloudCost: number; readonly localDeviceCost: number; readonly totalCost: number; readonly costPerSuccessfulResult: number; readonly costPerAcceptedResult: number; readonly creditsSaved: number; readonly cloudAvoidanceRate: number; readonly qualityGainPerCredit: number; readonly qualityGainPerSecond: number; readonly qualityGainPerLocalResource: number }
export interface PerformanceRow { readonly key: string; readonly executions: number; readonly successes: number; readonly successRate: number; readonly acceptanceRate: number; readonly averageQuality: number; readonly averageCost: number; readonly averageLatency: number; readonly energyWh: number; readonly fallbackRate: number; readonly retryRate: number }
export interface WasteFinding { readonly type: 'UNNECESSARY_AI' | 'RETRY_WITHOUT_GAIN' | 'DUPLICATE_CALL' | 'FALLBACK_WITHOUT_IMPROVEMENT' | 'INSIGNIFICANT_QUALITY_GAIN'; readonly executionId: string; readonly operationId: string; readonly estimatedWaste: number; readonly evidence: Readonly<Record<string, unknown>> }
export interface Anomaly { readonly type: 'COST_SPIKE' | 'LATENCY_SPIKE' | 'QUALITY_DEGRADATION' | 'PROVIDER_DEGRADATION' | 'LOCAL_MODEL_REGRESSION' | 'UNEXPECTED_ESCALATION' | 'UNUSUAL_RETRY_RATE'; readonly severity: 'WARNING' | 'BLOCK'; readonly key: string; readonly current: number; readonly baseline: number; readonly change: number }
export interface GoldenBenchmark { readonly scenario: 'BACKGROUND_REMOVAL' | 'UPSCALE' | 'PORTRAIT_ENHANCEMENT' | 'LUXURY_ENHANCEMENT' | 'TRY_ON' | 'GENERATIVE_EDIT'; readonly operationId: string; readonly minimumQuality: number; readonly maximumCost: number; readonly maximumLatencyMs: number }
export interface ObservabilityOutcome { readonly operation: string; readonly selectedTarget: ExecutionTarget; readonly actualOutcome: EventOutcome; readonly actualCost: number; readonly actualQuality: number; readonly actualLatency: number; readonly userReaction: 'ACCEPTED' | 'REJECTED' | 'UNDO' | 'CORRECTED' | 'UNKNOWN' }
export interface ObservabilityDependencies { readonly now?: () => number; readonly id?: () => string }
export interface ObservabilitySnapshot { readonly period: Readonly<{ from: number; to: number }>; readonly scope: ObservabilityScope; readonly usage: Readonly<Record<string, number>>; readonly cost: EconomicsSummary; readonly quality: Readonly<Record<string, number>>; readonly localCloud: Readonly<Record<string, number>>; readonly providers: readonly PerformanceRow[]; readonly models: readonly PerformanceRow[]; readonly failures: number; readonly recovery: Readonly<Record<string, number>>; readonly privacy: Readonly<Record<string, number>>; readonly economics: EconomicsSummary; readonly health: Readonly<Record<string, unknown>> }
export type ProductionTelemetrySource = ProductionTelemetryEvent | SecurityEvent | ProductionExecutionState;
export type { ProductionScope };
