import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionResultV2,
} from '../src/platform/creative/canonical/index.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { LocalGarmentMeshWarpExecutionService } from '../server/core/localExecution/LocalGarmentMeshWarpExecutionService.ts';

const auth = Object.freeze({ tenantId: 'tenant-warp-service', userId: 'user-warp-service' });
const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const viewId = '33333333-3333-4333-8333-333333333333';
const representationId = '44444444-4444-4444-8444-444444444444';
const anchorSetId = '55555555-5555-4555-8555-555555555555';
const projectStorageId = '66666666-6666-4666-8666-666666666666';
const sourceArtifactId = 'signed-project-source';
const projectSha = 'c'.repeat(64);
const viewSha = 'a'.repeat(64);
const representationSha = 'b'.repeat(64);
const anchorSha = 'd'.repeat(64);
const meshSha = 'e'.repeat(64);

const basisRgba = Uint8Array.from([
  255, 0, 0, 255, 0, 255, 0, 255,
  0, 0, 255, 255, 255, 255, 255, 128,
]);
const q = 65536;
const sourcePointsQ16 = Object.freeze([
  Object.freeze([0, 0] as const),
  Object.freeze([q, 0] as const),
  Object.freeze([q, q] as const),
  Object.freeze([0, q] as const),
]);
const destinationPointsQ16 = sourcePointsQ16;
const triangles = Object.freeze([
  Object.freeze([0, 1, 2] as const),
  Object.freeze([0, 2, 3] as const),
]);

const projectEvidence = Object.freeze({
  artifactId: sourceArtifactId,
  projectId,
  storageId: projectStorageId,
  role: 'COMPOSITE' as const,
  lifecycle: 'FINAL' as const,
  width: 2,
  height: 2,
  sha256: projectSha,
});
const viewBinding = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_VIEW' as const,
  garmentId,
  viewId,
  contentSha256: viewSha,
  contentType: 'image/png' as const,
  encoding: 'PNG_RGBA8_LOSSLESS' as const,
  width: 2,
  height: 2,
});
const representationBinding = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_REPRESENTATION' as const,
  garmentId,
  representationId,
  tier: 'PARAMETRIC' as const,
  format: 'BERS_PARAMETRIC_V1' as const,
  contentType: 'application/vnd.bers.garment-parametric+json' as const,
  contentSha256: representationSha,
  basisViewId: viewId,
  generatorId: 'bers.mesh-fit',
  generatorVersion: '1',
  validatorId: 'bers.parametric-topology-validator',
  validatorVersion: '1',
});
const mesh = Object.freeze({
  schemaId: 'BERS_GARMENT_DESTINATION_MESH_Q16_V1' as const,
  coordinateSpace: 'PROJECT_IMAGE_NORMALIZED_Q16' as const,
  sourcePointsQ16,
  destinationPointsQ16,
  triangles,
  frameAnchors: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const),
  provenance: Object.freeze({
    anchorSetId,
    projectId,
    projectImageStorageId: projectStorageId,
    projectImageSha256: projectSha,
    projectImageWidth: 2,
    projectImageHeight: 2,
    anchorPayloadSha256: anchorSha,
    garmentId,
    representationId,
    representationContentSha256: representationSha,
    garmentCategory: 'tshirts' as const,
  }),
  meshSha256: meshSha,
});

async function png(rgba: Uint8Array | Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(rgba, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer());
}

function resultFor(ticket: any, upload: any): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '2',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL' as const, toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION }),
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([Object.freeze(upload)]),
    metrics: Object.freeze({ latencyMs: 7, memoryBytes: 4096 }),
  });
}

