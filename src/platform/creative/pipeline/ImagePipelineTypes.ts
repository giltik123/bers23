import type { WorkflowExecutionPlan } from '../integration';

export type PipelineScope = WorkflowExecutionPlan['scope'];
export type PipelineCapability = 'local' | 'gpu' | 'ai' | 'hybrid';
export type PipelineRecoveryAction = 'fallback' | 'skip' | 'replace' | 'abort';

export interface PipelineDependencies {
  readonly id: () => string;
  readonly now: () => number;
  readonly random: () => number;
}

export interface PipelineOperationDefinition {
  readonly id: string;
  readonly workflowOperation: string;
  readonly implementation: string;
  readonly capability: PipelineCapability;
  readonly aliases: readonly string[];
  readonly versions: readonly string[];
  readonly deprecated: boolean;
  readonly fallback?: string;
  readonly priority: number;
  readonly effects: Readonly<Partial<ImageState>>;
  readonly resources: Readonly<{ cpu: number; gpu: number; ram: number; latency: number; credits: number }>;
}

export interface ImageState {
  readonly id: string;
  readonly scope: PipelineScope;
  readonly width: number;
  readonly height: number;
  readonly format: 'jpeg' | 'png' | 'webp' | 'raw';
  readonly channels: 1 | 3 | 4;
  readonly alpha: boolean;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
  readonly estimatedQuality: number;
  readonly estimatedFileSize: number;
  readonly generation: number;
  readonly parentId?: string;
  readonly createdAt: number;
}

export interface PipelineOperationNode {
  readonly id: string;
  readonly scope: PipelineScope;
  readonly workflowStepId: string;
  readonly operation: string;
  readonly implementation: string;
  readonly capability: PipelineCapability;
  readonly dependencies: readonly string[];
  readonly resources: PipelineOperationDefinition['resources'];
  readonly verificationRequired: boolean;
  readonly rollbackPoint: boolean;
  readonly stage: number;
}

export interface PipelineStage {
  readonly id: string;
  readonly order: number;
  readonly operationIds: readonly string[];
  readonly parallel: boolean;
}

export interface PipelineGraphSnapshot {
  readonly id: string;
  readonly scope: PipelineScope;
  readonly workflowPlanId: string;
  readonly stages: readonly PipelineStage[];
  readonly operations: readonly PipelineOperationNode[];
  readonly dependencies: readonly { source: string; target: string }[];
  readonly rollbackPoints: readonly string[];
  readonly createdAt: number;
}

export interface PipelineResources {
  readonly cpu: number;
  readonly gpu: number;
  readonly ram: number;
  readonly imagePixels: number;
  readonly estimatedMemory: number;
  readonly estimatedLatency: number;
  readonly feasible: boolean;
  readonly shortages: readonly string[];
}

export interface PipelineVerificationResult {
  readonly operationId: string;
  readonly expected: Readonly<Partial<ImageState>>;
  readonly current: ImageState;
  readonly passed: boolean;
  readonly issues: readonly string[];
}

export interface PipelineRecoveryPlan {
  readonly operationId: string;
  readonly action: PipelineRecoveryAction;
  readonly fallback?: string;
  readonly preserveOperationIds: readonly string[];
  readonly removeOperationIds: readonly string[];
  readonly reason: string;
}

export interface PipelineSimulationResult {
  readonly latency: number;
  readonly memory: number;
  readonly credits: number;
  readonly expectedQuality: number;
  readonly expectedSize: number;
  readonly finalState: ImageState;
  readonly states: readonly ImageState[];
}

export interface PipelineOptimizationResultV2 {
  readonly graph: PipelineGraphSnapshot;
  readonly removedOperationIds: readonly string[];
  readonly reorderedOperationIds: readonly string[];
  readonly parallelGroups: readonly (readonly string[])[];
  readonly memorySavings: number;
  readonly bufferSavings: number;
}

export interface PipelineCacheEntry {
  readonly id: string;
  readonly scope: PipelineScope;
  readonly operationId: string;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly state: ImageState;
  readonly createdAt: number;
}

export interface PipelineMetrics {
  readonly operationCount: number;
  readonly localRatio: number;
  readonly parallelRatio: number;
  readonly cacheReuse: number;
  readonly verificationPassRate: number;
  readonly recoveryCount: number;
}

export interface PipelineTimelineEntry {
  readonly id: string;
  readonly operationId?: string;
  readonly type: 'built' | 'simulated' | 'verified' | 'recovery' | 'replayed';
  readonly timestamp: number;
  readonly message: string;
}

export interface PipelineSnapshot {
  readonly id: string;
  readonly scope: PipelineScope;
  readonly workflow: WorkflowExecutionPlan;
  readonly graph: PipelineGraphSnapshot;
  readonly resources: PipelineResources;
  readonly simulation: PipelineSimulationResult;
  readonly verification: readonly PipelineVerificationResult[];
  readonly recovery: readonly PipelineRecoveryPlan[];
  readonly metrics: PipelineMetrics;
  readonly timeline: readonly PipelineTimelineEntry[];
  readonly imageStates: readonly ImageState[];
  readonly createdAt: number;
}

export interface PipelineDebugSnapshot {
  readonly workflowId: string;
  readonly pipelineId: string;
  readonly operations: readonly string[];
  readonly resources: PipelineResources;
  readonly verification: readonly PipelineVerificationResult[];
  readonly recovery: readonly PipelineRecoveryPlan[];
  readonly metrics: PipelineMetrics;
  readonly snapshotId: string;
}
