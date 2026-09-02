import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FASHION_TRYON_EXECUTION_MIME,
  FASHION_TRYON_MESH_PHASE,
  FASHION_TRYON_PREPARED_EXECUTION_VERSION,
  FASHION_TRYON_TEXTURE_PHASE,
  encodeFashionTryOnMeshExecutionEnvelope,
  encodeFashionTryOnTextureExecutionEnvelope,
} from '../src/platform/creative/canonical/fashionTryOnPreparedExecution.ts';
import {
  CorePreparedGarmentMeshWarp,
  CorePreparedGarmentTextureComposite,
} from '../src/application/local-execution/CorePreparedFashionTryOn.ts';
import {
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { garmentTextureCompositeRgba8 } from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const meshTicketId = '22222222-2222-4222-8222-222222222222';
const textureTicketId = '33333333-3333-4333-8333-333333333333';
const points = Object.freeze([
  Object.freeze([0, 0] as const),
  Object.freeze([65_536, 0] as const),
  Object.freeze([65_536, 65_536] as const),
  Object.freeze([0, 65_536] as const),
]);
const triangles = Object.freeze([
  Object.freeze([0, 1, 2] as const),
  Object.freeze([0, 2, 3] as const),
]);
const basis = Uint8Array.from([
  255, 0, 0, 255, 0, 255, 0, 255,
  0, 0, 255, 255, 255, 255, 255, 255,
]);
const project = Uint8Array.from([
  10, 20, 30, 255, 20, 30, 40, 255,
  30, 40, 50, 255, 40, 50, 60, 255,
]);
const producerParameters = Object.freeze({
  schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  textureTransform: Object.freeze({
    scaleXQ16: 65_536,
    scaleYQ16: 65_536,
    offsetXQ16: 0,
    offsetYQ16: 0,
    wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
    alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  }),
  featherRadius: 0,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});

function meshDescriptor(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    version: FASHION_TRYON_PREPARED_EXECUTION_VERSION,
    ticketId: meshTicketId,
    phase: FASHION_TRYON_MESH_PHASE,
    toolId: GARMENT_MESH_WARP_TOOL_ID,
    toolVersion: GARMENT_MESH_WARP_TOOL_VERSION,
    outputWidth: 2,
    outputHeight: 2,
    mimeType: FASHION_TRYON_EXECUTION_MIME,
    expiresAt: 10_000,
    ...overrides,
  });
}
function textureDescriptor() {
  return Object.freeze({
    version: FASHION_TRYON_PREPARED_EXECUTION_VERSION,
    ticketId: textureTicketId,
    phase: FASHION_TRYON_TEXTURE_PHASE,
    toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
    toolVersion: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
    outputWidth: 2,
    outputHeight: 2,
    mimeType: FASHION_TRYON_EXECUTION_MIME,
    expiresAt: 10_000,
  });
}

test('F4b.6b.4b prepared mesh executor is pixel-identical and submits one identifier-minimal PNG candidate', async () => {
  const envelope = encodeFashionTryOnMeshExecutionEnvelope({
    basisViewRgba: basis,
    basisViewWidth: 2,
    basisViewHeight: 2,
    sourcePointsQ16: points,
    destinationPointsQ16: points,
    triangles,
    outputWidth: 2,
    outputHeight: 2,
  });
  const expected = garmentMeshWarpRgba8(basis, 2, 2, {
    sourcePointsQ16: points,
    destinationPointsQ16: points,
    triangles,
    outputWidth: 2,
    outputHeight: 2,
  });
  const calls: any = { loads: [], submits: [] };
  let clock = 100;
  const executor = new CorePreparedGarmentMeshWarp(projectId, {
    loadPreparedGarmentMeshWarpInput: async payload => { calls.loads.push(payload); return envelope; },
    submitPreparedGarmentMeshWarpCandidate: async payload => { calls.submits.push(payload); return { status: 'SUCCESS' }; },
  }, () => { const value = clock; clock += 7; return value; }, () => 1_000);

  const result = await executor.run(meshDescriptor());
  assert.deepEqual(result.preview.data, expected);
  assert.equal(result.latencyMs, 7);
  assert.deepEqual(calls.loads, [{ ticketId: meshTicketId, projectId }]);
  assert.equal(calls.submits.length, 1);
  const submission = calls.submits[0];
  assert.deepEqual({ ticketId: submission.ticketId, projectId: submission.projectId, latencyMs: submission.latencyMs }, { ticketId: meshTicketId, projectId, latencyMs: 7 });
  assert.ok(submission.bytes instanceof Uint8Array && submission.bytes.byteLength > 0);
  assertNoAuthorityMetadata({ ...submission, bytes: '<png>' });
  assert.equal('layerId' in result, false);
  assert.equal('artifactId' in result, false);
});

