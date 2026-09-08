import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoundedAgentRunner } from '../src/application/agent/createBoundedAgentRunner.ts';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';
import { ORTHOGONAL_TRANSFORM_CAPABILITY, orthogonalTransformRgba8 } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_CAPABILITY, resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { ORTHOGONAL_TRANSFORM_TOOL_DEFINITION, RESIZE_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

const projectId = 'agent-project';
const workflowId = 'agent-workflow';
const scope = Object.freeze({ tenantId: 'agent-tenant', userId: 'agent-user', projectId });
const rootRgba = new Uint8ClampedArray([
  255,0,0,255, 0,255,0,255,
  0,0,255,255, 255,255,0,255,
  255,0,255,255, 0,255,255,255,
]);
const orthogonalRgba = orthogonalTransformRgba8(rootRgba, 2, 3, 'ROTATE_90_CW');
const rootSha = 'a'.repeat(64);
const orthogonalSha = 'b'.repeat(64);

function orthogonalTicket(): LocalExecutionTicketV2 {
  const exact = ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.parameters.exact;
  return Object.freeze({
    ticketId: 'ticket-orthogonal', version: '2', issuer: 'CORE', requestId: 'child-orthogonal', workflowId, stepId: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.operation.id,
    operation: Object.freeze({ id: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.operation.id, version: '1', type: 'ORTHOGONAL_TRANSFORM', capability: ORTHOGONAL_TRANSFORM_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: 'root-artifact', mode: 'ROTATE_90_CW', ...exact }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: 'root-artifact', kind: 'image', role: 'ORIGINAL', sha256: rootSha })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 3, height: 2 })]),
    allowedExecutors: Object.freeze([ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'agent-orthogonal', nonce: 'nonce-orthogonal', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function resizeTicket(): LocalExecutionTicketV2 {
  const exact = RESIZE_TOOL_DEFINITION.parameters.exact;
  return Object.freeze({
    ticketId: 'ticket-resize', version: '2', issuer: 'CORE', requestId: 'child-resize', workflowId, stepId: RESIZE_TOOL_DEFINITION.operation.id,
    operation: Object.freeze({ id: RESIZE_TOOL_DEFINITION.operation.id, version: '1', type: 'RESIZE', capability: RESIZE_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: 'orthogonal-final', width: 4, height: 4, ...exact }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: 'orthogonal-final', kind: 'image', role: 'COMPOSITE', sha256: orthogonalSha })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 4, height: 4 })]),
    allowedExecutors: Object.freeze([RESIZE_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'agent-resize', nonce: 'nonce-resize', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function waiting(executionId: string, revision: number, operation: 'ORTHOGONAL_TRANSFORM' | 'RESIZE', ticket: LocalExecutionTicketV2) {
  return Object.freeze({ executionId, revision, state: 'WAITING_FOR_LOCAL_RESULT', nextAction: Object.freeze({ type: 'LOCAL_EXECUTION', operation, ticket }) });
}

test('browser runner follows only Core nextAction views and returns the terminal Resize preview', async () => {
  const events: string[] = [];
  const submitted: any[] = [];
  const first = orthogonalTicket();
  const second = resizeTicket();
  let submitCount = 0;
  const client = {
    agent: {
      async startBoundedDeterministic(payload) {
        events.push('agent-start');
        assert.deepEqual(payload, { clientRequestId: 'browser-request', projectId, sourceArtifactId: 'root-artifact', mode: 'ROTATE_90_CW', width: 4, height: 4 });
        return waiting(workflowId, 1, 'ORTHOGONAL_TRANSFORM', first);
      },
      async resumeBoundedDeterministic() { throw new Error('not used'); },
      async retryBoundedDeterministic() { throw new Error('not used'); },
      async cancelBoundedDeterministic() { throw new Error('not used'); },
      async submitBoundedDeterministicResult(payload) {
        events.push('agent-result');
        submitted.push(payload.result);
        assert.equal(payload.executionId, workflowId); assert.equal(payload.projectId, projectId);
        submitCount += 1;
        if (submitCount === 1) {
          assert.equal(payload.result.ticketId, first.ticketId);
          return waiting(workflowId, 3, 'RESIZE', second);
        }
        assert.equal(payload.result.ticketId, second.ticketId);
        return Object.freeze({ executionId: workflowId, revision: 6, state: 'SUCCESS', terminalArtifactId: 'resize-final', terminalImageUrl: '/api/core/artifacts/results/live-delivery' });
      },
    },
    localExecution: {
      async loadOrthogonalTransformInput({ ticketId, projectId: scopedProject }) { events.push('orthogonal-input'); assert.equal(ticketId, first.ticketId); assert.equal(scopedProject, projectId); return { width: 2, height: 3, sourceSha256: rootSha, sourceRgba: rootRgba }; },
      async uploadOrthogonalTransformImage({ ticketId, projectId: scopedProject, bytes }) { events.push('orthogonal-upload'); assert.equal(ticketId, first.ticketId); assert.equal(scopedProject, projectId); return { uploadId: 'upload-orthogonal', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), sizeBytes: bytes.byteLength, mimeType: 'image/png', width: 3, height: 2 }; },
      async loadResizeInput({ ticketId, projectId: scopedProject }) { events.push('resize-input'); assert.equal(ticketId, second.ticketId); assert.equal(scopedProject, projectId); return { width: 3, height: 2, sourceSha256: orthogonalSha, sourceRgba: orthogonalRgba }; },
      async uploadResizeImage({ ticketId, projectId: scopedProject, bytes }) { events.push('resize-upload'); assert.equal(ticketId, second.ticketId); assert.equal(scopedProject, projectId); return { uploadId: 'upload-resize', kind: 'image', role: 'COMPOSITE', sha256: 'd'.repeat(64), sizeBytes: bytes.byteLength, mimeType: 'image/png', width: 4, height: 4 }; },
    },
  };
  const views: any[] = [];
  const runner = createBoundedAgentRunner({ projectId, client: client as never, clock: (() => { let value = 100; return () => ++value; })() });
  const outcome = await runner.start({ clientRequestId: 'browser-request', sourceArtifactId: 'root-artifact', mode: 'ROTATE_90_CW', width: 4, height: 4 }, view => views.push(view));

  assert.equal(outcome.view.state, 'SUCCESS');
  assert.equal(outcome.view.terminalArtifactId, 'resize-final');
  assert.equal(outcome.view.terminalImageUrl, '/api/core/artifacts/results/live-delivery');
  assert.ok(outcome.preview);
  assert.deepEqual([...outcome.preview!.data], [...resizeRgba8(orthogonalRgba, 3, 2, { width: 4, height: 4 })]);
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0].workflowId, workflowId); assert.equal(submitted[1].workflowId, workflowId);
  assert.deepEqual(events, ['agent-start', 'orthogonal-input', 'orthogonal-upload', 'agent-result', 'resize-input', 'resize-upload', 'agent-result']);
  assert.deepEqual(views.map(view => [view.revision, view.nextAction?.operation ?? view.state]), [[1, 'ORTHOGONAL_TRANSFORM'], [3, 'RESIZE'], [6, 'SUCCESS']]);
});

