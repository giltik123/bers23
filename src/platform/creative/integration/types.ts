import type {
  ExecutionCheckpoint,
  ExecutionGraphSnapshot,
  ExecutionScope,
  ExecutionVerificationStep,
} from '../execution';

export type WorkflowStatus = 'pending' | 'running' | 'paused' | 'retrying' | 'completed' | 'cancelled' | 'failed';

export interface IntegrationDependencies {
  readonly id: () => string;
  readonly now: () => number;
}

export interface WorkflowStep {
  readonly id: string;
  readonly executionNodeId: string;
  readonly capability: string;
  readonly operation: string;
  readonly dependencies: readonly string[];
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly verificationRequired: boolean;
  readonly estimatedLatency: number;
}

export interface WorkflowExecutionPlan {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly executionGraphId: string;
  readonly steps: readonly WorkflowStep[];
  readonly stages: readonly { id: string; order: number; stepIds: readonly string[] }[];
  readonly createdAt: number;
}

export interface WorkflowOperationResult {
  readonly stepId: string;
  readonly status: WorkflowStatus;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly metrics: Readonly<Record<string, number>>;
  readonly error?: string;
}

export interface WorkflowResult {
  readonly workflowId: string;
  readonly status: WorkflowStatus;
  readonly operations: readonly WorkflowOperationResult[];
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export interface WorkflowExecutor {
  execute(plan: WorkflowExecutionPlan): Promise<WorkflowResult> | WorkflowResult;
  cancel(id: string): Promise<void> | void;
  pause(id: string): Promise<void> | void;
  resume(id: string): Promise<void> | void;
  status(id: string): Promise<WorkflowStatus> | WorkflowStatus;
}

export interface OperationMapping {
  readonly operation: string;
  readonly capability: string;
  readonly workflowStep: string;
  readonly aliases: readonly string[];
  readonly parameters: Readonly<Record<string, unknown>>;
}

export type ExecutionEventType =
  | 'OperationStarted' | 'OperationCompleted' | 'OperationFailed' | 'OperationSkipped'
  | 'RetryScheduled' | 'RollbackStarted' | 'RollbackFinished';

export interface ExecutionEvent {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly workflowId: string;
  readonly executionNodeId?: string;
  readonly type: ExecutionEventType;
  readonly message: string;
  readonly timestamp: number;
}

export interface ExecutionProgress {
  readonly overall: number;
  readonly currentStage?: string;
  readonly estimatedRemainingTime: number;
  readonly completedNodes: readonly string[];
  readonly remainingNodes: readonly string[];
}

export interface VerificationComparison {
  readonly executionNodeId: string;
  readonly expected: number;
  readonly actual: number;
  readonly passed: boolean;
  readonly difference: number;
  readonly reason: string;
}

export interface RecoveryDirective {
  readonly action: 'rollback' | 'retry' | 'replan' | 'none';
  readonly executionNodeId?: string;
  readonly reason: string;
  readonly preserveNodeIds: readonly string[];
}

export interface ReplanningResult {
  readonly graph: ExecutionGraphSnapshot;
  readonly replacedNodeIds: readonly string[];
  readonly preservedNodeIds: readonly string[];
  readonly reason: string;
}

export type TimelineLayer = 'decision' | 'planning' | 'execution' | 'workflow' | 'verification' | 'recovery';

export interface TimelineEntry {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly layer: TimelineLayer;
  readonly referenceId: string;
  readonly status: string;
  readonly timestamp: number;
  readonly message: string;
}

export interface WorkflowSnapshot {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly execution: ExecutionGraphSnapshot;
  readonly workflow: WorkflowExecutionPlan;
  readonly status: WorkflowStatus;
  readonly verification: readonly VerificationComparison[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly events: readonly ExecutionEvent[];
  readonly progress: ExecutionProgress;
  readonly recovery: readonly RecoveryDirective[];
  readonly timeline: readonly TimelineEntry[];
  readonly checkpoints: readonly ExecutionCheckpoint[];
  readonly createdAt: number;
}

export interface IntegrationDebugSnapshot {
  readonly goal: string;
  readonly planId: string;
  readonly executionGraphId: string;
  readonly workflowGraphId: string;
  readonly currentState: WorkflowStatus;
  readonly verification: readonly VerificationComparison[];
  readonly recovery: readonly RecoveryDirective[];
  readonly completion: number;
}

export interface VerificationInput {
  readonly expected: readonly ExecutionVerificationStep[];
  readonly actual: WorkflowResult;
  readonly workflow: WorkflowExecutionPlan;
}
