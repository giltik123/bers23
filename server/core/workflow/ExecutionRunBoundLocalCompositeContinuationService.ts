import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { ExecutionRun, ExecutionRunRegistry } from '../execution/executionRunRegistry.ts';
import type {
  LocalCompositeContinuationService,
  LocalCompositeContinuationView,
  LocalCompositeStartCommand,
} from './LocalCompositeContinuationService.ts';
import type { WorkflowContinuationSnapshot, WorkflowContinuationStore } from './WorkflowContinuationStore.ts';

export type LocalCompositeContinuationPort = Pick<
  LocalCompositeContinuationService,
  'start' | 'resume' | 'submitLocalResult'
>;

type ContinuationReader = Pick<WorkflowContinuationStore, 'get'>;
type ExecutionRunProjectionInput = Readonly<{
  delegate: LocalCompositeContinuationPort;
  continuations: ContinuationReader;
  runs: ExecutionRunRegistry;
}>;

/**
 * Production projection boundary between durable WorkflowContinuation authority
 * and the canonical ExecutionRun index. The continuation remains execution
 * authority; the run is a recoverable, monotonic projection only.
 *
 * A crash may occur after the continuation commits but before this projection.
 * Every subsequent start/resume/result read reconciles the durable snapshot, so
 * recovery never requires redispatching workflow work from ExecutionRun state.
 */
export class ExecutionRunBoundLocalCompositeContinuationService implements LocalCompositeContinuationPort {
  private readonly input: ExecutionRunProjectionInput;

  constructor(input: ExecutionRunProjectionInput) {
    this.input = input;
  }

  async start(command: LocalCompositeStartCommand, scope: Scope): Promise<LocalCompositeContinuationView> {
    const view = await this.input.delegate.start(command, scope);
    await this.reconcile(view.executionId, scope);
    return view;
  }

  async resume(executionId: string, scope: Scope): Promise<LocalCompositeContinuationView> {
    const view = await this.input.delegate.resume(executionId, scope);
    await this.reconcile(view.executionId, scope);
    return view;
  }

  async submitLocalResult(executionId: string, scope: Scope, result: unknown): Promise<LocalCompositeContinuationView> {
    const view = await this.input.delegate.submitLocalResult(executionId, scope, result);
    await this.reconcile(view.executionId, scope);
    return view;
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
  return projectIssuedRun(runs, issued.run, snapshot);
}

async function projectIssuedRun(
  runs: ExecutionRunRegistry,
  run: ExecutionRun,
  snapshot: WorkflowContinuationSnapshot,
): Promise<ExecutionRun> {
  switch (snapshot.state) {
    case 'READY':
      if (run.status === 'QUEUED') return run;
      throw stateConflict(run, snapshot);
    case 'WAITING_FOR_LOCAL_RESULT':
    case 'RUNNING_INTERNAL':
      return ensureRunning(runs, run, snapshot);
    case 'SUCCESS': {
      if (run.status === 'SUCCEEDED') return run;
      const running = await ensureRunning(runs, run, snapshot);
      return runs.succeed(running.scope, running.runId);
    }
    case 'FAILED': {
      const reason = requiredFailureCode(snapshot);
      if (run.status === 'FAILED') return runs.fail(run.scope, run.runId, reason);
      const running = await ensureRunning(runs, run, snapshot);
      return runs.fail(running.scope, running.runId, reason);
    }
    case 'CANCELLED': {
      const reason = snapshot.failureCode ?? 'WORKFLOW_CANCELLED';
      if (run.status === 'QUEUED' || run.status === 'RUNNING' || run.status === 'CANCELLED') {
        return runs.cancel(run.scope, run.runId, reason);
      }
      throw stateConflict(run, snapshot);
    }
    case 'UNKNOWN': {
      const reason = requiredFailureCode(snapshot);
      if (run.status === 'UNKNOWN') return runs.markUnknown(run.scope, run.runId, reason);
      const running = await ensureRunning(runs, run, snapshot);
      return runs.markUnknown(running.scope, running.runId, reason);
    }
  }
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

function requiredFailureCode(snapshot: WorkflowContinuationSnapshot): string {
  if (!snapshot.failureCode) throw projectionError('workflow_execution_run_failure_code_missing', `${snapshot.state} continuation has no durable failure code`);
  return snapshot.failureCode;
}

function stateConflict(run: ExecutionRun, snapshot: WorkflowContinuationSnapshot) {
  return projectionError(
    'workflow_execution_run_state_conflict',
    `ExecutionRun ${run.status} cannot represent workflow continuation ${snapshot.state}`,
  );
}

function projectionError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