function harness(options: Readonly<{ failCommitOnce?: boolean; deliveryFailure?: Error }> = {}) {
  let now = 1_000;
  let ticketSequence = 0;
  let uploadSequence = 0;
  let layerSequence = 0;
  let deliveryCalls = 0;
  let layerPersistCalls = 0;
  let layer: any;
  let failCommitOnce = Boolean(options.failCommitOnce);
  const admission = new LocalExecutionAdmissionRegistry();
  const originalCommit = admission.commit.bind(admission);
  const admissionPort = Object.freeze({
    issue: admission.issue.bind(admission),
    issueV2: admission.issueV2.bind(admission),
    get: admission.get.bind(admission),
    getV2: admission.getV2.bind(admission),
    getByIdempotencyKey: admission.getByIdempotencyKey.bind(admission),
    getByIdempotencyKeyV2: admission.getByIdempotencyKeyV2.bind(admission),
    getFinalization: admission.getFinalization.bind(admission),
    claim: admission.claim.bind(admission),
    claimV2: admission.claimV2.bind(admission),
    release: admission.release.bind(admission),
    commit: async (ticketId: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS') => {
      if (failCommitOnce) { failCommitOnce = false; throw new Error('simulated durable commit failure'); }
      await originalCommit(ticketId, status);
    },
  });
  const tickets = new LocalExecutionTicketAuthority(admissionPort as any, {
    now: () => now,
    id: () => `warp-ticket-${++ticketSequence}`,
    nonce: () => `warp-nonce-${ticketSequence}`,
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: Object.freeze({
      [GARMENT_MESH_WARP_CAPABILITY]: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL' as const, toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION })]),
    }),
  });
  const platform: CreativeExecutionPlatformRuntimeDependencies = {
    decision: new CanonicalDecisionService(),
    planning: new CanonicalPlanningService(),
    routeSelector: { select: operation => operation.type === GARMENT_MESH_WARP_OPERATION ? 'ON_DEVICE' : (() => { throw new Error('unexpected operation'); })() },
    targetSelector: { select: operation => operation.type === GARMENT_MESH_WARP_OPERATION ? 'LOCAL' : 'BLOCKED' },
    providerSelector: { select: () => { throw new Error('provider selection must never run for garment mesh warp'); } },
    capabilityAdmission: { admit: ({ operation, route, target }) => operation.type === GARMENT_MESH_WARP_OPERATION && route === 'ON_DEVICE' && target === 'LOCAL'
      ? Object.freeze({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: GARMENT_MESH_WARP_CAPABILITY })
      : Object.freeze({ allowed: false, reasonCode: 'UNSUPPORTED_OPERATION' }) },
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must never execute garment mesh-warp candidate'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: { verify: async operation => Object.freeze({ stepId: operation.id, valid: true, checks: Object.freeze(['TEST_BYTE_EXACT_CORE_RECOMPUTE']), errors: Object.freeze([]) }) },
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must never run for garment mesh warp'); },
      commit: async () => { throw new Error('external billing commit must never run for garment mesh warp'); },
      release: async () => { throw new Error('external billing release must never run for garment mesh warp'); },
    },
    localExecutionV2: tickets,
    now: () => now,
    id: () => 'warp-platform-authority',
  };
  const uploads = new Map<string, any>();
  const uploadStore = Object.freeze({
    persist: async (input: any) => {
      const uploadId = `warp-upload-${++uploadSequence}`;
      const stored = Object.freeze({
        uploadId,
        ticketId: input.ticketId,
        scope: input.scope,
        kind: input.kind,
        role: input.role,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
        sizeBytes: input.bytes.byteLength,
        bytes: Uint8Array.from(input.bytes),
      });
      uploads.set(uploadId, stored);
      return stored;
    },
    load: async (uploadId: string, ticketId: string, scope: any) => {
      const value = uploads.get(uploadId);
      return value && value.ticketId === ticketId && value.scope.tenantId === scope.tenantId && value.scope.userId === scope.userId && value.scope.projectId === scope.projectId ? value : undefined;
    },
    consume: async (uploadId: string) => uploads.delete(uploadId),
  });
  const layerStore = Object.freeze({
    persist: async (_owner: any, input: any) => {
      layerPersistCalls += 1;
      const digest = createHash('sha256').update(input.rgba).digest('hex');
      if (layer) {
        assert.equal(layer.executionId, input.executionId);
        assert.equal(layer.ticketId, input.ticketId);
        assert.equal(layer.contentSha256, digest);
        assert.deepEqual([...layer.rgba], [...input.rgba]);
        return layer;
      }
      layer = Object.freeze({ id: `77777777-7777-4777-8777-${String(++layerSequence).padStart(12, '0')}`, ...input, contentSha256: digest, rgba: Uint8Array.from(input.rgba), createdAt: new Date(now).toISOString() });
      return layer;
    },
    loadByExecution: async (_owner: any, requestedProjectId: string, executionId: string) => layer && layer.projectId === requestedProjectId && layer.executionId === executionId ? layer : undefined,
  });
  const delivery = Object.freeze({
    deliver: async (ticketId: string, requestedProjectId: string) => {
      deliveryCalls += 1;
      if (options.deliveryFailure) throw options.deliveryFailure;
      return Object.freeze({
        ticketId,
        projectId: requestedProjectId,
        projectImageStorageId: projectStorageId,
        projectImageSha256: projectSha,
        outputWidth: 2,
        outputHeight: 2,
        garmentId,
        viewId,
        representationId,
        anchorSetId,
        basisViewWidth: 2,
        basisViewHeight: 2,
        basisViewRgba: Uint8Array.from(basisRgba),
        destinationMeshSha256: meshSha,
        sourcePointsQ16,
        destinationPointsQ16,
        triangles,
      });
    },
  });
  const service = new LocalGarmentMeshWarpExecutionService({
    platform,
    artifacts: { resolveStoredImageEvidence: async () => projectEvidence },
    managedInputs: {
      bindParametricRepresentation: async () => representationBinding,
      bindView: async (_scope: any, _garment: string, requestedView: string) => {
        assert.equal(requestedView, representationBinding.basisViewId, 'Core must derive basis view from admitted representation');
        return viewBinding;
      },
    },
    bodyAnchors: { deriveDestinationMesh: async () => mesh },
    delivery: delivery as any,
    admission: admissionPort as any,
    uploads: uploadStore as any,
    layers: layerStore as any,
    limits: { maxDimension: 4096, maxPixels: 8_388_608, maxUploadBytes: 1_000_000 },
    now: () => now,
  });
  return Object.freeze({
    service,
    admission,
    advance: (ms: number) => { now += ms; },
    deliveryCalls: () => deliveryCalls,
    layerPersistCalls: () => layerPersistCalls,
    layer: () => layer,
  });
}

