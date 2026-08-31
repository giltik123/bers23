import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import {
  decodeGarmentTextureCompositeInputEnvelope,
  encodeGarmentTextureCompositeInputEnvelope,
} from '../src/platform/creative/canonical/garmentTextureCompositeInputEnvelope.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { normalizeGarmentTextureFinalLineageParameters } from '../server/core/fashion/garmentTextureFinalLineage.ts';
import { GarmentTextureCompositeInputDeliveryService } from '../server/core/localExecution/GarmentTextureCompositeInputDeliveryService.ts';

const scope = Object.freeze({
  tenantId: 'tenant-texture-delivery',
  userId: 'user-texture-delivery',
  projectId: '11111111-1111-4111-8111-111111111111',
});
const ids = Object.freeze({
  projectStorage: '22222222-2222-4222-8222-222222222222',
  layer: '33333333-3333-4333-8333-333333333333',
  garment: '44444444-4444-4444-8444-444444444444',
  view: '55555555-5555-4555-8555-555555555555',
  representation: '66666666-6666-4666-8666-666666666666',
  anchor: '77777777-7777-4777-8777-777777777777',
});
const hashes = Object.freeze({
  project: 'a'.repeat(64), layer: 'b'.repeat(64), view: 'c'.repeat(64),
  representation: 'd'.repeat(64), anchor: 'e'.repeat(64), mesh: 'f'.repeat(64),
});
const producer = Object.freeze({
  schema: 'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1' as const,
  textureTransform: Object.freeze({
    scaleXQ16: 65536,
    scaleYQ16: 65536,
    offsetXQ16: 0,
    offsetYQ16: 0,
    wrapMode: 'CLAMP' as const,
    alphaPolicy: 'PRESERVE_BASE_ALPHA' as const,
  }),
  featherRadius: 2,
  colorSpacePolicy: 'SRGB_GAMMA_ENCODED_RGBA8' as const,
});
const normalizedProducer = normalizeGarmentTextureFinalLineageParameters(producer);
const view = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_VIEW' as const,
  garmentId: ids.garment,
  viewId: ids.view,
  contentSha256: hashes.view,
  contentType: 'image/png' as const,
  encoding: 'PNG_RGBA8_LOSSLESS' as const,
  width: 2,
  height: 2,
});
const representation = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_REPRESENTATION' as const,
  garmentId: ids.garment,
  representationId: ids.representation,
  tier: 'PARAMETRIC' as const,
  format: 'BERS_PARAMETRIC_V1' as const,
  contentType: 'application/vnd.bers.garment-parametric+json' as const,
  contentSha256: hashes.representation,
  basisViewId: ids.view,
  generatorId: 'bers.mesh-fit',
  generatorVersion: '1',
  validatorId: 'bers.parametric-topology-validator',
  validatorVersion: '1',
});
const sourcePointsQ16 = Object.freeze([
  Object.freeze([0, 0] as const), Object.freeze([65536, 0] as const), Object.freeze([0, 65536] as const),
]);
const destinationPointsQ16 = Object.freeze([
  Object.freeze([0, 0] as const), Object.freeze([65536, 0] as const), Object.freeze([0, 65536] as const),
]);
const triangles = Object.freeze([Object.freeze([0, 1, 2] as const)]);
const parameters = Object.freeze({
  sourceArtifactId: 'signed-project-source',
  projectImageStorageId: ids.projectStorage,
  projectImageSha256: hashes.project,
  garmentWarpLayerId: ids.layer,
  garmentWarpLayerSha256: hashes.layer,
  garmentId: ids.garment,
  viewId: ids.view,
  viewSha256: hashes.view,
  representationId: ids.representation,
  representationSha256: hashes.representation,
  anchorSetId: ids.anchor,
  anchorPayloadSha256: hashes.anchor,
  destinationMeshSha256: hashes.mesh,
  producerParameters: normalizedProducer.document,
  producerParametersSha256: normalizedProducer.sha256,
  deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
  maxDimension: 4096,
  maxOutputPixels: 8_388_608,
});

