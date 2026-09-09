import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutomationInvocationRunner } from '../src/application/automation/createAutomationInvocationRunner.ts';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';
import { ORTHOGONAL_TRANSFORM_CAPABILITY, orthogonalTransformRgba8 } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_CAPABILITY, resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { ORTHOGONAL_TRANSFORM_TOOL_DEFINITION, RESIZE_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

const projectId = 'automation-project';
const automationId = 'automation-definition';
const invocationId = 'automation-invocation';
const workflowId = 'server-owned-workflow';
const scope = Object.freeze({ tenantId: 'tenant', userId: 'user', projectId });
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
    ticketId: 'ticket-orthogonal', version: '2', issuer: 'CORE', requestId: 'request-orthogonal', workflowId, stepId: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.operation.id,
    operation: Object.freeze({ id: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.operation.id, version: '1', type: 'ORTHOGONAL_TRANSFORM', capability: ORTHOGONAL_TRANSFORM_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: 'root-artifact', mode: 'ROTATE_90_CW', ...exact }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: 'root-artifact', kind: 'image', role: 'ORIGINAL', sha256: rootSha })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 3, height: 2 })]),
    allowedExecutors: Object.freeze([ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'automation-orthogonal', nonce: 'nonce-orthogonal', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function resizeTicket(): LocalExecutionTicketV2 {
  const exact = RESIZE_TOOL_DEFINITION.parameters.exact;
  return Object.freeze({
    ticketId: 'ticket-resize', version: '2', issuer: 'CORE', requestId: 'request-resize', workflowId, stepId: RESIZE_TOOL_DEFINITION.operation.id,
    operation: Object.freeze({ id: RESIZE_TOOL_DEFINITION.operation.id, version: '1', type: 'RESIZE', capability: RESIZE_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: 'orthogonal-final', width: 4, height: 4, ...exact }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: 'orthogonal-final', kind: 'image', role: 'COMPOSITE', sha256: orthogonalSha })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 4, height: 4 })]),
    allowedExecutors: Object.freeze([RESIZE_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'automation-resize', nonce: 'nonce-resize', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function waiting(revision: number, operation: 'ORTHOGONAL_TRANSFORM' | 'RESIZE', ticket: LocalExecutionTicketV2) {
  return Object.freeze({ invocationId, automationId, definitionRevision: 3, projectId, revision, state: 'WAITING_FOR_LOCAL_RESULT', nextAction: Object.freeze({ type: 'LOCAL_EXECUTION', operation, ticket }) });
}

test('Automation runner follows only invocation-addressed Core actions and returns terminal preview', async () => {
  const events: string[] = [];
  const submitted: any[] = [];
  const first = orthogonalTicket();
  const second = resizeTicket();
  let submitCount = 0;
  const client = {
    automation: { invocations: {
      async start(payload) { events.push('automation-start'); assert.deepEqual(payload, { automationId, definitionRevision: 3, projectId, clientRequestId: 'browser-request' }); return waiting(1, 'ORTHOGONAL_TRANSFORM', first); },
      async resume() { throw new Error('not used'); }, async retry() { throw new Error('not used'); }, async cancel() { throw new Error('not used'); },
      async submitResult(payload) {
        events.push('automation-result'); assert.equal(payload.invocationId, invocationId); submitted.push(payload.result); submitCount += 1;
        if (submitCount === 1) return waiting(3, 'RESIZE', second);
        return Object.freeze({ invocationId, automationId, definitionRevision: 3, projectId, revision: 6, state: 'SUCCESS', terminalArtifactId: 'resize-final', terminalImageUrl: '/api/core/artifacts/results/live-delivery' });
      },
    } },
    localExecution: {
      async loadOrthogonalTransformInput({ ticketId, projectId: scopedProject }) { events.push('orthogonal-input'); assert.equal(ticketId, first.ticketId); assert.equal(scopedProject, projectId); return { width: 2, height: 3, sourceSha256: rootSha, sourceRgba: rootRgba }; },
      async uploadOrthogonalTransformImage({ ticketId, projectId: scopedProject, bytes }) { events.push('orthogonal-upload'); assert.equal(ticketId, first.ticketId); assert.equal(scopedProject, projectId); return { uploadId: 'upload-orthogonal', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), sizeBytes: bytes.byteLength, mimeType: 'image/png', width: 3, height: 2 }; },
      async loadResizeInput({ ticketId, projectId: scopedProject }) { events.push('resize-input'); assert.equal(ticketId, second.ticketId); assert.equal(scopedProject, projectId); return { width: 3, height: 2, sourceSha256: orthogonalSha, sourceRgba: orthogonalRgba }; },
      async uploadResizeImage({ ticketId, projectId: scopedProject, bytes }) { events.push('resize-upload'); assert.equal(ticketId, second.ticketId); assert.equal(scopedProject, projectId); return { uploadId: 'upload-resize', kind: 'image', role: 'COMPOSITE', sha256: 'd'.repeat(64), sizeBytes: bytes.byteLength, mimeType: 'image/png', width: 4, height: 4 }; },
    },
  };
  const runner = createAutomationInvocationRunner({ projectId, client: client as never, clock: (() => { let value = 100; return () => ++value; })() });
  const outcome = await runner.start({ automationId, definitionRevision: 3, clientRequestId: 'browser-request' });

  assert.equal(outcome.view.state, 'SUCCESS');
  assert.equal(outcome.view.terminalArtifactId, 'resize-final');
  assert.ok(outcome.preview);
  assert.deepEqual([...outcome.preview!.data], [...resizeRgba8(orthogonalRgba, 3, 2, { width: 4, height: 4 })]);
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0].workflowId, workflowId);
  assert.equal(submitted[1].workflowId, workflowId);
  assert.deepEqual(events, ['automation-start', 'orthogonal-input', 'orthogonal-upload', 'automation-result', 'resize-input', 'resize-upload', 'automation-result']);
});

