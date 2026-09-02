import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { normalizeGarmentTextureFinalLineageParameters } from '../server/core/fashion/garmentTextureFinalLineage.ts';
import { GarmentTextureCompositeFinalRecoveryAuthority } from '../server/core/localExecution/GarmentTextureCompositeFinalRecoveryAuthority.ts';
import {
  garmentTextureCompositeExecutionId,
  garmentTextureCompositeTicketIdempotencyKey,
} from '../server/core/localExecution/GarmentTextureCompositeExecutionContract.ts';

const scope = Object.freeze({ tenantId: 'tenant-intent-recovery', userId: 'user-intent-recovery', projectId: '11111111-1111-4111-8111-111111111111' });
const clientRequestId = 'root-tryon-1:texture-composite:v1';
const executionId = garmentTextureCompositeExecutionId(scope, clientRequestId);
const idempotencyKey = garmentTextureCompositeTicketIdempotencyKey(clientRequestId);
const sourceArtifactId = 'signed-project-source';
const garmentId = '22222222-2222-4222-8222-222222222222';
const otherGarmentId = '33333333-3333-4333-8333-333333333333';
const projectStorageId = '44444444-4444-4444-8444-444444444444';
const layerId = '55555555-5555-4555-8555-555555555555';
const viewId = '66666666-6666-4666-8666-666666666666';
const representationId = '77777777-7777-4777-8777-777777777777';
const anchorSetId = '88888888-8888-4888-8888-888888888888';
const storageId = '99999999-9999-4999-8999-999999999999';
const hashes = Object.freeze({ project: 'a'.repeat(64), layer: 'b'.repeat(64), view: 'c'.repeat(64), representation: 'd'.repeat(64), anchor: 'e'.repeat(64), mesh: 'f'.repeat(64) });
const producer = normalizeGarmentTextureFinalLineageParameters({
  schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  textureTransform: Object.freeze({ scaleXQ16: 65536, scaleYQ16: 65536, offsetXQ16: 0, offsetYQ16: 0, wrapMode: 'CLAMP', alphaPolicy: 'PRESERVE_BASE_ALPHA' }),
  featherRadius: 2,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});
const view = Object.freeze({ authority: 'MANAGED_GARMENT' as const, kind: 'GARMENT_VIEW' as const, garmentId, viewId, contentSha256: hashes.view, contentType: 'image/png' as const, encoding: 'PNG_RGBA8_LOSSLESS' as const, width: 2, height: 2 });
const representation = Object.freeze({ authority: 'MANAGED_GARMENT' as const, kind: 'GARMENT_REPRESENTATION' as const, garmentId, representationId, tier: 'PARAMETRIC' as const, format: 'BERS_PARAMETRIC_V1' as const, contentType: 'application/vnd.bers.garment-parametric+json' as const, contentSha256: hashes.representation, basisViewId: viewId, generatorId: 'bers.manual-parametric-contour', generatorVersion: '1', validatorId: 'bers.parametric-topology-validator', validatorVersion: '1' });
const parameters = Object.freeze({
  sourceArtifactId,
  projectImageStorageId: projectStorageId,
  projectImageSha256: hashes.project,
  garmentWarpLayerId: layerId,
  garmentWarpLayerSha256: hashes.layer,
  garmentId,
  viewId,
  viewSha256: hashes.view,
  representationId,
  representationSha256: hashes.representation,
  anchorSetId,
  anchorPayloadSha256: hashes.anchor,
  destinationMeshSha256: hashes.mesh,
  producerParameters: producer.document,
  producerParametersSha256: producer.sha256,
  deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
  maxDimension: 4096,
  maxOutputPixels: 8_388_608,
});

