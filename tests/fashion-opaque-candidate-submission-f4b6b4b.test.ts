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
import { FashionTryOnOpaqueCandidateSubmissionService } from '../server/core/localExecution/FashionTryOnOpaqueCandidateSubmissionService.ts';

const auth = Object.freeze({ tenantId: 'tenant-opaque-submit', userId: 'user-opaque-submit' });
const projectId = 'a1111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const viewId = '33333333-3333-4333-8333-333333333333';
const representationId = '44444444-4444-4444-8444-444444444444';
const anchorSetId = '55555555-5555-4555-8555-555555555555';
const projectStorageId = '66666666-6666-4666-8666-666666666666';
const layerId = '77777777-7777-4777-8777-777777777777';
const meshTicketId = '88888888-8888-4888-8888-888888888888';
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

function meshTicket(): LocalExecutionTicketV2 {
  const exact = GARMENT_MESH_WARP_TOOL_DEFINITION.parameters.exact;
  const parameters = Object.freeze({
    sourceArtifactId,
    garmentId,
    viewId,
    representationId,
    anchorSetId,
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
    ticketId: meshTicketId,
    version: '2',
    issuer: 'CORE',
    requestId: 'garment-mesh-warp:opaque-submit',
    workflowId: 'garment-mesh-warp:opaque-submit',
    stepId: GARMENT_MESH_WARP_STEP_ID,
    operation: Object.freeze({ id: GARMENT_MESH_WARP_STEP_ID, version: GARMENT_MESH_WARP_TOOL_VERSION, type: GARMENT_MESH_WARP_OPERATION, capability: GARMENT_MESH_WARP_CAPABILITY, parameters }),
    scope: Object.freeze({ ...auth, projectId }),
    inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, kind: 'image', role: 'COMPOSITE', sha256: hashes.project })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'WORKING', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: garmentMeshWarpTicketIdempotencyKey('opaque-submit'),
    nonce: 'mesh-server-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function textureTicket(): LocalExecutionTicketV2 {
  const producer = normalizeGarmentTextureFinalLineageParameters({
    schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
    textureTransform: Object.freeze({ scaleXQ16: 65536, scaleYQ16: 65536, offsetXQ16: 0, offsetYQ16: 0, wrapMode: 'CLAMP', alphaPolicy: 'PRESERVE_BASE_ALPHA' }),
    featherRadius: 2,
    colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  });
  const parameters = Object.freeze({
    sourceArtifactId,
    projectImageStorageId: projectStorageId,
    projectImageSha256: hashes.project,
    garmentWarpLayerId: layerId,
    garmentWarpLayerSha256: hashes.layer,
    garmentId,
    viewId,
    viewSha256: hashes.view,
    representationId,
    representationSha256: hashes.representation,
    anchorSetId,
    anchorPayloadSha256: hashes.anchor,
    destinationMeshSha256: hashes.mesh,
    producerParameters: producer.document,
    producerParametersSha256: producer.sha256,
    deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
    maxDimension: GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
    maxOutputPixels: GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  });
  return Object.freeze({
    ticketId: textureTicketId,
    version: '2',
    issuer: 'CORE',
    requestId: 'garment-texture-composite:opaque-submit',
    workflowId: 'garment-texture-composite:opaque-submit',
    stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    operation: Object.freeze({ id: GARMENT_TEXTURE_COMPOSITE_STEP_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION, type: GARMENT_TEXTURE_COMPOSITE_OPERATION, capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY, parameters }),
    scope: Object.freeze({ ...auth, projectId }),
    inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, kind: 'image', role: 'ORIGINAL', sha256: hashes.project })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: garmentTextureCompositeTicketIdempotencyKey('opaque-submit:texture'),
    nonce: 'texture-server-nonce',
    issuedAt: 1_000,
    expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function evidence(role: 'WORKING' | 'COMPOSITE') {
  return Object.freeze({
    uploadId: role === 'WORKING' ? 'mesh-upload' : 'texture-upload',
    kind: 'image' as const,
    role,
    sha256: role === 'WORKING' ? '1'.repeat(64) : '2'.repeat(64),
    sizeBytes: 100,
    mimeType: 'image/png',
    width: 2,
    height: 2,
  });
}

type Terminal = 'SUCCESS' | 'FAILED' | undefined;
type ReplayResponse = Terminal | Error;
type HarnessOptions = Readonly<{
  replayResponses?: readonly ReplayResponse[];
  meshUploadError?: Error;
  textureUploadError?: Error;
}>;

function harness(ticket: LocalExecutionTicketV2, options: HarnessOptions = {}) {
  const replayResponses = [...(options.replayResponses ?? [])];
  const calls = {
    lookups: [] as string[],
    replays: [] as any[],
    meshUploads: [] as any[],
    meshSubmits: [] as any[],
    textureUploads: [] as any[],
    textureSubmits: [] as any[],
  };
  const nextReplay = async (kind: 'MESH' | 'TEXTURE', input: any, principal: any) => {
    calls.replays.push({ kind, input, principal });
    const response = replayResponses.shift();
    if (response instanceof Error) throw response;
    return response === undefined ? undefined : Object.freeze({ status: response });
  };
  const service = new FashionTryOnOpaqueCandidateSubmissionService({
    admission: {
      async getV2(ticketId: string) { calls.lookups.push(ticketId); return ticketId === ticket.ticketId ? ticket : undefined; },
    },
    terminalReplay: {
      tryRecoverGarmentWarp: (input: any, principal: any) => nextReplay('MESH', input, principal),
      tryRecoverTextureComposite: (input: any, principal: any) => nextReplay('TEXTURE', input, principal),
    },
    garmentWarp: {
      async uploadImage(input: any, principal: any) {
        calls.meshUploads.push({ input, principal });
        if (options.meshUploadError) throw options.meshUploadError;
        return evidence('WORKING');
      },
      async submit(input: any, principal: any) {
        calls.meshSubmits.push({ input, principal });
        return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', layerId, contentSha256: hashes.layer, verification: Object.freeze({ valid: true, checks: Object.freeze([]), errors: Object.freeze([]) }) });
      },
    },
    textureComposite: {
      async uploadImage(input: any, principal: any) {
        calls.textureUploads.push({ input, principal });
        if (options.textureUploadError) throw options.textureUploadError;
        return evidence('COMPOSITE');
      },
      async submit(input: any, principal: any) {
        calls.textureSubmits.push({ input, principal });
        return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'signed-internal-final', verification: Object.freeze({ valid: true, checks: Object.freeze([]), errors: Object.freeze([]) }) });
      },
    },
  } as any);
  return { service, calls };
}

