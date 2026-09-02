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

const scope = Object.freeze({ tenantId: 'tenant-evidence-recovery', userId: 'user-evidence-recovery', projectId: '11111111-1111-4111-8111-111111111111' });
const clientRequestId = 'evidence-tryon-1:texture-composite:v1';
const executionId = garmentTextureCompositeExecutionId(scope, clientRequestId);
const idempotencyKey = garmentTextureCompositeTicketIdempotencyKey(clientRequestId);
const sourceArtifactId = 'signed-project-source';
const garmentId = '22222222-2222-4222-8222-222222222222';
const projectStorageId = '33333333-3333-4333-8333-333333333333';
const layerId = '44444444-4444-4444-8444-444444444444';
const viewId = '55555555-5555-4555-8555-555555555555';
const representationId = '66666666-6666-4666-8666-666666666666';
const anchorSetId = '77777777-7777-4777-8777-777777777777';
const finalStorageId = '88888888-8888-4888-8888-888888888888';
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
const exactEvidence = Object.freeze({
  projectImageStorageId: projectStorageId,
  projectImageSha256: hashes.project,
  projectImageWidth: 2,
  projectImageHeight: 2,
  representationId,
  representationContentSha256: hashes.representation,
  anchorSetId,
  anchorPayloadSha256: hashes.anchor,
  destinationMeshSha256: hashes.mesh,
});
const exactIntent = Object.freeze({ projectId: scope.projectId, clientRequestId, sourceArtifactId, garmentId, evidence: exactEvidence });

function ticket(): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'resolved-evidence-recovery-ticket',
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
    nonce: 'resolved-evidence-recovery-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function stored() {
  return Object.freeze({
    storageId: finalStorageId,
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
        assert.equal(ticketId, 'resolved-evidence-recovery-ticket');
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
      assert.equal(id, finalStorageId);
      return `signed-final:${id}`;
    },
  });
  return { authority, calls };
}

test('F4b.6b.4c exact current Project representation anchor and mesh evidence can recover committed FINAL', async () => {
  const h = harness();
  const result = await h.authority.recoverForResolvedEvidence(exactIntent, scope);
  assert.deepEqual(result, { status: 'SUCCESS', executionId, artifactId: `signed-final:${finalStorageId}` });
  assert.deepEqual(h.calls, { lookup: 1, finalization: 1, images: 1, issued: 1 });
});

test('F4b.6b.4c any current evidence drift fails before finalization and FINAL lookup', async () => {
  const mismatches = [
    { projectImageStorageId: '99999999-9999-4999-8999-999999999999' },
    { projectImageSha256: '0'.repeat(64) },
    { projectImageWidth: 3 },
    { projectImageHeight: 3 },
    { representationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    { representationContentSha256: '1'.repeat(64) },
    { anchorSetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { anchorPayloadSha256: '2'.repeat(64) },
    { destinationMeshSha256: '3'.repeat(64) },
  ];
  for (const mismatch of mismatches) {
    const h = harness();
    await assert.rejects(
      () => h.authority.recoverForResolvedEvidence({ ...exactIntent, evidence: { ...exactEvidence, ...mismatch } }, scope),
      (error: any) => error?.status === 409 && error?.code === 'garment_texture_final_recovery_evidence_mismatch',
    );
    assert.deepEqual(h.calls, { lookup: 1, finalization: 0, images: 0, issued: 0 });
  }
});

test('F4b.6b.4c resolved evidence input is a closed canonical server binding before durable lookup', async () => {
  const invalid = [
    { ...exactEvidence, representationId: 'abcdefab-cdef-4abc-8def-abcdefabcdef'.toUpperCase() },
    { ...exactEvidence, projectImageSha256: hashes.project.toUpperCase() },
    { ...exactEvidence, projectImageWidth: 0 },
    { ...exactEvidence, unexpected: 'client-evidence' },
  ];
  for (const evidence of invalid) {
    const h = harness();
    await assert.rejects(
      () => h.authority.recoverForResolvedEvidence({ ...exactIntent, evidence } as any, scope),
      (error: any) => error?.status === 400 && error?.code === 'invalid_garment_texture_final_recovery_request',
    );
    assert.deepEqual(h.calls, { lookup: 0, finalization: 0, images: 0, issued: 0 });
  }
});
