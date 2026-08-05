import type { WorkflowGraph } from './WorkflowGraph';
import type { WorkflowStep } from './WorkflowStep';

export type WorkflowCategory = 'image-editing' | 'portrait' | 'fashion' | 'background' | 'general';
export type WorkflowRiskLevel = 'low' | 'medium' | 'high';

export interface WorkflowBudget {
  readonly maxCredits?: number;
  readonly maxDurationMs?: number;
  readonly maxProviderCalls?: number;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: WorkflowCategory;
  readonly steps: readonly WorkflowStep[];
  readonly requirements: readonly string[];
  readonly capabilities: readonly string[];
  readonly budget: WorkflowBudget;
  readonly riskLevel: WorkflowRiskLevel;
  readonly metadata: Record<string, unknown>;
}

export interface WorkflowInspection {
  readonly definition: WorkflowDefinition;
  readonly graph: WorkflowGraph;
  readonly orderedSteps: readonly WorkflowStep[];
  readonly estimatedBudget: Required<WorkflowBudget>;
}

export const defineWorkflow = (definition: WorkflowDefinition): WorkflowDefinition => Object.freeze({
  ...definition,
  steps: Object.freeze([...definition.steps]),
  requirements: Object.freeze([...(definition.requirements || [])]),
  capabilities: Object.freeze([...(definition.capabilities || [])]),
  budget: Object.freeze({ ...(definition.budget || {}) }),
  metadata: Object.freeze({ ...(definition.metadata || {}) }),
});