test('browser runner resumes durable terminal SUCCESS without replaying local pixels or uploads', async () => {
  const localEvents: string[] = [];
  let resumeCalls = 0;
  const client = {
    agent: {
      async startBoundedDeterministic() { throw new Error('not used'); },
      async resumeBoundedDeterministic(payload) {
        resumeCalls += 1;
        assert.deepEqual(payload, { executionId: workflowId, projectId });
        return Object.freeze({ executionId: workflowId, revision: 9, state: 'SUCCESS', terminalArtifactId: 'resize-final', terminalImageUrl: '/api/core/artifacts/results/recovered-delivery' });
      },
      async submitBoundedDeterministicResult() { throw new Error('must not submit recovered SUCCESS'); },
      async retryBoundedDeterministic() { throw new Error('not used'); },
      async cancelBoundedDeterministic() { throw new Error('not used'); },
    },
    localExecution: {
      async loadOrthogonalTransformInput() { localEvents.push('orthogonal-input'); throw new Error('must not execute'); },
      async uploadOrthogonalTransformImage() { localEvents.push('orthogonal-upload'); throw new Error('must not execute'); },
      async loadResizeInput() { localEvents.push('resize-input'); throw new Error('must not execute'); },
      async uploadResizeImage() { localEvents.push('resize-upload'); throw new Error('must not execute'); },
    },
  };
  const views: any[] = [];
  const runner = createBoundedAgentRunner({ projectId, client: client as never });
  const outcome = await runner.resume(workflowId, view => views.push(view));

  assert.equal(resumeCalls, 1);
  assert.deepEqual(localEvents, []);
  assert.equal(outcome.view.state, 'SUCCESS');
  assert.equal(outcome.view.terminalArtifactId, 'resize-final');
  assert.equal(outcome.view.terminalImageUrl, '/api/core/artifacts/results/recovered-delivery');
  assert.equal(outcome.preview, undefined, 'recovered terminal view must use the server-minted delivery rather than inventing pixels');
  assert.equal(outcome.localLatencyMs, 0);
  assert.deepEqual(views.map(view => [view.revision, view.state]), [[9, 'SUCCESS']]);
});

