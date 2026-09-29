export const WORKFLOW_RETRY_CONTROL_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const WORKFLOW_CAPABILITY = 'WORKFLOW_CONTINUATION';
const WORKFLOW_AUTHORITY = 'WORKFLOW_CONTINUATION';
const LOCAL_CAPABILITY = 'LOCAL_EXECUTION';
const LOCAL_AUTHORITY = 'LOCAL_EXECUTION_TICKET';
const ACTIVE_ROOT_STATUS = 'RUNNING';
const RETRYABLE_LOCAL_STATES = new Set(['FINALIZED_FAILED', 'EXPIRED']);

export class WorkflowExecutionRetryPolicy {
  constructor(client) {
    if (!client || typeof client.retryBoundedDeterministic !== 'function') {
      throw new TypeError('Owning bounded Agent retry client is required');
    }
    this.client = client;
  }

  inspect(run) {
    return staticEligibility(run);
  }

  async retry(run, projectIdValue) {
    const control = this.inspect(run);
    if (control.state !== WORKFLOW_RETRY_CONTROL_STATES.AVAILABLE) {
      throw controlError(control.reasonCode);
    }
    const projectId = token(projectIdValue, 'projectId');
    const response = await this.client.retryBoundedDeterministic({
      executionId: control.executionId,
      projectId,
    });
    return validateRetryResponse(response, control.executionId, projectId);
  }
}

function staticEligibility(run) {
  if (!run || typeof run !== 'object') return unavailable('INVALID_RUN');
  if (run.capability !== WORKFLOW_CAPABILITY || run.authorityKind !== WORKFLOW_AUTHORITY) {
    return unavailable('NOT_WORKFLOW_CONTINUATION');
  }
  if (run.status !== ACTIVE_ROOT_STATUS) return unavailable('WORKFLOW_NOT_ACTIVE');
  if (typeof run.authorityRef !== 'string' || !run.authorityRef.trim()) return unavailable('INVALID_AUTHORITY_REF');
  if (typeof run.runId !== 'string' || !run.runId.trim()) return unavailable('INVALID_RUN_ID');
  if (!Number.isSafeInteger(run.revision) || run.revision < 1) return unavailable('INVALID_REVISION');

  const latest = latestLocalChild(run.children);
  if (!latest) return unavailable('NO_LOCAL_ATTEMPT');
  const state = latest.localExecution?.state;
  if (!RETRYABLE_LOCAL_STATES.has(state)) {
    return unavailable(state === 'FINALIZED_UNKNOWN' ? 'LOCAL_ATTEMPT_UNKNOWN' : 'LOCAL_ATTEMPT_NOT_RETRYABLE');
  }

  return Object.freeze({
    state: WORKFLOW_RETRY_CONTROL_STATES.AVAILABLE,
    runId: run.runId,
    executionId: run.authorityRef.trim(),
    revision: run.revision,
    localRunId: latest.runId,
    localAuthorityState: state,
  });
}

function latestLocalChild(children) {
  if (!Array.isArray(children)) return null;
  let latest = null;
  for (const child of children) {
    if (!child || child.capability !== LOCAL_CAPABILITY || child.authorityKind !== LOCAL_AUTHORITY) continue;
    if (!latest || childOrder(child, latest) > 0) latest = child;
  }
  return latest;
}

function childOrder(left, right) {
  const leftCreated = typeof left.createdAt === 'string' ? left.createdAt : '';
  const rightCreated = typeof right.createdAt === 'string' ? right.createdAt : '';
  if (leftCreated !== rightCreated) return leftCreated < rightCreated ? -1 : 1;
  const leftId = typeof left.runId === 'string' ? left.runId : '';
  const rightId = typeof right.runId === 'string' ? right.runId : '';
  return leftId === rightId ? 0 : leftId < rightId ? -1 : 1;
}

function validateRetryResponse(response, executionId, projectId) {
  if (!response || typeof response !== 'object') throw controlError('RETRY_RESPONSE_INVALID');
  if (response.executionId !== executionId) throw controlError('RETRY_EXECUTION_MISMATCH');
  if (response.state !== 'WAITING_FOR_LOCAL_RESULT') throw controlError('RETRY_STATE_MISMATCH');
  const action = response.nextAction;
  if (!action || action.type !== 'LOCAL_EXECUTION') throw controlError('RETRY_ACTION_MISSING');
  const ticket = action.ticket;
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') {
    throw controlError('RETRY_TICKET_INVALID');
  }
  if (ticket.workflowId !== executionId || ticket.scope?.projectId !== projectId) throw controlError('RETRY_TICKET_SCOPE_MISMATCH');
  if (ticket.cost?.providerCalls !== 0 || ticket.cost?.paidCloudCredits !== 0) throw controlError('RETRY_TICKET_COST_MISMATCH');
  return Object.freeze({
    executionId,
    state: response.state,
    ticketId: token(ticket.ticketId, 'ticketId'),
  });
}

function unavailable(reasonCode) {
  return Object.freeze({
    state: WORKFLOW_RETRY_CONTROL_STATES.UNAVAILABLE,
    reasonCode,
  });
}

function token(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw controlError(`INVALID_${field.toUpperCase()}`);
  return value.trim();
}

function controlError(reasonCode) {
  return Object.assign(new Error('Workflow retry is not available for this canonical execution'), {
    code: 'workflow_retry_unavailable',
    controlReason: reasonCode,
  });
}
