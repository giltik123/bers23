import assert from 'node:assert/strict';
import test from 'node:test';
import { FashionTryOnTextureContinuationService } from '../server/core/fashion/FashionTryOnTextureContinuationService.ts';
import {
  FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1,
  fashionTryOnPhaseRequestIds,
} from '../server/core/fashion/FashionTryOnOrchestrationContract.ts';
import { garmentMeshWarpExecutionId } from '../server/core/localExecution/GarmentMeshWarpExecutionContract.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const representationId = '33333333-3333-4333-8333-333333333333';
const anchorSetId = '44444444-4444-4444-8444-444444444444';
const sourceStorageId = '55555555-5555-4555-8555-555555555555';
const layerId = '66666666-6666-4666-8666-666666666666';
const sourceArtifactId = 'signed-current-project-image';
const clientRequestId = 'tryon-request-1';
const auth = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a' });
const intent = Object.freeze({ projectId, sourceArtifactId, garmentId, clientRequestId });
const phaseIds = fashionTryOnPhaseRequestIds(clientRequestId);
const warpExecutionId = garmentMeshWarpExecutionId({ ...auth, projectId }, phaseIds.garmentWarp);

const readiness = Object.freeze({
  status: 'READY' as const,
  projectId,
  sourceArtifactId,
  garmentId,
  categoryGroup: 'tops' as const,
  source: Object.freeze({
    artifactId: sourceArtifactId,
    projectId,
    storageId: sourceStorageId,
    role: 'ORIGINAL' as const,
    lifecycle: 'IMMUTABLE' as const,
    width: 256,
    height: 384,
    sha256: 'a'.repeat(64),
  }),
  representationId,
  anchorSetId,
  destinationMesh: Object.freeze({
    schemaId: 'BERS_GARMENT_DESTINATION_MESH_Q16_V1',
    coordinateSpace: 'PROJECT_IMAGE_NORMALIZED_Q16',
    sourcePointsQ16: Object.freeze([[0, 0], [65536, 0], [0, 65536]]),
    destinationPointsQ16: Object.freeze([[0, 0], [65536, 0], [0, 65536]]),
    triangles: Object.freeze([[0, 1, 2]]),
    frameAnchors: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']),
    provenance: Object.freeze({
      anchorSetId,
      projectId,
      projectImageStorageId: sourceStorageId,
      projectImageSha256: 'a'.repeat(64),
      projectImageWidth: 256,
      projectImageHeight: 384,
      anchorPayloadSha256: 'b'.repeat(64),
      garmentId,
      representationId,
      representationContentSha256: 'c'.repeat(64),
      garmentCategory: 'jackets',
    }),
    meshSha256: 'd'.repeat(64),
  }),
});

function layer(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: layerId,
    projectId,
    executionId: warpExecutionId,
    ticketId: 'warp-ticket',
    projectImageStorageId: sourceStorageId,
    projectImageSha256: 'a'.repeat(64),
    garmentId,
    viewId: '77777777-7777-4777-8777-777777777777',
    viewContentSha256: 'e'.repeat(64),
    representationId,
    representationContentSha256: 'c'.repeat(64),
    anchorSetId,
    anchorPayloadSha256: 'b'.repeat(64),
    destinationMeshSha256: 'd'.repeat(64),
    width: 256,
    height: 384,
    contentSha256: 'f'.repeat(64),
    rgba: new Uint8Array(256 * 384 * 4),
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  });
}

function harness(input: Readonly<{ resolution?: any; storedLayer?: any; textureError?: unknown }> = {}) {
  const calls = { readiness: [] as any[], layers: [] as any[], texture: [] as any[] };
  const service = new FashionTryOnTextureContinuationService({
    readiness: {
      async resolve(command: any, principal: any) {
        calls.readiness.push({ command, principal });
        return input.resolution ?? readiness;
      },
    },
    layers: {
      async loadByExecution(scope: any, requestedProjectId: string, executionId: string) {
        calls.layers.push({ scope, projectId: requestedProjectId, executionId });
        return input.storedLayer === undefined ? layer() : input.storedLayer;
      },
    },
    textureComposite: {
      async prepare(command: any, principal: any) {
        calls.texture.push({ command, principal });
        if (input.textureError) throw input.textureError;
        return Object.freeze({ executionId: 'texture-execution', ticket: Object.freeze({ ticketId: 'texture-ticket' }) as any });
      },
    },
  });
  return { service, calls };
}

