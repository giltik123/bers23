export const CREATIVE_CANCEL_CONTROL_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const CREATIVE_CAPABILITY = 'CREATIVE_EXECUTION';
const CREATIVE_AUTHORITY = 'CREATIVE_EXECUTION';
const ACTIVE_RUN_STATUS = 'RUNNING';
const CANCELLABLE_LIFECYCLE_STATUS = 'READY';

export class CreativeExecutionControlPolicy {
  constructor(client) {
    if (!client || typeof client.status !== 'function' || typeof client.cancel !== 'function') {
      throw new TypeError('Owning Creative lifecycle client with status and cancel is required');
    }
    this.client = client;
  }

  async inspect(run) {
    const staticDecision = staticEligibility(run);
    if (staticDecision) return staticDecision;

    let lifecycle;
    try {
      lifecycle = await this.client.status(run.authorityRef);
    } catch {
      return unavailable('LIFECYCLE_UNAVAILABLE');
    }

    if (!lifecycle || lifecycle.executionId !== run.authorityRef) return unavailable('LIFECYCLE_MISMATCH');
    if (lifecycle.status !== CANCELLABLE_LIFECYCLE_STATUS) {
      return unavailable(lifecycle.status === 'UNKNOWN' ? 'LIFECYCLE_UNKNOWN' : 'LIFECYCLE_NOT_CANCELLABLE');
    }

    return Object.freeze({
      state: CREATIVE_CANCEL_CONTROL_STATES.AVAILABLE,
      runId: run.runId,
      executionId: run.authorityRef,
      revision: run.revision,
    });
  }

  async cancel(run) {
    const control = await this.inspect(run);
    if (control.state !== CREATIVE_CANCEL_CONTROL_STATES.AVAILABLE) {
      throw controlError(control.reasonCode);
    }

    const response = await this.client.cancel(control.executionId);
    if (!response || response.executionId !== control.executionId || response.status !== 'SKIPPED') {
      throw controlError('CANCEL_RECONCILIATION_MISMATCH');
    }

    return Object.freeze({
      executionId: control.executionId,
      status: 'SKIPPED',
    });
  }
}

function staticEligibility(run) {
  if (!run || typeof run !== 'object') return unavailable('INVALID_RUN');
  if (run.capability !== CREATIVE_CAPABILITY || run.authorityKind !== CREATIVE_AUTHORITY) {
    return unavailable('NOT_CREATIVE_EXECUTION');
  }
  if (run.status !== ACTIVE_RUN_STATUS) return unavailable('RUN_NOT_ACTIVE');
  if (typeof run.authorityRef !== 'string' || !run.authorityRef.trim()) return unavailable('INVALID_AUTHORITY_REF');
  if (typeof run.runId !== 'string' || !run.runId.trim()) return unavailable('INVALID_RUN_ID');
  if (!Number.isSafeInteger(run.revision) || run.revision < 1) return unavailable('INVALID_REVISION');
  return null;
}

function unavailable(reasonCode) {
  return Object.freeze({
    state: CREATIVE_CANCEL_CONTROL_STATES.UNAVAILABLE,
    reasonCode,
  });
}

function controlError(reasonCode) {
  return Object.assign(new Error('Creative cancellation is not available for this canonical execution'), {
    code: 'creative_cancel_unavailable',
    controlReason: reasonCode,
  });
}
