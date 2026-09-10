import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { BoundedAgentExecutionPort, BoundedAgentWorkflowView } from '../workflow/BoundedAgentExecutionPort.ts';
import type {
  AutomationInvocationBinding,
  AutomationInvocationBindCommand,
  PostgresAutomationInvocationStore,
} from './PostgresAutomationInvocationStore.ts';

export type AutomationManualExecutionView = Readonly<{
  invocationId: string;
  automationId: string;
  definitionRevision: number;
  projectId: string;
  executionId: string;
  revision: number;
  state: BoundedAgentWorkflowView['state'];
  nextAction?: BoundedAgentWorkflowView['nextAction'];
  retryAvailable?: boolean;
  attemptStatus?: BoundedAgentWorkflowView['attemptStatus'];
  terminalArtifactId?: string;
  failureCode?: string;
}>;

type InvocationPort = Pick<PostgresAutomationInvocationStore, 'bind' | 'get'>;
type AgentPort = Pick<BoundedAgentExecutionPort, 'start' | 'submitLocalResult' | 'retry' | 'cancel'>;
type SourceArtifactAuthority = Readonly<{
  issueStoredOriginal(storageId: string, scope: Readonly<{ tenantId: string; userId: string; projectId: string }>): string;
  issueStoredFinal(storageId: string, scope: Readonly<{ tenantId: string; userId: string; projectId: string }>): string;
}>;

export type AutomationManualExecutionDependencies = Readonly<{
  invocations: InvocationPort;
  agent: AgentPort;
  artifacts: SourceArtifactAuthority;
}>;

/**
 * C3b owns only immutable Automation invocation binding and delegation.
 * WorkflowContinuation + ExecutionRun remain the sole execution-state authorities.
 */
export class AutomationManualExecutionService {
  constructor(private readonly dependencies: AutomationManualExecutionDependencies) {}

  async start(command: AutomationInvocationBindCommand, authInput: AuthenticatedScope): Promise<AutomationManualExecutionView> {
    const auth = normalizeAuth(authInput);
    const binding = await this.dependencies.invocations.bind(auth, command);
    return this.delegateStart(binding, auth);
  }

  async resume(invocationId: string, authInput: AuthenticatedScope): Promise<AutomationManualExecutionView> {
    const auth = normalizeAuth(authInput);
    const binding = await this.requireBinding(invocationId, auth);
    return this.delegateStart(binding, auth);
  }

  async submitLocalResult(invocationId: string, authInput: AuthenticatedScope, result: unknown): Promise<AutomationManualExecutionView> {
    const auth = normalizeAuth(authInput);
    const binding = await this.requireBinding(invocationId, auth);
    const current = await this.delegateStart(binding, auth);
    const view = await this.dependencies.agent.submitLocalResult(current.executionId, binding.projectId, auth, result);
    return publicView(binding, view);
  }

  async retry(invocationId: string, authInput: AuthenticatedScope): Promise<AutomationManualExecutionView> {
    const auth = normalizeAuth(authInput);
    const binding = await this.requireBinding(invocationId, auth);
    const current = await this.delegateStart(binding, auth);
    const view = await this.dependencies.agent.retry(current.executionId, binding.projectId, auth);
    return publicView(binding, view);
  }

  async cancel(invocationId: string, authInput: AuthenticatedScope): Promise<AutomationManualExecutionView> {
    const auth = normalizeAuth(authInput);
    const binding = await this.requireBinding(invocationId, auth);
    const current = await this.delegateStart(binding, auth);
    const view = await this.dependencies.agent.cancel(current.executionId, binding.projectId, auth);
    return publicView(binding, view);
  }

  private async delegateStart(binding: AutomationInvocationBinding, auth: AuthenticatedScope): Promise<AutomationManualExecutionView> {
    const scope = Object.freeze({ ...auth, projectId: binding.projectId });
    const sourceArtifactId = binding.sourceRole === 'ORIGINAL'
      ? this.dependencies.artifacts.issueStoredOriginal(binding.sourceImageStorageId, scope)
      : this.dependencies.artifacts.issueStoredFinal(binding.sourceImageStorageId, scope);
    const view = await this.dependencies.agent.start(Object.freeze({
      clientRequestId: binding.downstreamClientRequestId,
      projectId: binding.projectId,
      sourceArtifactId,
      mode: binding.plan.orthogonalMode,
      width: binding.plan.targetWidth,
      height: binding.plan.targetHeight,
    }), auth);
    return publicView(binding, view);
  }

  private async requireBinding(invocationIdInput: string, auth: AuthenticatedScope): Promise<AutomationInvocationBinding> {
    const invocationId = token(invocationIdInput, 'invocationId');
    const binding = await this.dependencies.invocations.get(auth, invocationId);
    if (!binding) throw serviceError(404, 'automation_invocation_not_found', 'Automation invocation was not found in authenticated scope');
    return binding;
  }
}

function publicView(binding: AutomationInvocationBinding, view: BoundedAgentWorkflowView): AutomationManualExecutionView {
  return Object.freeze({
    invocationId: binding.invocationId,
    automationId: binding.automationId,
    definitionRevision: binding.definitionRevision,
    projectId: binding.projectId,
    executionId: view.executionId,
    revision: view.revision,
    state: view.state,
    nextAction: view.nextAction,
    retryAvailable: view.retryAvailable,
    attemptStatus: view.attemptStatus,
    terminalArtifactId: view.terminalArtifactId,
    failureCode: view.failureCode,
  });
}

function normalizeAuth(auth: AuthenticatedScope): AuthenticatedScope {
  const tenantId = token(auth?.tenantId, 'tenantId');
  const userId = token(auth?.userId, 'userId');
  return Object.freeze({ tenantId, userId });
}
function token(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw serviceError(400, 'invalid_automation_manual_execution_request', `${field} is invalid`);
  }
  return normalized;
}
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
