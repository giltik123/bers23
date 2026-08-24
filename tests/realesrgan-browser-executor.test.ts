import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';
import {
  CoreAuthorizedSuperResolution,
  type CoreSuperResolutionClient,
  type LocalSuperResolutionModelPort,
} from '../src/application/local-execution/CoreAuthorizedSuperResolution.ts';

const sourceHash = 'a'.repeat(64);
const modelBinding = Object.freeze({ kind: 'MODEL' as const, modelId: 'realesr-general-x4v3', version: '1.0.0-candidate.1' });

function ticket(overrides: Partial<LocalExecutionTicketV2> = {}): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: 'ticket-upscale', version: '2', issuer: 'CORE', requestId: 'request-upscale', workflowId: 'request-upscale', stepId: 'super-resolution',
    operation: Object.freeze({ id: 'super-resolution', version: '1', type: 'SUPER_RESOLUTION', capability: 'local:realesrgan:upscale:v1', parameters: Object.freeze({ sourceArtifactId: 'source', scale: 4, alphaPolicy: 'OPAQUE_INPUT_ONLY' }) }),
    scope: Object.freeze({ tenantId: 'tenant', userId: 'user', projectId: 'project' }),
    inputs: Object.freeze([Object.freeze({ artifactId: 'source', kind: 'image', role: 'ORIGINAL', sha256: sourceHash })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 8, height: 8 })]),
    allowedExecutors: Object.freeze([modelBinding]), policy: 'LOCAL_ONLY', idempotencyKey: 'request-upscale:super-resolution:local-v2', nonce: 'nonce', issuedAt: 1, expiresAt: 9_999_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  });
}

const source = Object.freeze({
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    0, 64, 255, 255,
    32, 96, 224, 255,
    128, 160, 192, 255,
    255, 192, 128, 255,
  ]),
});

function outputRgb(width = 8, height = 8): Float32Array {
  const pixels = width * height;
  const output = new Float32Array(pixels * 3);
  output.fill(-0.1, 0, pixels);
  output.fill(0.5, pixels, pixels * 2);
  output.fill(1.1, pixels * 2);
  return output;
}

function coreFor(preparedTicket: LocalExecutionTicketV2, state: { uploaded?: Uint8Array; submitted?: any }): CoreSuperResolutionClient {
  return {
    prepareSuperResolution: async payload => {
      assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: 'source', clientRequestId: 'request-upscale' });
      return { executionId: preparedTicket.requestId, ticket: preparedTicket };
    },
    uploadImage: async payload => {
      state.uploaded = payload.bytes;
      return Object.freeze({
        uploadId: 'upload-upscale', kind: 'image', role: 'COMPOSITE', mimeType: 'image/png',
        sha256: createHash('sha256').update(payload.bytes).digest('hex'), sizeBytes: payload.bytes.byteLength,
        width: preparedTicket.expectedOutputs[0].width, height: preparedTicket.expectedOutputs[0].height,
      });
    },
    submitSuperResolution: async payload => {
      state.submitted = payload.result;
      return { executionId: preparedTicket.requestId, status: 'SUCCESS', artifactId: 'canonical-final-upscale', verification: { valid: true } };
    },
  };
}

test('browser C3 executor uses exact Core MODEL binding and upstream-compatible clamp/round postprocess', async () => {
  const preparedTicket = ticket();
  const state: { uploaded?: Uint8Array; submitted?: any } = {};
  let modelInput: Float32Array | undefined;
  const model: LocalSuperResolutionModelPort = {
    infer: async input => {
      assert.deepEqual(input.model, modelBinding);
      assert.equal(input.width, 2); assert.equal(input.height, 2);
      modelInput = input.rgbNchw;
      return { width: 8, height: 8, data: outputRgb(), runtime: 'WASM', accelerator: 'wasm', latencyMs: 12.5, memoryBytes: 123456 };
    },
  };
  const executor = new CoreAuthorizedSuperResolution('project', coreFor(preparedTicket, state), {
    loadImage: async artifactId => { assert.equal(artifactId, 'source'); return source; },
    sha256: async artifactId => { assert.equal(artifactId, 'source'); return sourceHash; },
  }, model);

  const result = await executor.run({ requestId: 'request-upscale', sourceArtifactId: 'source' });
  assert.equal(result.canonicalArtifactId, 'canonical-final-upscale');
  assert.equal(result.runtime, 'WASM'); assert.equal(result.accelerator, 'wasm');
  assert.deepEqual(result.model, { modelId: 'realesr-general-x4v3', version: '1.0.0-candidate.1' });
  assert.ok(modelInput); assert.equal(modelInput!.length, 12);
  const expectedInput = new Float32Array([0, 32/255, 128/255, 1, 64/255, 96/255, 160/255, 192/255, 1, 224/255, 192/255, 128/255]);
  assert.deepEqual(Array.from(modelInput!), Array.from(expectedInput));
  assert.equal(result.preview.width, 8); assert.equal(result.preview.height, 8);
  assert.deepEqual(Array.from(result.preview.data.slice(0, 4)), [0, 128, 255, 255], 'clamp and ties-to-even uint8 conversion must be deterministic');
  assert.ok(state.uploaded?.byteLength);
  assert.equal(state.submitted.executor.kind, 'MODEL');
  assert.equal(state.submitted.executor.modelId, modelBinding.modelId);
  assert.equal(state.submitted.runtime, 'WASM');
  assert.equal(state.submitted.benchmarkEvidence.postprocess, 'CLAMP_0_1');
  assert.equal(state.submitted.benchmarkEvidence.alphaPolicy, 'OPAQUE_INPUT_ONLY');
});

