export type WorkflowStepKind = 'analysis' | 'processing' | 'generation' | 'validation' | 'composition' | 'orchestration';
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'recovered' | 'skipped';

export interface WorkflowStepRequirement {
  readonly capability?: string;
  readonly input?: string;
  readonly policy?: string;
}

export interface WorkflowStep {
  readonly id: string;
  readonly name: string;
  readonly kind: WorkflowStepKind;
  readonly capability: string;
  readonly dependsOn: readonly string[];
  readonly input?: Record<string, unknown>;
  readonly recovery?: { readonly strategy: 'retry' | 'skip' | 'fallback'; readonly maxAttempts?: number; readonly fallbackStepId?: string };
  readonly requirements?: readonly WorkflowStepRequirement[];
  readonly metadata?: Record<string, unknown>;
}

export interface WorkflowStepExecutionResult {
  readonly stepId: string;
  readonly status: WorkflowStepStatus;
  readonly attempt: number;
  readonly output?: unknown;
  readonly error?: string;
  readonly durationMs: number;
  readonly metadata?: Record<string, unknown>;
}

export const defineWorkflowStep = (step: WorkflowStep): WorkflowStep => Object.freeze({
  ...step,
  dependsOn: Object.freeze([...(step.dependsOn || [])]),
  input: Object.freeze({ ...(step.input || {}) }),
  requirements: Object.freeze([...(step.requirements || [])]),
  metadata: Object.freeze({ ...(step.metadata || {}) }),
});