test('F4b.6b.3 exact immutable warp execution is reconstructed and supplied to texture prepare with closed defaults', async () => {
  const h = harness();
  const result = await h.service.continue(intent, auth as any);
  assert.equal(result.status, 'TEXTURE_PREPARED');
  assert.equal(result.executionId, 'texture-execution');
  assert.deepEqual(h.calls.readiness[0].command, { projectId, sourceArtifactId, garmentId });
  assert.deepEqual(h.calls.layers, [{ scope: auth, projectId, executionId: warpExecutionId }]);
  assert.equal(h.calls.texture.length, 1);
  assert.deepEqual(h.calls.texture[0].command, {
    projectId,
    sourceArtifactId,
    garmentWarpLayerId: layerId,
    garmentWarpLayerSha256: 'f'.repeat(64),
    textureTransform: FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1.textureTransform,
    featherRadius: FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1.featherRadius,
    clientRequestId: phaseIds.textureComposite,
  });
  assert.deepEqual(h.calls.texture[0].principal, auth);
  assert.equal('garmentWarpLayerId' in result, false);
  assert.equal('garmentWarpLayerSha256' in result, false);
});

test('F4b.6b.3 readiness prerequisite suppresses layer lookup and texture prepare', async () => {
  const prerequisite = Object.freeze({ status: 'BODY_ANCHORS_REQUIRED', projectId, sourceArtifactId, garmentId, categoryGroup: 'tops' });
  const h = harness({ resolution: prerequisite });
  const result = await h.service.continue(intent, auth as any);
  assert.deepEqual(result, { status: 'PREREQUISITE', readiness: prerequisite });
  assert.equal(h.calls.layers.length, 0);
  assert.equal(h.calls.texture.length, 0);
});

test('F4b.6b.3 missing exact execution layer is pending and never searches or invents another layer', async () => {
  const h = harness({ storedLayer: null });
  const result = await h.service.continue(intent, auth as any);
  assert.deepEqual(result, { status: 'WARP_PENDING', projectId, sourceArtifactId, garmentId });
  assert.equal(h.calls.layers.length, 1);
  assert.equal(h.calls.layers[0].executionId, warpExecutionId);
  assert.equal(h.calls.texture.length, 0);
});

test('F4b.6b.3 immutable layer lineage mismatch fails closed before texture prepare', async () => {
  for (const stale of [
    layer({ projectImageSha256: '9'.repeat(64) }),
    layer({ representationId: '88888888-8888-4888-8888-888888888888' }),
    layer({ anchorSetId: '99999999-9999-4999-8999-999999999999' }),
    layer({ destinationMeshSha256: '8'.repeat(64) }),
  ]) {
    const h = harness({ storedLayer: stale });
    await assert.rejects(
      () => h.service.continue(intent, auth as any),
      (error: any) => error?.status === 409 && error?.code === 'fashion_tryon_warp_lineage_mismatch',
    );
    assert.equal(h.calls.texture.length, 0);
  }
});

test('F4b.6b.3 client layer or representation authority is rejected by shared intent before readiness', async () => {
  const h = harness();
  await assert.rejects(
    () => h.service.continue({ ...intent, garmentWarpLayerId: layerId }, auth as any),
    (error: any) => error?.status === 400 && error?.code === 'forbidden_client_authority',
  );
  await assert.rejects(
    () => h.service.continue({ ...intent, representationId }, auth as any),
    (error: any) => error?.status === 400 && error?.code === 'forbidden_client_authority',
  );
  assert.equal(h.calls.readiness.length, 0);
  assert.equal(h.calls.layers.length, 0);
  assert.equal(h.calls.texture.length, 0);
});