test('F4b.6b.4b mesh candidate reconstructs private result identity in Core and strips layer authority', async () => {
  const ticket = meshTicket();
  const h = harness(ticket);
  const bytes = Uint8Array.from([1, 2, 3]);
  const result = await h.service.submitGarmentWarpCandidate({ ticketId: meshTicketId, projectId, bytes, latencyMs: 12.5 }, auth);
  assert.deepEqual(result, { status: 'SUCCESS' });
  assert.deepEqual(h.calls.lookups, [meshTicketId]);
  assert.deepEqual(h.calls.replays.map(call => call.kind), ['MESH']);
  assert.equal(h.calls.meshUploads.length, 1);
  assert.notEqual(h.calls.meshUploads[0].input.bytes, bytes, 'Core must own a snapshot of browser candidate bytes');
  assert.deepEqual([...h.calls.meshUploads[0].input.bytes], [1, 2, 3]);
  const submitted = h.calls.meshSubmits[0].input.result;
  assert.equal(submitted.ticketId, meshTicketId);
  assert.equal(submitted.nonce, 'mesh-server-nonce');
  assert.equal(submitted.stepId, GARMENT_MESH_WARP_STEP_ID);
  assert.deepEqual(submitted.executor, GARMENT_MESH_WARP_TOOL_DEFINITION.executor);
  assert.equal(submitted.outputs[0].uploadId, 'mesh-upload');
  assert.equal(submitted.benchmarkEvidence.destinationMeshSha256, hashes.mesh);
  assert.equal('layerId' in result, false);
  assert.equal('contentSha256' in result, false);
});

test('F4b.6b.4b texture candidate reconstructs private result identity in Core and strips FINAL authority', async () => {
  const ticket = textureTicket();
  const h = harness(ticket);
  const result = await h.service.submitTextureCompositeCandidate({ ticketId: textureTicketId, projectId, bytes: Uint8Array.from([9]), latencyMs: 7 }, auth);
  assert.deepEqual(result, { status: 'SUCCESS' });
  assert.deepEqual(h.calls.replays.map(call => call.kind), ['TEXTURE']);
  const submitted = h.calls.textureSubmits[0].input.result;
  assert.equal(submitted.ticketId, textureTicketId);
  assert.equal(submitted.nonce, 'texture-server-nonce');
  assert.equal(submitted.stepId, GARMENT_TEXTURE_COMPOSITE_STEP_ID);
  assert.deepEqual(submitted.executor, { kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION });
  assert.equal(submitted.outputs[0].uploadId, 'texture-upload');
  assert.equal(submitted.benchmarkEvidence.garmentWarpLayerSha256, hashes.layer);
  assert.equal('artifactId' in result, false);
  assert.equal('executionId' in result, false);
});

