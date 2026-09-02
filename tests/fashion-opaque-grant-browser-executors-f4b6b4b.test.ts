import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FASHION_TRYON_EXECUTION_GRANT_VERSION,
  FASHION_TRYON_EXECUTION_MIME,
  FASHION_TRYON_MESH_PHASE,
  FASHION_TRYON_TEXTURE_PHASE,
  decodeFashionTryOnMeshExecutionEnvelope,
  decodeFashionTryOnTextureExecutionEnvelope,
  encodeFashionTryOnMeshExecutionEnvelope,
  encodeFashionTryOnTextureExecutionEnvelope,
  normalizeFashionTryOnExecutionGrant,
} from '../src/platform/creative/canonical/fashionTryOnOpaqueExecution.ts';
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
const sourcePointsQ16 = Object.freeze([
  Object.freeze([0, 0] as const),
  Object.freeze([65_536, 0] as const),
  Object.freeze([65_536, 65_536] as const),
  Object.freeze([0, 65_536] as const),
]);
const destinationPointsQ16 = sourcePointsQ16;
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

function meshGrant(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    version: FASHION_TRYON_EXECUTION_GRANT_VERSION,
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
function textureGrant(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    version: FASHION_TRYON_EXECUTION_GRANT_VERSION,
    ticketId: textureTicketId,
    phase: FASHION_TRYON_TEXTURE_PHASE,
    toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
    toolVersion: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
    outputWidth: 2,
    outputHeight: 2,
    mimeType: FASHION_TRYON_EXECUTION_MIME,
    expiresAt: 10_000,
    ...overrides,
  });
}

const meshEnvelope = Object.freeze({
  basisViewRgba: basis,
  basisViewWidth: 2,
  basisViewHeight: 2,
  sourcePointsQ16,
  destinationPointsQ16,
  triangles,
  outputWidth: 2,
  outputHeight: 2,
});
const textureEnvelope = Object.freeze({
  projectRgba: project,
  garmentSourceRgba: basis,
  garmentSourceWidth: 2,
  garmentSourceHeight: 2,
  sourcePointsQ16,
  destinationPointsQ16,
  triangles,
  outputWidth: 2,
  outputHeight: 2,
  producerParameters,
});

test('F4b.6b.4b opaque grant rejects every raw-ticket and evidence authority field', () => {
  assert.deepEqual(normalizeFashionTryOnExecutionGrant(meshGrant()), meshGrant());
  for (const extra of [
    { representationId: '55555555-5555-4555-8555-555555555555' },
    { anchorSetId: '66666666-6666-4666-8666-666666666666' },
    { viewId: '77777777-7777-4777-8777-777777777777' },
    { garmentWarpLayerId: '88888888-8888-4888-8888-888888888888' },
    { projectImageStorageId: '99999999-9999-4999-8999-999999999999' },
    { projectImageSha256: 'a'.repeat(64) },
    { nonce: 'server-nonce' },
    { managedInputs: [] },
    { operation: { id: 'garment-mesh-warp' } },
  ]) assert.throws(() => normalizeFashionTryOnExecutionGrant({ ...meshGrant(), ...extra }), /unknown or missing fields/i);

  assert.throws(() => normalizeFashionTryOnExecutionGrant({ ...meshGrant(), toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID }), /tool binding/i);
  assert.throws(() => normalizeFashionTryOnExecutionGrant({ ...meshGrant(), ticketId: meshTicketId.toUpperCase() }), /canonical lowercase UUID/i);
});

test('F4b.6b.4b minimal binary envelopes contain kernel data but no reusable Fashion authority identities', () => {
  const meshBytes = encodeFashionTryOnMeshExecutionEnvelope(meshEnvelope);
  const decodedMesh = decodeFashionTryOnMeshExecutionEnvelope(meshBytes);
  assert.deepEqual(decodedMesh.basisViewRgba, basis);
  assert.deepEqual(decodedMesh.sourcePointsQ16, sourcePointsQ16);
  assert.deepEqual(decodedMesh.destinationPointsQ16, destinationPointsQ16);
  assert.deepEqual(decodedMesh.triangles, triangles);

  const textureBytes = encodeFashionTryOnTextureExecutionEnvelope(textureEnvelope);
  const decodedTexture = decodeFashionTryOnTextureExecutionEnvelope(textureBytes);
  assert.deepEqual(decodedTexture.projectRgba, project);
  assert.deepEqual(decodedTexture.garmentSourceRgba, basis);
  assert.deepEqual(decodedTexture.producerParameters, producerParameters);

  const transportText = new TextDecoder().decode(Uint8Array.from([...meshBytes, ...textureBytes]));
  for (const forbidden of [
    'ticketId','projectId','sourceArtifactId','garmentId','viewId','representationId','anchorSetId',
    'garmentWarpLayerId','projectImageStorageId','projectImageSha256','nonce','managedInputs',
  ]) assert.equal(transportText.includes(forbidden), false, forbidden);
});