const command = Object.freeze({ projectId, sourceArtifactId, garmentId, representationId, anchorSetId, clientRequestId: 'warp-service-request' });

async function prepareAndUpload(h: ReturnType<typeof harness>, rgba: Uint8Array | Uint8ClampedArray) {
  const prepared = await h.service.prepare(command, auth);
  assert.deepEqual(prepared.ticket.inputs.map(input => ({ artifactId: input.artifactId, role: input.role, sha256: input.sha256 })), [{ artifactId: sourceArtifactId, role: 'COMPOSITE', sha256: projectSha }]);
  assert.deepEqual(prepared.ticket.managedInputs, [viewBinding, representationBinding]);
  const bytes = await png(rgba);
  const upload = await h.service.uploadImage({ ticketId: prepared.ticket.ticketId, projectId, bytes }, auth);
  return { prepared, upload };
}

test('Core garment warp service derives managed evidence, byte-recomputes candidate and persists only Fashion WORKING intermediate', async () => {
  const h = harness();
  const expected = garmentMeshWarpRgba8(basisRgba, 2, 2, { sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2 });
  const { prepared, upload } = await prepareAndUpload(h, expected);
  assert.equal(prepared.ticket.expectedOutputs[0].role, 'WORKING');
  assert.equal(prepared.ticket.cost.paidCloudCredits, 0);
  assert.equal(prepared.ticket.cost.providerCalls, 0);
  const result = resultFor(prepared.ticket, upload);
  const admitted = await h.service.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, auth);
  assert.equal(admitted.status, 'SUCCESS');
  assert.ok(admitted.layerId);
  assert.equal(h.layerPersistCalls(), 1);
  assert.equal(h.deliveryCalls(), 1);
  assert.equal(h.layer().projectImageStorageId, projectStorageId);
  assert.equal(h.layer().destinationMeshSha256, meshSha);
  assert.deepEqual([...h.layer().rgba], [...expected]);
  assert.equal('artifactId' in admitted, false, 'F4b.4 must not mint a Project FINAL artifact');

  const replay = await h.service.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.layerId, admitted.layerId);
  assert.equal(h.deliveryCalls(), 1, 'historical replay must not revalidate later mutable Garment evidence');
  assert.equal(h.layerPersistCalls(), 1, 'historical replay must reuse the immutable admitted layer');
});

