import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  LocalExecutionResultV2,
  LocalExecutionTicketIssueRequestV2,
  LocalExecutionTicketV2,
} from '../src/platform/creative/canonical/localExecution.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { LocalGarmentTextureCompositeExecutionService } from '../server/core/localExecution/LocalGarmentTextureCompositeExecutionService.ts';
import { verifyGarmentTextureCompositeFinalArtifact } from '../server/core/providers/garmentTextureCompositeWorkflowVerifier.ts';
import { assertProductionTextureTuple } from '../server/core/providers/productionGarmentTextureCompositePolicy.ts';

const scope = Object.freeze({
  tenantId: 'tenant-texture-production',
  userId: 'user-texture-production',
  projectId: '11111111-1111-4111-8111-111111111111',
});
const ids = Object.freeze({
  storage: '22222222-2222-4222-8222-222222222222',
  layer: '33333333-3333-4333-8333-333333333333',
  garment: '44444444-4444-4444-8444-444444444444',
  view: '55555555-5555-4555-8555-555555555555',
  representation: '66666666-6666-4666-8666-666666666666',
  anchor: '77777777-7777-4777-8777-777777777777',
});
const hashes = Object.freeze({
  project: 'a'.repeat(64),
  layer: 'b'.repeat(64),
  view: 'c'.repeat(64),
  representation: 'd'.repeat(64),
  anchor: 'e'.repeat(64),
  mesh: 'f'.repeat(64),
});
const transform = Object.freeze({
  scaleXQ16: 65536,
  scaleYQ16: 65536,
  offsetXQ16: 0,
  offsetYQ16: 0,
  wrapMode: 'CLAMP' as const,
  alphaPolicy: 'PRESERVE_BASE_ALPHA' as const,
});
const viewBinding = Object.freeze({
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
const representationBinding = Object.freeze({
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

function evidence() {
  return Object.freeze({
    project: Object.freeze({
      artifactId: 'signed-project-source',
      projectId: scope.projectId,
      storageId: ids.storage,
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
      projectImageStorageId: ids.storage,
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
    view: Object.freeze({ binding: viewBinding, bytes: new Uint8Array([1]) }),
    representation: Object.freeze({ binding: representationBinding, bytes: new Uint8Array([123, 125]) }),
    mesh: Object.freeze({
      schemaId: 'BERS_GARMENT_DESTINATION_MESH_Q16_V1',
      coordinateSpace: 'PROJECT_IMAGE_NORMALIZED_Q16',
      sourcePointsQ16: Object.freeze([Object.freeze([0, 0] as const), Object.freeze([65536, 0] as const), Object.freeze([0, 65536] as const)]),
      destinationPointsQ16: Object.freeze([Object.freeze([0, 0] as const), Object.freeze([65536, 0] as const), Object.freeze([0, 65536] as const)]),
      triangles: Object.freeze([Object.freeze([0, 1, 2] as const)]),
      frameAnchors: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']),
      provenance: Object.freeze({
        anchorSetId: ids.anchor,
        projectId: scope.projectId,
        projectImageStorageId: ids.storage,
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
    projectRgba: new Uint8Array(64),
    garmentSourceRgba: new Uint8Array(16),
  });
}

function issuedTicket(request: LocalExecutionTicketIssueRequestV2): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'ticket-texture-production',
    version: '2',
    issuer: 'CORE',
    requestId: request.requestId,
    workflowId: request.workflowId,
    stepId: request.stepId,
    operation: request.operation,
    scope: request.scope,
    inputs: request.inputs,
    managedInputs: request.managedInputs,
    expectedOutputs: request.expectedOutputs,
    allowedExecutors: Object.freeze([Object.freeze({
      kind: 'DETERMINISTIC_TOOL' as const,
      toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
      version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
    })]),
    policy: request.policy,
    idempotencyKey: request.idempotencyKey,
    nonce: 'texture-production-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function createService(options: Readonly<{
  durable?: LocalExecutionTicketV2;
  authorize?: () => void;
}> = {}) {
  let issueCount = 0;
  let policyCount = 0;
  let issued: LocalExecutionTicketV2 | undefined;
  const service = new LocalGarmentTextureCompositeExecutionService({
    tickets: {
      issue: async (request) => {
        issueCount += 1;
        issued = issuedTicket(request);
        return issued;
      },
    },
    admission: { getByIdempotencyKeyV2: async () => options.durable },
    evidence: { resolve: async () => evidence() } as any,
    submission: { uploadImage: async () => { throw new Error('not used'); }, submit: async () => { throw new Error('not used'); } } as any,
    policy: {
      authorize: () => {
        policyCount += 1;
        options.authorize?.();
      },
    },
    now: () => 2_000,
  });
  return Object.freeze({ service, issueCount: () => issueCount, policyCount: () => policyCount, issued: () => issued });
}

const command = Object.freeze({
  projectId: scope.projectId,
  sourceArtifactId: 'signed-project-source',
  garmentWarpLayerId: ids.layer,
  garmentWarpLayerSha256: hashes.layer,
  textureTransform: transform,
  featherRadius: 2,
  clientRequestId: 'texture-production-1',
});

test('dormant production policy fails closed before any ticket issuer can be trusted', () => {
  const operation = Object.freeze({
    id: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
    type: GARMENT_TEXTURE_COMPOSITE_OPERATION,
    capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
    parameters: Object.freeze({}),
  });
  assert.throws(
    () => assertProductionTextureTuple({ scope, sourceArtifactId: command.sourceArtifactId, operation }),
    (error: any) => error?.code === 'garment_texture_composite_not_admitted' && error?.status === 422,
  );
});

test('Core prepare derives a closed zero-cloud v2 ticket only from re-resolved Fashion evidence', async () => {
  const harness = createService();
  const prepared = await harness.service.prepare(command, { tenantId: scope.tenantId, userId: scope.userId });
  assert.equal(harness.policyCount(), 1);
  assert.equal(harness.issueCount(), 1);
  assert.equal(prepared.ticket, harness.issued());
  assert.equal(prepared.ticket.operation.capability, GARMENT_TEXTURE_COMPOSITE_CAPABILITY);
  assert.equal(prepared.ticket.operation.type, GARMENT_TEXTURE_COMPOSITE_OPERATION);
  assert.equal(prepared.ticket.policy, 'LOCAL_ONLY');
  assert.deepEqual(prepared.ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual(prepared.ticket.inputs, [Object.freeze({
    artifactId: command.sourceArtifactId,
    kind: 'image',
    role: 'COMPOSITE',
    sha256: hashes.project,
  })]);
  assert.deepEqual(prepared.ticket.managedInputs, [viewBinding, representationBinding]);
  const parameters = prepared.ticket.operation.parameters as Record<string, any>;
  assert.equal(parameters.projectImageStorageId, ids.storage);
  assert.equal(parameters.projectImageSha256, hashes.project);
  assert.equal(parameters.garmentWarpLayerId, ids.layer);
  assert.equal(parameters.garmentWarpLayerSha256, hashes.layer);
  assert.equal(parameters.garmentId, ids.garment);
  assert.equal(parameters.viewId, ids.view);
  assert.equal(parameters.representationId, ids.representation);
  assert.equal(parameters.anchorSetId, ids.anchor);
  assert.equal(parameters.destinationMeshSha256, hashes.mesh);
  assert.equal(parameters.deterministicTool, `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`);
});

test('durable idempotency replay rejects producer-parameter drift before issuing another ticket', async () => {
  const first = createService();
  const prepared = await first.service.prepare(command, { tenantId: scope.tenantId, userId: scope.userId });
  const replay = createService({ durable: prepared.ticket });
  await assert.rejects(
    () => replay.service.prepare({
      ...command,
      textureTransform: Object.freeze({ ...transform, offsetXQ16: 65536 }),
    }, { tenantId: scope.tenantId, userId: scope.userId }),
    (error: any) => error?.code === 'local_execution_idempotency_mismatch' && error?.status === 409,
  );
  assert.equal(replay.issueCount(), 0);
});

test('strict FINAL verifier accepts exact Core metadata and rejects Fashion lineage forgery', async () => {
  const harness = createService();
  const { ticket } = await harness.service.prepare(command, { tenantId: scope.tenantId, userId: scope.userId });
  const parameters = ticket.operation.parameters as Record<string, any>;
  const result: LocalExecutionResultV2 = Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: ticket.version,
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: ticket.allowedExecutors[0],
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([]),
    metrics: Object.freeze({ latencyMs: 1 }),
  });
  const metadata = Object.freeze({
    artifactRole: 'COMPOSITE',
    localExecutionAdmission: 'ADMITTED',
    admissionClass: 'DETERMINISTIC_BYTE_EXACT',
    verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
    ticketId: ticket.ticketId,
    toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
    toolVersion: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    candidateSha256: '1'.repeat(64),
    verifiedPixelSha256: '2'.repeat(64),
    sourceImageStorageId: parameters.projectImageStorageId,
    sourceImageSha256: parameters.projectImageSha256,
    garmentWarpLayerId: parameters.garmentWarpLayerId,
    garmentWarpLayerSha256: parameters.garmentWarpLayerSha256,
    producerParametersSha256: parameters.producerParametersSha256,
    destinationMeshSha256: parameters.destinationMeshSha256,
    integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
    parentArtifactIds: Object.freeze([command.sourceArtifactId]),
  });
  const artifact = Object.freeze({
    id: 'core-verified-texture',
    kind: 'image' as const,
    value: Object.freeze({ width: 4, height: 4, data: new Uint8ClampedArray(64), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }),
    producerOperationId: ticket.stepId,
    scope: ticket.scope,
    state: 'FINAL' as const,
    role: 'COMPOSITE' as const,
    image: Object.freeze({ width: 4, height: 4, format: 'RGBA8' as const, orientation: 1 as const, colorSpace: 'srgb' as const, alpha: true }),
    metadata,
  });
  assert.equal(verifyGarmentTextureCompositeFinalArtifact(ticket, result, artifact).valid, true);
  const forged = Object.freeze({
    ...artifact,
    metadata: Object.freeze({ ...metadata, garmentWarpLayerSha256: '0'.repeat(64) }),
  });
  const verification = verifyGarmentTextureCompositeFinalArtifact(ticket, result, forged);
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.includes('FINAL_LINEAGE_METADATA_INVALID'));
});
