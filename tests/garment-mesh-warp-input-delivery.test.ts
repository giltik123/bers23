import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js';
import type { GarmentDestinationMesh } from '../server/core/fashion/bodyAnchorGeometry.ts';
import {
  GarmentMeshWarpInputDeliveryService,
  assertMeshMatchesTicket,
} from '../server/core/localExecution/GarmentMeshWarpInputDeliveryService.ts';

const scope = Object.freeze({
  tenantId: 'tenant-delivery',
  userId: 'user-delivery',
  projectId: '11111111-1111-4111-8111-111111111111',
});
const view = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_VIEW' as const,
  garmentId: '22222222-2222-4222-8222-222222222222',
  viewId: '33333333-3333-4333-8333-333333333333',
  contentSha256: 'a'.repeat(64),
  contentType: 'image/png' as const,
  encoding: 'PNG_RGBA8_LOSSLESS' as const,
  width: 2,
  height: 2,
});
const representation = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_REPRESENTATION' as const,
  garmentId: view.garmentId,
  representationId: '44444444-4444-4444-8444-444444444444',
  tier: 'PARAMETRIC' as const,
  format: 'BERS_PARAMETRIC_V1' as const,
  contentType: 'application/vnd.bers.garment-parametric+json' as const,
  contentSha256: 'b'.repeat(64),
  basisViewId: view.viewId,
  generatorId: 'bers.mesh-fit',
  generatorVersion: '1',
  validatorId: 'bers.parametric-topology-validator',
  validatorVersion: '1',
});
const exact = GARMENT_MESH_WARP_TOOL_DEFINITION.parameters.exact;
const projectEvidence = Object.freeze({
  artifactId: 'signed-project-source',
  projectId: scope.projectId,
  storageId: '66666666-6666-4666-8666-666666666666',
  role: 'COMPOSITE' as const,
  lifecycle: 'FINAL' as const,
  width: 4,
  height: 4,
  sha256: 'c'.repeat(64),
});
const parameters = Object.freeze({
  sourceArtifactId: projectEvidence.artifactId,
  garmentId: view.garmentId,
  viewId: view.viewId,
  representationId: representation.representationId,
  anchorSetId: '55555555-5555-4555-8555-555555555555',
  projectImageStorageId: projectEvidence.storageId,
  projectImageSha256: projectEvidence.sha256,
  viewSha256: view.contentSha256,
  representationSha256: representation.contentSha256,
  anchorPayloadSha256: 'd'.repeat(64),
  destinationMeshSha256: 'e'.repeat(64),
  deterministicTool: exact.deterministicTool,
  meshSchema: exact.meshSchema,
  sourceCoordinateSpace: exact.sourceCoordinateSpace,
  destinationCoordinateSpace: exact.destinationCoordinateSpace,
  fixedPointBits: exact.fixedPointBits,
  rasterization: exact.rasterization,
  interpolation: exact.interpolation,
  rounding: exact.rounding,
  alphaPolicy: exact.alphaPolicy,
  uncoveredPixels: exact.uncoveredPixels,
  maxOutputPixels: exact.maxOutputPixels,
  maxRasterWork: exact.maxRasterWork,
});

function ticket(overrides: Partial<LocalExecutionTicketV2> = {}): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'ticket-warp-delivery',
    version: '2',
    issuer: 'CORE',
    requestId: 'garment-mesh-warp:delivery',
    workflowId: 'garment-mesh-warp:delivery',
    stepId: GARMENT_MESH_WARP_STEP_ID,
    operation: Object.freeze({ id: GARMENT_MESH_WARP_STEP_ID, version: '1', type: GARMENT_MESH_WARP_OPERATION, capability: GARMENT_MESH_WARP_CAPABILITY, parameters }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: projectEvidence.artifactId, kind: 'image', role: 'COMPOSITE', sha256: projectEvidence.sha256 })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'WORKING', count: 1, mimeTypes: Object.freeze(['image/png']), width: 4, height: 4 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: 'delivery:garment-mesh-warp:local-v2',
    nonce: 'delivery-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  });
}

const mesh = Object.freeze({
  schemaId: 'BERS_GARMENT_DESTINATION_MESH_Q16_V1',
  coordinateSpace: 'PROJECT_IMAGE_NORMALIZED_Q16',
  sourcePointsQ16: Object.freeze([Object.freeze([0, 0] as const), Object.freeze([65536, 0] as const), Object.freeze([0, 65536] as const)]),
  destinationPointsQ16: Object.freeze([Object.freeze([0, 0] as const), Object.freeze([65536, 0] as const), Object.freeze([0, 65536] as const)]),
  triangles: Object.freeze([Object.freeze([0, 1, 2] as const)]),
  frameAnchors: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const),
  provenance: Object.freeze({
    anchorSetId: parameters.anchorSetId,
    projectId: scope.projectId,
    projectImageStorageId: projectEvidence.storageId,
    projectImageSha256: projectEvidence.sha256,
    projectImageWidth: 4,
    projectImageHeight: 4,
    anchorPayloadSha256: parameters.anchorPayloadSha256,
    garmentId: view.garmentId,
    representationId: representation.representationId,
    representationContentSha256: representation.contentSha256,
    garmentCategory: 'tops_tshirt',
  }),
  meshSha256: parameters.destinationMeshSha256,
}) as unknown as GarmentDestinationMesh;