test('F4b.6b.4b prepared mesh executor is pixel-identical and submit carries only opaque ticket identity plus latency', async () => {
  const envelopeBytes = encodeFashionTryOnMeshExecutionEnvelope(meshEnvelope);
  const expected = garmentMeshWarpRgba8(basis, 2, 2, {
    sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2,
  });
  const calls: any = { loads: [], uploads: [], submits: [] };
  let clock = 100;
  const executor = new CorePreparedGarmentMeshWarp(projectId, {
    loadPreparedGarmentMeshWarpInput: async payload => { calls.loads.push(payload); return envelopeBytes; },
    uploadPreparedGarmentMeshWarpImage: async payload => {
      calls.uploads.push(payload);
      return { status: 'STORED', mimeType: 'image/png', width: 2, height: 2, sizeBytes: payload.bytes.byteLength };
    },
    submitPreparedGarmentMeshWarp: async payload => { calls.submits.push(payload); return { status: 'SUCCESS' }; },
  }, () => { const value = clock; clock += 7; return value; }, () => 1_000);

  const result = await executor.run(meshGrant());
  assert.deepEqual(result.preview.data, expected);
  assert.equal(result.latencyMs, 7);
  assert.deepEqual(calls.loads, [{ ticketId: meshTicketId, projectId }]);
  assert.equal(calls.uploads.length, 1);
  assert.deepEqual(calls.submits, [{ ticketId: meshTicketId, projectId, latencyMs: 7 }]);
  for (const forbidden of ['uploadId','nonce','stepId','workflowId','requestId','executor','representationId','anchorSetId','layerId']) {
    assert.equal(JSON.stringify(calls.submits).includes(forbidden), false, forbidden);
  }
});

test('F4b.6b.4b prepared texture executor is pixel-identical and never receives or returns layer FINAL or upload authority', async () => {
  const envelopeBytes = encodeFashionTryOnTextureExecutionEnvelope(textureEnvelope);
  const expected = garmentTextureCompositeRgba8(
    project, 2, 2, basis, 2, 2,
    { sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2 },
    {
      textureTransform: producerParameters.textureTransform,
      featherRadius: producerParameters.featherRadius,
      colorSpacePolicy: producerParameters.colorSpacePolicy,
    },
  );
  const calls: any = { loads: [], uploads: [], submits: [] };
  let clock = 200;
  const executor = new CorePreparedGarmentTextureComposite(projectId, {
    loadPreparedGarmentTextureCompositeInput: async payload => { calls.loads.push(payload); return envelopeBytes; },
    uploadPreparedGarmentTextureCompositeImage: async payload => {
      calls.uploads.push(payload);
      return { status: 'STORED', mimeType: 'image/png', width: 2, height: 2, sizeBytes: payload.bytes.byteLength };
    },
    submitPreparedGarmentTextureComposite: async payload => { calls.submits.push(payload); return { status: 'SUCCESS' }; },
  }, () => { const value = clock; clock += 11; return value; }, () => 1_000);

  const result = await executor.run(textureGrant());
  assert.deepEqual(result.preview.data, expected);
  assert.equal(result.latencyMs, 11);
  assert.deepEqual(calls.loads, [{ ticketId: textureTicketId, projectId }]);
  assert.deepEqual(calls.submits, [{ ticketId: textureTicketId, projectId, latencyMs: 11 }]);
  assert.equal('artifactId' in result, false);
  assert.equal('layerId' in result, false);
  assert.equal(JSON.stringify(calls.submits).includes('uploadId'), false);
});

test('F4b.6b.4b grant phase expiry geometry and over-rich server projections fail before upload or submit', async () => {
  const meshBytes = encodeFashionTryOnMeshExecutionEnvelope(meshEnvelope);
  const calls = { uploads: 0, submits: 0 };
  const executor = new CorePreparedGarmentMeshWarp(projectId, {
    loadPreparedGarmentMeshWarpInput: async () => meshBytes,
    uploadPreparedGarmentMeshWarpImage: async () => { calls.uploads += 1; return {}; },
    submitPreparedGarmentMeshWarp: async () => { calls.submits += 1; return {}; },
  }, () => 1, () => 1_000);

  await assert.rejects(() => executor.run(textureGrant()), /phase is invalid/i);
  await assert.rejects(() => executor.run(meshGrant({ expiresAt: 1_000 })), /expired/i);
  await assert.rejects(() => executor.run(meshGrant({ outputWidth: 3 })), /payload geometry/i);
  await assert.rejects(() => executor.run({ ...meshGrant(), representationId: '55555555-5555-4555-8555-555555555555' }), /unknown or missing fields/i);
  assert.deepEqual(calls, { uploads: 0, submits: 0 });
});