test('browser runner stops at durable retry state instead of inventing another local attempt', async () => {
  const client = {
    agent: {
      async startBoundedDeterministic() { return Object.freeze({ executionId: workflowId, revision: 2, state: 'WAITING_FOR_LOCAL_RESULT', retryAvailable: true, attemptStatus: 'FAILED' }); },
      async resumeBoundedDeterministic() { throw new Error('not used'); }, async submitBoundedDeterministicResult() { throw new Error('must not submit'); }, async retryBoundedDeterministic() { throw new Error('not used'); }, async cancelBoundedDeterministic() { throw new Error('not used'); },
    },
    localExecution: {
      async loadOrthogonalTransformInput() { throw new Error('must not execute'); }, async uploadOrthogonalTransformImage() { throw new Error('must not execute'); }, async loadResizeInput() { throw new Error('must not execute'); }, async uploadResizeImage() { throw new Error('must not execute'); },
    },
  };
  const runner = createBoundedAgentRunner({ projectId, client: client as never });
  const outcome = await runner.start({ clientRequestId: 'browser-request', sourceArtifactId: 'root-artifact', mode: 'ROTATE_90_CW', width: 4, height: 4 });
  assert.equal(outcome.view.retryAvailable, true);
  assert.equal(outcome.view.attemptStatus, 'FAILED');
});

test('browser runner rejects an unadmitted Core nextAction before any local input is read', async () => {
  let localReads = 0;
  const forged = Object.freeze({ ...orthogonalTicket(), operation: Object.freeze({ ...orthogonalTicket().operation, type: 'BACKGROUND_ISOLATION' }) });
  const client = {
    agent: {
      async startBoundedDeterministic() { return waiting(workflowId, 1, 'BACKGROUND_ISOLATION' as never, forged); },
      async resumeBoundedDeterministic() { throw new Error('not used'); }, async submitBoundedDeterministicResult() { throw new Error('not used'); }, async retryBoundedDeterministic() { throw new Error('not used'); }, async cancelBoundedDeterministic() { throw new Error('not used'); },
    },
    localExecution: {
      async loadOrthogonalTransformInput() { localReads += 1; throw new Error('not reached'); }, async uploadOrthogonalTransformImage() { throw new Error('not reached'); }, async loadResizeInput() { localReads += 1; throw new Error('not reached'); }, async uploadResizeImage() { throw new Error('not reached'); },
    },
  };
  const runner = createBoundedAgentRunner({ projectId, client: client as never });
  await assert.rejects(() => runner.start({ clientRequestId: 'browser-request', sourceArtifactId: 'root-artifact', mode: 'ROTATE_90_CW', width: 4, height: 4 }), /does not admit operation/);
  assert.equal(localReads, 0);
});