async function png(): Promise<Uint8Array> {
  const rgba = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 0,
  ]);
  return new Uint8Array(await sharp(rgba, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer());
}

async function service(overrides: Readonly<Record<string, unknown>> = {}) {
  const viewBytes = await png();
  let deliveredBytes = Uint8Array.from(viewBytes);
  const dependencies = {
    admission: { getV2: async () => ticket() },
    managedInputs: { revalidateTicket: async () => Object.freeze([
      Object.freeze({ binding: view, bytes: Uint8Array.from(deliveredBytes) }),
      Object.freeze({ binding: representation, bytes: new Uint8Array([123, 125]) }),
    ]) },
    bodyAnchors: { deriveDestinationMesh: async () => mesh },
    artifacts: { resolveStoredImageEvidence: async () => projectEvidence },
    now: () => 2_000,
    ...overrides,
  } as any;
  return Object.freeze({ value: new GarmentMeshWarpInputDeliveryService(dependencies), replaceViewBytes: (next: Uint8Array) => { deliveredBytes = Uint8Array.from(next); } });
}

test('purpose-bound delivery returns only revalidated Garment pixels plus server-derived mesh', async () => {
  const { value } = await service();
  const result = await value.deliver('ticket-warp-delivery', scope.projectId, scope);
  assert.equal(result.ticketId, 'ticket-warp-delivery');
  assert.equal(result.projectImageStorageId, projectEvidence.storageId);
  assert.equal(result.projectImageSha256, projectEvidence.sha256);
  assert.equal(result.outputWidth, 4);
  assert.equal(result.outputHeight, 4);
  assert.equal(result.viewId, view.viewId);
  assert.equal(result.destinationMeshSha256, mesh.meshSha256);
  assert.deepEqual(result.sourcePointsQ16, mesh.sourcePointsQ16);
  assert.deepEqual(result.destinationPointsQ16, mesh.destinationPointsQ16);
  assert.deepEqual(result.triangles, mesh.triangles);
  assert.equal(result.basisViewRgba.byteLength, 16);
  assert.equal(Object.hasOwn(result, 'projectRgba'), false);
});

test('delivery is Project-scope-bound and rejects expired tickets before reading Garment bytes', async () => {
  let managedReads = 0;
  const wrongScope = await service({ managedInputs: { revalidateTicket: async () => { managedReads += 1; return []; } } });
  await assert.rejects(() => wrongScope.value.deliver('ticket-warp-delivery', 'other-project', scope), /outside the authenticated Project scope/i);
  assert.equal(managedReads, 0);

  const expired = await service({ admission: { getV2: async () => ticket({ expiresAt: 1_500 }) }, managedInputs: { revalidateTicket: async () => { managedReads += 1; return []; } } });
  await assert.rejects(() => expired.value.deliver('ticket-warp-delivery', scope.projectId, scope), /expired/i);
  assert.equal(managedReads, 0);
});

test('delivery rejects Project evidence, managed binding and destination-mesh drift', async () => {
  const projectDrift = await service({ artifacts: { resolveStoredImageEvidence: async () => Object.freeze({ ...projectEvidence, sha256: 'f'.repeat(64) }) } });
  await assert.rejects(() => projectDrift.value.deliver('ticket-warp-delivery', scope.projectId, scope), /Project image evidence no longer matches/i);

  const managedDrift = await service({ managedInputs: { revalidateTicket: async () => Object.freeze([
    Object.freeze({ binding: Object.freeze({ ...view, contentSha256: 'f'.repeat(64) }), bytes: await png() }),
    Object.freeze({ binding: representation, bytes: new Uint8Array([123, 125]) }),
  ]) } });
  await assert.rejects(() => managedDrift.value.deliver('ticket-warp-delivery', scope.projectId, scope), /managed Garment evidence differs/i);

  const meshDrift = await service({ bodyAnchors: { deriveDestinationMesh: async () => Object.freeze({ ...mesh, meshSha256: 'f'.repeat(64) }) } });
  await assert.rejects(() => meshDrift.value.deliver('ticket-warp-delivery', scope.projectId, scope), /destination mesh no longer matches/i);
});

test('mesh verifier binds provenance to the resolved Project, not merely to self-consistent mesh fields', () => {
  const foreign = Object.freeze({ ...projectEvidence, projectId: '99999999-9999-4999-8999-999999999999' });
  assert.throws(() => assertMeshMatchesTicket(parameters as any, foreign, mesh, 4, 4), /destination mesh no longer matches/i);
});