test('Core garment warp service rejects a same-geometry pixel mutation and releases the claim for a corrected retry', async () => {
  const h = harness();
  const expected = garmentMeshWarpRgba8(basisRgba, 2, 2, { sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2 });
  const wrong = Uint8Array.from(expected);
  wrong[0] ^= 1;
  const first = await prepareAndUpload(h, wrong);
  await assert.rejects(() => h.service.submit({ ticketId: first.prepared.ticket.ticketId, projectId, result: resultFor(first.prepared.ticket, first.upload) }, auth), /differs from Core recomputation/i);
  assert.equal(h.layerPersistCalls(), 0);

  const correctBytes = await png(expected);
  const correctUpload = await h.service.uploadImage({ ticketId: first.prepared.ticket.ticketId, projectId, bytes: correctBytes }, auth);
  const corrected = await h.service.submit({ ticketId: first.prepared.ticket.ticketId, projectId, result: resultFor(first.prepared.ticket, correctUpload) }, auth);
  assert.equal(corrected.status, 'SUCCESS');
  assert.equal(h.layerPersistCalls(), 1);
});

test('Core garment warp service fails closed on stale purpose-bound delivery before persistence', async () => {
  const h = harness({ deliveryFailure: Object.assign(new Error('destination mesh no longer matches immutable ticket'), { status: 409, code: 'garment_mesh_warp_destination_mesh_stale' }) });
  const expected = garmentMeshWarpRgba8(basisRgba, 2, 2, { sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2 });
  const { prepared, upload } = await prepareAndUpload(h, expected);
  await assert.rejects(() => h.service.submit({ ticketId: prepared.ticket.ticketId, projectId, result: resultFor(prepared.ticket, upload) }, auth), /destination mesh no longer matches/i);
  assert.equal(h.layerPersistCalls(), 0);
  assert.equal(h.deliveryCalls(), 1);
});

test('immutable layer replay makes persistence-before-ticket-commit retry idempotent', async () => {
  const h = harness({ failCommitOnce: true });
  const expected = garmentMeshWarpRgba8(basisRgba, 2, 2, { sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2 });
  const { prepared, upload } = await prepareAndUpload(h, expected);
  const result = resultFor(prepared.ticket, upload);
  await assert.rejects(() => h.service.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, auth), /simulated durable commit failure/i);
  assert.equal(h.layerPersistCalls(), 1, 'layer is already durable before ticket finalization');
  const firstLayerId = h.layer().id;

  const retried = await h.service.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, auth);
  assert.equal(retried.status, 'SUCCESS');
  assert.equal(retried.layerId, firstLayerId);
  assert.equal(h.layerPersistCalls(), 2, 'retry re-enters persistence but exact immutable replay returns the same layer');
});
