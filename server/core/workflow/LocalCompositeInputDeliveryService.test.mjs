import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalCompositeInputDeliveryService } from './LocalCompositeInputDeliveryService.ts';
import { LOCAL_COMPOSITE_CONTINUATION_STEPS } from './LocalCompositeContinuationService.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';

const SEGMENT = LOCAL_COMPOSITE_CONTINUATION_STEPS.segment;
const BACKGROUND = LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation;
const scope = Object.freeze({ tenantId: 'tenant-agent', userId: 'user-agent', projectId: 'project-agent' });
const executionId = 'agent-composite-execution';
const sourceId = 'source-artifact';
const maskId = 'mask-artifact';
const sourceHash = 'a'.repeat(64);
const maskHash = 'b'.repeat(64);
const expiresAt = 2_000_000_000_000;
const now = 1_900_000_000_000;
const sourcePixels = new Uint8ClampedArray([
  10, 20, 30, 255, 40, 50, 60, 255,
  70, 80, 90, 255, 100, 110, 120, 255,
]);
const maskAlpha = new Uint8Array([255, 128, 64, 0]);

function binding(ticket) {
  return Object.freeze({
    stepId: ticket.stepId,
    ticketId: ticket.ticketId,
    ticketVersion: ticket.version,
    nonce: ticket.nonce,
    expiresAt: new Date(ticket.expiresAt).toISOString(),
  });
}

function segmentTicket(overrides = {}) {
  return Object.freeze({
    ticketId: 'segment-ticket', version: '1', issuer: 'CORE', requestId: executionId, workflowId: executionId,
    stepId: SEGMENT,
    operation: Object.freeze({
      id: SEGMENT, version: '1', type: 'segment', capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment,
      parameters: Object.freeze({ selectionRequestId: 'request:segment', analysis: Object.freeze({}), points: Object.freeze([]) }),
    }),
    scope,
    inputs: Object.freeze([{ artifactId: sourceId, kind: 'image', role: 'ORIGINAL', sha256: sourceHash }]),
    expectedOutputs: Object.freeze([{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: Object.freeze(['application/octet-stream']), width: 2, height: 2 }]),
    allowedModels: Object.freeze([{ modelId: 'mobilesam-vit-t', revision: 'test', weightsSha256: 'c'.repeat(64), runtime: 'ONNX_RUNTIME_WEB', accelerator: 'WASM', deterministic: true }]),
    policy: 'LOCAL_ONLY', idempotencyKey: 'segment-key', nonce: 'segment-nonce', expiresAt,
    ...overrides,
  });
}