function ticket(overrides: Partial<LocalExecutionTicketV2> = {}): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'ticket-texture-delivery',
    version: '2',
    issuer: 'CORE',
    requestId: 'garment-texture-composite:delivery',
    workflowId: 'garment-texture-composite:delivery',
    stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    operation: Object.freeze({
      id: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
      version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
      type: GARMENT_TEXTURE_COMPOSITE_OPERATION,
      capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
      parameters,
    }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: parameters.sourceArtifactId, kind: 'image', role: 'COMPOSITE', sha256: hashes.project })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 4, height: 4 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: 'delivery:garment-texture-composite:local-v2',
    nonce: 'texture-delivery-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  });
}

const projectRgba = Uint8Array.from({ length: 4 * 4 * 4 }, (_, index) => index % 256);
const garmentRgba = Uint8Array.from([
  255, 0, 0, 255, 0, 255, 0, 255,
  0, 0, 255, 255, 255, 255, 255, 0,
]);

function evidence(overrides: Record<string, unknown> = {}) {
  const base = {
    project: Object.freeze({
      artifactId: parameters.sourceArtifactId,
      projectId: scope.projectId,
      storageId: ids.projectStorage,
      role: 'COMPOSITE' as const,
      lifecycle: 'FINAL' as const,
      width: 4,
      height: 4,
      sha256: hashes.project,
      bytes: new Uint8Array([1]),
    }),
    layer: Object.freeze({
      id: ids.layer,
      projectId: scope.projectId,
      executionId: 'garment-mesh-warp:source',
      ticketId: 'ticket-warp-source',
      projectImageStorageId: ids.projectStorage,
      projectImageSha256: hashes.project,
      garmentId: ids.garment,
      viewId: ids.view,
      viewContentSha256: hashes.view,
      representationId: ids.representation,
      representationContentSha256: hashes.representation,
      anchorSetId: ids.anchor,
      anchorPayloadSha256: hashes.anchor,
      destinationMeshSha256: hashes.mesh,
      width: 4,
      height: 4,
      contentSha256: hashes.layer,
      rgba: new Uint8Array(64),
      createdAt: new Date(0).toISOString(),
    }),
    view: Object.freeze({ binding: view, bytes: new Uint8Array([1]) }),
    representation: Object.freeze({ binding: representation, bytes: new Uint8Array([123, 125]) }),
    mesh: Object.freeze({
      schemaId: 'BERS_GARMENT_DESTINATION_MESH_Q16_V1',
      coordinateSpace: 'PROJECT_IMAGE_NORMALIZED_Q16',
      sourcePointsQ16,
      destinationPointsQ16,
      triangles,
      frameAnchors: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']),
      provenance: Object.freeze({
        anchorSetId: ids.anchor,
        projectId: scope.projectId,
        projectImageStorageId: ids.projectStorage,
        projectImageSha256: hashes.project,
        projectImageWidth: 4,
        projectImageHeight: 4,
        anchorPayloadSha256: hashes.anchor,
        garmentId: ids.garment,
        representationId: ids.representation,
        representationContentSha256: hashes.representation,
        garmentCategory: 'tops_tshirt',
      }),
      meshSha256: hashes.mesh,
    }),
    projectRgba,
    garmentSourceRgba: garmentRgba,
  };
  return Object.freeze({ ...base, ...overrides });
}

function service(options: { currentTicket?: LocalExecutionTicketV2; currentEvidence?: any; now?: number } = {}) {
  let evidenceReads = 0;
  const currentTicket = options.currentTicket ?? ticket();
  const currentEvidence = options.currentEvidence ?? evidence();
  return Object.freeze({
    value: new GarmentTextureCompositeInputDeliveryService({
      admission: { getV2: async () => currentTicket } as any,
      evidence: { resolve: async () => { evidenceReads += 1; return currentEvidence; } } as any,
      now: () => options.now ?? 2_000,
    }),
    evidenceReads: () => evidenceReads,
  });
}

