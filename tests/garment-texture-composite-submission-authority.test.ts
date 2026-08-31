import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import type { LocalExecutionResultV2, LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';
import { garmentTextureCompositeRgba8 } from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';
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
import { GarmentTextureCompositeSubmissionAuthority } from '../server/core/localExecution/GarmentTextureCompositeSubmissionAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-submit', userId: 'user-submit', projectId: '11111111-1111-4111-8111-111111111111' });
const projectStorageId = '22222222-2222-4222-8222-222222222222';
const layerId = '33333333-3333-4333-8333-333333333333';
const garmentId = '44444444-4444-4444-8444-444444444444';
const viewId = '55555555-5555-4555-8555-555555555555';
const representationId = '66666666-6666-4666-8666-666666666666';
const anchorSetId = '77777777-7777-4777-8777-777777777777';
const sourceArtifactId = 'signed-project-source';
const hashes = Object.freeze({ project: 'a'.repeat(64), layer: 'b'.repeat(64), view: 'c'.repeat(64), representation: 'd'.repeat(64), anchor: 'e'.repeat(64), mesh: 'f'.repeat(64) });
const transform = Object.freeze({ scaleXQ16: 65536, scaleYQ16: 65536, offsetXQ16: 0, offsetYQ16: 0, wrapMode: 'CLAMP' as const, alphaPolicy: 'PRESERVE_BASE_ALPHA' as const });
const producer = normalizeGarmentTextureFinalLineageParameters({ schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA, textureTransform: transform, featherRadius: 0, colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY });
const view = Object.freeze({ authority: 'MANAGED_GARMENT' as const, kind: 'GARMENT_VIEW' as const, garmentId, viewId, contentSha256: hashes.view, contentType: 'image/png' as const, encoding: 'PNG_RGBA8_LOSSLESS' as const, width: 2, height: 2 });
const representation = Object.freeze({ authority: 'MANAGED_GARMENT' as const, kind: 'GARMENT_REPRESENTATION' as const, garmentId, representationId, tier: 'PARAMETRIC' as const, format: 'BERS_PARAMETRIC_V1' as const, contentType: 'application/vnd.bers.garment-parametric+json' as const, contentSha256: hashes.representation, basisViewId: viewId, generatorId: 'bers.mesh-fit', generatorVersion: '1', validatorId: 'bers.parametric-topology-validator', validatorVersion: '1' });
const parameters = Object.freeze({ sourceArtifactId, projectImageStorageId: projectStorageId, projectImageSha256: hashes.project, garmentWarpLayerId: layerId, garmentWarpLayerSha256: hashes.layer, garmentId, viewId, viewSha256: hashes.view, representationId, representationSha256: hashes.representation, anchorSetId, anchorPayloadSha256: hashes.anchor, destinationMeshSha256: hashes.mesh, producerParameters: producer.document, producerParametersSha256: producer.sha256, deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`, maxDimension: 4096, maxOutputPixels: 8_388_608 });
const sourcePointsQ16 = Object.freeze([Object.freeze([0,0] as const), Object.freeze([65536,0] as const), Object.freeze([0,65536] as const), Object.freeze([65536,65536] as const)]);
const destinationPointsQ16 = sourcePointsQ16;
const triangles = Object.freeze([Object.freeze([0,1,2] as const), Object.freeze([1,3,2] as const)]);
const projectRgba = Uint8Array.from([10,20,30,255, 40,50,60,255, 70,80,90,255, 100,110,120,255]);
const garmentRgba = Uint8Array.from([200,0,0,255, 0,200,0,255, 0,0,200,255, 200,200,0,255]);
const delivered = Object.freeze({
  ticketId: 'ticket-texture-submit', projectId: scope.projectId, sourceArtifactId, projectImageStorageId: projectStorageId, projectImageSha256: hashes.project,
  garmentWarpLayerId: layerId, garmentWarpLayerSha256: hashes.layer, garmentId, viewId, viewSha256: hashes.view, representationId, representationSha256: hashes.representation,
  anchorSetId, anchorPayloadSha256: hashes.anchor, destinationMeshSha256: hashes.mesh, outputWidth: 2, outputHeight: 2, garmentSourceWidth: 2, garmentSourceHeight: 2,
  sourcePointsQ16, destinationPointsQ16, triangles, producerParameters: producer.document, producerParametersSha256: producer.sha256,
  projectRgba, garmentSourceRgba: garmentRgba,
});

function ticket(): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: delivered.ticketId, version: '2', issuer: 'CORE', requestId: 'garment-texture-composite:submit', workflowId: 'garment-texture-composite:submit', stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    operation: Object.freeze({ id: GARMENT_TEXTURE_COMPOSITE_STEP_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION, type: GARMENT_TEXTURE_COMPOSITE_OPERATION, capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY, parameters }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, kind: 'image', role: 'COMPOSITE', sha256: hashes.project })]), managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY', idempotencyKey: 'submit:garment-texture-composite:local-v2', nonce: 'submit-nonce', issuedAt: 1_000, expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

async function png(rgba: Uint8Array | Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(rgba, { raw: { width: 2, height: 2, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}
function expectedRgba() {
  return garmentTextureCompositeRgba8(projectRgba, 2, 2, garmentRgba, 2, 2, { sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2 }, { textureTransform: producer.document.textureTransform, featherRadius: producer.document.featherRadius, colorSpacePolicy: producer.document.colorSpacePolicy });
}

function harness() {
  const t = ticket();
  let claimed = false, finalized: 'SUCCESS' | 'FAILED' | 'UNKNOWN' | undefined;
  let storedFinal: any;
  let upload: any;
  let releases = 0, commits = 0, consumes = 0, deliveries = 0, verifies = 0, persists = 0;
  const order: string[] = [];
  const admission = {
    getV2: async () => t,
    getByIdempotencyKeyV2: async () => undefined,
    issueV2: async (value: any) => value,
    getFinalization: async () => finalized ? Object.freeze({ status: finalized }) : undefined,
    claimV2: async ({ result }: any) => {
      if (finalized) return Object.freeze({ allowed: false, reasonCode: 'REPLAYED_TICKET' });
      if (claimed) return Object.freeze({ allowed: false, reasonCode: 'IN_PROGRESS' });
      claimed = true; return Object.freeze({ allowed: true, result });
    },
    commit: async (_id: string, status: 'SUCCESS' | 'FAILED') => { commits += 1; finalized = status; claimed = false; order.push('commit'); },
    release: async () => { releases += 1; claimed = false; order.push('release'); },
  } as any;
  const uploads = {
    persist: async (input: any) => {
      const bytes = Uint8Array.from(input.bytes); const sha256 = createHash('sha256').update(bytes).digest('hex');
      upload = Object.freeze({ uploadId: 'upload-texture-submit', ticketId: input.ticketId, scope: input.scope, kind: input.kind, role: input.role, mimeType: input.mimeType, width: input.width, height: input.height, bytes, sha256, sizeBytes: bytes.byteLength });
      return upload;
    },
    load: async () => upload,
    consume: async () => { consumes += 1; order.push('consume'); return true; },
  } as any;
  const authority = new GarmentTextureCompositeSubmissionAuthority({
    admission,
    uploads,
    delivery: { deliver: async () => { deliveries += 1; order.push('deliver'); return delivered as any; } },
    maxUploadBytes: 1024 * 1024,
    completeCanonicalExecution: async ({ artifact }: any) => { verifies += 1; order.push('verify'); assert.equal(artifact.role, 'COMPOSITE'); return Object.freeze({ valid: true, checks: Object.freeze(['BYTE_EXACT_CORE_RECOMPUTE']), errors: Object.freeze([]) }); },
    persistFinal: async (_scope, _executionId, _operationId, image, lineage) => {
      persists += 1; order.push('persist');
      assert.deepEqual(image.data, expectedRgba());
      storedFinal = Object.freeze({ storageId: '88888888-8888-4888-8888-888888888888', width: image.width, height: image.height, sourceImageStorageId: lineage.sourceImageStorageId, producerOperation: lineage.producerOperation, garmentWarpLayerId: lineage.garmentWarpLayerId, garmentWarpLayerSha256: lineage.garmentWarpLayerSha256, producerParametersSha256: producer.sha256 });
      return storedFinal;
    },
    loadPersistedFinal: async () => storedFinal,
    issueFinalId: (storageId) => `signed-final:${storageId}`,
    now: () => 2_000,
  });
  return Object.freeze({ authority, ticket: t, admission, uploads, setUpload: (value: any) => { upload = value; }, setStored: (value: any) => { storedFinal = value; }, counters: () => ({ releases, commits, consumes, deliveries, verifies, persists }), order });
}

function result(evidence: any): LocalExecutionResultV2 {
  return Object.freeze({ ticketId: delivered.ticketId, ticketVersion: '2', requestId: 'garment-texture-composite:submit', workflowId: 'garment-texture-composite:submit', stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID, nonce: 'submit-nonce', executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION }), runtime: 'BROWSER_JS', accelerator: 'cpu', outputs: Object.freeze([evidence]), metrics: Object.freeze({ latencyMs: 10 }), benchmarkEvidence: Object.freeze({}) });
}

test('Core verifies exact candidate before canonical FINAL persistence and replay returns the same signed identity', async () => {
  const h = harness();
  const bytes = await png(expectedRgba());
  const evidence = await h.authority.uploadImage({ ticketId: h.ticket.ticketId, projectId: scope.projectId, bytes }, scope);
  const first = await h.authority.submit({ ticketId: h.ticket.ticketId, projectId: scope.projectId, result: result(evidence) }, scope);
  assert.equal(first.status, 'SUCCESS'); assert.equal(first.artifactId, 'signed-final:88888888-8888-4888-8888-888888888888'); assert.equal(first.verification.valid, true);
  assert.ok(h.order.indexOf('verify') < h.order.indexOf('persist'));
  assert.ok(h.order.indexOf('persist') < h.order.indexOf('commit'));
  assert.deepEqual(h.counters(), { releases: 0, commits: 1, consumes: 1, deliveries: 1, verifies: 1, persists: 1 });

  const replay = await h.authority.submit({ ticketId: h.ticket.ticketId, projectId: scope.projectId, result: result(evidence) }, scope);
  assert.equal(replay.status, 'SUCCESS'); assert.equal(replay.artifactId, first.artifactId); assert.equal(replay.verification.valid, true);
  assert.deepEqual(h.counters(), { releases: 0, commits: 1, consumes: 1, deliveries: 1, verifies: 1, persists: 1 });
});

test('tampered candidate creates no FINAL and releases its claim without consuming or finalizing the ticket', async () => {
  const h = harness();
  const tampered = Uint8Array.from(expectedRgba()); tampered[0] ^= 1;
  const badEvidence = await h.authority.uploadImage({ ticketId: h.ticket.ticketId, projectId: scope.projectId, bytes: await png(tampered) }, scope);
  await assert.rejects(() => h.authority.submit({ ticketId: h.ticket.ticketId, projectId: scope.projectId, result: result(badEvidence) }, scope), /differs from Core recomputation/i);
  assert.deepEqual(h.counters(), { releases: 1, commits: 0, consumes: 0, deliveries: 1, verifies: 0, persists: 0 });

  // Submission authority releases the durable claim, but does not mutate quarantine.
  // The real PostgreSQL store separately proves that non-WORKING COMPOSITE bytes are
  // immutable within one ticket; a corrected image therefore requires a fresh ticket.
  await assert.rejects(() => h.authority.submit({ ticketId: h.ticket.ticketId, projectId: scope.projectId, result: result(badEvidence) }, scope), /differs from Core recomputation/i);
  assert.deepEqual(h.counters(), { releases: 2, commits: 0, consumes: 0, deliveries: 2, verifies: 0, persists: 0 });
});

test('canonical verification failure occurs before persistence and releases claim', async () => {
  const h = harness();
  const bytes = await png(expectedRgba());
  const evidence = await h.authority.uploadImage({ ticketId: h.ticket.ticketId, projectId: scope.projectId, bytes }, scope);
  const failing = new GarmentTextureCompositeSubmissionAuthority({
    admission: h.admission,
    uploads: h.uploads,
    delivery: { deliver: async () => delivered as any },
    maxUploadBytes: 1024 * 1024,
    completeCanonicalExecution: async () => Object.freeze({ valid: false, checks: Object.freeze([]), errors: Object.freeze(['VERIFIER_REJECTED']) }),
    persistFinal: async () => { throw new Error('must not persist'); },
    loadPersistedFinal: async () => undefined,
    issueFinalId: () => 'must-not-issue',
    now: () => 2_000,
  });
  await assert.rejects(() => failing.submit({ ticketId: h.ticket.ticketId, projectId: scope.projectId, result: result(evidence) }, scope), /did not pass workflow verification/i);
  assert.equal(h.counters().releases, 1);
});