test('Automation runner resumes terminal SUCCESS without replaying local pixels', async () => {
  let localCalls = 0;
  const client = {
    automation: { invocations: {
      async start() { throw new Error('not used'); },
      async resume(value) { assert.equal(value, invocationId); return Object.freeze({ invocationId, automationId, definitionRevision: 3, projectId, revision: 9, state: 'SUCCESS', terminalArtifactId: 'resize-final', terminalImageUrl: '/api/core/artifacts/results/recovered' }); },
      async submitResult() { throw new Error('must not submit'); }, async retry() { throw new Error('not used'); }, async cancel() { throw new Error('not used'); },
    } },
    localExecution: {
      async loadOrthogonalTransformInput() { localCalls += 1; throw new Error('must not run'); }, async uploadOrthogonalTransformImage() { localCalls += 1; throw new Error('must not run'); }, async loadResizeInput() { localCalls += 1; throw new Error('must not run'); }, async uploadResizeImage() { localCalls += 1; throw new Error('must not run'); },
    },
  };
  const runner = createAutomationInvocationRunner({ projectId, client: client as never });
  const outcome = await runner.resume(invocationId);
  assert.equal(outcome.view.state, 'SUCCESS');
  assert.equal(outcome.preview, undefined);
  assert.equal(localCalls, 0);
});

test('Automation runner rejects cloud-cost or wrong-project tickets before local input', async () => {
  let localCalls = 0;
  const badTicket = Object.freeze({ ...orthogonalTicket(), cost: Object.freeze({ paidCloudCredits: 1, providerCalls: 1 }) });
  const client = {
    automation: { invocations: {
      async start() { return waiting(1, 'ORTHOGONAL_TRANSFORM', badTicket as LocalExecutionTicketV2); }, async resume() { throw new Error('not used'); }, async submitResult() { throw new Error('not used'); }, async retry() { throw new Error('not used'); }, async cancel() { throw new Error('not used'); },
    } },
    localExecution: {
      async loadOrthogonalTransformInput() { localCalls += 1; throw new Error('not reached'); }, async uploadOrthogonalTransformImage() { localCalls += 1; throw new Error('not reached'); }, async loadResizeInput() { localCalls += 1; throw new Error('not reached'); }, async uploadResizeImage() { localCalls += 1; throw new Error('not reached'); },
    },
  };
  const runner = createAutomationInvocationRunner({ projectId, client: client as never });
  await assert.rejects(() => runner.start({ automationId, definitionRevision: 3, clientRequestId: 'browser-request' }), /zero-cloud authority/);
  assert.equal(localCalls, 0);
});