test('F4b.6b.4b prepared texture executor is pixel-identical and candidate acknowledgement reveals no FINAL identity', async () => {
  const envelope = encodeFashionTryOnTextureExecutionEnvelope({
    projectRgba: project,
    garmentSourceRgba: basis,
    garmentSourceWidth: 2,
    garmentSourceHeight: 2,
    sourcePointsQ16: points,
    destinationPointsQ16: points,
    triangles,
    outputWidth: 2,
    outputHeight: 2,
    producerParameters,
  });
  const expected = garmentTextureCompositeRgba8(
    project, 2, 2, basis, 2, 2,
    { sourcePointsQ16: points, destinationPointsQ16: points, triangles, outputWidth: 2, outputHeight: 2 },
    { textureTransform: producerParameters.textureTransform, featherRadius: 0, colorSpacePolicy: producerParameters.colorSpacePolicy },
  );
  const calls: any = { loads: [], submits: [] };
  let clock = 200;
  const executor = new CorePreparedGarmentTextureComposite(projectId, {
    loadPreparedGarmentTextureCompositeInput: async payload => { calls.loads.push(payload); return envelope; },
    submitPreparedGarmentTextureCompositeCandidate: async payload => { calls.submits.push(payload); return { status: 'SUCCESS' }; },
  }, () => { const value = clock; clock += 11; return value; }, () => 1_000);

  const result = await executor.run(textureDescriptor());
  assert.deepEqual(result.preview.data, expected);
  assert.equal(result.latencyMs, 11);
  assert.deepEqual(calls.loads, [{ ticketId: textureTicketId, projectId }]);
  assert.equal(calls.submits.length, 1);
  assertNoAuthorityMetadata({ ...calls.submits[0], bytes: '<png>' });
  assert.equal('artifactId' in result, false);
  assert.equal('executionId' in result, false);
  assert.equal('layerId' in result, false);
});

test('F4b.6b.4b prepared executor rejects stale descriptor or payload geometry before candidate submit', async () => {
  const envelope = encodeFashionTryOnMeshExecutionEnvelope({
    basisViewRgba: basis,
    basisViewWidth: 2,
    basisViewHeight: 2,
    sourcePointsQ16: points,
    destinationPointsQ16: points,
    triangles,
    outputWidth: 2,
    outputHeight: 2,
  });
  let submits = 0;
  const executor = new CorePreparedGarmentMeshWarp(projectId, {
    loadPreparedGarmentMeshWarpInput: async () => envelope,
    submitPreparedGarmentMeshWarpCandidate: async () => { submits += 1; return { status: 'SUCCESS' }; },
  }, () => 1, () => 1_000);

  await assert.rejects(() => executor.run(meshDescriptor({ expiresAt: 1_000 })), /expired/i);
  await assert.rejects(() => executor.run(meshDescriptor({ outputWidth: 3 })), /payload geometry/i);
  await assert.rejects(() => executor.run({ ...meshDescriptor(), representationId: '55555555-5555-4555-8555-555555555555' }), /unknown or missing fields/i);
  assert.equal(submits, 0);
});

function assertNoAuthorityMetadata(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'uploadId', 'nonce', 'stepId', 'workflowId', 'requestId', 'executor', 'representationId', 'anchorSetId',
    'garmentWarpLayerId', 'layerId', 'artifactId', 'storageId', 'sha256', 'managedInputs',
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
}
