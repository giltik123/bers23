import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { ExecutionRun, ExecutionRunRegistry } from '../execution/executionRunRegistry.ts';
import {
  LOCAL_COMPOSITE_CONTINUATION_STEPS,
  type LocalCompositeContinuationService,
  type LocalCompositeContinuationView,
  type LocalCompositeInternalVerifier,
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
type InternalVerifierProjectionInput = Readonly<{
  delegate: LocalCompositeInternalVerifier;
  continuations: Pick<WorkflowContinuationStore, 'get'>;
  runs: ExecutionRunRegistry;
}>;
type InternalVerifyInput = Parameters<LocalCompositeInternalVerifier['verify']>[0];

const CHILD_LIMIT = 8;
const SEGMENT_STEP = LOCAL_COMPOSITE_CONTINUATION_STEPS.segment;
const BACKGROUND_STEP = LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation;
const VERIFY_STEP = LOCAL_COMPOSITE_CONTINUATION_STEPS.verify;

/**
 * Production projection boundary between durable WorkflowContinuation authority
 * and the canonical ExecutionRun index. The continuation remains execution
 * authority; runs are recoverable, monotonic projections only.
 *
 * D2 pre-reconciles already-outstanding LOCAL work before delegate advancement.
 * D3 also pre-reconciles RUNNING_INTERNAL so the exact server-owned verify child
 * is durable before a verifier retry. ExecutionRun state never redispatches work.
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
    if (snapshot?.state === 'WAITING_FOR_LOCAL_RESULT' || snapshot?.state === 'RUNNING_INTERNAL') {
      await projectWorkflowContinuationRun(this.input.runs, snapshot);
    }
  }

  private async reconcile(executionId: string, scope: Scope): Promise<void> {
    const snapshot = await this.input.continuations.get(executionId, scope);
    if (!snapshot) throw projectionError('workflow_execution_run_snapshot_missing', 'Durable workflow continuation is unavailable for ExecutionRun projection');
    await projectWorkflowContinuationRun(this.input.runs, snapshot);
  }
}

/**
 * D3 boundary placed immediately before the accepted server-owned verifier.
 * It proves the durable RUNNING_INTERNAL continuation and creates/reuses the
 * verify child before verifier side effects. Verifier return is not terminal
 * authority; only a later durable completed-step binding may succeed the child.
 */
export class ExecutionRunBoundLocalCompositeInternalVerifier implements LocalCompositeInternalVerifier {
  private readonly input: InternalVerifierProjectionInput;

  constructor(input: InternalVerifierProjectionInput) {
    this.input = input;
  }

  async verify(request: InternalVerifyInput): Promise<void> {
    const snapshot = await this.input.continuations.get(request.executionId, request.scope);
    if (!snapshot) throw projectionError('workflow_internal_run_snapshot_missing', 'Durable workflow continuation is unavailable before INTERNAL verification');
    assertInternalVerifyInvocation(snapshot, request);
    await projectWorkflowContinuationRun(this.input.runs, snapshot);
    await this.input.delegate.verify(request);
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
  await projectInternalVerifyChild(runs, preparedParent, snapshot);
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
  let allChildren = await runs.listChildren(parent.scope, parent.runId, CHILD_LIMIT);
  validateChildSet(parent, allChildren);
  let children = localChildren(allChildren);

  // A terminal D1-era continuation can have no D2 child topology at all. Do not
  // invent historical ticket execution after the fact. New D2 executions create
  // their child before delegate terminalization through pre-reconciliation.
  if (isTerminalSnapshot(snapshot) && children.length === 0) return;

  for (const completed of snapshot.completedSteps) {
    if (isAcceptedLocalStep(completed.stepId)) {
      if (!completed.ticketId) throw projectionError('workflow_child_run_ticket_missing', `Completed local step ${completed.stepId} has no durable ticket binding`);
      await projectSucceededLocalChild(runs, parent, completed.stepId, completed.ticketId, snapshot);
    } else if (completed.ticketId) {
      throw projectionError('workflow_child_run_step_contract', `Non-local workflow step ${completed.stepId} cannot own a LOCAL_EXECUTION child`);
    }
  }

  if (snapshot.outstandingLocal) {
    const stepId = requireAcceptedLocalStep(snapshot.outstandingLocal.stepId);
    if (snapshot.currentStepId !== stepId) throw projectionError('workflow_child_run_step_contract', 'Outstanding local ticket does not match current workflow step');
    await projectRunningLocalChild(runs, parent, stepId, snapshot.outstandingLocal.ticketId, snapshot);
  } else if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
    throw projectionError('workflow_child_run_ticket_missing', 'Waiting workflow continuation has no durable local ticket binding');
  }

  if (!isTerminalSnapshot(snapshot)) return;
  allChildren = await runs.listChildren(parent.scope, parent.runId, CHILD_LIMIT);
  validateChildSet(parent, allChildren);
  children = localChildren(allChildren);
  const completedTicketIds = new Set(snapshot.completedSteps.flatMap(step => step.ticketId ? [step.ticketId] : []));
  const unresolved = children.filter(child => !completedTicketIds.has(child.authorityRef));
  if (unresolved.length > 1) throw projectionError('workflow_child_run_active_conflict', 'Workflow continuation has more than one unresolved LOCAL_EXECUTION child');
  if (unresolved.length === 0) return;

  const child = unresolved[0];
  const stepId = localChildStepFromRun(parent, child);
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
    if (child.status !== 'QUEUED' && child.status !== 'RUNNING') throw localChildStateConflict(child, snapshot, stepId);
    const running = await ensureLocalChildRunning(runs, child, snapshot);
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
    if (child.status !== 'QUEUED' && child.status !== 'RUNNING') throw localChildStateConflict(child, snapshot, stepId);
    const running = await ensureLocalChildRunning(runs, child, snapshot);
    await runs.markUnknown(running.scope, running.runId, reason);
    return;
  }
  const reason = snapshot.failureCode ?? 'WORKFLOW_CANCELLED';
  if (child.status === 'CANCELLED') {
    await runs.cancel(child.scope, child.runId, reason);
    return;
  }
  if (child.status !== 'QUEUED' && child.status !== 'RUNNING') throw localChildStateConflict(child, snapshot, stepId);
  await runs.cancel(child.scope, child.runId, reason);
}

