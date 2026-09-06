import type { ExecutionRunScope } from './executionRunRegistry.ts';

export const EXECUTION_STEP_STATUSES = Object.freeze([
  'WAITING_FOR_LOCAL_RESULT',
  'RUNNING_INTERNAL',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'UNKNOWN',
] as const);

export type ExecutionStepStatus = (typeof EXECUTION_STEP_STATUSES)[number];

export type ExecutionStep = Readonly<{
  runId: string;
  stepId: string;
  sourceAuthority: 'WORKFLOW_CONTINUATION';
  status: ExecutionStepStatus;
  revision: number;
  localTicketId?: string;
  artifactIds: readonly string[];
  statusReasonCode?: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  finishedAt?: string;
}>;

export type ProjectExecutionStepInput = Readonly<{
  scope: ExecutionRunScope;
  runId: string;
  stepId: string;
  status: ExecutionStepStatus;
  localTicketId?: string;
  artifactIds?: readonly string[];
  statusReasonCode?: string;
}>;

/**
 * Durable observation/index projection only. Implementations must never dispatch
 * workflow work or treat an ExecutionStep row as execution authority.
 */
export interface ExecutionStepRegistry {
  project(input: ProjectExecutionStepInput): Promise<ExecutionStep>;
  get(scope: ExecutionRunScope, runId: string, stepId: string): Promise<ExecutionStep | undefined>;
  list(scope: ExecutionRunScope, runId: string): Promise<readonly ExecutionStep[]>;
}
