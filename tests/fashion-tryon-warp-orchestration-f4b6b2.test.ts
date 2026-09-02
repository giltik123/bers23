import assert from 'node:assert/strict';
import test from 'node:test';
import { FASHION_TRYON_READINESS_STATUSES } from '../server/core/fashion/FashionTryOnReadinessService.ts';
import { FashionTryOnWarpOrchestrationService } from '../server/core/fashion/FashionTryOnWarpOrchestrationService.ts';

const auth = Object.freeze({ tenantId: 'tenant-orchestration', userId: 'user-orchestration' });
const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const representationId = '33333333-3333-4333-8333-333333333333';
const anchorSetId = '44444444-4444-4444-8444-444444444444';
const viewId = '55555555-5555-4555-8555-555555555555';
const sourceArtifactId = 'signed-current-project-source';
const intent = Object.freeze({ projectId, sourceArtifactId, garmentId, clientRequestId: 'tryon-user-request-1' });

function readyResolution(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    status: 'READY',
    projectId,
    sourceArtifactId,
    garmentId,
    categoryGroup: 'tops',
    source: Object.freeze({
      artifactId: sourceArtifactId,
      projectId,
      storageId: '66666666-6666-4666-8666-666666666666',
      role: 'COMPOSITE',
      lifecycle: 'FINAL',
      width: 640,
      height: 960,
      sha256: 'a'.repeat(64),
    }),
    representationId,
    anchorSetId,
    destinationMesh: Object.freeze({ meshSha256: 'b'.repeat(64) }),
    ...overrides,
  });
}

function overRichTicket() {
  return Object.freeze({
    ticketId: 'warp-ticket',
    requestId: 'warp-execution',
    workflowId: 'warp-execution',
    operation: Object.freeze({
      parameters: Object.freeze({ representationId, anchorSetId, viewId, sourceImageStorageId: 'internal-storage', evidenceSha256: 'c'.repeat(64) }),
    }),
    managedInputs: Object.freeze([Object.freeze({ representationId, viewId })]),
    inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, sha256: 'd'.repeat(64) })]),
  });
}

test('F4b.6b.2 READY uses only server-resolved evidence and projects opaque ticketId', async () => {
  const calls: any = { readiness: [], warp: [] };
  const ticket = overRichTicket();
  const service = new FashionTryOnWarpOrchestrationService({
    readiness: {
      resolve: async (command: any, principal: any) => {
        calls.readiness.push({ command, principal });
        return readyResolution() as any;
      },
    },
    garmentWarp: {
      prepare: async (command: any, principal: any) => {
        calls.warp.push({ command, principal });
        return Object.freeze({ executionId: 'warp-execution', ticket: ticket as any });
      },
    },
  });

  const result = await service.prepare(intent, auth as any);
  assert.deepEqual(result, {
    status: 'WARP_PREPARED',
    projectId,
    sourceArtifactId,
    garmentId,
    categoryGroup: 'tops',
    executionId: 'warp-execution',
    ticketId: 'warp-ticket',
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of [representationId, anchorSetId, viewId, 'internal-storage', 'evidenceSha256', 'managedInputs', 'operation']) {
    assert.equal(serialized.includes(forbidden), false, `public orchestration result leaked ${forbidden}`);
  }
  assert.equal('ticket' in result, false);
  assert.deepEqual(calls.readiness, [{
    command: { projectId, sourceArtifactId, garmentId },
    principal: auth,
  }]);
  assert.deepEqual(calls.warp, [{
    command: {
      projectId,
      sourceArtifactId,
      garmentId,
      representationId,
      anchorSetId,
      clientRequestId: 'tryon-user-request-1:garment-warp:v1',
    },
    principal: auth,
  }]);
});

test('F4b.6b.2 every readiness failure suppresses mesh-warp preparation', async () => {
  for (const status of FASHION_TRYON_READINESS_STATUSES.filter(value => value !== 'READY')) {
    let warpCalls = 0;
    const service = new FashionTryOnWarpOrchestrationService({
      readiness: {
        resolve: async () => Object.freeze({ status, projectId, sourceArtifactId, garmentId }) as any,
      },
      garmentWarp: {
        prepare: async () => {
          warpCalls += 1;
          throw new Error('must not prepare');
        },
      },
    });
    const result = await service.prepare(intent, auth as any);
    assert.equal(result.status, 'PREREQUISITE');
    if (result.status !== 'PREREQUISITE') throw new Error('expected prerequisite');
    assert.equal(result.readiness.status, status);
    assert.equal(warpCalls, 0, `${status} must not prepare F4b.4 execution`);
  }
});

test('F4b.6b.2 rejects client execution/evidence authority before readiness resolution', async () => {
  let readinessCalls = 0;
  const service = new FashionTryOnWarpOrchestrationService({
    readiness: {
      resolve: async () => {
        readinessCalls += 1;
        return readyResolution() as any;
      },
    },
    garmentWarp: { prepare: async () => { throw new Error('must not prepare'); } },
  });

  for (const extra of [
    { representationId },
    { anchorSetId },
    { viewId },
    { ticketId: 'client-ticket' },
    { executionId: 'client-execution' },
    { storageId: '77777777-7777-4777-8777-777777777777' },
    { garmentWarpLayerId: '88888888-8888-4888-8888-888888888888' },
    { garmentWarpLayerSha256: 'f'.repeat(64) },
    { garments: [garmentId] },
  ]) {
    await assert.rejects(
      service.prepare({ ...intent, ...extra }, auth as any),
      (cause: any) => cause?.status === 400 && cause?.code === 'forbidden_client_authority',
    );
  }
  assert.equal(readinessCalls, 0);
});

test('F4b.6b.2 durable F4b.4 evidence/idempotency conflict propagates instead of rebinding request', async () => {
  const service = new FashionTryOnWarpOrchestrationService({
    readiness: { resolve: async () => readyResolution({ representationId: '99999999-9999-4999-8999-999999999999' }) as any },
    garmentWarp: {
      prepare: async () => {
        throw Object.assign(new Error('durable ticket owns different evidence'), {
          status: 409,
          code: 'local_execution_idempotency_mismatch',
        });
      },
    },
  });
  await assert.rejects(
    service.prepare(intent, auth as any),
    (cause: any) => cause?.status === 409 && cause?.code === 'local_execution_idempotency_mismatch',
  );
});
