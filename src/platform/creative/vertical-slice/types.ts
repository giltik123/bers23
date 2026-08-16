import type { PrivacyMode } from '../local-ai';

export interface ProviderScope { readonly tenantId: string; readonly projectId: string; readonly userId: string }
export interface CloudProviderArtifactView { readonly url: string; readonly mimeType: string; readonly size: number; readonly hash: string; readonly bytes?: Uint8Array }
export interface CloudProviderResultView { readonly id: string; readonly artifacts: readonly CloudProviderArtifactView[]; readonly data: Readonly<Record<string, unknown>>; readonly metrics: Readonly<{ latencyMs: number; cost: number }>; readonly createdAt: number }
export interface CloudProviderPort { readonly name: string; supports(capability: string): boolean; execute(request: Readonly<{ scope: ProviderScope; capability: string; prompt?: string; inputs?: Readonly<Record<string, unknown>>; timeoutMs?: number; metadata?: Readonly<Record<string, unknown>> }>): Promise<CloudProviderResultView> }

export type VerticalSliceScenario = 'SMART_BACKGROUND_EDIT' | 'SMART_UPSCALE' | 'SMART_CREATIVE_ENHANCEMENT' | 'GENERATIVE_EDIT';
export type OperationName = 'analysis' | 'segmentation' | 'mask-cleanup' | 'background-edit' | 'upscale' | 'enhancement' | 'generative-edit' | 'verification';
export type QualityDecision = 'ACCEPT' | 'RETRY' | 'ESCALATE' | 'REPLAN';
export type ExecutionTarget = 'LOCAL' | 'FAL' | 'REVE';

export interface ImageArtifact {
  readonly id: string;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly hash: string;
  readonly createdAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface QualityMeasurement {
  readonly quality: number;
  readonly goalCompletion: number;
  readonly artifactIntegrity: number;
  readonly identityPreservation: number;
  readonly operationSuccess: number;
}

export interface VerificationResult extends QualityMeasurement {
  readonly score: number;
  readonly threshold: number;
  readonly decision: QualityDecision;
  readonly reasons: readonly string[];
}

export interface InferenceResult {
  readonly artifact: ImageArtifact;
  readonly quality: QualityMeasurement;
  readonly model: string;
  readonly latencyMs: number;
  readonly actualCost?: number;
}

export interface LocalInferencePort {
  readonly available: (operation: OperationName) => Promise<boolean> | boolean;
  readonly infer: (request: Readonly<{ operation: OperationName; artifact: ImageArtifact; prompt: string; signal?: AbortSignal }>) => Promise<InferenceResult>;
}

export interface ReveProviderPort {
  readonly execute: (request: Readonly<{ scope: ProviderScope; prompt: string; artifact: ImageArtifact; signal?: AbortSignal }>) => Promise<InferenceResult>;
}

export interface VerticalSliceProviders {
  readonly local: LocalInferencePort;
  /** The existing public FalProvider contract; credentials stay inside the provider. */
  readonly fal?: CloudProviderPort;
  readonly reve?: ReveProviderPort;
}

export type TelemetryEventName = 'LocalInferenceStarted' | 'LocalInferenceCompleted' | 'CloudInferenceStarted' | 'CloudInferenceCompleted' | 'Escalated' | 'Fallback' | 'Verified' | 'Rejected' | 'Completed';
export interface TelemetryEvent {
  readonly id: string;
  readonly type: TelemetryEventName;
  readonly timestamp: number;
  readonly runId: string;
  readonly operation?: OperationName;
  readonly target?: ExecutionTarget;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ExecutionAccounting {
  readonly provider: 'local' | 'fal' | 'reve';
  readonly model: string;
  readonly operation: OperationName;
  readonly estimatedCost: number;
  readonly actualCost: number;
  readonly credits: number;
  readonly latencyMs: number;
  readonly deviceTimeMs: number;
  readonly energyEstimateWh: number;
  readonly result: 'SUCCESS' | 'FAILED' | 'REJECTED';
  readonly quality: number;
}

export interface VerticalSliceRequest {
  readonly scope: ProviderScope;
  readonly scenario: VerticalSliceScenario;
  readonly prompt: string;
  readonly image: ImageArtifact;
  readonly privacyMode?: PrivacyMode;
  readonly cloudAllowed?: boolean;
  readonly qualityThreshold?: number;
  readonly signal?: AbortSignal;
}

export interface VerticalSliceResult {
  readonly status: 'COMPLETED' | 'BLOCKED' | 'FAILED';
  readonly reason?: string;
  readonly finalArtifact?: ImageArtifact;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly executionSnapshot: Readonly<{ runId: string; intent: VerticalSliceScenario; plan: readonly OperationName[]; processingPath: readonly ExecutionTarget[]; accounting: readonly ExecutionAccounting[] }>;
  readonly costSummary: Readonly<{ cloudCredits: number; cloudCost: number; localOperations: number; deviceTimeMs: number; energyEstimateWh: number; creditsSaved: number }>;
  readonly verification?: VerificationResult;
  readonly explanation: string;
  readonly telemetry: readonly TelemetryEvent[];
}

export interface VerticalSliceDependencies {
  readonly providers: VerticalSliceProviders;
  readonly now?: () => number;
  readonly id?: () => string;
  readonly hash?: (bytes: Uint8Array) => Promise<string>;
  readonly estimatedCloudCredits?: Readonly<Partial<Record<OperationName, number>>>;
}
