export const WORKFLOW_RETRY_CONTROL_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const WORKFLOW_CAPABILITY = 'WORKFLOW_CONTINUATION';
const WORKFLOW_AUTHORITY = 'WORKFLOW_CONTINUATION';
const LOCAL_CAPABILITY = 'LOCAL_EXECUTION';
const LOCAL_AUTHORITY = 'LOCAL_EXECUTION_TICKET';
const RETRYABLE_LOCAL_STATES = new Set(['FINALIZED_FAILED', 'EXPIRED']);

export class BoundedWorkflowRetryControlPolicy {
  constructor(runnerFactory) {
    if (typeof runnerFactory !== 'function') throw new TypeError('Bounded workflow runner factory is required');
    this.runnerFactory = runnerFactory;
  }

  inspect(run) {
    if (!run || typeof run !== 'object') return unavailable('INVALID_RUN');
    if (run.capability !== WORKFLOW_CAPABILITY || run.authorityKind !== WORKFLOW_AUTHORITY) {
      return unavailable('NOT_WORKFLOW_CONTINUATION');
    }
    if (run.status !== 'RUNNING') {
      return unavailable(run.status === 'UNKNOWN' ? 'WORKFLOW_UNKNOWN' : 'WORKFLOW_NOT_RUNNING');
    }
    if (typeof run.authorityRef !== 'string' || !run.authorityRef.trim()) return unavailable('INVALID_AUTHORITY_REF');
    if (typeof run.runId !== 'string' || !run.runId.trim()) return unavailable('INVALID_RUN_ID');

    const attempts = Array.isArray(run.children)
      ? run.children.filter((child) => child?.capability === LOCAL_CAPABILITY && child?.authorityKind === LOCAL_AUTHORITY)
      : [];
    if (!attempts.length) return unavailable('NO_LOCAL_ATTEMPT');

    // ExecutionRun recovery returns children in canonical creation order. The
    // newest local child is the only attempt Job Center may use as UI evidence;
    // Core /retry still revalidates the exact outstanding WorkflowContinuation.
    const latest = attempts[attempts.length - 1];
    const state = latest?.localExecution?.state;
    if (RETRYABLE_LOCAL_STATES.has(state)) {
      return Object.freeze({
        state: WORKFLOW_RETRY_CONTROL_STATES.AVAILABLE,
        runId: run.runId,
        executionId: run.authorityRef,
        attemptRunId: latest.runId,
        attemptState: state,
      });
    }
    if (state === 'FINALIZED_UNKNOWN') return unavailable('ATTEMPT_UNKNOWN');
    if (state === 'ACTIVE') return unavailable('ATTEMPT_ACTIVE');
    if (state === 'FINALIZED_SUCCESS') return unavailable('ATTEMPT_SUCCEEDED');
    return unavailable('ATTEMPT_UNAVAILABLE');
  }

  async retry(run, projectId) {
    const control = this.inspect(run);
    if (control.state !== WORKFLOW_RETRY_CONTROL_STATES.AVAILABLE) {
      throw controlError(control.reasonCode);
    }
    const project = token(projectId, 'projectId');
    const runner = this.runnerFactory(project);
    if (!runner || typeof runner.retry !== 'function') throw new TypeError('Bounded workflow runner must expose retry');

    const outcome = await runner.retry(control.executionId);
    const view = outcome?.view;
    if (!view || view.executionId !== control.executionId) {
      throw controlError('RETRY_RECONCILIATION_MISMATCH');
    }
    return Object.freeze({
      executionId: view.executionId,
      state: view.state,
      revision: view.revision,
    });
  }
}

function unavailable(reasonCode) {
  return Object.freeze({
    state: WORKFLOW_RETRY_CONTROL_STATES.UNAVAILABLE,
    reasonCode,
  });
}

function controlError(reasonCode) {
  return Object.assign(new Error('Workflow retry is not available for this canonical execution'), {
    code: 'workflow_retry_unavailable',
    controlReason: reasonCode,
  });
}

function token(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}
