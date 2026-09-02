import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { normalizeGarmentTextureFinalLineageParameters } from '../server/core/fashion/garmentTextureFinalLineage.ts';
import { garmentMeshWarpTicketIdempotencyKey } from '../server/core/localExecution/GarmentMeshWarpExecutionContract.ts';
import { garmentTextureCompositeTicketIdempotencyKey } from '../server/core/localExecution/GarmentTextureCompositeExecutionContract.ts';
import { FashionTryOnOpaqueTerminalReplayGuard } from '../server/core/localExecution/FashionTryOnOpaqueTerminalReplayGuard.ts';

const auth = Object.freeze({ tenantId: 'tenant-opaque-replay', userId: 'user-opaque-replay' });
const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const viewId = '33333333-3333-4333-8333-333333333333';
const representationId = '44444444-4444-4444-8444-444444444444';
const anchorSetId = '55555555-5555-4555-8555-555555555555';
const projectStorageId = '66666666-6666-4666-8666-666666666666';
const layerId = '77777777-7777-4777-8777-777777777777';
const meshTicketId = 'a8888888-8888-4888-8888-888888888888';
const textureTicketId = '99999999-9999-4999-8999-999999999999';
const sourceArtifactId = 'signed-current-project-source';
const hashes = Object.freeze({
  project: 'a'.repeat(64),
  view: 'b'.repeat(64),
  representation: 'c'.repeat(64),
  anchor: 'd'.repeat(64),
  mesh: 'e'.repeat(64),
  layer: 'f'.repeat(64),
});
const view = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_VIEW' as const,
  garmentId,
  viewId,
  contentSha256: hashes.view,
  contentType: 'image/png' as const,
  encoding: 'PNG_RGBA8_LOSSLESS' as const,
  width: 2,
  height: 2,
});
const representation = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_REPRESENTATION' as const,
  garmentId,
  representationId,
  tier: 'PARAMETRIC' as const,
  format: 'BERS_PARAMETRIC_V1' as const,
  contentType: 'application/vnd.bers.garment-parametric+json' as const,
  contentSha256: hashes.representation,
  basisViewId: viewId,
  generatorId: 'bers.manual-parametric-contour',
  generatorVersion: '1',
  validatorId: 'bers.parametric-topology-validator',
  validatorVersion: '1',
});
const producer = normalizeGarmentTextureFinalLineageParameters({
  schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  textureTransform: Object.freeze({ scaleXQ16: 65536, scaleYQ16: 65536, offsetXQ16: 0, offsetYQ16: 0, wrapMode: 'CLAMP', alphaPolicy: 'PRESERVE_BASE_ALPHA' }),
  featherRadius: 2,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});