test('BERSGTC1 envelope round-trips exact dual RGBA payloads and rejects truncation/trailing bytes', () => {
  const delivered = service();
  void delivered;
  const bytes = encodeGarmentTextureCompositeInputEnvelope({
    metadata: {
      ticketId: 'ticket-texture-delivery',
      projectId: scope.projectId,
      sourceArtifactId: parameters.sourceArtifactId,
      projectImageStorageId: ids.projectStorage,
      projectImageSha256: hashes.project,
      garmentWarpLayerId: ids.layer,
      garmentWarpLayerSha256: hashes.layer,
      garmentId: ids.garment,
      viewId: ids.view,
      viewSha256: hashes.view,
      representationId: ids.representation,
      representationSha256: hashes.representation,
      anchorSetId: ids.anchor,
      anchorPayloadSha256: hashes.anchor,
      destinationMeshSha256: hashes.mesh,
      outputWidth: 4,
      outputHeight: 4,
      garmentSourceWidth: 2,
      garmentSourceHeight: 2,
      sourcePointsQ16,
      destinationPointsQ16,
      triangles,
      producerParameters: normalizedProducer.document,
      producerParametersSha256: normalizedProducer.sha256,
    },
    projectRgba,
    garmentSourceRgba: garmentRgba,
  });
  const decoded = decodeGarmentTextureCompositeInputEnvelope(bytes);
  assert.deepEqual(decoded.projectRgba, projectRgba);
  assert.deepEqual(decoded.garmentSourceRgba, garmentRgba);
  assert.deepEqual(decoded.metadata.producerParameters, normalizedProducer.document);
  assert.equal(decoded.metadata.producerParametersSha256, normalizedProducer.sha256);
  assert.throws(() => decodeGarmentTextureCompositeInputEnvelope(bytes.subarray(0, bytes.byteLength - 1)), /payload length/i);
  const trailing = new Uint8Array(bytes.byteLength + 1); trailing.set(bytes); trailing[trailing.length - 1] = 7;
  assert.throws(() => decodeGarmentTextureCompositeInputEnvelope(trailing), /payload length/i);
});

test('purpose-bound delivery returns only evidence re-resolved against the immutable ticket', async () => {
  const fixture = service();
  const delivered = await fixture.value.deliver('ticket-texture-delivery', scope.projectId, scope);
  assert.equal(fixture.evidenceReads(), 1);
  assert.equal(delivered.projectImageStorageId, ids.projectStorage);
  assert.equal(delivered.garmentWarpLayerId, ids.layer);
  assert.equal(delivered.destinationMeshSha256, hashes.mesh);
  assert.equal(delivered.producerParametersSha256, normalizedProducer.sha256);
  assert.deepEqual(delivered.projectRgba, projectRgba);
  assert.deepEqual(delivered.garmentSourceRgba, garmentRgba);
});

test('delivery rejects foreign scope and expiry before transitive evidence resolution', async () => {
  const foreign = service();
  await assert.rejects(() => foreign.value.deliver('ticket-texture-delivery', '99999999-9999-4999-8999-999999999999', scope), /outside the authenticated Project scope/i);
  assert.equal(foreign.evidenceReads(), 0);

  const expired = service({ currentTicket: ticket({ expiresAt: 1_500 }) });
  await assert.rejects(() => expired.value.deliver('ticket-texture-delivery', scope.projectId, scope), /expired/i);
  assert.equal(expired.evidenceReads(), 0);
});

test('delivery fails closed when re-resolved Project, layer, managed or mesh evidence drifts from ticket', async () => {
  const projectDrift = evidence({ project: Object.freeze({ ...(evidence() as any).project, sha256: '0'.repeat(64) }) });
  await assert.rejects(() => service({ currentEvidence: projectDrift }).value.deliver('ticket-texture-delivery', scope.projectId, scope), /no longer matches/i);

  const layerDrift = evidence({ layer: Object.freeze({ ...(evidence() as any).layer, contentSha256: '0'.repeat(64) }) });
  await assert.rejects(() => service({ currentEvidence: layerDrift }).value.deliver('ticket-texture-delivery', scope.projectId, scope), /no longer matches/i);

  const managedDrift = evidence({ view: Object.freeze({ binding: Object.freeze({ ...view, contentSha256: '0'.repeat(64) }), bytes: new Uint8Array([1]) }) });
  await assert.rejects(() => service({ currentEvidence: managedDrift }).value.deliver('ticket-texture-delivery', scope.projectId, scope), /no longer matches/i);

  const meshDrift = evidence({ mesh: Object.freeze({ ...(evidence() as any).mesh, meshSha256: '0'.repeat(64) }) });
  await assert.rejects(() => service({ currentEvidence: meshDrift }).value.deliver('ticket-texture-delivery', scope.projectId, scope), /no longer matches/i);
});
