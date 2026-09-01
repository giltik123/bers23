import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import { encodeGarmentTextureCompositeInputEnvelope } from '../src/platform/creative/canonical/garmentTextureCompositeInputEnvelope.ts';
import { CoreAuthorizedGarmentTextureComposite } from '../src/application/local-execution/CoreAuthorizedGarmentTextureComposite.ts';
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

const scope = Object.freeze({ tenantId: 'tenant-browser', userId: 'user-browser', projectId: '11111111-1111-4111-8111-111111111111' });
const layerId = '22222222-2222-4222-8222-222222222222';
const garmentId = '33333333-3333-4333-8333-333333333333';
const viewId = '44444444-4444-4444-8444-444444444444';
const representationId = '55555555-5555-4555-8555-555555555555';
const anchorSetId = '66666666-6666-4666-8666-666666666666';
const projectStorageId = '77777777-7777-4777-8777-777777777777';
const sourceArtifactId = 'signed-project-source';
const projectSha = 'a'.repeat(64), layerSha = 'b'.repeat(64), viewSha = 'c'.repeat(64), representationSha = 'd'.repeat(64), anchorSha = 'e'.repeat(64), meshSha = 'f'.repeat(64);
const transform = Object.freeze({ scaleXQ16: 65536, scaleYQ16: 65536, offsetXQ16: 0, offsetYQ16: 0, wrapMode: 'CLAMP' as const, alphaPolicy: 'PRESERVE_BASE_ALPHA' as const });
const producer = normalizeGarmentTextureFinalLineageParameters({ schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA, textureTransform: transform, featherRadius: 0, colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY });
const view = Object.freeze({ authority: 'MANAGED_GARMENT' as const, kind: 'GARMENT_VIEW' as const, garmentId, viewId, contentSha256: viewSha, contentType: 'image/png' as const, encoding: 'PNG_RGBA8_LOSSLESS' as const, width: 2, height: 2 });
const representation = Object.freeze({ authority: 'MANAGED_GARMENT' as const, kind: 'GARMENT_REPRESENTATION' as const, garmentId, representationId, tier: 'PARAMETRIC' as const, format: 'BERS_PARAMETRIC_V1' as const, contentType: 'application/vnd.bers.garment-parametric+json' as const, contentSha256: representationSha, basisViewId: viewId, generatorId: 'bers.mesh-fit', generatorVersion: '1', validatorId: 'bers.parametric-topology-validator', validatorVersion: '1' });
const parameters = Object.freeze({ sourceArtifactId, projectImageStorageId: projectStorageId, projectImageSha256: projectSha, garmentWarpLayerId: layerId, garmentWarpLayerSha256: layerSha, garmentId, viewId, viewSha256: viewSha, representationId, representationSha256: representationSha, anchorSetId, anchorPayloadSha256: anchorSha, destinationMeshSha256: meshSha, producerParameters: producer.document, producerParametersSha256: producer.sha256, deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`, maxDimension: 4096, maxOutputPixels: 8_388_608 });

function ticket(overrides: Partial<LocalExecutionTicketV2> = {}): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'ticket-texture-browser', version: '2', issuer: 'CORE', requestId: 'garment-texture-composite:browser', workflowId: 'garment-texture-composite:browser', stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    operation: Object.freeze({ id: GARMENT_TEXTURE_COMPOSITE_STEP_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION, type: GARMENT_TEXTURE_COMPOSITE_OPERATION, capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY, parameters }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: sourceArtifactId, kind: 'image', role: 'COMPOSITE', sha256: projectSha })]),
    managedInputs: Object.freeze([view, representation]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY', idempotencyKey: 'browser:garment-texture-composite:local-v2', nonce: 'browser-nonce', issuedAt: 1_000, expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  });
}

const sourcePointsQ16 = Object.freeze([Object.freeze([0,0] as const), Object.freeze([65536,0] as const), Object.freeze([0,65536] as const), Object.freeze([65536,65536] as const)]);
const destinationPointsQ16 = sourcePointsQ16;
const triangles = Object.freeze([Object.freeze([0,1,2] as const), Object.freeze([1,3,2] as const)]);
const projectRgba = Uint8Array.from([10,20,30,255, 40,50,60,255, 70,80,90,255, 100,110,120,255]);
const garmentRgba = Uint8Array.from([200,0,0,255, 0,200,0,255, 0,0,200,255, 200,200,0,255]);

function envelope(overrides: Record<string, unknown> = {}): Uint8Array {
  const metadata = {
    ticketId: 'ticket-texture-browser', projectId: scope.projectId, sourceArtifactId, projectImageStorageId: projectStorageId, projectImageSha256: projectSha,
    garmentWarpLayerId: layerId, garmentWarpLayerSha256: layerSha, garmentId, viewId, viewSha256: viewSha, representationId, representationSha256: representationSha,
    anchorSetId, anchorPayloadSha256: anchorSha, destinationMeshSha256: meshSha, outputWidth: 2, outputHeight: 2, garmentSourceWidth: 2, garmentSourceHeight: 2,
    sourcePointsQ16, destinationPointsQ16, triangles, producerParameters: producer.document, producerParametersSha256: producer.sha256,
    ...overrides,
  } as any;
  return encodeGarmentTextureCompositeInputEnvelope({ metadata, projectRgba, garmentSourceRgba: garmentRgba });
}

function core(options: { currentTicket?: LocalExecutionTicketV2; currentEnvelope?: Uint8Array } = {}) {
  let loads = 0, uploads = 0, submits = 0;
  return Object.freeze({
    client: {
      prepareGarmentTextureComposite: async () => Object.freeze({ executionId: 'garment-texture-composite:browser', ticket: options.currentTicket ?? ticket() }),
      loadGarmentTextureCompositeInput: async () => { loads += 1; return options.currentEnvelope ?? envelope(); },
      uploadGarmentTextureCompositeImage: async ({ bytes }: any) => { uploads += 1; assert.ok(bytes.byteLength > 0); return Object.freeze({ uploadId: 'upload-browser', kind: 'image', role: 'COMPOSITE', sha256: '1'.repeat(64), sizeBytes: bytes.byteLength, mimeType: 'image/png', width: 2, height: 2 }); },
      submitGarmentTextureComposite: async ({ result }: any) => { submits += 1; assert.equal(result.executor.toolId, GARMENT_TEXTURE_COMPOSITE_TOOL_ID); assert.equal(result.outputs.length, 1); return Object.freeze({ executionId: result.requestId, status: 'SUCCESS', artifactId: 'signed-final-texture', verification: Object.freeze({ valid: true }) }); },
    },
    counts: () => ({ loads, uploads, submits }),
  });
}

test('browser executes only the Core ticketed BERSGTC1 payload and receives canonical artifact identity after submit', async () => {
  const fixture = core();
  let now = 100;
  const executor = new CoreAuthorizedGarmentTextureComposite(scope.projectId, fixture.client as any, () => (now += 5));
  const result = await executor.run({ requestId: 'browser-request', sourceArtifactId, garmentWarpLayerId: layerId, garmentWarpLayerSha256: layerSha, textureTransform: transform, featherRadius: 0 });
  assert.equal(result.target, 'LOCAL');
  assert.equal(result.runtime, 'BROWSER_JS');
  assert.equal(result.accelerator, 'cpu');
  assert.equal(result.artifactId, 'signed-final-texture');
  assert.equal(result.preview.width, 2); assert.equal(result.preview.height, 2); assert.equal(result.preview.data.byteLength, 16);
  assert.deepEqual(fixture.counts(), { loads: 1, uploads: 1, submits: 1 });
});

test('prepared browser texture composite never calls legacy prepare and redacts FINAL artifact authority', async () => {
  const fixture = core();
  const executor = new CoreAuthorizedGarmentTextureComposite(scope.projectId, Object.freeze({
    ...fixture.client,
    prepareGarmentTextureComposite: async () => { throw new Error('legacy prepare must not be called'); },
  }) as any, () => 5);
  const result = await executor.runPrepared({ ticket: ticket(), sourceArtifactId });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.target, 'LOCAL');
  assert.equal(result.runtime, 'BROWSER_JS');
  assert.equal('artifactId' in result, false);
  assert.equal(result.preview.width, 2); assert.equal(result.preview.height, 2); assert.equal(result.preview.data.byteLength, 16);
  assert.deepEqual(fixture.counts(), { loads: 1, uploads: 1, submits: 1 });
});

test('browser rejects cloud-cost authority before purpose-bound input delivery', async () => {
  const fixture = core({ currentTicket: ticket({ cost: Object.freeze({ paidCloudCredits: 1, providerCalls: 0 }) }) });
  const executor = new CoreAuthorizedGarmentTextureComposite(scope.projectId, fixture.client as any, () => 1);
  await assert.rejects(() => executor.run({ requestId: 'browser-request', sourceArtifactId, garmentWarpLayerId: layerId, garmentWarpLayerSha256: layerSha, textureTransform: transform, featherRadius: 0 }), /forbidden cloud cost/i);
  assert.deepEqual(fixture.counts(), { loads: 0, uploads: 0, submits: 0 });
});

test('prepared browser texture composite rejects cloud-cost ticket before input delivery without legacy prepare', async () => {
  const fixture = core();
  const executor = new CoreAuthorizedGarmentTextureComposite(scope.projectId, Object.freeze({
    ...fixture.client,
    prepareGarmentTextureComposite: async () => { throw new Error('legacy prepare must not be called'); },
  }) as any, () => 1);
  await assert.rejects(() => executor.runPrepared({ ticket: ticket({ cost: Object.freeze({ paidCloudCredits: 1, providerCalls: 0 }) }), sourceArtifactId }), /forbidden cloud cost/i);
  assert.deepEqual(fixture.counts(), { loads: 0, uploads: 0, submits: 0 });
});

test('browser rejects purpose-bound envelope lineage drift before kernel upload', async () => {
  const fixture = core({ currentEnvelope: envelope({ garmentWarpLayerSha256: '0'.repeat(64) }) });
  const executor = new CoreAuthorizedGarmentTextureComposite(scope.projectId, fixture.client as any, () => 1);
  await assert.rejects(() => executor.run({ requestId: 'browser-request', sourceArtifactId, garmentWarpLayerId: layerId, garmentWarpLayerSha256: layerSha, textureTransform: transform, featherRadius: 0 }), /does not match the immutable Core ticket/i);
  assert.deepEqual(fixture.counts(), { loads: 1, uploads: 0, submits: 0 });
});
