import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowExecutionRetryPolicy } from './workflowExecutionRetryControl.js';

const root = (overrides = {}) => ({
  runId: '11111111-1111-4111-8111-111111111111',
  capability: 'WORKFLOW_CONTINUATION',
  authorityKind: 'WORKFLOW_CONTINUATION',
  authorityRef: 'workflow-execution-1',
  status: 'RUNNING',
  revision: 4,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:01:00.000Z',
  children: [
    local('22222222-2222-4222-8222-222222222222', 'FINALIZED_FAILED', '2026-09-29T10:01:00.000Z'),
  ],
  ...overrides,
});
function local(runId, state, createdAt) {
  return {
    runId,
    capability: 'LOCAL_EXECUTION',
    authorityKind: 'LOCAL_EXECUTION_TICKET',
    authorityRef: `ticket-${runId}`,
    status: state === 'FINALIZED_FAILED' ? 'FAILED' : 'RUNNING',
    revision: 2,
    createdAt,
    updatedAt: createdAt,
    localExecution: { kind: 'LOCAL_EXECUTION_TICKET', state, expiresAt: '2026-09-29T11:00:00.000Z', cancellation: 'UNSUPPORTED' },
  };
}

test('workflow retry is available only for active workflow root whose latest local authority is failed or expired', () => {
  const policy = new WorkflowExecutionRetryPolicy({ retryBoundedDeterministic: async () => { throw new Error('not used'); } });
  assert.equal(policy.inspect(root()).state, 'AVAILABLE');
  assert.equal(policy.inspect(root({ children: [local('22222222-2222-4222-8222-222222222222', 'EXPIRED', '2026-09-29T10:01:00.000Z')] })).state, 'AVAILABLE');

  for (const state of ['ACTIVE', 'FINALIZED_SUCCESS', 'FINALIZED_UNKNOWN']) {
    const decision = policy.inspect(root({ children: [local('22222222-2222-4222-8222-222222222222', state, '2026-09-29T10:01:00.000Z')] }));
    assert.equal(decision.state, 'UNAVAILABLE');
  }
  assert.equal(policy.inspect(root({ capability: 'CREATIVE_EXECUTION', authorityKind: 'CREATIVE_EXECUTION' })).state, 'UNAVAILABLE');
  assert.equal(policy.inspect(root({ status: 'FAILED' })).state, 'UNAVAILABLE');
});

test('workflow retry uses only the latest local child rather than any historical failed attempt', () => {
  const policy = new WorkflowExecutionRetryPolicy({ retryBoundedDeterministic: async () => { throw new Error('not used'); } });
  const historicalFailure = local('22222222-2222-4222-8222-222222222222', 'FINALIZED_FAILED', '2026-09-29T10:01:00.000Z');
  const currentActive = local('33333333-3333-4333-8333-333333333333', 'ACTIVE', '2026-09-29T10:02:00.000Z');
  assert.deepEqual(policy.inspect(root({ children: [historicalFailure, currentActive] })), {
    state: 'UNAVAILABLE',
    reasonCode: 'LOCAL_ATTEMPT_NOT_RETRYABLE',
  });
});

test('workflow retry delegates to owning bounded Agent retry and validates replacement zero-cloud ticket', async () => {
  const calls = [];
  const policy = new WorkflowExecutionRetryPolicy({
    async retryBoundedDeterministic(payload) {
      calls.push(payload);
      return {
        executionId: 'workflow-execution-1',
        revision: 5,
        state: 'WAITING_FOR_LOCAL_RESULT',
        nextAction: {
          type: 'LOCAL_EXECUTION',
          operation: 'ORTHOGONAL_TRANSFORM',
          ticket: {
            version: '2',
            issuer: 'CORE',
            ticketId: 'replacement-ticket',
            workflowId: 'workflow-execution-1',
            policy: 'LOCAL_ONLY',
            scope: { projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
            cost: { providerCalls: 0, paidCloudCredits: 0 },
          },
        },
      };
    },
  });
  const result = await policy.retry(root(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.deepEqual(calls, [{ executionId: 'workflow-execution-1', projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]);
  assert.deepEqual(result, { executionId: 'workflow-execution-1', state: 'WAITING_FOR_LOCAL_RESULT', ticketId: 'replacement-ticket' });
});

test('workflow retry fails closed on stale/mismatched owning response', async () => {
  const policy = new WorkflowExecutionRetryPolicy({
    async retryBoundedDeterministic() {
      return { executionId: 'other', state: 'WAITING_FOR_LOCAL_RESULT', nextAction: { type: 'LOCAL_EXECUTION', ticket: {} } };
    },
  });
  await assert.rejects(
    () => policy.retry(root(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    error => error?.code === 'workflow_retry_unavailable' && error?.controlReason === 'RETRY_EXECUTION_MISMATCH',
  );
});
