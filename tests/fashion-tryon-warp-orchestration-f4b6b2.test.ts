import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FASHION_TRYON_READINESS_STATUSES,
} from '../server/core/fashion/FashionTryOnReadinessService.ts';
import { FashionTryOnWarpOrchestrationService } from '../server/core/fashion/FashionTryOnWarpOrchestrationService.ts';

const auth = Object.freeze({ tenantId: 'tenant-orchestration', userId: 'user-orchestration' });
const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const representationId = '33333333-3333-4333-8333-333333333333';
const anchorSetId = '44444444-4444-4444-8444-444444444444';
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
      storageId: '55555555-5555-4555-8555-555555555555',
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

test('F4b.6b.2 READY uses only server-resolved representation and anchor evidence for F4b.4 prepare', async () => {
  const calls: any = { readiness: [], warp: [] };
  const ticket = Object.freeze({ ticketId: 'warp-ticket' });
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
  assert.equal(result.status, 'WARP_PREPARED');
  if (result.status !== 'WARP_PREPARED') throw new Error('expected WARP_PREPARED');
  assert.equal(result.executionId, 'warp-execution');
  assert.equal(result.ticket, ticket);
  assert.equal('representationId' in result, false);
  assert.equal('anchorSetId' in result, false);
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

test('F4b.6b.2 client evidence authority is rejected before readiness resolution', async () => {
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
    { garmentWarpLayerId: '66666666-6666-4666-8666-666666666666' },
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
    readiness: { resolve: async () => readyResolution({ representationId: '77777777-7777-4777-8777-777777777777' }) as any },
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
