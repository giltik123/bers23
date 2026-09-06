import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { ExecutionRun, ExecutionRunRegistry } from '../execution/executionRunRegistry.ts';
import {
  LOCAL_COMPOSITE_CONTINUATION_STEPS,
  type LocalCompositeContinuationService,
  type LocalCompositeContinuationView,
  type LocalCompositeStartCommand,
} from './LocalCompositeContinuationService.ts';
import type { WorkflowContinuationSnapshot, WorkflowContinuationStore } from './WorkflowContinuationStore.ts';

export type LocalCompositeContinuationPort = Pick<
  LocalCompositeContinuationService,
  'start' | 'resume' | 'submitLocalResult'
>;

type ContinuationReader = Pick<WorkflowContinuationStore, 'get' | 'getByClientRequestId'>;
type ExecutionRunProjectionInput = Readonly<{
  delegate: LocalCompositeContinuationPort;
  continuations: ContinuationReader;
  runs: ExecutionRunRegistry;
}>;

const CHILD_LIMIT = 8;
const SEGMENT_STEP = LOCAL_COMPOSITE_CONTINUATION_STEPS.segment;
const BACKGROUND_STEP = LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation;

/**
 * Production projection boundary between durable WorkflowContinuation authority
 * and the canonical ExecutionRun index. The continuation remains execution
 * authority; runs are recoverable, monotonic projections only.
 *
 * D2 pre-reconciles an already-outstanding LOCAL ticket before delegate
 * advancement. That closes the crash window in which a delegate can consume the
 * ticket and terminalize the continuation (clearing outstandingLocal) before the
 * ticket becomes a durable child run. ExecutionRun state never redispatches work.
 */
export class ExecutionRunBoundLocalCompositeContinuationService implements LocalCompositeContinuationPort {
  private readonly input: ExecutionRunProjectionInput;

  constructor(input: ExecutionRunProjectionInput) {
    this.input = input;
  }

  async start(command: LocalCompositeStartCommand, scope: Scope): Promise<LocalCompositeContinuationView> {
    await this.preReconcile(await this.input.continuations.getByClientRequestId(scope, command.clientRequestId));
    const view = await this.input.delegate.start(command, scope);
    await this.reconcile(view.executionId, scope);
    return view;
  }

  async resume(executionId: string, scope: Scope): Promise<LocalCompositeContinuationView> {
    await this.preReconcile(await this.input.continuations.get(executionId, scope));
    const view = await this.input.delegate.resume(executionId, scope);
    await this.reconcile(view.executionId, scope);
    return view;
  }

  async submitLocalResult(executionId: string, scope: Scope, result: unknown): Promise<LocalCompositeContinuationView> {
    await this.preReconcile(await this.input.continuations.get(executionId, scope));
    const view = await this.input.delegate.submitLocalResult(executionId, scope, result);
    await this.reconcile(view.executionId, scope);
    return view;
  }

  private async preReconcile(snapshot: WorkflowContinuationSnapshot | undefined): Promise<void> {
    if (snapshot?.state === 'WAITING_FOR_LOCAL_RESULT') await projectWorkflowContinuationRun(this.input.runs, snapshot);
  }

  private async reconcile(executionId: string, scope: Scope): Promise<void> {
    const snapshot = await this.input.continuations.get(executionId, scope);
    if (!snapshot) throw projectionError('workflow_execution_run_snapshot_missing', 'Durable workflow continuation is unavailable for ExecutionRun projection');
    await projectWorkflowContinuationRun(this.input.runs, snapshot);
  }
}

export async function projectWorkflowContinuationRun(
  runs: ExecutionRunRegistry,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  const issued = await runs.issue({
    scope: snapshot.scope,
    capability: 'WORKFLOW_CONTINUATION',
    idempotencyKey: snapshot.clientRequestId,
    authorityKind: 'WORKFLOW_CONTINUATION',
    authorityRef: snapshot.executionId,
  });
  const preparedParent = await prepareParentRun(runs, issued.run, snapshot);
  await projectLocalChildren(runs, preparedParent, snapshot);
  return finalizeParentRun(runs, preparedParent, snapshot);
}

async function prepareParentRun(
  runs: ExecutionRunRegistry,
  run: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  if (snapshot.state === 'READY') {
    if (run.status === 'QUEUED') return run;
    throw stateConflict(run, snapshot);
  }
  if (snapshot.state === 'CANCELLED') {
    if (run.status === 'QUEUED' || run.status === 'RUNNING' || run.status === 'CANCELLED') return run;
    throw stateConflict(run, snapshot);
  }
  const matchingTerminal = (snapshot.state === 'SUCCESS' && run.status === 'SUCCEEDED')
    || (snapshot.state === 'FAILED' && run.status === 'FAILED')
    || (snapshot.state === 'UNKNOWN' && run.status === 'UNKNOWN');
  if (matchingTerminal) return run;
  return ensureRunning(runs, run, snapshot);
}