function backgroundTicket(overrides = {}) {
  return Object.freeze({
    ticketId: 'background-ticket', version: '2', issuer: 'CORE', requestId: executionId, workflowId: executionId,
    stepId: BACKGROUND,
    operation: Object.freeze({
      id: BACKGROUND, version: '1', type: 'BACKGROUND_ISOLATION', capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation,
      parameters: Object.freeze({ sourceArtifactId: sourceId, maskArtifactId: maskId, deterministicTool: 'background-isolation@1' }),
    }),
    scope,
    inputs: Object.freeze([
      { artifactId: sourceId, kind: 'image', role: 'ORIGINAL', sha256: sourceHash },
      { artifactId: maskId, kind: 'mask', role: 'MASK', sha256: maskHash },
    ]),
    expectedOutputs: Object.freeze([{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 }]),
    allowedExecutors: Object.freeze([{ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1', deterministic: true }]),
    policy: 'LOCAL_ONLY', idempotencyKey: 'background-key', nonce: 'background-nonce', expiresAt,
    ...overrides,
  });
}

function snapshot(ticket, overrides = {}) {
  return Object.freeze({
    executionId, clientRequestId: 'agent-request', scope,
    plan: Object.freeze({ planId: 'local-background-isolation-composite', planRevision: '1', planDigest: 'd'.repeat(64) }),
    inputArtifacts: Object.freeze([{ artifactId: sourceId, kind: 'image', role: 'ORIGINAL', sha256: sourceHash, parentArtifactIds: Object.freeze([]) }]),
    state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: ticket.stepId, outstandingLocal: binding(ticket),
    completedSteps: Object.freeze([]), revision: 2,
    createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  });
}

function sourceArtifact() {
  return Object.freeze({
    id: sourceId, kind: 'image', role: 'ORIGINAL', state: 'AVAILABLE', producerOperationId: 'user-input', scope,
    value: Object.freeze({ width: 2, height: 2, data: sourcePixels }),
    metadata: Object.freeze({ sha256: sourceHash }),
  });
}
function maskArtifact() {
  return Object.freeze({
    id: maskId, kind: 'mask', role: 'MASK', state: 'AVAILABLE', producerOperationId: 'segment', scope,
    value: Object.freeze({ width: 2, height: 2, alpha: maskAlpha }),
    metadata: Object.freeze({ sha256: maskHash }),
  });
}

function sameScope(a, b) {
  return a?.tenantId === b.tenantId && a?.userId === b.userId && a?.projectId === b.projectId;
}

function harness(ticket, snapshotValue = snapshot(ticket)) {
  const calls = { continuationScopes: [], get: 0, getV2: 0, owns: [], hydrate: [] };
  const service = new LocalCompositeInputDeliveryService({
    continuations: Object.freeze({
      async get(id, requestedScope) {
        assert.equal(id, executionId);
        calls.continuationScopes.push({ ...requestedScope });
        return sameScope(requestedScope, scope) ? snapshotValue : undefined;
      },
    }),
    tickets: Object.freeze({
      async get(id) { calls.get += 1; return id === ticket.ticketId && ticket.version === '1' ? ticket : undefined; },
      async getV2(id) { calls.getV2 += 1; return id === ticket.ticketId && ticket.version === '2' ? ticket : undefined; },
    }),
    async ownsArtifacts(requestedScope, ids) { calls.owns.push([...ids]); assert.deepEqual(requestedScope, scope); return true; },
    async hydrateArtifacts(requestedScope, source, masks) {
      calls.hydrate.push([source, [...masks]]); assert.deepEqual(requestedScope, scope);
      return masks.length ? Object.freeze([sourceArtifact(), maskArtifact()]) : Object.freeze([sourceArtifact()]);
    },
    now: () => now,
  });
  return { service, calls };
}

test('durable composite SEGMENT input is derived from the outstanding workflow ticket, not browser ticket authority', async () => {
  const ticket = segmentTicket();
  const { service, calls } = harness(ticket);
  const delivered = await service.deliver(executionId, scope);
  assert.equal(delivered.step, 'SEGMENT');
  assert.equal(delivered.executionId, executionId);
  assert.equal(delivered.ticketId, ticket.ticketId);
  assert.equal(delivered.sourceArtifactId, sourceId);
  assert.equal(delivered.sourceSha256, sourceHash);
  assert.equal(delivered.width, 2); assert.equal(delivered.height, 2);
  assert.deepEqual([...delivered.sourceRgba], [...sourcePixels]);
  assert.equal(calls.get, 1); assert.equal(calls.getV2, 0);
  assert.deepEqual(calls.owns, [[sourceId]]);
  assert.deepEqual(calls.hydrate, [[sourceId, []]]);
});

test('durable composite BACKGROUND_ISOLATION input rehydrates exact IMAGE + MASK from the Core-selected outstanding ticket', async () => {
  const ticket = backgroundTicket();
  const { service, calls } = harness(ticket);
  const delivered = await service.deliver(executionId, scope);
  assert.equal(delivered.step, 'BACKGROUND_ISOLATION');
  assert.equal(delivered.ticketId, ticket.ticketId);
  assert.equal(delivered.sourceArtifactId, sourceId);
  assert.equal(delivered.maskArtifactId, maskId);
  assert.equal(delivered.sourceSha256, sourceHash); assert.equal(delivered.maskSha256, maskHash);
  assert.deepEqual([...delivered.sourceRgba], [...sourcePixels]);
  assert.deepEqual([...delivered.maskAlpha], [...maskAlpha]);
  assert.equal(calls.get, 0); assert.equal(calls.getV2, 1);
  assert.deepEqual(calls.owns, [[sourceId, maskId]]);
  assert.deepEqual(calls.hydrate, [[sourceId, [maskId]]]);
});

test('delivery rejects forged capability before exposing canonical bytes', async () => {
  const ticket = segmentTicket({ operation: Object.freeze({ id: SEGMENT, version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1', parameters: Object.freeze({}) }) });
  const { service, calls } = harness(ticket);
  await assert.rejects(service.deliver(executionId, scope), /composite segmentation contract/);
  assert.deepEqual(calls.owns, []); assert.deepEqual(calls.hydrate, []);
});

test('delivery rejects terminal or non-outstanding workflow state and never falls back to a ticket lookup', async () => {
  const ticket = segmentTicket();
  const terminal = snapshot(ticket, { state: 'SUCCESS', currentStepId: undefined, outstandingLocal: undefined, terminalArtifactId: 'final-artifact' });
  const { service, calls } = harness(ticket, terminal);
  await assert.rejects(service.deliver(executionId, scope), /only for the exact outstanding local step/);
  assert.equal(calls.get, 0); assert.equal(calls.getV2, 0);
});

test('delivery rejects a durable binding that no longer matches ticket nonce or expiry binding before hydration', async () => {
  const ticket = segmentTicket();
  const mismatched = snapshot(ticket, { outstandingLocal: Object.freeze({ ...binding(ticket), nonce: 'different-nonce' }) });
  const { service, calls } = harness(ticket, mismatched);
  await assert.rejects(service.deliver(executionId, scope), /ticket binding no longer matches/);
  assert.deepEqual(calls.owns, []); assert.deepEqual(calls.hydrate, []);
});

test('delivery uses the injected clock and rejects an expired outstanding ticket before artifact reads', async () => {
  const ticket = segmentTicket({ expiresAt: now - 1 });
  const { service, calls } = harness(ticket, snapshot(ticket));
  await assert.rejects(service.deliver(executionId, scope), Object.assign(new Error(), { code: undefined }));
  try {
    await service.deliver(executionId, scope);
    assert.fail('expired ticket unexpectedly delivered bytes');
  } catch (error) {
    assert.equal(error.code, 'local_ticket_expired');
    assert.equal(error.status, 410);
  }
  assert.deepEqual(calls.owns, []); assert.deepEqual(calls.hydrate, []);
});

test('delivery denies a different authenticated project scope before ticket or artifact authority is consulted', async () => {
  const ticket = segmentTicket();
  const { service, calls } = harness(ticket);
  const foreign = Object.freeze({ ...scope, projectId: 'other-project' });
  try {
    await service.deliver(executionId, foreign);
    assert.fail('foreign scope unexpectedly delivered bytes');
  } catch (error) {
    assert.equal(error.code, 'local_composite_not_found');
    assert.equal(error.status, 404);
  }
  assert.equal(calls.get, 0); assert.equal(calls.getV2, 0);
  assert.deepEqual(calls.owns, []); assert.deepEqual(calls.hydrate, []);
});
