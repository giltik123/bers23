import assert from 'node:assert/strict';
import test from 'node:test';
import { AutomationManualExecutionService } from '../server/core/automation/AutomationManualExecutionService.ts';

const auth = Object.freeze({ tenantId: 'tenant-c3b', userId: 'user-c3b' });
const binding = Object.freeze({
  invocationId: '11111111-1111-4111-8111-111111111111',
  tenantId: auth.tenantId,
  userId: auth.userId,
  automationId: '22222222-2222-4222-8222-222222222222',
  definitionRevision: 7,
  plan: Object.freeze({
    kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1' as const,
    orthogonalMode: 'ROTATE_90_CW' as const,
    targetWidth: 640,
    targetHeight: 480,
  }),
  planDigest: 'a'.repeat(64),
  projectId: '33333333-3333-4333-8333-333333333333',
  sourceImageStorageId: '44444444-4444-4444-8444-444444444444',
  sourceRole: 'ORIGINAL' as const,
  sourceWidth: 320,
  sourceHeight: 200,
  clientRequestId: 'browser-manual-intent',
  downstreamClientRequestId: `automation-agent-v1-${'b'.repeat(64)}`,
  createdAt: '2026-09-09T00:00:00.000Z',
});

function harness(sourceRole: 'ORIGINAL' | 'COMPOSITE' = 'ORIGINAL') {
  const calls: any[] = [];
  const fixedBinding = Object.freeze({ ...binding, sourceRole });
  const service = new AutomationManualExecutionService({
    invocations: Object.freeze({
      bind: async (scope: any, command: any) => {
        calls.push(['bind', scope, command]);
        return fixedBinding;
      },
      get: async (scope: any, invocationId: string) => {
        calls.push(['get', scope, invocationId]);
        return invocationId === fixedBinding.invocationId ? fixedBinding : undefined;
      },
    }),
    artifacts: Object.freeze({
      issueStoredOriginal: (storageId: string, scope: any) => {
        calls.push(['issue-original', storageId, scope]);
        return `stored-original:${storageId}`;
      },
      issueStoredFinal: (storageId: string, scope: any) => {
        calls.push(['issue-final', storageId, scope]);
        return `stored-final:${storageId}`;
      },
    }),
    agent: Object.freeze({
      start: async (command: any, scope: any) => {
        calls.push(['agent-start', command, scope]);
        return Object.freeze({ executionId: 'agent-execution', revision: 3, state: 'WAITING_FOR_LOCAL_RESULT' as const,
          nextAction: Object.freeze({ type: 'LOCAL_EXECUTION' as const, operation: 'ORTHOGONAL_TRANSFORM' as const, ticket: Object.freeze({ ticketId: 'ticket-1' }) as any }) });
      },
      submitLocalResult: async (executionId: string, projectId: string, scope: any, result: unknown) => {
        calls.push(['agent-result', executionId, projectId, scope, result]);
        return Object.freeze({ executionId, revision: 4, state: 'WAITING_FOR_LOCAL_RESULT' as const });
      },
      retry: async (executionId: string, projectId: string, scope: any) => {
        calls.push(['agent-retry', executionId, projectId, scope]);
        return Object.freeze({ executionId, revision: 5, state: 'WAITING_FOR_LOCAL_RESULT' as const, retryAvailable: false });
      },
      cancel: async (executionId: string, projectId: string, scope: any) => {
        calls.push(['agent-cancel', executionId, projectId, scope]);
        return Object.freeze({ executionId, revision: 6, state: 'CANCELLED' as const });
      },
    }),
  });
  return { service, calls, binding: fixedBinding };
}

test('C3b start delegates only immutable server binding values into bounded Agent namespace', async () => {
  const { service, calls } = harness('ORIGINAL');
  const command = Object.freeze({
    automationId: binding.automationId,
    definitionRevision: binding.definitionRevision,
    projectId: binding.projectId,
    clientRequestId: binding.clientRequestId,
  });
  const view = await service.start(command, auth);
  assert.equal(view.invocationId, binding.invocationId);
  assert.equal(view.executionId, 'agent-execution');

  const start = calls.find(entry => entry[0] === 'agent-start');
  assert.ok(start);
  assert.deepEqual(start[1], {
    clientRequestId: binding.downstreamClientRequestId,
    projectId: binding.projectId,
    sourceArtifactId: `stored-original:${binding.sourceImageStorageId}`,
    mode: binding.plan.orthogonalMode,
    width: binding.plan.targetWidth,
    height: binding.plan.targetHeight,
  });
  assert.deepEqual(start[2], auth);
  assert.equal(start[1].clientRequestId === binding.clientRequestId, false, 'browser request identity must never enter Agent namespace directly');
  assert.equal(Object.hasOwn(start[1], 'provider'), false);
  assert.equal(Object.hasOwn(start[1], 'model'), false);
  assert.equal(Object.hasOwn(start[1], 'ticket'), false);
  assert.equal(Object.hasOwn(start[1], 'credits'), false);
});

test('C3b replay reconstructs COMPOSITE source from immutable binding without rereading mutable definition', async () => {
  const { service, calls, binding: composite } = harness('COMPOSITE');
  const view = await service.resume(composite.invocationId, auth);
  assert.equal(view.executionId, 'agent-execution');
  assert.equal(calls.some(entry => entry[0] === 'bind'), false);
  assert.ok(calls.some(entry => entry[0] === 'issue-final' && entry[1] === composite.sourceImageStorageId));
  const start = calls.find(entry => entry[0] === 'agent-start');
  assert.equal(start[1].sourceArtifactId, `stored-final:${composite.sourceImageStorageId}`);
});

test('C3b result retry and cancel recover the same bound Agent execution', async () => {
  const { service, calls } = harness();
  await service.submitLocalResult(binding.invocationId, auth, Object.freeze({ ticketId: 'ticket-1', status: 'SUCCESS' }));
  await service.retry(binding.invocationId, auth);
  const cancelled = await service.cancel(binding.invocationId, auth);
  assert.equal(cancelled.state, 'CANCELLED');

  const routed = calls.filter(entry => ['agent-result','agent-retry','agent-cancel'].includes(entry[0]));
  assert.equal(routed.length, 3);
  for (const entry of routed) {
    assert.equal(entry[1], 'agent-execution');
    assert.equal(entry[2], binding.projectId);
    assert.deepEqual(entry[3], auth);
  }
});

test('C3b invocation scope fails closed when binding is unavailable', async () => {
  const { service } = harness();
  await assert.rejects(service.resume('55555555-5555-4555-8555-555555555555', auth), (error: any) => error?.code === 'automation_invocation_not_found');
});
