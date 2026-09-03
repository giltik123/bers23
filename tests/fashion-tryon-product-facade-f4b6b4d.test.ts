import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FASHION_TRYON_EXECUTION_MIME,
  FASHION_TRYON_MESH_PHASE,
  FASHION_TRYON_PREPARED_EXECUTION_VERSION,
  FASHION_TRYON_TEXTURE_PHASE,
} from '../src/platform/creative/canonical/fashionTryOnPreparedExecution.ts';
import {
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import {
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { FashionTryOnProductService } from '../server/core/fashion/FashionTryOnProductService.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const sourceArtifactId = 'source-artifact';
const garmentId = '22222222-2222-4222-8222-222222222222';
const clientRequestId = '33333333-3333-4333-8333-333333333333';
const meshTicketId = '44444444-4444-4444-8444-444444444444';
const textureTicketId = '55555555-5555-4555-8555-555555555555';
const auth = Object.freeze({ tenantId: 'tenant', userId: 'user' });
const intent = Object.freeze({ projectId, sourceArtifactId, garmentId, clientRequestId });

const meshDescriptor = Object.freeze({
  version: FASHION_TRYON_PREPARED_EXECUTION_VERSION,
  ticketId: meshTicketId,
  phase: FASHION_TRYON_MESH_PHASE,
  toolId: GARMENT_MESH_WARP_TOOL_ID,
  toolVersion: GARMENT_MESH_WARP_TOOL_VERSION,
  outputWidth: 256,
  outputHeight: 512,
  mimeType: FASHION_TRYON_EXECUTION_MIME,
  expiresAt: 123_456,
});
const textureDescriptor = Object.freeze({
  version: FASHION_TRYON_PREPARED_EXECUTION_VERSION,
  ticketId: textureTicketId,
  phase: FASHION_TRYON_TEXTURE_PHASE,
  toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  toolVersion: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
  outputWidth: 256,
  outputHeight: 512,
  mimeType: FASHION_TRYON_EXECUTION_MIME,
  expiresAt: 123_789,
});

test('F4b.6b.4d product prepare replaces internal execution identity with opaque prepared descriptor', async () => {
  const calls: any = { describe: [] };
  const service = new FashionTryOnProductService({
    warp: {
      prepare: async () => Object.freeze({
        status: 'WARP_PREPARED' as const,
        projectId,
        sourceArtifactId,
        garmentId,
        categoryGroup: 'tops' as const,
        executionId: 'internal-warp-execution-id',
        ticketId: meshTicketId,
      }),
    },
    texture: { continue: async () => { throw new Error('unused'); } },
    inputs: {
      describeGarmentWarp: async (input) => { calls.describe.push(input); return meshDescriptor; },
      loadGarmentWarpInput: async () => Uint8Array.from([1]),
      describeTextureComposite: async () => textureDescriptor,
      loadTextureCompositeInput: async () => Uint8Array.from([2]),
    },
    candidates: {
      submitGarmentWarpCandidate: async () => Object.freeze({ status: 'SUCCESS' as const }),
      submitTextureCompositeCandidate: async () => Object.freeze({ status: 'SUCCESS' as const }),
    },
    result: { result: async () => Object.freeze({ status: 'TEXTURE_PENDING' as const, projectId, sourceArtifactId, garmentId }) },
  });

  const result = await service.prepare(intent, auth);
  assert.deepEqual(calls.describe, [{ ticketId: meshTicketId, projectId }]);
  assert.deepEqual(result, {
    status: 'WARP_PREPARED', projectId, sourceArtifactId, garmentId, categoryGroup: 'tops', preparedExecution: meshDescriptor,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('executionId'), false);
  assert.equal(serialized.includes('internal-warp-execution-id'), false);
  assert.equal('ticketId' in result, false, 'opaque handle must live only inside preparedExecution');
});

test('F4b.6b.4d product continuation hides texture execution identity and exposes only texture descriptor', async () => {
  const calls: any = { describe: [] };
  const service = new FashionTryOnProductService({
    warp: { prepare: async () => { throw new Error('unused'); } },
    texture: {
      continue: async () => Object.freeze({
        status: 'TEXTURE_PREPARED' as const,
        projectId,
        sourceArtifactId,
        garmentId,
        executionId: 'internal-texture-execution-id',
        ticketId: textureTicketId,
      }),
    },
    inputs: {
      describeGarmentWarp: async () => meshDescriptor,
      loadGarmentWarpInput: async () => Uint8Array.from([1]),
      describeTextureComposite: async (input) => { calls.describe.push(input); return textureDescriptor; },
      loadTextureCompositeInput: async () => Uint8Array.from([2]),
    },
    candidates: {
      submitGarmentWarpCandidate: async () => Object.freeze({ status: 'SUCCESS' as const }),
      submitTextureCompositeCandidate: async () => Object.freeze({ status: 'SUCCESS' as const }),
    },
    result: { result: async () => Object.freeze({ status: 'TEXTURE_PENDING' as const, projectId, sourceArtifactId, garmentId }) },
  });

  const result = await service.continue(intent, auth);
  assert.deepEqual(calls.describe, [{ ticketId: textureTicketId, projectId }]);
  assert.deepEqual(result, {
    status: 'TEXTURE_PREPARED', projectId, sourceArtifactId, garmentId, preparedExecution: textureDescriptor,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('executionId'), false);
  assert.equal('ticketId' in result, false);
});

test('F4b.6b.4d prerequisite and warp-pending states do not mint or describe prepared execution', async () => {
  let descriptions = 0;
  const service = new FashionTryOnProductService({
    warp: {
      prepare: async () => Object.freeze({
        status: 'PREREQUISITE' as const,
        readiness: Object.freeze({ status: 'MISSING_BODY_ANCHORS' as const, projectId, sourceArtifactId, garmentId }),
      }),
    },
    texture: {
      continue: async () => Object.freeze({ status: 'WARP_PENDING' as const, projectId, sourceArtifactId, garmentId }),
    },
    inputs: {
      describeGarmentWarp: async () => { descriptions += 1; return meshDescriptor; },
      loadGarmentWarpInput: async () => Uint8Array.from([1]),
      describeTextureComposite: async () => { descriptions += 1; return textureDescriptor; },
      loadTextureCompositeInput: async () => Uint8Array.from([2]),
    },
    candidates: {
      submitGarmentWarpCandidate: async () => Object.freeze({ status: 'SUCCESS' as const }),
      submitTextureCompositeCandidate: async () => Object.freeze({ status: 'SUCCESS' as const }),
    },
    result: { result: async () => Object.freeze({ status: 'TEXTURE_PENDING' as const, projectId, sourceArtifactId, garmentId }) },
  });

  const prepare = await service.prepare(intent, auth);
  const continuation = await service.continue(intent, auth);
  assert.equal(prepare.status, 'PREREQUISITE');
  assert.equal(continuation.status, 'WARP_PENDING');
  assert.equal(descriptions, 0);
});

test('F4b.6b.4d execution I/O and FINAL methods delegate without widening authority-shaped metadata', async () => {
  const calls: any[] = [];
  const service = new FashionTryOnProductService({
    warp: { prepare: async () => { throw new Error('unused'); } },
    texture: { continue: async () => { throw new Error('unused'); } },
    inputs: {
      describeGarmentWarp: async () => meshDescriptor,
      loadGarmentWarpInput: async (input) => { calls.push(['load-mesh', input]); return Uint8Array.from([1, 2]); },
      describeTextureComposite: async () => textureDescriptor,
      loadTextureCompositeInput: async (input) => { calls.push(['load-texture', input]); return Uint8Array.from([3, 4]); },
    },
    candidates: {
      submitGarmentWarpCandidate: async (input) => { calls.push(['submit-mesh', { ...input, bytes: '<bytes>' }]); return Object.freeze({ status: 'SUCCESS' as const }); },
      submitTextureCompositeCandidate: async (input) => { calls.push(['submit-texture', { ...input, bytes: '<bytes>' }]); return Object.freeze({ status: 'FAILED' as const }); },
    },
    result: {
      result: async (input) => { calls.push(['result', input]); return Object.freeze({ status: 'FINAL_READY' as const, projectId, sourceArtifactId, garmentId, artifactId: 'final-artifact' }); },
    },
  });

  const lookup = Object.freeze({ ticketId: meshTicketId, projectId });
  assert.deepEqual(Array.from(await service.loadGarmentWarpInput(lookup, auth)), [1, 2]);
  assert.deepEqual(await service.submitGarmentWarpCandidate({ ...lookup, bytes: Uint8Array.from([9]), latencyMs: 5 }, auth), { status: 'SUCCESS' });
  assert.deepEqual(Array.from(await service.loadTextureCompositeInput({ ticketId: textureTicketId, projectId }, auth)), [3, 4]);
  assert.deepEqual(await service.submitTextureCompositeCandidate({ ticketId: textureTicketId, projectId, bytes: Uint8Array.from([8]), latencyMs: 7 }, auth), { status: 'FAILED' });
  assert.deepEqual(await service.result(intent, auth), { status: 'FINAL_READY', projectId, sourceArtifactId, garmentId, artifactId: 'final-artifact' });
  assert.equal(JSON.stringify(calls).includes('representationId'), false);
  assert.equal(JSON.stringify(calls).includes('anchorSetId'), false);
  assert.equal(JSON.stringify(calls).includes('layerId'), false);
  assert.equal(JSON.stringify(calls).includes('storageId'), false);
});
