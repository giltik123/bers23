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

const scope = Object.freeze({
  tenantId: 'tenant-intent-recovery',
  userId: 'user-intent-recovery',
  projectId: '11111111-1111-4111-8111-111111111111',
});
const clientRequestId = 'tryon-root:texture-composite:v1';
const sourceArtifactId = 'signed-project-source';
const garmentId = '22222222-2222-4222-8222-222222222222';
const projectStorageId = '33333333-3333-4333-8333-333333333333';
const layerId = '44444444-4444-4444-8444-444444444444';
const viewId = '55555555-5555-4555-8555-555555555555';
const representationId = '66666666-6666-4666-8666-666666666666';
const anchorSetId = '77777777-7777-4777-8777-777777777777';
const executionId = garmentTextureCompositeExecutionId(scope, clientRequestId);
const idempotencyKey = garmentTextureCompositeTicketIdempotencyKey(clientRequestId);
const hashes = Object.freeze({
  project: 'a'.repeat(64),
  layer: 'b'.repeat(64),
  view: 'c'.repeat(64),
  representation: 'd'.repeat(64),
  anchor: 'e'.repeat(64),
  mesh: 'f'.repeat(64),
});
const producer = normalizeGarmentTextureFinalLineageParameters({
  schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  textureTransform: Object.freeze({
    scaleXQ16: 65_536,
    scaleYQ16: 65_536,
    offsetXQ16: 0,
    offsetYQ16: 0,
    wrapMode: 'CLAMP',
    alphaPolicy: 'PRESERVE_BASE_ALPHA',
  }),
  featherRadius: 2,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});
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
    operation: Object.freeze({
      id: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
      version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
      type: GARMENT_TEXTURE_COMPOSITE_OPERATION,
      capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
      parameters,
    }),
    scope,
    inputs: Object.freeze([Object.freeze({
      artifactId: sourceArtifactId,
      kind: 'image',
      role: 'ORIGINAL',
      sha256: hashes.project,
    })]),
    managedInputs: Object.freeze([
      Object.freeze({
        authority: 'MANAGED_GARMENT',
        kind: 'GARMENT_VIEW',
        garmentId,
        viewId,
        contentSha256: hashes.view,
        contentType: 'image/png',
        encoding: 'PNG_RGBA8_LOSSLESS',
        width: 2,
        height: 2,
      }),
      Object.freeze({
        authority: 'MANAGED_GARMENT',
        kind: 'GARMENT_REPRESENTATION',
        garmentId,
        representationId,
        tier: 'PARAMETRIC',
        format: 'BERS_PARAMETRIC_V1',
        contentType: 'application/vnd.bers.garment-parametric+json',
        contentSha256: hashes.representation,
        basisViewId: viewId,
        generatorId: 'bers.manual-parametric-contour',
        generatorVersion: '1',
        validatorId: 'bers.parametric-topology-validator',
        validatorVersion: '1',
      }),
    ]),
    expectedOutputs: Object.freeze([Object.freeze({
      kind: 'image',
      role: 'COMPOSITE',
      count: 1,
      mimeTypes: Object.freeze(['image/png']),
      width: 2,
      height: 2,
    })]),
    allowedExecutors: Object.freeze([Object.freeze({
      kind: 'DETERMINISTIC_TOOL',
      toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
      version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
    })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey,
    nonce: 'intent-recovery-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function harness() {
  const calls = {
    lookup: [] as any[],
    finalization: [] as string[],
    images: [] as any[],
    issued: [] as string[],
  };
  const authority = new GarmentTextureCompositeFinalRecoveryAuthority({
    admission: {
      async getByIdempotencyKeyV2(requestScope: any, key: string) {
        calls.lookup.push({ scope: requestScope, key });
        return ticket();
      },
      async getFinalization(ticketId: string) {
        calls.finalization.push(ticketId);
        return Object.freeze({ status: 'UNKNOWN' as const });
      },
    },
    images: {
      async loadFinalByExecution(requestExecutionId: string, requestScope: any) {
        calls.images.push({ executionId: requestExecutionId, scope: requestScope });
        return undefined;
      },
    },
    issueFinalId(id) {
      calls.issued.push(id);
      return `signed:${id}`;
    },
  });
  return { authority, calls };
}

test('F4b.6b.4c purpose-bound recovery accepts the exact source + garment intent before durable state mapping', async () => {
  const h = harness();
  const result = await h.authority.recoverForIntent({
    projectId: scope.projectId,
    clientRequestId,
    sourceArtifactId,
    garmentId,
  }, scope);
  assert.deepEqual(result, { status: 'PENDING', executionId });
  assert.deepEqual(h.calls.lookup, [{ scope, key: idempotencyKey }]);
  assert.deepEqual(h.calls.finalization, ['intent-recovery-ticket']);
  assert.equal(h.calls.images.length, 0);
  assert.equal(h.calls.issued.length, 0);
});

test('F4b.6b.4c rejects same phase identity reused for a different source or garment before finalization', async () => {
  const mismatches = [
    { sourceArtifactId: 'different-signed-source', garmentId },
    { sourceArtifactId, garmentId: '88888888-8888-4888-8888-888888888888' },
  ];
  for (const mismatch of mismatches) {
    const h = harness();
    await assert.rejects(
      () => h.authority.recoverForIntent({
        projectId: scope.projectId,
        clientRequestId,
        ...mismatch,
      }, scope),
      (error: any) => error?.status === 409
        && error?.code === 'garment_texture_final_recovery_intent_mismatch',
    );
    assert.equal(h.calls.lookup.length, 1);
    assert.equal(h.calls.finalization.length, 0);
    assert.equal(h.calls.images.length, 0);
    assert.equal(h.calls.issued.length, 0);
  }
});

test('F4b.6b.4c validates purpose-bound stable intent before durable lookup', async () => {
  const invalid = [
    { projectId: scope.projectId, clientRequestId, sourceArtifactId: '', garmentId },
    { projectId: scope.projectId, clientRequestId, sourceArtifactId, garmentId: 'not-a-uuid' },
    { projectId: 'not-a-uuid', clientRequestId, sourceArtifactId, garmentId },
    { projectId: scope.projectId, clientRequestId: 'bad request', sourceArtifactId, garmentId },
  ];
  for (const input of invalid) {
    const h = harness();
    await assert.rejects(
      () => h.authority.recoverForIntent(input, scope),
      (error: any) => error?.status === 400
        && error?.code === 'invalid_garment_texture_final_recovery_request',
    );
    assert.equal(h.calls.lookup.length, 0);
  }
});
