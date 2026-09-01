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

const scope = Object.freeze({ tenantId: 'tenant-recovery', userId: 'user-recovery', projectId: '11111111-1111-4111-8111-111111111111' });
const clientRequestId = 'tryon-request-1:texture-composite:v1';
const executionId = garmentTextureCompositeExecutionId(scope, clientRequestId);
const idempotencyKey = garmentTextureCompositeTicketIdempotencyKey(clientRequestId);
const projectStorageId = '22222222-2222-4222-8222-222222222222';
const layerId = '33333333-3333-4333-8333-333333333333';
const garmentId = '44444444-4444-4444-8444-444444444444';
const viewId = '55555555-5555-4555-8555-555555555555';
const representationId = '66666666-6666-4666-8666-666666666666';
const anchorSetId = '77777777-7777-4777-8777-777777777777';
const storageId = '88888888-8888-4888-8888-888888888888';
const sourceArtifactId = 'signed-project-source';
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

function exactTicket(overrides: Record<string, unknown> = {}): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'texture-recovery-ticket',
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
    nonce: 'recovery-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  } as LocalExecutionTicketV2);
}

function stored(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  });
}

function harness(input: Readonly<{ ticket?: LocalExecutionTicketV2 | null; finalization?: 'SUCCESS' | 'FAILED' | 'UNKNOWN' | null; final?: any }> = {}) {
  const calls = { lookup: [] as any[], finalization: [] as string[], images: [] as any[], issued: [] as string[] };
  const ticket = input.ticket === undefined ? exactTicket() : input.ticket;
  const authority = new GarmentTextureCompositeFinalRecoveryAuthority({
    admission: {
      async getByIdempotencyKeyV2(requestScope: any, key: string) {
        calls.lookup.push({ scope: requestScope, key });
        return ticket ?? undefined;
      },
      async getFinalization(ticketId: string) {
        calls.finalization.push(ticketId);
        if (input.finalization === null) return undefined;
        return Object.freeze({ status: input.finalization ?? 'SUCCESS' });
      },
    },
    images: {
      async loadFinalByExecution(requestExecutionId: string, requestScope: any) {
        calls.images.push({ executionId: requestExecutionId, scope: requestScope });
        return input.final === null ? undefined : (input.final ?? stored()) as any;
      },
    },
    issueFinalId: (id) => { calls.issued.push(id); return `signed-final:${id}`; },
  });
  return { authority, calls };
}

test('F4b.6b.4a reconstructs exact ticket identity and returns signed committed FINAL', async () => {
  const h = harness();
  const result = await h.authority.recover({ projectId: scope.projectId, clientRequestId }, scope);
  assert.deepEqual(result, { status: 'SUCCESS', executionId, artifactId: `signed-final:${storageId}` });
  assert.deepEqual(h.calls.lookup, [{ scope, key: idempotencyKey }]);
  assert.deepEqual(h.calls.finalization, ['texture-recovery-ticket']);
  assert.deepEqual(h.calls.images, [{ executionId, scope }]);
  assert.deepEqual(h.calls.issued, [storageId]);
});

test('F4b.6b.4a reports not-prepared pending and failed durable states without inventing FINAL identity', async () => {
  const notPrepared = harness({ ticket: null });
  assert.deepEqual(await notPrepared.authority.recover({ projectId: scope.projectId, clientRequestId }, scope), { status: 'NOT_PREPARED' });
  assert.equal(notPrepared.calls.finalization.length, 0);
  assert.equal(notPrepared.calls.images.length, 0);

  for (const finalization of [null, 'UNKNOWN'] as const) {
    const pending = harness({ finalization });
    assert.deepEqual(await pending.authority.recover({ projectId: scope.projectId, clientRequestId }, scope), { status: 'PENDING', executionId });
    assert.equal(pending.calls.images.length, 0);
  }

  const failed = harness({ finalization: 'FAILED' });
  assert.deepEqual(await failed.authority.recover({ projectId: scope.projectId, clientRequestId }, scope), { status: 'FAILED', executionId });
  assert.equal(failed.calls.images.length, 0);
  assert.equal(failed.calls.issued.length, 0);
});

test('F4b.6b.4a rejects durable ticket scope and phase identity mismatches before FINAL lookup', async () => {
  const cases = [
    exactTicket({ scope: Object.freeze({ ...scope, userId: 'other-user' }) }),
    exactTicket({ requestId: 'garment-texture-composite:wrong', workflowId: 'garment-texture-composite:wrong' }),
    exactTicket({ idempotencyKey: 'wrong:garment-texture-composite:local-v2' }),
  ];
  for (const ticket of cases) {
    const h = harness({ ticket });
    await assert.rejects(() => h.authority.recover({ projectId: scope.projectId, clientRequestId }, scope), (error: any) => error?.status === 403 || error?.status === 409);
    assert.equal(h.calls.images.length, 0);
    assert.equal(h.calls.issued.length, 0);
  }
});

test('F4b.6b.4a SUCCESS finalization requires exact stored execution operation output and Fashion lineage', async () => {
  const mismatches = [
    stored({ operationId: 'other-operation' }),
    stored({ width: 3 }),
    stored({ sourceImageStorageId: '99999999-9999-4999-8999-999999999999' }),
    stored({ garmentWarpLayerSha256: '0'.repeat(64) }),
    stored({ producerParametersSha256: '1'.repeat(64) }),
  ];
  for (const final of mismatches) {
    const h = harness({ final });
    await assert.rejects(
      () => h.authority.recover({ projectId: scope.projectId, clientRequestId }, scope),
      (error: any) => error?.status === 409 && error?.code === 'garment_texture_final_recovery_lineage_mismatch',
    );
    assert.equal(h.calls.issued.length, 0);
  }

  const missing = harness({ final: null });
  await assert.rejects(
    () => missing.authority.recover({ projectId: scope.projectId, clientRequestId }, scope),
    (error: any) => error?.status === 409 && error?.code === 'garment_texture_final_recovery_artifact_unavailable',
  );
});

test('F4b.6b.4a validates only stable Project and phase request intent', async () => {
  const h = harness();
  await assert.rejects(() => h.authority.recover({ projectId: 'not-a-uuid', clientRequestId }, scope), /projectId/i);
  await assert.rejects(() => h.authority.recover({ projectId: scope.projectId, clientRequestId: 'bad request' }, scope), /clientRequestId/i);
  assert.equal(h.calls.lookup.length, 0);
});