test('F4b.6b.4b validated terminal retry short-circuits upload for SUCCESS and FAILED', async () => {
  for (const status of ['SUCCESS', 'FAILED'] as const) {
    const h = harness(meshTicket(), { replayResponses: [status] });
    const result = await h.service.submitGarmentWarpCandidate({ ticketId: meshTicketId, projectId, bytes: Uint8Array.from([1]), latencyMs: 1 }, auth);
    assert.deepEqual(result, { status });
    assert.deepEqual(h.calls.replays.map(call => call.kind), ['MESH']);
    assert.equal(h.calls.meshUploads.length, 0);
    assert.equal(h.calls.meshSubmits.length, 0);
  }
});

test('F4b.6b.4b finalization race converts upload failure only after validated terminal recovery', async () => {
  const uploadError = new Error('Local execution output has already been consumed');
  const h = harness(meshTicket(), { replayResponses: [undefined, 'SUCCESS'], meshUploadError: uploadError });
  const result = await h.service.submitGarmentWarpCandidate({ ticketId: meshTicketId, projectId, bytes: Uint8Array.from([1]), latencyMs: 1 }, auth);
  assert.deepEqual(result, { status: 'SUCCESS' });
  assert.deepEqual(h.calls.replays.map(call => call.kind), ['MESH', 'MESH']);
  assert.equal(h.calls.meshUploads.length, 1);
  assert.equal(h.calls.meshSubmits.length, 0);
});

test('F4b.6b.4b non-terminal or invalid race recovery preserves the original candidate failure', async () => {
  for (const secondReplay of [undefined, new Error('committed replay lineage mismatch')] as const) {
    const uploadError = new Error('candidate decode failed');
    const h = harness(textureTicket(), { replayResponses: [undefined, secondReplay], textureUploadError: uploadError });
    await assert.rejects(
      () => h.service.submitTextureCompositeCandidate({ ticketId: textureTicketId, projectId, bytes: Uint8Array.from([1]), latencyMs: 1 }, auth),
      error => error === uploadError,
    );
    assert.deepEqual(h.calls.replays.map(call => call.kind), ['TEXTURE', 'TEXTURE']);
    assert.equal(h.calls.textureUploads.length, 1);
    assert.equal(h.calls.textureSubmits.length, 0);
  }
});

test('F4b.6b.4b authenticated scope mismatch fails before replay, upload or result admission', async () => {
  const h = harness(meshTicket());
  await assert.rejects(
    () => h.service.submitGarmentWarpCandidate({ ticketId: meshTicketId, projectId, bytes: Uint8Array.from([1]), latencyMs: 1 }, { ...auth, userId: 'other-user' }),
    (error: any) => error?.status === 403 && error?.code === 'fashion_tryon_opaque_ticket_scope_mismatch',
  );
  assert.equal(h.calls.replays.length, 0);
  assert.equal(h.calls.meshUploads.length, 0);
  assert.equal(h.calls.meshSubmits.length, 0);
});

test('F4b.6b.4b phase substitution fails closed before replay or candidate upload', async () => {
  const h = harness(textureTicket());
  await assert.rejects(
    () => h.service.submitGarmentWarpCandidate({ ticketId: textureTicketId, projectId, bytes: Uint8Array.from([1]), latencyMs: 1 }, auth),
    /garment mesh-warp contract/i,
  );
  assert.equal(h.calls.replays.length, 0);
  assert.equal(h.calls.meshUploads.length, 0);
  assert.equal(h.calls.meshSubmits.length, 0);
});

test('F4b.6b.4b malformed browser candidate fields fail before durable ticket lookup or replay', async () => {
  const h = harness(meshTicket());
  const invalid = [
    { ticketId: 'not-a-uuid', projectId, bytes: Uint8Array.from([1]), latencyMs: 1 },
    { ticketId: meshTicketId, projectId: projectId.toUpperCase(), bytes: Uint8Array.from([1]), latencyMs: 1 },
    { ticketId: meshTicketId, projectId, bytes: new Uint8Array(), latencyMs: 1 },
    { ticketId: meshTicketId, projectId, bytes: Uint8Array.from([1]), latencyMs: Number.NaN },
    { ticketId: meshTicketId, projectId, bytes: Uint8Array.from([1]), latencyMs: -1 },
  ];
  for (const value of invalid) {
    await assert.rejects(() => h.service.submitGarmentWarpCandidate(value, auth), (error: any) => error?.status === 400);
  }
  assert.equal(h.calls.lookups.length, 0);
  assert.equal(h.calls.replays.length, 0);
});