async function finalizeParentRun(
  runs: ExecutionRunRegistry,
  run: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  switch (snapshot.state) {
    case 'READY':
    case 'WAITING_FOR_LOCAL_RESULT':
    case 'RUNNING_INTERNAL':
      return run;
    case 'SUCCESS':
      return run.status === 'SUCCEEDED' ? run : runs.succeed(run.scope, run.runId);
    case 'FAILED':
      return runs.fail(run.scope, run.runId, requiredFailureCode(snapshot));
    case 'CANCELLED':
      return runs.cancel(run.scope, run.runId, snapshot.failureCode ?? 'WORKFLOW_CANCELLED');
    case 'UNKNOWN':
      return runs.markUnknown(run.scope, run.runId, requiredFailureCode(snapshot));
  }
}

async function projectLocalChildren(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<void> {
  let children = await runs.listChildren(parent.scope, parent.runId, CHILD_LIMIT);
  validateChildSet(parent, children);

  // A terminal D1-era continuation can have no D2 child topology at all. Do not
  // invent historical ticket execution after the fact. New D2 executions create
  // their child before delegate terminalization through pre-reconciliation.
  if (isTerminalSnapshot(snapshot) && children.length === 0) return;

  for (const completed of snapshot.completedSteps) {
    if (isAcceptedLocalStep(completed.stepId)) {
      if (!completed.ticketId) throw projectionError('workflow_child_run_ticket_missing', `Completed local step ${completed.stepId} has no durable ticket binding`);
      await projectSucceededChild(runs, parent, completed.stepId, completed.ticketId, snapshot);
    } else if (completed.ticketId) {
      throw projectionError('workflow_child_run_step_contract', `Non-local workflow step ${completed.stepId} cannot own a LOCAL_EXECUTION child`);
    }
  }

  if (snapshot.outstandingLocal) {
    const stepId = requireAcceptedLocalStep(snapshot.outstandingLocal.stepId);
    if (snapshot.currentStepId !== stepId) throw projectionError('workflow_child_run_step_contract', 'Outstanding local ticket does not match current workflow step');
    await projectRunningChild(runs, parent, stepId, snapshot.outstandingLocal.ticketId, snapshot);
  } else if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
    throw projectionError('workflow_child_run_ticket_missing', 'Waiting workflow continuation has no durable local ticket binding');
  }

  if (!isTerminalSnapshot(snapshot)) return;
  children = await runs.listChildren(parent.scope, parent.runId, CHILD_LIMIT);
  validateChildSet(parent, children);
  const completedTicketIds = new Set(snapshot.completedSteps.flatMap(step => step.ticketId ? [step.ticketId] : []));
  const unresolved = children.filter(child => !completedTicketIds.has(child.authorityRef));
  if (unresolved.length > 1) throw projectionError('workflow_child_run_active_conflict', 'Workflow continuation has more than one unresolved LOCAL_EXECUTION child');
  if (unresolved.length === 0) return;

  const child = unresolved[0];
  const stepId = childStepFromRun(parent, child);
  if (snapshot.state === 'SUCCESS') {
    throw projectionError('workflow_child_run_state_conflict', 'Successful workflow continuation cannot retain an unresolved LOCAL_EXECUTION child');
  }
  if (snapshot.state === 'FAILED') {
    const reason = requiredFailureCode(snapshot);
    assertLocalTerminalReason(stepId, reason, 'FAILED');
    if (child.status === 'FAILED') {
      await runs.fail(child.scope, child.runId, reason);
      return;
    }
    if (child.status !== 'QUEUED' && child.status !== 'RUNNING') throw childStateConflict(child, snapshot, stepId);
    const running = await ensureChildRunning(runs, child, snapshot);
    await runs.fail(running.scope, running.runId, reason);
    return;
  }
  if (snapshot.state === 'UNKNOWN') {
    const reason = requiredFailureCode(snapshot);
    assertLocalTerminalReason(stepId, reason, 'UNKNOWN');
    if (child.status === 'UNKNOWN') {
      await runs.markUnknown(child.scope, child.runId, reason);
      return;
    }
    if (child.status !== 'QUEUED' && child.status !== 'RUNNING') throw childStateConflict(child, snapshot, stepId);
    const running = await ensureChildRunning(runs, child, snapshot);
    await runs.markUnknown(running.scope, running.runId, reason);
    return;
  }
  const reason = snapshot.failureCode ?? 'WORKFLOW_CANCELLED';
  if (child.status === 'CANCELLED') {
    await runs.cancel(child.scope, child.runId, reason);
    return;
  }
  if (child.status !== 'QUEUED' && child.status !== 'RUNNING') throw childStateConflict(child, snapshot, stepId);
  await runs.cancel(child.scope, child.runId, reason);
}

async function projectRunningChild(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  stepId: string,
  ticketId: string,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  const child = await issueChild(runs, parent, stepId, ticketId);
  if (child.status === 'RUNNING') return child;
  if (child.status !== 'QUEUED') throw childStateConflict(child, snapshot, stepId);
  return runs.start(child.scope, child.runId);
}

