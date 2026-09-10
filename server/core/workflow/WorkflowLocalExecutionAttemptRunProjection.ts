import { createHash } from 'node:crypto';
import type { ExecutionRun, ExecutionRunRegistry } from '../execution/executionRunRegistry.ts';

const CHILD_LIMIT = 200;
const RETRY_REASON = 'LOCAL_EXECUTION_RETRIED';

export type WorkflowLocalExecutionAttemptTarget = 'RUNNING' | 'SUCCEEDED';
export type WorkflowLocalExecutionAttemptProjectionInput = Readonly<{
  runs: ExecutionRunRegistry;
  parent: ExecutionRun;
  acceptedStepIds: readonly string[];
  stepId: string;
  ticketId: string;
  target: WorkflowLocalExecutionAttemptTarget;
}>;
export type WorkflowLocalExecutionAttemptQuery = Readonly<{
  runs: ExecutionRunRegistry;
  parent: ExecutionRun;
  acceptedStepIds: readonly string[];
  stepId: string;
}>;

/**
 * Observation-only query over the canonical LOCAL_EXECUTION attempt projection.
 * Retry budgets can therefore be derived from ExecutionRun history without
 * adding a second retry counter to WorkflowContinuation or another state store.
 */
export async function listWorkflowLocalExecutionAttempts(input: WorkflowLocalExecutionAttemptQuery): Promise<readonly ExecutionRun[]> {
  const parent = requireWorkflowParent(input.parent);
  const stepIds = normalizeAcceptedSteps(input.acceptedStepIds);
  const stepId = acceptedStep(input.stepId, stepIds);
  const children = await input.runs.listChildren(parent.scope, parent.runId, CHILD_LIMIT);
  if (children.length >= CHILD_LIMIT) throw projectionError('workflow_local_attempt_history_limit', 'Workflow local attempt history reached the projection safety limit');
  return Object.freeze(children
    .filter(child => child.capability === 'LOCAL_EXECUTION' && child.parentRunId === parent.runId)
    .filter(child => localAttemptStep(parent, child, stepIds) === stepId));
}

/**
 * Observation-only projection for one durable workflow LOCAL_EXECUTION attempt.
 *
 * The caller must already own the canonical WORKFLOW_CONTINUATION parent. This
 * helper cannot issue a workflow root and never dispatches execution. A retry is
 * represented by a new immutable child bound to the replacement ticket, while
 * an older active attempt is terminalized as historical RETRIED observation.
 */
export async function projectWorkflowLocalExecutionAttempt(input: WorkflowLocalExecutionAttemptProjectionInput): Promise<ExecutionRun> {
  const parent = requireWorkflowParent(input.parent);
  const stepIds = normalizeAcceptedSteps(input.acceptedStepIds);
  const stepId = acceptedStep(input.stepId, stepIds);
  const ticketId = token(input.ticketId, 'ticketId');
  if (input.target !== 'RUNNING' && input.target !== 'SUCCEEDED') throw projectionError('workflow_local_attempt_target_invalid', 'Local attempt projection target is invalid');

  const attempts = await listWorkflowLocalExecutionAttempts({ runs: input.runs, parent, acceptedStepIds: [...stepIds], stepId });
  const exact = attempts.find(child => child.authorityKind === 'LOCAL_EXECUTION_TICKET' && child.authorityRef === ticketId);
  if (exact) return transitionTarget(input.runs, exact, input.target, stepId);

  await retireSupersededAttempts(input.runs, attempts, stepId);
  const idempotencyKey = attempts.length === 0
    ? firstAttemptIdempotencyKey(parent.runId, stepId)
    : retryAttemptIdempotencyKey(parent.runId, stepId, ticketId);
  const issued = await input.runs.issue({
    scope: parent.scope,
    capability: 'LOCAL_EXECUTION',
    idempotencyKey,
    authorityKind: 'LOCAL_EXECUTION_TICKET',
    authorityRef: ticketId,
    parentRunId: parent.runId,
  });
  assertAttemptBinding(parent, issued.run, stepId, ticketId, attempts.length === 0);
  return transitionTarget(input.runs, issued.run, input.target, stepId);
}

async function retireSupersededAttempts(runs: ExecutionRunRegistry, attempts: readonly ExecutionRun[], stepId: string): Promise<void> {
  for (const child of attempts) {
    if (child.status === 'SUCCEEDED') throw projectionError('workflow_local_attempt_retry_conflict', `Succeeded local attempt for ${stepId} cannot be superseded`);
    if (child.status === 'UNKNOWN') throw projectionError('workflow_local_attempt_retry_conflict', `UNKNOWN local attempt for ${stepId} must be reconciled before retry`);
    if (child.status === 'FAILED' || child.status === 'CANCELLED') continue;
    const running = child.status === 'QUEUED' ? await runs.start(child.scope, child.runId) : child;
    if (running.status !== 'RUNNING') throw projectionError('workflow_local_attempt_state_conflict', `Superseded local attempt for ${stepId} is ${running.status}`);
    await runs.fail(running.scope, running.runId, RETRY_REASON);
  }
}

