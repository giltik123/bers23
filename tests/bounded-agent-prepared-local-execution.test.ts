import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreAuthorizedOrthogonalTransform, type CoreOrthogonalTransformClient } from '../src/application/local-execution/CoreAuthorizedOrthogonalTransform.ts';
import { CoreAuthorizedResize, type CoreResizeClient } from '../src/application/local-execution/CoreAuthorizedResize.ts';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';
import { ORTHOGONAL_TRANSFORM_CAPABILITY, orthogonalTransformRgba8 } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { RESIZE_CAPABILITY, resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { ORTHOGONAL_TRANSFORM_TOOL_DEFINITION, RESIZE_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

const scope = Object.freeze({ tenantId: 'agent-tenant', userId: 'agent-user', projectId: 'agent-project' });
const sourceHash = 'a'.repeat(64);
const rgba = new Uint8ClampedArray([
  255, 0, 0, 255, 0, 255, 0, 128,
  0, 0, 255, 64, 90, 80, 70, 0,
]);

function orthogonalTicket(): LocalExecutionTicketV2 {
  const exact = ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.parameters.exact;
  return Object.freeze({
    ticketId: 'agent-orthogonal-ticket', version: '2', issuer: 'CORE', requestId: 'agent-orthogonal-execution', workflowId: 'agent-workflow', stepId: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.operation.id,
    operation: Object.freeze({ id: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.operation.id, version: '1', type: 'ORTHOGONAL_TRANSFORM', capability: ORTHOGONAL_TRANSFORM_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: 'agent-source', mode: 'ROTATE_90_CW', ...exact }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: 'agent-source', kind: 'image', role: 'ORIGINAL', sha256: sourceHash })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'agent-orthogonal', nonce: 'orthogonal-nonce', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function resizeTicket(): LocalExecutionTicketV2 {
  const exact = RESIZE_TOOL_DEFINITION.parameters.exact;
  return Object.freeze({
    ticketId: 'agent-resize-ticket', version: '2', issuer: 'CORE', requestId: 'agent-resize-execution', workflowId: 'agent-workflow', stepId: RESIZE_TOOL_DEFINITION.operation.id,
    operation: Object.freeze({ id: RESIZE_TOOL_DEFINITION.operation.id, version: '1', type: 'RESIZE', capability: RESIZE_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: 'agent-orthogonal-final', width: 3, height: 3, ...exact }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: 'agent-orthogonal-final', kind: 'image', role: 'COMPOSITE', sha256: 'b'.repeat(64) })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 3, height: 3 })]),
    allowedExecutors: Object.freeze([RESIZE_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'agent-resize', nonce: 'resize-nonce', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

test('prepared orthogonal execution never prepares or finalizes a second ticket', async () => {
  const ticket = orthogonalTicket();
  const events: string[] = [];
  const core: CoreOrthogonalTransformClient = {
    prepareOrthogonalTransform: async () => { throw new Error('prepared Agent execution must not prepare'); },
    uploadOrthogonalTransformImage: async ({ ticketId, bytes }) => {
      events.push('upload'); assert.equal(ticketId, ticket.ticketId); assert.ok(bytes.byteLength > 0);
      return { uploadId: 'orthogonal-upload', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), sizeBytes: bytes.byteLength, mimeType: 'image/png', width: 2, height: 2 };
    },
    submitOrthogonalTransform: async () => { throw new Error('prepared Agent execution must not finalize standalone'); },
  };
  const browser = new CoreAuthorizedOrthogonalTransform(scope.projectId, core, {
    loadImage: async artifactId => { events.push('load'); assert.equal(artifactId, 'agent-source'); return { width: 2, height: 2, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }; },
    sha256: async artifactId => { events.push('hash'); assert.equal(artifactId, 'agent-source'); return sourceHash; },
  }, (() => { let value = 100; return () => ++value; })());

  const candidate = await browser.runPrepared({ ticket, sourceArtifactId: 'agent-source', mode: 'ROTATE_90_CW' });
  assert.deepEqual([...candidate.preview.data], [...orthogonalTransformRgba8(rgba, 2, 2, 'ROTATE_90_CW')]);
  assert.equal(candidate.result.ticketId, ticket.ticketId);
  assert.equal(candidate.result.workflowId, 'agent-workflow');
  assert.deepEqual(candidate.result.executor, ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor);
  assert.deepEqual(events.filter(value => value === 'upload'), ['upload']);
});

test('prepared Resize execution uses exact intermediate ticket source and never prepares or finalizes standalone', async () => {
  const ticket = resizeTicket();
  const events: string[] = [];
  const intermediateHash = ticket.inputs[0].sha256!;
  const core: CoreResizeClient = {
    prepareResize: async () => { throw new Error('prepared Agent execution must not prepare'); },
    uploadResizeImage: async ({ ticketId, bytes }) => {
      events.push('upload'); assert.equal(ticketId, ticket.ticketId); assert.ok(bytes.byteLength > 0);
      return { uploadId: 'resize-upload', kind: 'image', role: 'COMPOSITE', sha256: 'd'.repeat(64), sizeBytes: bytes.byteLength, mimeType: 'image/png', width: 3, height: 3 };
    },
    submitResize: async () => { throw new Error('prepared Agent execution must not finalize standalone'); },
  };
  const browser = new CoreAuthorizedResize(scope.projectId, core, {
    loadImage: async artifactId => { events.push('load'); assert.equal(artifactId, 'agent-orthogonal-final'); return { width: 2, height: 2, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }; },
    sha256: async artifactId => { events.push('hash'); assert.equal(artifactId, 'agent-orthogonal-final'); return intermediateHash; },
  }, (() => { let value = 200; return () => ++value; })());

  const candidate = await browser.runPrepared({ ticket, sourceArtifactId: 'agent-orthogonal-final', target: { width: 3, height: 3 } });
  assert.deepEqual([...candidate.preview.data], [...resizeRgba8(rgba, 2, 2, { width: 3, height: 3 })]);
  assert.equal(candidate.result.ticketId, ticket.ticketId);
  assert.equal(candidate.result.workflowId, 'agent-workflow');
  assert.deepEqual(candidate.result.executor, RESIZE_TOOL_DEFINITION.executor);
  assert.deepEqual(events.filter(value => value === 'upload'), ['upload']);
});

test('prepared execution rejects a forged browser source instead of trusting next-step UI state', async () => {
  const ticket = resizeTicket();
  const core: CoreResizeClient = {
    prepareResize: async () => { throw new Error('not reached'); },
    uploadResizeImage: async () => { throw new Error('not reached'); },
    submitResize: async () => { throw new Error('not reached'); },
  };
  const browser = new CoreAuthorizedResize(scope.projectId, core, {
    loadImage: async () => { throw new Error('not reached'); },
    sha256: async () => { throw new Error('not reached'); },
  });
  await assert.rejects(() => browser.runPrepared({ ticket, sourceArtifactId: 'attacker-source', target: { width: 3, height: 3 } }), /source binding is invalid/);
});