async function projectSucceededChild(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  stepId: string,
  ticketId: string,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  const child = await issueChild(runs, parent, stepId, ticketId);
  if (child.status === 'SUCCEEDED') return child;
  const running = await ensureChildRunning(runs, child, snapshot);
  return runs.succeed(running.scope, running.runId);
}

async function issueChild(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  stepIdValue: string,
  ticketId: string,
): Promise<ExecutionRun> {
  const stepId = requireAcceptedLocalStep(stepIdValue);
  const issued = await runs.issue({
    scope: parent.scope,
    capability: 'LOCAL_EXECUTION',
    idempotencyKey: childIdempotencyKey(parent.runId, stepId),
    authorityKind: 'LOCAL_EXECUTION_TICKET',
    authorityRef: ticketId,
    parentRunId: parent.runId,
  });
  return issued.run;
}

async function ensureRunning(
  runs: ExecutionRunRegistry,
  run: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  if (run.status === 'RUNNING') return run;
  if (run.status === 'QUEUED') return runs.start(run.scope, run.runId);
  throw stateConflict(run, snapshot);
}

async function ensureChildRunning(
  runs: ExecutionRunRegistry,
  child: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  if (child.status === 'RUNNING') return child;
  if (child.status === 'QUEUED') return runs.start(child.scope, child.runId);
  throw childStateConflict(child, snapshot, childStepFromIdempotency(child));
}

function validateChildSet(parent: ExecutionRun, children: readonly ExecutionRun[]): void {
  if (children.length > 2) throw projectionError('workflow_child_run_topology_conflict', 'Accepted local composite can have at most two LOCAL_EXECUTION children');
  for (const child of children) {
    if (child.parentRunId !== parent.runId || child.capability !== 'LOCAL_EXECUTION' || child.authorityKind !== 'LOCAL_EXECUTION_TICKET') {
      throw projectionError('workflow_child_run_topology_conflict', 'ExecutionRun child is outside the accepted local-step topology');
    }
    childStepFromRun(parent, child);
  }
}

function childStepFromRun(parent: ExecutionRun, child: ExecutionRun): string {
  for (const stepId of [SEGMENT_STEP, BACKGROUND_STEP]) {
    if (child.idempotencyKey === childIdempotencyKey(parent.runId, stepId)) return stepId;
  }
  throw projectionError('workflow_child_run_topology_conflict', 'LOCAL_EXECUTION child idempotency is not bound to an accepted workflow step');
}

function childStepFromIdempotency(child: ExecutionRun): string {
  if (!child.parentRunId) throw projectionError('workflow_child_run_topology_conflict', 'LOCAL_EXECUTION child has no parent run');
  for (const stepId of [SEGMENT_STEP, BACKGROUND_STEP]) {
    if (child.idempotencyKey === childIdempotencyKey(child.parentRunId, stepId)) return stepId;
  }
  throw projectionError('workflow_child_run_topology_conflict', 'LOCAL_EXECUTION child idempotency is not bound to an accepted workflow step');
}

function childIdempotencyKey(parentRunId: string, stepId: string): string {
  return `workflow-child:${parentRunId}:${stepId}`;
}

function isAcceptedLocalStep(stepId: string): boolean {
  return stepId === SEGMENT_STEP || stepId === BACKGROUND_STEP;
}

function requireAcceptedLocalStep(stepId: string): string {
  if (!isAcceptedLocalStep(stepId)) throw projectionError('workflow_child_run_step_contract', `Workflow step ${stepId} is not an accepted LOCAL_EXECUTION child step`);
  return stepId;
}

function assertLocalTerminalReason(stepId: string, reason: string, suffix: 'FAILED' | 'UNKNOWN'): void {
  const expected = stepId === SEGMENT_STEP ? `LOCAL_SEGMENTATION_${suffix}` : `LOCAL_BACKGROUND_ISOLATION_${suffix}`;
  if (reason !== expected) throw projectionError('workflow_child_run_reason_conflict', `Local child ${stepId} cannot terminate with workflow reason ${reason}`);
}

function requiredFailureCode(snapshot: WorkflowContinuationSnapshot): string {
  if (!snapshot.failureCode) throw projectionError('workflow_execution_run_failure_code_missing', `${snapshot.state} continuation has no durable failure code`);
  return snapshot.failureCode;
}

function isTerminalSnapshot(snapshot: WorkflowContinuationSnapshot): boolean {
  return snapshot.state === 'SUCCESS' || snapshot.state === 'FAILED' || snapshot.state === 'CANCELLED' || snapshot.state === 'UNKNOWN';
}

function stateConflict(run: ExecutionRun, snapshot: WorkflowContinuationSnapshot) {
  return projectionError(
    'workflow_execution_run_state_conflict',
    `ExecutionRun ${run.status} cannot represent workflow continuation ${snapshot.state}`,
  );
}

function childStateConflict(child: ExecutionRun, snapshot: WorkflowContinuationSnapshot, stepId: string) {
  return projectionError(
    'workflow_child_run_state_conflict',
    `LOCAL_EXECUTION child ${stepId} is ${child.status} while workflow continuation is ${snapshot.state}`,
  );
}

function projectionError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