function meshTicket(): LocalExecutionTicketV2 {
  const exact = GARMENT_MESH_WARP_TOOL_DEFINITION.parameters.exact;
  const parameters = Object.freeze({
    sourceArtifactId, garmentId, viewId, representationId, anchorSetId,
    projectImageStorageId: projectStorageId,
    projectImageSha256: hashes.project,
    viewSha256: hashes.view,
    representationSha256: hashes.representation,
    anchorPayloadSha256: hashes.anchor,
    destinationMeshSha256: hashes.mesh,
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
  return Object.freeze({
    ticketId: meshTicketId, version: '2', issuer: 'CORE',
    requestId: 'garment-mesh-warp:opaque-replay', workflowId: 'garment-mesh-warp:opaque-replay', stepId: GARMENT_MESH_WARP_STEP_ID,
    operation: Object.freeze({ id: GARMENT_MESH_WARP_STEP_ID, version: GARMENT_MESH_WARP_TOOL_VERSION, type: GARMENT_MESH_WARP_OPERATION, capability: GARMENT_MESH_WARP_CAPABILITY, parameters }),
    scope: Object.freeze({ ...auth, projectId }),
    inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, kind: 'image', role: 'COMPOSITE', sha256: hashes.project })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'WORKING', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY', idempotencyKey: garmentMeshWarpTicketIdempotencyKey('opaque-replay'), nonce: 'mesh-replay-nonce', issuedAt: 1_000, expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function textureTicket(): LocalExecutionTicketV2 {
  const parameters = Object.freeze({
    sourceArtifactId,
    projectImageStorageId: projectStorageId,
    projectImageSha256: hashes.project,
    garmentWarpLayerId: layerId,
    garmentWarpLayerSha256: hashes.layer,
    garmentId, viewId, viewSha256: hashes.view, representationId, representationSha256: hashes.representation,
    anchorSetId, anchorPayloadSha256: hashes.anchor, destinationMeshSha256: hashes.mesh,
    producerParameters: producer.document,
    producerParametersSha256: producer.sha256,
    deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
    maxDimension: GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
    maxOutputPixels: GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  });
  return Object.freeze({
    ticketId: textureTicketId, version: '2', issuer: 'CORE',
    requestId: 'garment-texture-composite:opaque-replay', workflowId: 'garment-texture-composite:opaque-replay', stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    operation: Object.freeze({ id: GARMENT_TEXTURE_COMPOSITE_STEP_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION, type: GARMENT_TEXTURE_COMPOSITE_OPERATION, capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY, parameters }),
    scope: Object.freeze({ ...auth, projectId }),
    inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, kind: 'image', role: 'ORIGINAL', sha256: hashes.project })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY', idempotencyKey: garmentTextureCompositeTicketIdempotencyKey('opaque-replay:texture'), nonce: 'texture-replay-nonce', issuedAt: 1_000, expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function meshStored(ticket = meshTicket(), overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: layerId,
    projectId,
    executionId: ticket.requestId,
    ticketId: ticket.ticketId,
    projectImageStorageId: projectStorageId,
    projectImageSha256: hashes.project,
    garmentId,
    viewId,
    viewContentSha256: hashes.view,
    representationId,
    representationContentSha256: hashes.representation,
    anchorSetId,
    anchorPayloadSha256: hashes.anchor,
    destinationMeshSha256: hashes.mesh,
    width: 2,
    height: 2,
    contentSha256: '1'.repeat(64),
    rgba: Uint8Array.from({ length: 16 }, () => 0),
    createdAt: new Date(0).toISOString(),
    ...overrides,
  });
}

function textureStored(ticket = textureTicket(), overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    storageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: auth.tenantId,
    userId: auth.userId,
    projectId,
    executionId: ticket.requestId,
    operationId: ticket.stepId,
    role: 'COMPOSITE' as const,
    lifecycle: 'FINAL' as const,
    width: 2,
    height: 2,
    encoding: 'PNG_RGBA8_LOSSLESS' as const,
    contentType: 'image/png' as const,
    bytes: Uint8Array.from([1]),
    sourceImageStorageId: projectStorageId,
    producerOperation: 'GARMENT_TEXTURE_COMPOSITE' as const,
    garmentWarpLayerId: layerId,
    garmentWarpLayerSha256: hashes.layer,
    producerParameters: producer.document,
    producerParametersSha256: producer.sha256,
    ...overrides,
  });
}

type Status = 'SUCCESS' | 'FAILED' | 'UNKNOWN' | undefined;
function harness(ticket: LocalExecutionTicketV2, status: Status, options: Readonly<{ layer?: unknown; final?: unknown }> = {}) {
  const calls = { tickets: [] as string[], finalizations: [] as string[], layers: 0, finals: 0 };
  const guard = new FashionTryOnOpaqueTerminalReplayGuard({
    admission: {
      async getV2(ticketId: string) { calls.tickets.push(ticketId); return ticketId === ticket.ticketId ? ticket : undefined; },
      async getFinalization(ticketId: string) { calls.finalizations.push(ticketId); return status === undefined ? undefined : Object.freeze({ status }); },
    },
    layers: {
      async loadByExecution() { calls.layers += 1; return options.layer === undefined ? meshStored(ticket) : options.layer as any; },
    },
    finals: {
      async loadFinalByExecution() { calls.finals += 1; return options.final === undefined ? textureStored(ticket) : options.final as any; },
    },
  } as any);
  return { guard, calls };
}

test('F4b.6b.4b terminal guard treats missing or UNKNOWN finalization as non-terminal without persisted reads', async () => {
  for (const status of [undefined, 'UNKNOWN'] as const) {
    const h = harness(meshTicket(), status);
    assert.equal(await h.guard.tryRecoverGarmentWarp({ ticketId: meshTicketId, projectId }, auth), undefined);
    assert.equal(h.calls.layers, 0);
    assert.equal(h.calls.finals, 0);
  }
});