function ticket(): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'intent-recovery-ticket',
    version: '2',
    issuer: 'CORE',
    requestId: executionId,
    workflowId: executionId,
    stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    operation: Object.freeze({ id: GARMENT_TEXTURE_COMPOSITE_STEP_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION, type: GARMENT_TEXTURE_COMPOSITE_OPERATION, capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY, parameters }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, kind: 'image', role: 'ORIGINAL', sha256: hashes.project })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey,
    nonce: 'intent-recovery-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function stored() {
  return Object.freeze({
    storageId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    projectId: scope.projectId,
    executionId,
    operationId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    role: 'COMPOSITE',
    lifecycle: 'FINAL',
    width: 2,
    height: 2,
    encoding: 'PNG_RGBA8_LOSSLESS',
    contentType: 'image/png',
    bytes: Uint8Array.from([1]),
    sourceImageStorageId: projectStorageId,
    producerOperation: 'GARMENT_TEXTURE_COMPOSITE',
    garmentWarpLayerId: layerId,
    garmentWarpLayerSha256: hashes.layer,
    producerParameters: producer.document,
    producerParametersSha256: producer.sha256,
  });
}

function harness() {
  const calls = { lookup: 0, finalization: 0, images: 0, issued: 0 };
  const authority = new GarmentTextureCompositeFinalRecoveryAuthority({
    admission: {
      async getByIdempotencyKeyV2(requestScope: any, key: string) {
        calls.lookup += 1;
        assert.deepEqual(requestScope, scope);
        assert.equal(key, idempotencyKey);
        return ticket();
      },
      async getFinalization(ticketId: string) {
        calls.finalization += 1;
        assert.equal(ticketId, 'intent-recovery-ticket');
        return Object.freeze({ status: 'SUCCESS' as const });
      },
    },
    images: {
      async loadFinalByExecution(requestExecutionId: string, requestScope: any) {
        calls.images += 1;
        assert.equal(requestExecutionId, executionId);
        assert.deepEqual(requestScope, scope);
        return stored() as any;
      },
    },
    issueFinalId: (id) => {
      calls.issued += 1;
      assert.equal(id, storageId);
      return `signed-final:${id}`;
    },
  });
  return { authority, calls };
}

const exactIntent = Object.freeze({ projectId: scope.projectId, clientRequestId, sourceArtifactId, garmentId });

test('F4b.6b.4c exact stable source and garment intent can recover the committed FINAL', async () => {
  const h = harness();
  const result = await h.authority.recoverForIntent(exactIntent, scope);
  assert.deepEqual(result, { status: 'SUCCESS', executionId, artifactId: `signed-final:${storageId}` });
  assert.deepEqual(h.calls, { lookup: 1, finalization: 1, images: 1, issued: 1 });
});

test('F4b.6b.4c same phase identity cannot recover a FINAL for a different garment', async () => {
  const h = harness();
  await assert.rejects(
    () => h.authority.recoverForIntent({ ...exactIntent, garmentId: otherGarmentId }, scope),
    (error: any) => error?.status === 409 && error?.code === 'garment_texture_final_recovery_intent_mismatch',
  );
  assert.deepEqual(h.calls, { lookup: 1, finalization: 0, images: 0, issued: 0 });
});

test('F4b.6b.4c same phase identity cannot recover a FINAL for a different signed source intent', async () => {
  const h = harness();
  await assert.rejects(
    () => h.authority.recoverForIntent({ ...exactIntent, sourceArtifactId: 'signed-other-project-source' }, scope),
    (error: any) => error?.status === 409 && error?.code === 'garment_texture_final_recovery_intent_mismatch',
  );
  assert.deepEqual(h.calls, { lookup: 1, finalization: 0, images: 0, issued: 0 });
});

test('F4b.6b.4c validates stable intent before durable lookup', async () => {
  const h = harness();
  await assert.rejects(() => h.authority.recoverForIntent({ ...exactIntent, garmentId: 'not-a-uuid' }, scope), /garmentId/i);
  await assert.rejects(() => h.authority.recoverForIntent({ ...exactIntent, sourceArtifactId: 'bad\nsource' }, scope), /sourceArtifactId/i);
  await assert.rejects(() => h.authority.recoverForIntent({ ...exactIntent, sourceArtifactId: 'x'.repeat(513) }, scope), /sourceArtifactId/i);
  assert.deepEqual(h.calls, { lookup: 0, finalization: 0, images: 0, issued: 0 });
});
