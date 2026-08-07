export interface PlanningScope {
  readonly tenantId: string;
  readonly projectId: string;
  readonly userId: string;
}

export interface PlanningDependencies {
  readonly id: () => string;
  readonly now: () => number;
  readonly random: () => number;
}

export type PlanNodeType = 'goal' | 'task' | 'operation' | 'verification' | 'completion';
export type PlanStatus = 'planned' | 'ready' | 'blocked' | 'completed' | 'failed';

export interface GoalDefinition {
  readonly title: string;
  readonly description?: string;
  readonly priority?: number;
  readonly operations?: readonly string[];
  readonly subGoals?: readonly GoalDefinition[];
  readonly tags?: readonly string[];
}

export interface GoalNode {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly level: number;
  readonly priority: number;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly operations: readonly string[];
  readonly tags: readonly string[];
}

export interface PlanNode {
  readonly id: string;
  readonly scope: PlanningScope;
  readonly type: PlanNodeType;
  readonly title: string;
  readonly goalId: string;
  readonly operation?: string;
  readonly dependencies: readonly string[];
  readonly status: PlanStatus;
  readonly quality: number;
  readonly cost: number;
  readonly latency: number;
  readonly risk: number;
  readonly local: boolean;
  readonly ai: boolean;
  readonly tags: readonly string[];
}

export interface PlanEdge {
  readonly source: string;
  readonly target: string;
  readonly relation: 'decomposes-to' | 'depends-on' | 'verified-by' | 'completes';
}

export interface PlanGraphSnapshot {
  readonly nodes: readonly PlanNode[];
  readonly edges: readonly PlanEdge[];
  readonly topologicalOrder: readonly string[];
  readonly parallelGroups: readonly (readonly string[])[];
}

export interface ResourceBudget {
  readonly credits: number;
  readonly ai: number;
  readonly local: number;
  readonly memory: number;
  readonly thinking: number;
  readonly runtime: number;
}

export interface ResourceAllocation extends ResourceBudget {
  readonly feasible: boolean;
  readonly shortages: readonly (keyof ResourceBudget)[];
}

export interface CreativePlan {
  readonly id: string;
  readonly scope: PlanningScope;
  readonly name: string;
  readonly strategy: PlanStrategy;
  readonly goalTree: readonly GoalNode[];
  readonly graph: PlanGraphSnapshot;
  readonly resources: ResourceAllocation;
  readonly createdAt: number;
  readonly generation: number;
  readonly parentPlanId?: string;
  readonly ready: boolean;
}

export type PlanStrategy = 'balanced' | 'cheap' | 'fast' | 'luxury' | 'creative' | 'safe';

export interface PlanRequest {
  readonly scope: PlanningScope;
  readonly goal: GoalDefinition;
  readonly strategy?: PlanStrategy;
  readonly budget?: Partial<ResourceBudget>;
  readonly constraints?: Readonly<{
    maxCost?: number;
    maxLatency?: number;
    maxRisk?: number;
    minimumQuality?: number;
  }>;
}

export interface OptimizationWeights {
  readonly quality: number;
  readonly cost: number;
  readonly latency: number;
  readonly risk: number;
  readonly dependencies: number;
  readonly parallelism: number;
}

export interface PlanOptimization {
  readonly plan: CreativePlan;
  readonly score: number;
  readonly weights: OptimizationWeights;
  readonly changes: readonly string[];
}

export interface VerificationStep {
  readonly id: string;
  readonly planNodeId: string;
  readonly check: string;
  readonly method: string;
  readonly when: 'before' | 'after' | 'completion';
  readonly required: boolean;
}

export interface FailureReport {
  readonly planId: string;
  readonly nodeId: string;
  readonly reason: string;
  readonly severity: number;
}

export interface PlanSimulation {
  readonly cost: number;
  readonly quality: number;
  readonly successProbability: number;
  readonly time: number;
  readonly risks: readonly string[];
}

export interface PlanningMetrics {
  readonly quality: number;
  readonly complexity: number;
  readonly efficiency: number;
  readonly robustness: number;
  readonly flexibility: number;
  readonly explainability: number;
}

export interface PlanningExplanation {
  readonly goal: string;
  readonly plan: string;
  readonly dependencies: readonly string[];
  readonly optimization: string;
  readonly alternatives: readonly string[];
  readonly verification: readonly string[];
  readonly executionReadiness: boolean;
  readonly narrative: string;
}

export interface PlanMemoryRecord {
  readonly id: string;
  readonly scope: PlanningScope;
  readonly planId: string;
  readonly successful: boolean;
  readonly errors: readonly string[];
  readonly structure: readonly string[];
  readonly metrics: PlanningMetrics;
  readonly createdAt: number;
}

export interface CreativePlanningSnapshot {
  readonly id: string;
  readonly scope: PlanningScope;
  readonly plan: CreativePlan;
  readonly alternatives: readonly CreativePlan[];
  readonly verification: readonly VerificationStep[];
  readonly simulation: PlanSimulation;
  readonly metrics: PlanningMetrics;
  readonly explanation: PlanningExplanation;
  readonly history: readonly PlanMemoryRecord[];
  readonly createdAt: number;
}