test('F4b.6b.4b FAILED is durable terminal without requiring a success artifact', async () => {
  const mesh = harness(meshTicket(), 'FAILED', { layer: null });
  assert.deepEqual(await mesh.guard.tryRecoverGarmentWarp({ ticketId: meshTicketId, projectId }, auth), { status: 'FAILED' });
  assert.equal(mesh.calls.layers, 0);
  const texture = harness(textureTicket(), 'FAILED', { final: null });
  assert.deepEqual(await texture.guard.tryRecoverTextureComposite({ ticketId: textureTicketId, projectId }, auth), { status: 'FAILED' });
  assert.equal(texture.calls.finals, 0);
});

test('F4b.6b.4b mesh SUCCESS requires the committed layer to match the complete durable ticket lineage', async () => {
  const ticket = meshTicket();
  const valid = harness(ticket, 'SUCCESS', { layer: meshStored(ticket) });
  assert.deepEqual(await valid.guard.tryRecoverGarmentWarp({ ticketId: meshTicketId, projectId }, auth), { status: 'SUCCESS' });
  assert.equal(valid.calls.layers, 1);

  const missing = harness(ticket, 'SUCCESS', { layer: null });
  await assert.rejects(
    () => missing.guard.tryRecoverGarmentWarp({ ticketId: meshTicketId, projectId }, auth),
    (error: any) => error?.status === 409 && error?.code === 'fashion_tryon_opaque_terminal_artifact_unavailable',
  );

  const mismatched = harness(ticket, 'SUCCESS', { layer: meshStored(ticket, { destinationMeshSha256: '0'.repeat(64) }) });
  await assert.rejects(
    () => mismatched.guard.tryRecoverGarmentWarp({ ticketId: meshTicketId, projectId }, auth),
    (error: any) => error?.status === 409 && error?.code === 'fashion_tryon_opaque_terminal_artifact_mismatch',
  );
});

test('F4b.6b.4b texture SUCCESS requires the committed FINAL to match source, warp and producer lineage', async () => {
  const ticket = textureTicket();
  const valid = harness(ticket, 'SUCCESS', { final: textureStored(ticket) });
  assert.deepEqual(await valid.guard.tryRecoverTextureComposite({ ticketId: textureTicketId, projectId }, auth), { status: 'SUCCESS' });
  assert.equal(valid.calls.finals, 1);

  const missing = harness(ticket, 'SUCCESS', { final: null });
  await assert.rejects(
    () => missing.guard.tryRecoverTextureComposite({ ticketId: textureTicketId, projectId }, auth),
    (error: any) => error?.status === 409 && error?.code === 'fashion_tryon_opaque_terminal_artifact_unavailable',
  );

  const mismatched = harness(ticket, 'SUCCESS', { final: textureStored(ticket, { producerParametersSha256: '0'.repeat(64) }) });
  await assert.rejects(
    () => mismatched.guard.tryRecoverTextureComposite({ ticketId: textureTicketId, projectId }, auth),
    (error: any) => error?.status === 409 && error?.code === 'fashion_tryon_opaque_terminal_artifact_mismatch',
  );
});

test('F4b.6b.4b replay guard rejects cross-scope and phase substitution before terminal artifact reads', async () => {
  const scoped = harness(meshTicket(), 'SUCCESS');
  await assert.rejects(
    () => scoped.guard.tryRecoverGarmentWarp({ ticketId: meshTicketId, projectId }, { ...auth, userId: 'other-user' }),
    (error: any) => error?.status === 403 && error?.code === 'fashion_tryon_opaque_ticket_scope_mismatch',
  );
  assert.equal(scoped.calls.finalizations.length, 0);
  assert.equal(scoped.calls.layers, 0);

  const phase = harness(textureTicket(), 'SUCCESS');
  await assert.rejects(
    () => phase.guard.tryRecoverGarmentWarp({ ticketId: textureTicketId, projectId }, auth),
    /garment mesh-warp contract/i,
  );
  assert.equal(phase.calls.finalizations.length, 0);
  assert.equal(phase.calls.layers, 0);
});

test('F4b.6b.4b replay lookup must be canonical before durable ticket access', async () => {
  const h = harness(meshTicket(), 'SUCCESS');
  await assert.rejects(
    () => h.guard.tryRecoverGarmentWarp({ ticketId: meshTicketId.toUpperCase(), projectId }, auth),
    (error: any) => error?.status === 400 && error?.code === 'invalid_fashion_tryon_opaque_terminal_lookup',
  );
  assert.equal(h.calls.tickets.length, 0);
  assert.equal(h.calls.finalizations.length, 0);
});
