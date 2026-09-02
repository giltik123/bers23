import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FASHION_TRYON_EXECUTION_MIME,
  FASHION_TRYON_MESH_PHASE,
  FASHION_TRYON_PREPARED_EXECUTION_VERSION,
  FASHION_TRYON_TEXTURE_PHASE,
  decodeFashionTryOnMeshExecutionEnvelope,
  decodeFashionTryOnTextureExecutionEnvelope,
  encodeFashionTryOnMeshExecutionEnvelope,
  encodeFashionTryOnTextureExecutionEnvelope,
  normalizeFashionTryOnPreparedExecutionDescriptor,
  requireUsableFashionTryOnPreparedExecutionDescriptor,
} from '../src/platform/creative/canonical/fashionTryOnPreparedExecution.ts';
import {
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';

const meshTicketId = 'a2222222-2222-4222-8222-222222222222';
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
function textureDescriptor(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  });
}

test('F4b.6b.4b prepared descriptor is a closed non-authorizing lookup contract', () => {
  assert.deepEqual(normalizeFashionTryOnPreparedExecutionDescriptor(meshDescriptor()), meshDescriptor());
  assert.deepEqual(requireUsableFashionTryOnPreparedExecutionDescriptor(textureDescriptor(), FASHION_TRYON_TEXTURE_PHASE, 9_999), textureDescriptor());
  for (const extra of [
    { projectId: '11111111-1111-4111-8111-111111111111' },
    { sourceArtifactId: 'signed-source' },
    { representationId: '55555555-5555-4555-8555-555555555555' },
    { anchorSetId: '66666666-6666-4666-8666-666666666666' },
    { viewId: '77777777-7777-4777-8777-777777777777' },
    { garmentWarpLayerId: '88888888-8888-4888-8888-888888888888' },
    { projectImageStorageId: '99999999-9999-4999-8999-999999999999' },
    { projectImageSha256: 'a'.repeat(64) },
    { nonce: 'server-nonce' },
    { managedInputs: [] },
    { signature: 'not-a-real-grant' },
  ]) {
    assert.throws(
      () => normalizeFashionTryOnPreparedExecutionDescriptor({ ...meshDescriptor(), ...extra }),
      /unknown or missing fields/i,
    );
  }
  assert.throws(() => normalizeFashionTryOnPreparedExecutionDescriptor({ ...meshDescriptor(), toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID }), /tool binding/i);
  assert.throws(() => normalizeFashionTryOnPreparedExecutionDescriptor({ ...meshDescriptor(), ticketId: meshTicketId.toUpperCase() }), /canonical lowercase UUID/i);
  assert.throws(() => requireUsableFashionTryOnPreparedExecutionDescriptor(meshDescriptor(), FASHION_TRYON_TEXTURE_PHASE, 1_000), /phase is invalid/i);
  assert.throws(() => requireUsableFashionTryOnPreparedExecutionDescriptor(meshDescriptor(), FASHION_TRYON_MESH_PHASE, 10_000), /expired/i);
});

test('F4b.6b.4b mesh envelope round-trip contains only deterministic kernel data', () => {
  const bytes = encodeFashionTryOnMeshExecutionEnvelope({
    basisViewRgba: basis,
    basisViewWidth: 2,
    basisViewHeight: 2,
    sourcePointsQ16,
    destinationPointsQ16,
    triangles,
    outputWidth: 2,
    outputHeight: 2,
  });
  const decoded = decodeFashionTryOnMeshExecutionEnvelope(bytes);
  assert.deepEqual(decoded, {
    basisViewRgba: basis,
    basisViewWidth: 2,
    basisViewHeight: 2,
    sourcePointsQ16,
    destinationPointsQ16,
    triangles,
    outputWidth: 2,
    outputHeight: 2,
  });
  assertNoAuthorityStrings(bytes);
});

test('F4b.6b.4b texture envelope round-trip contains Project/garment pixels plus closed producer math only', () => {
  const bytes = encodeFashionTryOnTextureExecutionEnvelope({
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
  const decoded = decodeFashionTryOnTextureExecutionEnvelope(bytes);
  assert.deepEqual(decoded, {
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
  assertNoAuthorityStrings(bytes);
});

test('F4b.6b.4b binary decoder rejects truncation, phase magic substitution and trailing plane bytes', () => {
  const mesh = encodeFashionTryOnMeshExecutionEnvelope({
    basisViewRgba: basis,
    basisViewWidth: 2,
    basisViewHeight: 2,
    sourcePointsQ16,
    destinationPointsQ16,
    triangles,
    outputWidth: 2,
    outputHeight: 2,
  });
  assert.throws(() => decodeFashionTryOnMeshExecutionEnvelope(mesh.subarray(0, 8)), /truncated/i);
  assert.throws(() => decodeFashionTryOnTextureExecutionEnvelope(mesh), /magic\/version/i);

  const texture = encodeFashionTryOnTextureExecutionEnvelope({
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
  const extended = new Uint8Array(texture.byteLength + 1);
  extended.set(texture);
  assert.throws(() => decodeFashionTryOnTextureExecutionEnvelope(extended), /RGBA length is invalid/i);
});

function assertNoAuthorityStrings(bytes: Uint8Array): void {
  const text = new TextDecoder().decode(bytes);
  for (const forbidden of [
    'ticketId', 'projectId', 'sourceArtifactId', 'garmentId', 'viewId', 'representationId', 'anchorSetId',
    'garmentWarpLayerId', 'projectImageStorageId', 'projectImageSha256', 'representationSha256',
    'anchorPayloadSha256', 'destinationMeshSha256', 'nonce', 'managedInputs', 'executionId', 'artifactId',
  ]) assert.equal(text.includes(forbidden), false, forbidden);
}