async function transitionTarget(runs: ExecutionRunRegistry, child: ExecutionRun, target: WorkflowLocalExecutionAttemptTarget, stepId: string): Promise<ExecutionRun> {
  if (target === 'RUNNING') {
    if (child.status === 'RUNNING') return child;
    if (child.status !== 'QUEUED') throw projectionError('workflow_local_attempt_state_conflict', `Local attempt for ${stepId} is ${child.status}, not RUNNING/QUEUED`);
    return runs.start(child.scope, child.runId);
  }
  if (child.status === 'SUCCEEDED') return child;
  if (child.status !== 'QUEUED' && child.status !== 'RUNNING') throw projectionError('workflow_local_attempt_state_conflict', `Local attempt for ${stepId} cannot succeed from ${child.status}`);
  const running = child.status === 'RUNNING' ? child : await runs.start(child.scope, child.runId);
  return runs.succeed(running.scope, running.runId);
}

function localAttemptStep(parent: ExecutionRun, child: ExecutionRun, accepted: ReadonlySet<string>): string {
  if (child.capability !== 'LOCAL_EXECUTION' || child.authorityKind !== 'LOCAL_EXECUTION_TICKET' || child.parentRunId !== parent.runId) {
    throw projectionError('workflow_local_attempt_binding_conflict', 'ExecutionRun is not a LOCAL_EXECUTION ticket child of the supplied workflow parent');
  }
  for (const stepId of accepted) {
    if (child.idempotencyKey === firstAttemptIdempotencyKey(parent.runId, stepId)) return stepId;
    if (child.idempotencyKey === retryAttemptIdempotencyKey(parent.runId, stepId, child.authorityRef)) return stepId;
  }
  throw projectionError('workflow_local_attempt_binding_conflict', 'LOCAL_EXECUTION child idempotency is outside the accepted workflow step set');
}

function assertAttemptBinding(parent: ExecutionRun, child: ExecutionRun, stepId: string, ticketId: string, first: boolean): void {
  const expectedKey = first ? firstAttemptIdempotencyKey(parent.runId, stepId) : retryAttemptIdempotencyKey(parent.runId, stepId, ticketId);
  if (child.scope.tenantId !== parent.scope.tenantId || child.scope.userId !== parent.scope.userId || child.scope.projectId !== parent.scope.projectId
    || child.capability !== 'LOCAL_EXECUTION' || child.authorityKind !== 'LOCAL_EXECUTION_TICKET' || child.authorityRef !== ticketId
    || child.parentRunId !== parent.runId || child.idempotencyKey !== expectedKey) {
    throw projectionError('workflow_local_attempt_binding_conflict', 'Issued LOCAL_EXECUTION attempt does not match the exact workflow/ticket binding');
  }
}

function requireWorkflowParent(parent: ExecutionRun): ExecutionRun {
  if (!parent || parent.capability !== 'WORKFLOW_CONTINUATION' || parent.authorityKind !== 'WORKFLOW_CONTINUATION' || parent.parentRunId) {
    throw projectionError('workflow_local_attempt_parent_invalid', 'Local attempt projection requires one canonical WORKFLOW_CONTINUATION root');
  }
  if (parent.status !== 'RUNNING') throw projectionError('workflow_local_attempt_parent_state', `Workflow parent must be RUNNING while local work is active, found ${parent.status}`);
  return parent;
}

function normalizeAcceptedSteps(values: readonly string[]): ReadonlySet<string> {
  if (!Array.isArray(values) || values.length < 1) throw projectionError('workflow_local_attempt_step_invalid', 'At least one accepted workflow local step is required');
  const normalized = values.map((value, index) => token(value, `acceptedStepIds[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw projectionError('workflow_local_attempt_step_invalid', 'Accepted workflow local steps must be unique');
  return new Set(normalized);
}
function acceptedStep(value: string, accepted: ReadonlySet<string>): string {
  const stepId = token(value, 'stepId');
  if (!accepted.has(stepId)) throw projectionError('workflow_local_attempt_step_invalid', `Workflow local step ${stepId} is not admitted by this projection contract`);
  return stepId;
}

export function firstAttemptIdempotencyKey(parentRunId: string, stepId: string): string {
  return `workflow-child:${token(parentRunId, 'parentRunId')}:${token(stepId, 'stepId')}`;
}
export function retryAttemptIdempotencyKey(parentRunId: string, stepId: string, ticketId: string): string {
  const digest = createHash('sha256').update(token(ticketId, 'ticketId')).digest('hex').slice(0, 32);
  return `workflow-child-retry:${token(parentRunId, 'parentRunId')}:${token(stepId, 'stepId')}:${digest}`;
}

function token(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw projectionError('workflow_local_attempt_binding_invalid', `${field} is required`);
  return value.trim();
}
function projectionError(code: string, message: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }
