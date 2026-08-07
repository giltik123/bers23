import type { CreativePlan, PlanningScope } from '../planning';

export type ExecutionScope = PlanningScope;
export type ExecutionMode = 'local' | 'ai' | 'hybrid';
export type ExecutionStatus = 'pending' | 'ready' | 'blocked' | 'completed' | 'failed' | 'skipped';

export interface ExecutionDependencies {
  readonly id: () => string;
  readonly now: () => number;
  readonly random: () => number;
}

export interface ExecutionNode {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly planNodeId: string;
  readonly operation: string;
  readonly mode: ExecutionMode;
  readonly status: ExecutionStatus;
  readonly dependencies: readonly string[];
  readonly rollbackPoint: boolean;
  readonly verificationRequired: boolean;
  readonly credits: number;
  readonly latency: number;
  readonly gpuTime: number;
  readonly cpuTime: number;
  readonly memory: number;
  readonly aiCalls: number;
  readonly expectedRetries: number;
  readonly quality: number;
  readonly risk: number;
  readonly tags: readonly string[];
}

export interface ExecutionEdge {
  readonly source: string;
  readonly target: string;
  readonly relation: 'depends-on' | 'synchronizes' | 'verifies' | 'rolls-back-to';
}

export interface ExecutionBarrier {
  readonly id: string;
  readonly afterNodeIds: readonly string[];
  readonly beforeNodeIds: readonly string[];
  readonly reason: string;
}

export interface ExecutionGroup {
  readonly id: string;
  readonly nodeIds: readonly string[];
  readonly parallel: boolean;
}

export interface ExecutionStage {
  readonly id: string;
  readonly order: number;
  readonly name: string;
  readonly groups: readonly ExecutionGroup[];
  readonly barriers: readonly ExecutionBarrier[];
}

export interface ExecutionGraphSnapshot {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly planId: string;
  readonly nodes: readonly ExecutionNode[];
  readonly edges: readonly ExecutionEdge[];
  readonly stages: readonly ExecutionStage[];
  readonly barriers: readonly ExecutionBarrier[];
  readonly topologicalOrder: readonly string[];
  readonly createdAt: number;
}

export interface ExecutionSchedule {
  readonly graphId: string;
  readonly stages: readonly ExecutionStage[];
  readonly criticalPath: readonly string[];
  readonly totalLatency: number;
  readonly parallelism: number;
}

export interface ExecutionCost {
  readonly credits: number;
  readonly latency: number;
  readonly gpuTime: number;
  readonly cpuTime: number;
  readonly memory: number;
  readonly expectedAiCalls: number;
  readonly expectedRetries: number;
}

export interface ExecutionResourceBudget {
  readonly cpu: number;
  readonly gpu: number;
  readonly ai: number;
  readonly memory: number;
  readonly local: number;
}

export interface ExecutionResourceAllocation extends ExecutionResourceBudget {
  readonly nodeAllocations: readonly {
    nodeId: string;
    cpu: number;
    gpu: number;
    ai: number;
    memory: number;
    local: number;
  }[];
  readonly feasible: boolean;
  readonly shortages: readonly (keyof ExecutionResourceBudget)[];
}

export interface ExecutionVerificationStep {
  readonly id: string;
  readonly stageId: string;
  readonly check: string;
  readonly method: string;
  readonly threshold: number;
  readonly required: boolean;
}

export interface ExecutionCheckpoint {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly graphId: string;
  readonly stageId: string;
  readonly state: Readonly<Record<string, ExecutionStatus>>;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly verification: readonly ExecutionVerificationStep[];
  readonly dependencies: readonly string[];
  readonly createdAt: number;
}

export interface RollbackPlan {
  readonly checkpointId: string;
  readonly rollbackToStageId?: string;
  readonly recalculate: readonly string[];
  readonly preserve: readonly string[];
  readonly remove: readonly string[];
}

export type RetryAction = 'rebuild-partial-graph' | 'skip-node' | 'replace-operation' | 'fallback-local' | 'fallback-ai' | 'cancel-subtree';

export interface RetryPlan {
  readonly failedNodeId: string;
  readonly action: RetryAction;
  readonly affectedNodeIds: readonly string[];
  readonly replacement?: string;
  readonly reason: string;
}

export interface ExecutionSimulation {
  readonly quality: number;
  readonly latency: number;
  readonly credits: number;
  readonly parallelism: number;
  readonly successProbability: number;
  readonly risks: readonly string[];
}

export interface ExecutionOptimization {
  readonly graph: ExecutionGraphSnapshot;
  readonly score: number;
  readonly savings: Readonly<{ latency: number; credits: number; aiCalls: number; memory: number; pipelineSwitches: number }>;
  readonly changes: readonly string[];
}

export interface ExecutionExplanation {
  readonly graphId: string;
  readonly operations: readonly {
    nodeId: string;
    whyHere: string;
    whyBefore: readonly string[];
    whyAfter: readonly string[];
    whyParallel: string;
    whyMode: string;
  }[];
  readonly narrative: string;
}

export interface ExecutionMemoryRecord {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly graphId: string;
  readonly successful: boolean;
  readonly time: number;
  readonly cost: number;
  readonly errors: readonly string[];
  readonly verification: readonly string[];
  readonly createdAt: number;
}

export interface ExecutionMetricsResult {
  readonly executionIq: number;
  readonly pipelineEfficiency: number;
  readonly parallelEfficiency: number;
  readonly resourceEfficiency: number;
  readonly recoveryScore: number;
  readonly verificationScore: number;
  readonly rollbackScore: number;
}

export interface ExecutionSnapshot {
  readonly id: string;
  readonly scope: ExecutionScope;
  readonly plan: CreativePlan;
  readonly graph: ExecutionGraphSnapshot;
  readonly schedule: ExecutionSchedule;
  readonly cost: ExecutionCost;
  readonly resources: ExecutionResourceAllocation;
  readonly verification: readonly ExecutionVerificationStep[];
  readonly simulation: ExecutionSimulation;
  readonly metrics: ExecutionMetricsResult;
  readonly checkpoints: readonly ExecutionCheckpoint[];
  readonly createdAt: number;
}
