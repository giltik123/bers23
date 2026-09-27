import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BoundedWorkflowRetryControlPolicy,
  WORKFLOW_RETRY_CONTROL_STATES,
} from './boundedWorkflowRetryControl.js';

const rootId = '11111111-1111-4111-8111-111111111111';
const failedId = '22222222-2222-4222-8222-222222222222';
const activeId = '33333333-3333-4333-8333-333333333333';

function local(runId, state, createdAt) {
  return Object.freeze({
    runId,
    capability: 'LOCAL_EXECUTION',
    authorityKind: 'LOCAL_EXECUTION_TICKET',
    authorityRef: `ticket-${runId}`,
    parentRunId: rootId,
    status: state === 'FINALIZED_FAILED' ? 'FAILED' : 'RUNNING',
    revision: 2,
    createdAt,
    updatedAt: createdAt,
    localExecution: Object.freeze({
      kind: 'LOCAL_EXECUTION_TICKET',
      state,
      expiresAt: '2026-09-27T06:00:00.000Z',
      cancellation: 'UNSUPPORTED',
    }),
    children: Object.freeze([]),
  });
}

function root(children, patch = {}) {
  return Object.freeze({
    runId: rootId,
    capability: 'WORKFLOW_CONTINUATION',
    authorityKind: 'WORKFLOW_CONTINUATION',
    authorityRef: 'bounded-workflow-execution-1',
    status: 'RUNNING',
    revision: 3,
    createdAt: '2026-09-27T05:00:00.000Z',
    updatedAt: '2026-09-27T05:01:00.000Z',
    children: Object.freeze(children),
    ...patch,
  });
}

test('latest failed local attempt exposes owning workflow Retry and delegates to the bounded runner', async () => {
  const calls = [];
  const policy = new BoundedWorkflowRetryControlPolicy((projectId) => ({
    async retry(executionId) {
      calls.push([projectId, executionId]);
      return Object.freeze({ view: Object.freeze({ executionId, revision: 4, state: 'WAITING_FOR_LOCAL_RESULT' }) });
    },
  }));
  const run = root([local(failedId, 'FINALIZED_FAILED', '2026-09-27T05:00:01.000Z')]);
  const control = policy.inspect(run);
  assert.equal(control.state, WORKFLOW_RETRY_CONTROL_STATES.AVAILABLE);
  assert.equal(control.attemptRunId, failedId);
  assert.equal(control.attemptState, 'FINALIZED_FAILED');

  const result = await policy.retry(run, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.deepEqual(calls, [['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bounded-workflow-execution-1']]);
  assert.deepEqual(result, { executionId: 'bounded-workflow-execution-1', state: 'WAITING_FOR_LOCAL_RESULT', revision: 4 });
});

test('expired latest attempt is retryable but an active replacement suppresses stale failed-attempt Retry', () => {
  const policy = new BoundedWorkflowRetryControlPolicy(() => ({ retry: async () => { throw new Error('not called'); } }));
  const expired = root([local(failedId, 'EXPIRED', '2026-09-27T05:00:01.000Z')]);
  assert.equal(policy.inspect(expired).state, WORKFLOW_RETRY_CONTROL_STATES.AVAILABLE);
  assert.equal(policy.inspect(expired).attemptState, 'EXPIRED');

  const replacementActive = root([
    local(failedId, 'FINALIZED_FAILED', '2026-09-27T05:00:01.000Z'),
    local(activeId, 'ACTIVE', '2026-09-27T05:00:02.000Z'),
  ]);
  assert.deepEqual(policy.inspect(replacementActive), {
    state: WORKFLOW_RETRY_CONTROL_STATES.UNAVAILABLE,
    reasonCode: 'ATTEMPT_ACTIVE',
  });
});

test('UNKNOWN, success, non-workflow roots and terminal workflows never surface Retry', () => {
  const policy = new BoundedWorkflowRetryControlPolicy(() => ({ retry: async () => { throw new Error('not called'); } }));
  assert.equal(policy.inspect(root([local(failedId, 'FINALIZED_UNKNOWN', '2026-09-27T05:00:01.000Z')])).reasonCode, 'ATTEMPT_UNKNOWN');
  assert.equal(policy.inspect(root([local(failedId, 'FINALIZED_SUCCESS', '2026-09-27T05:00:01.000Z')])).reasonCode, 'ATTEMPT_SUCCEEDED');
  assert.equal(policy.inspect(root([local(failedId, 'FINALIZED_FAILED', '2026-09-27T05:00:01.000Z')], { status: 'UNKNOWN' })).reasonCode, 'WORKFLOW_UNKNOWN');
  assert.equal(policy.inspect(root([local(failedId, 'FINALIZED_FAILED', '2026-09-27T05:00:01.000Z')], {
    capability: 'CREATIVE_EXECUTION',
    authorityKind: 'CREATIVE_EXECUTION',
  })).reasonCode, 'NOT_WORKFLOW_CONTINUATION');
});

test('Retry fails closed when the owning runner reconciles a different workflow identity', async () => {
  const policy = new BoundedWorkflowRetryControlPolicy(() => ({
    async retry() {
      return Object.freeze({ view: Object.freeze({ executionId: 'different-workflow', revision: 1, state: 'WAITING_FOR_LOCAL_RESULT' }) });
    },
  }));
  const run = root([local(failedId, 'FINALIZED_FAILED', '2026-09-27T05:00:01.000Z')]);
  await assert.rejects(
    () => policy.retry(run, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    (error) => error?.code === 'workflow_retry_unavailable' && error?.controlReason === 'RETRY_RECONCILIATION_MISMATCH',
  );
});
