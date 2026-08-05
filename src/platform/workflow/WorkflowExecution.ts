import type { WorkflowDefinition, WorkflowInspection } from './WorkflowDefinition';
import type { WorkflowStep, WorkflowStepExecutionResult } from './WorkflowStep';

export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'recovered' | 'rejected';

export interface WorkflowExecutionPlanStep { readonly workflowStep: WorkflowStep; readonly executionPlan: { readonly capability: string; readonly input: Record<string, unknown>; readonly metadata: Record<string, unknown> }; }
export interface WorkflowExecutionPlan { readonly workflowId: string; readonly steps: readonly WorkflowExecutionPlanStep[]; }

export interface WorkflowRun {
  readonly id: string;
  readonly workflowId: string;
  readonly status: WorkflowRunStatus;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly stepResults: readonly WorkflowStepExecutionResult[];
  readonly output?: unknown;
  readonly error?: string;
}

export interface WorkflowExecutionContext {
  readonly runId: string;
  readonly definition: WorkflowDefinition;
  readonly inspection: WorkflowInspection;
  readonly results: ReadonlyMap<string, WorkflowStepExecutionResult>;
  readonly signal?: AbortSignal;
}

export interface WorkflowOrchestrator {
  execute(plan: WorkflowExecutionPlan, context: WorkflowExecutionContext): Promise<WorkflowStepExecutionResult> | WorkflowStepExecutionResult;
}

export const createExecutionPlan = (definition: WorkflowDefinition, orderedSteps: readonly WorkflowStep[]): WorkflowExecutionPlan => Object.freeze({
  workflowId: definition.id,
  steps: Object.freeze(orderedSteps.map((workflowStep) => Object.freeze({
    workflowStep,
    executionPlan: Object.freeze({ capability: workflowStep.capability, input: Object.freeze({ ...(workflowStep.input || {}) }), metadata: Object.freeze({ workflowId: definition.id, stepId: workflowStep.id, ...(workflowStep.metadata || {}) }) }),
  }))),
});
