import type { LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { OrthogonalTransformMode } from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { WorkflowContinuationState } from './WorkflowContinuationStore.ts';

export type BoundedAgentStartCommand = Readonly<{
  clientRequestId: string;
  projectId: string;
  sourceArtifactId: string;
  mode: OrthogonalTransformMode;
  width: number;
  height: number;
}>;

export type BoundedAgentLocalAction = Readonly<{
  type: 'LOCAL_EXECUTION';
  operation: 'ORTHOGONAL_TRANSFORM' | 'RESIZE';
  ticket: LocalExecutionTicketV2;
}>;

export type BoundedAgentWorkflowView = Readonly<{
  executionId: string;
  revision: number;
  state: WorkflowContinuationState;
  nextAction?: BoundedAgentLocalAction;
  retryAvailable?: boolean;
  attemptStatus?: 'FAILED' | 'EXPIRED';
  terminalArtifactId?: string;
  failureCode?: string;
}>;

/**
 * Stable compatibility surface shared by bounded HTTP and Automation callers.
 * Implementations may route durable legacy continuations or generalized AEE
 * admitted graphs, but callers receive no authority to select that route.
 */
export interface BoundedAgentExecutionPort {
  start(command: BoundedAgentStartCommand, auth: AuthenticatedScope): Promise<BoundedAgentWorkflowView>;
  resume(executionId: string, projectId: string, auth: AuthenticatedScope): Promise<BoundedAgentWorkflowView>;
  submitLocalResult(executionId: string, projectId: string, auth: AuthenticatedScope, result: unknown): Promise<BoundedAgentWorkflowView>;
  retry(executionId: string, projectId: string, auth: AuthenticatedScope): Promise<BoundedAgentWorkflowView>;
  cancel(executionId: string, projectId: string, auth: AuthenticatedScope): Promise<BoundedAgentWorkflowView>;
}
