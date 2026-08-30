import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  LocalExecutionManagedGarmentInputBinding,
  LocalExecutionTicketV2,
} from '../src/platform/creative/canonical/localExecution.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  assertGarmentMeshWarpTicket,
  garmentMeshWarpExecutionId,
  garmentMeshWarpManagedBindings,
  garmentMeshWarpOutputContract,
  garmentMeshWarpParametersFromTicket,
  garmentMeshWarpTicketIdempotencyKey,
  sameGarmentMeshWarpTicket,
} from '../server/core/localExecution/GarmentMeshWarpExecutionContract.ts';

const scope = Object.freeze({
  tenantId: 'tenant-ticket-contract',
  userId: 'user-ticket-contract',
  projectId: '11111111-1111-4111-8111-111111111111',
});
const projectSha = '9'.repeat(64);
const view = Object.freeze({
  authority: 'MANAGED_GARMENT',
  kind: 'GARMENT_VIEW',
  garmentId: '22222222-2222-4222-8222-222222222222',
  viewId: '33333333-3333-4333-8333-333333333333',
  contentSha256: 'a'.repeat(64),
  contentType: 'image/png',
  encoding: 'PNG_RGBA8_LOSSLESS',
  width: 128,
  height: 192,
}) satisfies LocalExecutionManagedGarmentInputBinding;
const representation = Object.freeze({
  authority: 'MANAGED_GARMENT',
  kind: 'GARMENT_REPRESENTATION',
  garmentId: view.garmentId,
  representationId: '44444444-4444-4444-8444-444444444444',
  tier: 'PARAMETRIC',
  format: 'BERS_PARAMETRIC_V1',
  contentType: 'application/vnd.bers.garment-parametric+json',
  contentSha256: 'b'.repeat(64),
  basisViewId: view.viewId,
  generatorId: 'bers.mesh-fit',
  generatorVersion: '1',
  validatorId: 'bers.parametric-topology-validator',
  validatorVersion: '1',
}) satisfies LocalExecutionManagedGarmentInputBinding;
const exact = GARMENT_MESH_WARP_TOOL_DEFINITION.parameters.exact;
const parameters = Object.freeze({
  sourceArtifactId: 'signed-project-source',
  garmentId: view.garmentId,
  viewId: view.viewId,
  representationId: representation.representationId,
  anchorSetId: '55555555-5555-4555-8555-555555555555',
  projectImageStorageId: '66666666-6666-4666-8666-666666666666',
  projectImageSha256: 'c'.repeat(64),
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
    ticketId: 'ticket-garment-warp-contract',
    version: '2',
    issuer: 'CORE',
    requestId: 'garment-mesh-warp:request',
    workflowId: 'garment-mesh-warp:request',
    stepId: GARMENT_MESH_WARP_STEP_ID,
    operation: Object.freeze({
      id: GARMENT_MESH_WARP_STEP_ID,
      version: '1',
      type: GARMENT_MESH_WARP_OPERATION,
      capability: GARMENT_MESH_WARP_CAPABILITY,
      parameters,
    }),
    scope,
    inputs: Object.freeze([Object.freeze({
      artifactId: parameters.sourceArtifactId,
      kind: 'image',
      role: 'COMPOSITE',
      sha256: projectSha,
    })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({
      kind: 'image',
      role: 'WORKING',
      count: 1,
      mimeTypes: Object.freeze(['image/png']),
      width: 320,
      height: 480,
    })]),
    allowedExecutors: Object.freeze([Object.freeze({
      kind: 'DETERMINISTIC_TOOL',
      toolId: GARMENT_MESH_WARP_TOOL_ID,
      version: GARMENT_MESH_WARP_TOOL_VERSION,
    })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: garmentMeshWarpTicketIdempotencyKey('client-1'),
    nonce: 'garment-warp-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  });
}

function replaceOperation(base: LocalExecutionTicketV2, nextParameters: Record<string, unknown>): LocalExecutionTicketV2 {
  return Object.freeze({ ...base, operation: Object.freeze({ ...base.operation, parameters: Object.freeze(nextParameters) }) });
}

test('exact garment warp ticket contract accepts the closed Project + managed Garment authority split', () => {
  const value = ticket();
  assert.doesNotThrow(() => assertGarmentMeshWarpTicket(value));
  assert.deepEqual(garmentMeshWarpManagedBindings(value), { view, representation });
  assert.deepEqual(garmentMeshWarpOutputContract(value), value.expectedOutputs[0]);
  assert.deepEqual(garmentMeshWarpParametersFromTicket(value), parameters);
  assert.equal(sameGarmentMeshWarpTicket(value, structuredClone(value)), true);
});

test('garment warp ticket contract rejects managed-input count, order and basis-view drift', () => {
  const base = ticket();
  assert.throws(() => assertGarmentMeshWarpTicket(Object.freeze({ ...base, managedInputs: undefined })), /exactly two managed Garment inputs/i);
  assert.throws(() => assertGarmentMeshWarpTicket(Object.freeze({ ...base, managedInputs: Object.freeze([view]) })), /exactly two managed Garment inputs/i);
  assert.throws(() => assertGarmentMeshWarpTicket(Object.freeze({ ...base, managedInputs: Object.freeze([representation, view]) })), /order or representation tier/i);
  const wrongBasis = Object.freeze({ ...representation, basisViewId: '77777777-7777-4777-8777-777777777777' });
  assert.throws(() => assertGarmentMeshWarpTicket(Object.freeze({ ...base, managedInputs: Object.freeze([view, wrongBasis]) } as LocalExecutionTicketV2)), /do not match garment mesh-warp ticket parameters/i);
});

test('garment warp ticket contract rejects cloud cost, executor drift and Project-FINAL-shaped output', () => {
  const base = ticket();
  assert.throws(() => assertGarmentMeshWarpTicket(Object.freeze({ ...base, cost: Object.freeze({ paidCloudCredits: 1, providerCalls: 0 }) })), /zero-cloud/i);
  assert.throws(() => assertGarmentMeshWarpTicket(Object.freeze({ ...base, allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_MESH_WARP_TOOL_ID, version: '2' })]) })), /executor binding is invalid/i);
  assert.throws(() => assertGarmentMeshWarpTicket(Object.freeze({
    ...base,
    expectedOutputs: Object.freeze([Object.freeze({ ...base.expectedOutputs[0], role: 'COMPOSITE' })]),
  }) as LocalExecutionTicketV2), /PNG WORKING/i);
});