test('transparent source is rejected before model execution or upload', async () => {
  let modelCalls = 0; let uploads = 0;
  const preparedTicket = ticket();
  const core = coreFor(preparedTicket, {});
  const wrappedCore: CoreSuperResolutionClient = { ...core, uploadImage: async payload => { uploads += 1; return core.uploadImage(payload); } };
  const transparent = { ...source, data: new Uint8ClampedArray(source.data) }; transparent.data[3] = 254;
  const executor = new CoreAuthorizedSuperResolution('project', wrappedCore, {
    loadImage: async () => transparent,
    sha256: async () => sourceHash,
  }, { infer: async () => { modelCalls += 1; throw new Error('must not execute'); } });
  await assert.rejects(executor.run({ requestId: 'request-upscale', sourceArtifactId: 'source' }), /opaque source images only/);
  assert.equal(modelCalls, 0); assert.equal(uploads, 0);
});

test('input hash substitution is rejected before model execution', async () => {
  let modelCalls = 0;
  const executor = new CoreAuthorizedSuperResolution('project', coreFor(ticket(), {}), {
    loadImage: async () => source,
    sha256: async () => 'b'.repeat(64),
  }, { infer: async () => { modelCalls += 1; throw new Error('must not execute'); } });
  await assert.rejects(executor.run({ requestId: 'request-upscale', sourceArtifactId: 'source' }), /SHA-256/);
  assert.equal(modelCalls, 0);
});

test('deterministic tool cannot satisfy a Core MODEL super-resolution ticket', async () => {
  const bad = ticket({ allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' })]) });
  let loads = 0;
  const executor = new CoreAuthorizedSuperResolution('project', coreFor(bad, {}), {
    loadImage: async () => { loads += 1; return source; },
    sha256: async () => sourceHash,
  }, { infer: async () => { throw new Error('must not execute'); } });
  await assert.rejects(executor.run({ requestId: 'request-upscale', sourceArtifactId: 'source' }), /exactly one MODEL executor/);
  assert.equal(loads, 0);
});

test('MODEL executor cannot report BROWSER_JS and unsafe x4 allocation is denied before inference', async () => {
  const browserJsModel: LocalSuperResolutionModelPort = { infer: async () => ({ width: 8, height: 8, data: outputRgb(), runtime: 'BROWSER_JS', accelerator: 'cpu', latencyMs: 1 }) };
  const executor = new CoreAuthorizedSuperResolution('project', coreFor(ticket(), {}), { loadImage: async () => source, sha256: async () => sourceHash }, browserJsModel);
  await assert.rejects(executor.run({ requestId: 'request-upscale', sourceArtifactId: 'source' }), /cannot claim deterministic browser runtime/);

  const width = 1025, height = 1024;
  const largeSource = Object.freeze({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) });
  const unsafeTicket = ticket({ expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: width * 4, height: height * 4 })]) });
  let modelCalls = 0;
  const unsafe = new CoreAuthorizedSuperResolution('project', coreFor(unsafeTicket, {}), { loadImage: async () => largeSource, sha256: async () => sourceHash }, { infer: async () => { modelCalls += 1; throw new Error('must not execute'); } });
  await assert.rejects(unsafe.run({ requestId: 'request-upscale', sourceArtifactId: 'source' }), /safe full-frame pixel limit/);
  assert.equal(modelCalls, 0);
});
