import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionControlPolicy } from './creativeExecutionControl.js';

const baseRun = Object.freeze({
  runId: '11111111-1111-4111-8111-111111111111',
  capability: 'CREATIVE_EXECUTION',
  authorityKind: 'CREATIVE_EXECUTION',
  authorityRef: 'creative-authority-1',
  status: 'RUNNING',
  revision: 2,
});

function fixture({ lifecycle = 'READY', statusFails = false, cancelResponse } = {}) {
  const calls = { status: [], cancel: [] };
  const client = {
    status: async (executionId) => {
      calls.status.push(executionId);
      if (statusFails) throw Object.assign(new Error('status unavailable'), { code: 'result_not_found', status: 404 });
      return { executionId, status: lifecycle };
    },
    cancel: async (executionId) => {
      calls.cancel.push(executionId);
      return cancelResponse ?? { executionId, status: 'SKIPPED' };
    },
  };
  return { policy: new CreativeExecutionControlPolicy(client), calls };
}

test('only exact running CREATIVE_EXECUTION binding reaches owning lifecycle preflight', async () => {
  const f = fixture();
  for (const run of [
    { ...baseRun, capability: 'LOCAL_EXECUTION', authorityKind: 'LOCAL_EXECUTION_TICKET' },
    { ...baseRun, capability: 'WORKFLOW_CONTINUATION', authorityKind: 'WORKFLOW_CONTINUATION' },
    { ...baseRun, capability: 'WORKFLOW_STEP', authorityKind: 'WORKFLOW_INTERNAL_STEP' },
    { ...baseRun, authorityKind: 'WORKFLOW_CONTINUATION' },
    { ...baseRun, status: 'QUEUED' },
    { ...baseRun, status: 'SUCCEEDED' },
    { ...baseRun, status: 'FAILED' },
    { ...baseRun, status: 'CANCELLED' },
    { ...baseRun, status: 'UNKNOWN' },
  ]) {
    const control = await f.policy.inspect(run);
    assert.equal(control.state, 'UNAVAILABLE');
  }
  assert.deepEqual(f.calls, { status: [], cancel: [] });
});

test('RUNNING durable state is cancellable only when owning Creative lifecycle confirms READY', async () => {
  const ready = fixture({ lifecycle: 'READY' });
  assert.deepEqual(await ready.policy.inspect(baseRun), {
    state: 'AVAILABLE',
    runId: baseRun.runId,
    executionId: baseRun.authorityRef,
    revision: baseRun.revision,
  });
  assert.deepEqual(ready.calls.status, [baseRun.authorityRef]);

  for (const lifecycle of ['UNKNOWN', 'SUCCESS', 'FAILED', 'SKIPPED', 'WAITING']) {
    const f = fixture({ lifecycle });
    const control = await f.policy.inspect(baseRun);
    assert.equal(control.state, 'UNAVAILABLE');
    assert.equal(control.reasonCode, lifecycle === 'UNKNOWN' ? 'LIFECYCLE_UNKNOWN' : 'LIFECYCLE_NOT_CANCELLABLE');
    assert.deepEqual(f.calls.cancel, []);
  }
});

test('missing or restarted owning lifecycle fails closed instead of trusting durable RUNNING', async () => {
  const f = fixture({ statusFails: true });
  assert.deepEqual(await f.policy.inspect(baseRun), { state: 'UNAVAILABLE', reasonCode: 'LIFECYCLE_UNAVAILABLE' });
  assert.deepEqual(f.calls, { status: [baseRun.authorityRef], cancel: [] });
});

test('mismatched lifecycle authorityRef response fails closed', async () => {
  const calls = { status: 0, cancel: 0 };
  const policy = new CreativeExecutionControlPolicy({
    status: async () => { calls.status += 1; return { executionId: 'creative-other', status: 'READY' }; },
    cancel: async () => { calls.cancel += 1; return { executionId: 'creative-other', status: 'SKIPPED' }; },
  });
  assert.deepEqual(await policy.inspect(baseRun), { state: 'UNAVAILABLE', reasonCode: 'LIFECYCLE_MISMATCH' });
  await assert.rejects(() => policy.cancel(baseRun), (error) => error?.code === 'creative_cancel_unavailable' && error?.controlReason === 'LIFECYCLE_MISMATCH');
  assert.deepEqual(calls, { status: 2, cancel: 0 });
});

test('cancel revalidates owning READY state, awaits reconciled SKIPPED and never mutates durable run locally', async () => {
  const f = fixture();
  const original = structuredClone(baseRun);
  const result = await f.policy.cancel(baseRun);
  assert.deepEqual(result, { executionId: baseRun.authorityRef, status: 'SKIPPED' });
  assert.deepEqual(f.calls, { status: [baseRun.authorityRef], cancel: [baseRun.authorityRef] });
  assert.deepEqual(baseRun, original);
});

test('status race before cancel prevents stale mutation request', async () => {
  const f = fixture({ lifecycle: 'FAILED' });
  await assert.rejects(() => f.policy.cancel(baseRun), (error) => error?.code === 'creative_cancel_unavailable' && error?.controlReason === 'LIFECYCLE_NOT_CANCELLABLE');
  assert.deepEqual(f.calls, { status: [baseRun.authorityRef], cancel: [] });
});

test('unexpected cancel response is reconciliation failure rather than local CANCELLED truth', async () => {
  const f = fixture({ cancelResponse: { executionId: baseRun.authorityRef, status: 'READY' } });
  await assert.rejects(() => f.policy.cancel(baseRun), (error) => error?.code === 'creative_cancel_unavailable' && error?.controlReason === 'CANCEL_RECONCILIATION_MISMATCH');
  assert.deepEqual(f.calls, { status: [baseRun.authorityRef], cancel: [baseRun.authorityRef] });
});