test('garment warp ticket contract rejects open parameter schema, semantic drift and identity drift', () => {
  const base = ticket();
  assert.throws(() => assertGarmentMeshWarpTicket(replaceOperation(base, { ...parameters, clientMesh: [[0, 0]] })), /open or incomplete/i);
  assert.throws(() => assertGarmentMeshWarpTicket(replaceOperation(base, { ...parameters, rounding: 'ROUND_TO_EVEN' })), /semantic parameters are invalid/i);
  assert.throws(() => assertGarmentMeshWarpTicket(replaceOperation(base, { ...parameters, destinationMeshSha256: parameters.destinationMeshSha256.toUpperCase() })), /destinationMeshSha256 is invalid/i);
  assert.throws(() => assertGarmentMeshWarpTicket(replaceOperation(base, { ...parameters, viewId: 'not-a-uuid' })), /viewId is invalid/i);
});

test('execution and ticket idempotency identities are deterministic, scope-bound and reject unsafe client ids', () => {
  const id = garmentMeshWarpExecutionId(scope, 'client-1');
  assert.equal(id, garmentMeshWarpExecutionId(scope, 'client-1'));
  assert.notEqual(id, garmentMeshWarpExecutionId({ ...scope, userId: 'other-user' }, 'client-1'));
  assert.notEqual(id, garmentMeshWarpExecutionId({ ...scope, projectId: '77777777-7777-4777-8777-777777777777' }, 'client-1'));
  assert.equal(garmentMeshWarpTicketIdempotencyKey('client-1'), 'client-1:garment-mesh-warp:local-v2');
  assert.throws(() => garmentMeshWarpExecutionId(scope, 'contains whitespace'), /safe identifier/i);
  assert.throws(() => garmentMeshWarpTicketIdempotencyKey(''), /safe identifier/i);
});