async function projectInternalVerifyChild(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<void> {
  const allChildren = await runs.listChildren(parent.scope, parent.runId, CHILD_LIMIT);
  validateChildSet(parent, allChildren);
  const existing = internalChildren(allChildren)[0];
  const completed = snapshot.completedSteps.find(step => step.stepId === VERIFY_STEP);

  if (completed) {
    if (completed.ticketId) throw projectionError('workflow_internal_child_step_contract', 'INTERNAL verify completed-step binding cannot contain a local ticket');
    if (!existing) return; // Historical pre-D3 terminal truth must not be fabricated.
    if (existing.status === 'SUCCEEDED') return;
    if (existing.status !== 'QUEUED' && existing.status !== 'RUNNING') throw internalChildStateConflict(existing, snapshot);
    const running = await ensureInternalChildRunning(runs, existing, snapshot);
    await runs.succeed(running.scope, running.runId);
    return;
  }

  if (snapshot.state === 'RUNNING_INTERNAL') {
    assertRunningInternalVerifySnapshot(snapshot);
    const child = existing ?? await issueInternalVerifyChild(runs, parent, snapshot);
    if (child.status === 'RUNNING') return;
    if (child.status !== 'QUEUED') throw internalChildStateConflict(child, snapshot);
    await runs.start(child.scope, child.runId);
    return;
  }

  if (!existing) return;
  if (snapshot.state === 'CANCELLED') {
    const reason = snapshot.failureCode ?? 'WORKFLOW_CANCELLED';
    if (existing.status === 'CANCELLED') {
      await runs.cancel(existing.scope, existing.runId, reason);
      return;
    }
    if (existing.status !== 'QUEUED' && existing.status !== 'RUNNING') throw internalChildStateConflict(existing, snapshot);
    await runs.cancel(existing.scope, existing.runId, reason);
    return;
  }
  if (snapshot.state === 'FAILED' || snapshot.state === 'UNKNOWN') {
    throw projectionError('workflow_internal_child_terminal_policy_missing', `Durable workflow ${snapshot.state} cannot be projected onto an unresolved INTERNAL verify child without an accepted internal terminal policy`);
  }
  throw internalChildStateConflict(existing, snapshot);
}

async function projectRunningLocalChild(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  stepId: string,
  ticketId: string,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  const child = await issueLocalChild(runs, parent, stepId, ticketId);
  if (child.status === 'RUNNING') return child;
  if (child.status !== 'QUEUED') throw localChildStateConflict(child, snapshot, stepId);
  return runs.start(child.scope, child.runId);
}

async function projectSucceededLocalChild(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  stepId: string,
  ticketId: string,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  const child = await issueLocalChild(runs, parent, stepId, ticketId);
  if (child.status === 'SUCCEEDED') return child;
  const running = await ensureLocalChildRunning(runs, child, snapshot);
  return runs.succeed(running.scope, running.runId);
}

async function issueLocalChild(
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

async function issueInternalVerifyChild(
  runs: ExecutionRunRegistry,
  parent: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  assertRunningInternalVerifySnapshot(snapshot);
  const issued = await runs.issue({
    scope: parent.scope,
    capability: 'WORKFLOW_STEP',
    idempotencyKey: childIdempotencyKey(parent.runId, VERIFY_STEP),
    authorityKind: 'WORKFLOW_INTERNAL_STEP',
    authorityRef: internalAuthorityRef(snapshot.executionId, VERIFY_STEP),
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

async function ensureLocalChildRunning(
  runs: ExecutionRunRegistry,
  child: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  if (child.status === 'RUNNING') return child;
  if (child.status === 'QUEUED') return runs.start(child.scope, child.runId);
  throw localChildStateConflict(child, snapshot, localChildStepFromIdempotency(child));
}

async function ensureInternalChildRunning(
  runs: ExecutionRunRegistry,
  child: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  if (child.status === 'RUNNING') return child;
  if (child.status === 'QUEUED') return runs.start(child.scope, child.runId);
  throw internalChildStateConflict(child, snapshot);
}

function validateChildSet(parent: ExecutionRun, children: readonly ExecutionRun[]): void {
  if (children.length > 3) throw projectionError('workflow_child_run_topology_conflict', 'Accepted local composite can have at most two LOCAL children and one INTERNAL verify child');
  const local = localChildren(children);
  const internal = internalChildren(children);
  if (local.length > 2 || internal.length > 1 || local.length + internal.length !== children.length) {
    throw projectionError('workflow_child_run_topology_conflict', 'ExecutionRun children are outside the accepted local-composite topology');
  }
  const localSteps = new Set<string>();
  for (const child of local) {
    if (child.parentRunId !== parent.runId || child.authorityKind !== 'LOCAL_EXECUTION_TICKET') {
      throw projectionError('workflow_child_run_topology_conflict', 'LOCAL_EXECUTION child is outside the accepted local-step topology');
    }
    const stepId = localChildStepFromRun(parent, child);
    if (localSteps.has(stepId)) throw projectionError('workflow_child_run_topology_conflict', `Duplicate LOCAL_EXECUTION child for ${stepId}`);
    localSteps.add(stepId);
  }
  for (const child of internal) {
    if (child.parentRunId !== parent.runId || child.authorityKind !== 'WORKFLOW_INTERNAL_STEP'
      || child.idempotencyKey !== childIdempotencyKey(parent.runId, VERIFY_STEP)
      || child.authorityRef !== internalAuthorityRef(parent.authorityRef, VERIFY_STEP)) {
      throw projectionError('workflow_child_run_topology_conflict', 'WORKFLOW_STEP child is not the exact accepted INTERNAL verify binding');
    }
  }
}

function localChildren(children: readonly ExecutionRun[]): readonly ExecutionRun[] {
  return children.filter(child => child.capability === 'LOCAL_EXECUTION');
}

function internalChildren(children: readonly ExecutionRun[]): readonly ExecutionRun[] {
  return children.filter(child => child.capability === 'WORKFLOW_STEP');
}

function localChildStepFromRun(parent: ExecutionRun, child: ExecutionRun): string {
  for (const stepId of [SEGMENT_STEP, BACKGROUND_STEP]) {
    if (child.idempotencyKey === childIdempotencyKey(parent.runId, stepId)) return stepId;
  }
  throw projectionError('workflow_child_run_topology_conflict', 'LOCAL_EXECUTION child idempotency is not bound to an accepted workflow step');
}

function localChildStepFromIdempotency(child: ExecutionRun): string {
  if (!child.parentRunId) throw projectionError('workflow_child_run_topology_conflict', 'LOCAL_EXECUTION child has no parent run');
  for (const stepId of [SEGMENT_STEP, BACKGROUND_STEP]) {
    if (child.idempotencyKey === childIdempotencyKey(child.parentRunId, stepId)) return stepId;
  }
  throw projectionError('workflow_child_run_topology_conflict', 'LOCAL_EXECUTION child idempotency is not bound to an accepted workflow step');
}

function childIdempotencyKey(parentRunId: string, stepId: string): string {
  return `workflow-child:${parentRunId}:${stepId}`;
}

function internalAuthorityRef(executionId: string, stepId: string): string {
  return `workflow-internal-step:${executionId}:${stepId}`;
}

function isAcceptedLocalStep(stepId: string): boolean {
  return stepId === SEGMENT_STEP || stepId === BACKGROUND_STEP;
}

function requireAcceptedLocalStep(stepId: string): string {
  if (!isAcceptedLocalStep(stepId)) throw projectionError('workflow_child_run_step_contract', `Workflow step ${stepId} is not an accepted LOCAL_EXECUTION child step`);
  return stepId;
}

function assertRunningInternalVerifySnapshot(snapshot: WorkflowContinuationSnapshot): void {
  if (snapshot.state !== 'RUNNING_INTERNAL' || snapshot.currentStepId !== VERIFY_STEP || snapshot.outstandingLocal) {
    throw projectionError('workflow_internal_child_step_contract', 'INTERNAL verify child requires exact RUNNING_INTERNAL durable continuation state');
  }
  const segment = snapshot.completedSteps.find(step => step.stepId === SEGMENT_STEP);
  const background = snapshot.completedSteps.find(step => step.stepId === BACKGROUND_STEP);
  const verify = snapshot.completedSteps.find(step => step.stepId === VERIFY_STEP);
  if (!segment?.ticketId || !background?.ticketId || verify) {
    throw projectionError('workflow_internal_child_step_contract', 'INTERNAL verify requires both exact completed LOCAL dependencies and no prior verify completion');
  }
  if (background.artifactIds.length !== 1) {
    throw projectionError('workflow_internal_child_step_contract', 'INTERNAL verify requires one exact background-isolation Artifact dependency');
  }
}

function assertInternalVerifyInvocation(snapshot: WorkflowContinuationSnapshot, request: InternalVerifyInput): void {
  assertRunningInternalVerifySnapshot(snapshot);
  if (request.stepId !== VERIFY_STEP) throw projectionError('workflow_internal_child_step_contract', 'Verifier invocation is not the accepted INTERNAL verify step');
  const background = snapshot.completedSteps.find(step => step.stepId === BACKGROUND_STEP);
  if (!background || background.artifactIds.length !== 1 || background.artifactIds[0] !== request.artifactId) {
    throw projectionError('workflow_internal_child_artifact_conflict', 'Verifier Artifact is not the exact durable background-isolation output');
  }
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

function localChildStateConflict(child: ExecutionRun, snapshot: WorkflowContinuationSnapshot, stepId: string) {
  return projectionError(
    'workflow_child_run_state_conflict',
    `LOCAL_EXECUTION child ${stepId} is ${child.status} while workflow continuation is ${snapshot.state}`,
  );
}

function internalChildStateConflict(child: ExecutionRun, snapshot: WorkflowContinuationSnapshot) {
  return projectionError(
    'workflow_internal_child_state_conflict',
    `INTERNAL verify child is ${child.status} while workflow continuation is ${snapshot.state}`,
  );
}

function projectionError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
