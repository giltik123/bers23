import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createSuperResolution } from '../src/application/createSuperResolution.ts';
import { browserLocalAIComposition } from '../src/application/local-ai/BrowserLocalAIComposition.ts';
import type { LocalSuperResolutionModelPort } from '../src/application/local-execution/CoreAuthorizedSuperResolution.ts';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';

const sourceSha256 = 'a'.repeat(64);
const modelBinding = Object.freeze({ kind: 'MODEL' as const, modelId: 'realesr-general-x4v3', version: '1.0.0-candidate.1' });
const ticket: LocalExecutionTicketV2 = Object.freeze({
  ticketId: 'ticket-c3-browser-composition', version: '2', issuer: 'CORE', requestId: 'execution-c3-browser-composition', workflowId: 'execution-c3-browser-composition', stepId: 'super-resolution',
  operation: Object.freeze({ id: 'super-resolution', version: '1', type: 'SUPER_RESOLUTION', capability: 'local:realesrgan:upscale:v1', parameters: Object.freeze({ sourceArtifactId: 'source-original', scale: 4, alphaPolicy: 'OPAQUE_INPUT_ONLY' }) }),
  scope: Object.freeze({ tenantId: 'tenant', userId: 'user', projectId: 'project' }),
  inputs: Object.freeze([Object.freeze({ artifactId: 'source-original', kind: 'image', role: 'ORIGINAL', sha256: sourceSha256 })]),
  expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 8, height: 4 })]),
  allowedExecutors: Object.freeze([modelBinding]),
  policy: 'LOCAL_ONLY', idempotencyKey: 'request-c3:super-resolution:local-v2', nonce: 'nonce-c3', issuedAt: 1, expiresAt: 9_999_999_999_999,
  cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
});

function model(calls: string[]): LocalSuperResolutionModelPort {
  return Object.freeze({
    async infer(input) {
      calls.push('model');
      assert.deepEqual(input.model, modelBinding, 'browser composition must pass the exact Core MODEL binding');
      assert.deepEqual([input.width, input.height], [2, 1]);
      assert.equal(input.rgbNchw.length, 6);
      assert.deepEqual(Array.from(input.rgbNchw), [10/255, 40/255, 20/255, 50/255, 30/255, 60/255].map(Math.fround));
      const output = new Float32Array(8 * 4 * 3);
      output.fill(.25, 0, 8 * 4);
      output.fill(.5, 8 * 4, 8 * 4 * 2);
      output.fill(.75, 8 * 4 * 2);
      return Object.freeze({ width: 8, height: 4, data: output, runtime: 'WASM' as const, accelerator: 'wasm' as const, latencyMs: 14, memoryBytes: 123_456 });
    },
  });
}

test('C3 browser composition loads only ticket-bound canonical source, invokes exact MODEL port and submits candidate evidence', async () => {
  const calls: string[] = [];
  let uploaded: Uint8Array | undefined;
  const client = {
    localExecution: {
      prepareSuperResolution: async (payload: any) => {
        calls.push('prepare');
        assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: 'source-original', clientRequestId: 'request-c3' });
        return { executionId: ticket.requestId, ticket };
      },
      loadSuperResolutionInput: async (payload: any) => {
        calls.push('inputs');
        assert.deepEqual(payload, { ticketId: ticket.ticketId, projectId: 'project' });
        return Object.freeze({ width: 2, height: 1, sourceSha256, sourceRgba: new Uint8ClampedArray([10,20,30,255, 40,50,60,255]) });
      },
      uploadSuperResolutionImage: async (payload: any) => {
        calls.push('upload'); uploaded = payload.bytes;
        assert.equal(payload.ticketId, ticket.ticketId); assert.equal(payload.projectId, 'project');
        return Object.freeze({ uploadId: 'upload-c3', kind: 'image', role: 'COMPOSITE', sha256: createHash('sha256').update(payload.bytes).digest('hex'), sizeBytes: payload.bytes.length, mimeType: 'image/png', width: 8, height: 4 });
      },
      submitSuperResolution: async (payload: any) => {
        calls.push('submit');
        assert.equal(payload.ticketId, ticket.ticketId); assert.equal(payload.projectId, 'project');
        assert.deepEqual(payload.result.executor, modelBinding);
        assert.equal(payload.result.runtime, 'WASM');
        assert.equal(payload.result.accelerator, 'wasm');
        return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-final-c3', verification: Object.freeze({ valid: true }) });
      },
    },
  };

  const local = createSuperResolution({ projectId: 'project', client: client as any, model: model(calls) });
  assert.deepEqual(calls, [], 'C3 browser composition must remain lazy before user intent');
  const result = await local.run({ requestId: 'request-c3', sourceArtifactId: 'source-original' });
  assert.equal(result.canonicalArtifactId, 'canonical-final-c3');
  assert.deepEqual(result.model, { modelId: modelBinding.modelId, version: modelBinding.version });
  assert.deepEqual([result.preview.width, result.preview.height], [8, 4]);
  assert.ok(uploaded?.byteLength);
  assert.deepEqual(calls, ['prepare', 'inputs', 'model', 'upload', 'submit']);
});

test('C3 browser composition rejects forged source binding before input delivery or model inference', async () => {
  const forged = Object.freeze({ ...ticket, inputs: Object.freeze([Object.freeze({ ...ticket.inputs[0], artifactId: 'other-source' })]) }) as LocalExecutionTicketV2;
  let deliveries = 0, modelCalls = 0, uploads = 0;
  const client = {
    localExecution: {
      prepareSuperResolution: async () => ({ executionId: forged.requestId, ticket: forged }),
      loadSuperResolutionInput: async () => { deliveries += 1; throw new Error('must not deliver'); },
      uploadSuperResolutionImage: async () => { uploads += 1; throw new Error('must not upload'); },
      submitSuperResolution: async () => { throw new Error('must not submit'); },
    },
  };
  const forgedModel: LocalSuperResolutionModelPort = { infer: async () => { modelCalls += 1; throw new Error('must not infer'); } };
  const local = createSuperResolution({ projectId: 'project', client: client as any, model: forgedModel });
  await assert.rejects(local.run({ requestId: 'request-c3-forged', sourceArtifactId: 'source-original' }), /input binding|source|ticket/i);
  assert.equal(deliveries, 0); assert.equal(modelCalls, 0); assert.equal(uploads, 0);
});

test('production CANDIDATE rejection occurs before browser LocalAI initialization', async () => {
  assert.equal(browserLocalAIComposition.initialized(), false);
  let deliveries = 0;
  const client = {
    localExecution: {
      prepareSuperResolution: async () => { throw Object.assign(new Error('No approved local executors for capability local:realesrgan:upscale:v1'), { code: 'local_executor_unavailable' }); },
      loadSuperResolutionInput: async () => { deliveries += 1; throw new Error('must not deliver'); },
      uploadSuperResolutionImage: async () => { throw new Error('must not upload'); },
      submitSuperResolution: async () => { throw new Error('must not submit'); },
    },
  };
  const local = createSuperResolution({ projectId: 'project', client: client as any });
  await assert.rejects(local.run({ requestId: 'request-c3-candidate', sourceArtifactId: 'source-original' }), /No approved local executors/);
  assert.equal(deliveries, 0);
  assert.equal(browserLocalAIComposition.initialized(), false, 'unapproved Core ticket must fail before device/fleet/model initialization');
});
