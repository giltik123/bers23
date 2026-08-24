import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { CoreAuthorizedBackgroundIsolation, type CoreDeterministicImageClient } from '../src/application/local-execution/CoreAuthorizedBackgroundIsolation.ts';
import { encodeDeterministicRgbaPng } from '../src/platform/creative/deterministic/DeterministicPng.ts';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';

const sourceHash = 'a'.repeat(64); const maskHash = 'b'.repeat(64);
const ticket: LocalExecutionTicketV2 = Object.freeze({
  ticketId: 'ticket-c2-browser', version: '2', issuer: 'CORE', requestId: 'execution-c2-browser', workflowId: 'execution-c2-browser', stepId: 'background-isolation',
  operation: Object.freeze({ id: 'background-isolation', version: '1', type: 'BACKGROUND_ISOLATION', capability: 'local:tool:background-isolation:v1', parameters: Object.freeze({ sourceArtifactId: 'source', maskArtifactId: 'mask', deterministicTool: 'background-isolation@1' }) }),
  scope: Object.freeze({ tenantId: 'tenant', userId: 'user', projectId: 'project' }),
  inputs: Object.freeze([Object.freeze({ artifactId: 'source', kind: 'image', role: 'ORIGINAL', sha256: sourceHash }), Object.freeze({ artifactId: 'mask', kind: 'mask', role: 'MASK', sha256: maskHash })]),
  expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
  allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' })]),
  policy: 'LOCAL_ONLY', idempotencyKey: 'request:background-isolation:local-v2', nonce: 'nonce', issuedAt: 1, expiresAt: 9999999999999,
  cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
});

const source = Object.freeze({ width: 2, height: 2, data: new Uint8ClampedArray([
  10, 20, 30, 255, 40, 50, 60, 128,
  70, 80, 90, 255, 100, 110, 120, 0,
]), format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' });
const mask = Object.freeze({ width: 2, height: 2, alpha: new Uint8Array([255, 128, 0, 255]) });

test('deterministic PNG writer round-trips transparent RGB byte-exactly without Canvas premultiplication', async () => {
  const pixels = new Uint8ClampedArray([101, 102, 103, 0, 201, 202, 203, 1]);
  const png = await encodeDeterministicRgbaPng({ width: 2, height: 1, data: pixels });
  const decoded = await sharp(png).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 2); assert.equal(decoded.info.height, 1); assert.equal(decoded.info.channels, 4);
  assert.deepEqual([...decoded.data], [...pixels]);
});

test('browser C2 executor uses only authorized deterministic tool and submits exact PNG candidate', async () => {
  let uploaded: Uint8Array | undefined; let submitted: any; let now = 100;
  const core: CoreDeterministicImageClient = {
    prepareBackgroundIsolation: async payload => { assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: 'source', maskArtifactId: 'mask', clientRequestId: 'request' }); return { executionId: ticket.requestId, ticket }; },
    uploadImage: async payload => {
      uploaded = payload.bytes;
      const hash = createHash('sha256').update(payload.bytes).digest('hex');
      return Object.freeze({ uploadId: 'upload-1', kind: 'image', role: 'COMPOSITE', sha256: hash, sizeBytes: payload.bytes.length, mimeType: 'image/png', width: 2, height: 2 });
    },
    submitBackgroundIsolation: async payload => { submitted = payload.result; return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-final', verification: { valid: true } }; },
  };
  const executor = new CoreAuthorizedBackgroundIsolation('project', core, {
    loadImage: async () => source,
    loadMask: async () => mask,
    sha256: async artifactId => artifactId === 'source' ? sourceHash : maskHash,
  }, () => ++now);
  const result = await executor.run({ requestId: 'request', sourceArtifactId: 'source', maskArtifactId: 'mask' });
  assert.equal(result.canonicalArtifactId, 'canonical-final'); assert.equal(result.runtime, 'BROWSER_JS'); assert.equal(result.accelerator, 'cpu');
  assert.ok(uploaded); assert.equal(submitted.executor.kind, 'DETERMINISTIC_TOOL'); assert.equal(submitted.executor.toolId, 'background-isolation'); assert.equal(submitted.executor.version, '1'); assert.equal(submitted.runtime, 'BROWSER_JS'); assert.equal(submitted.accelerator, 'cpu');
  const decoded = await sharp(uploaded!).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...decoded.data], [10,20,30,255, 40,50,60,64, 70,80,90,0, 100,110,120,0]);
});

test('browser C2 executor fails before local computation when Core input hash binding changes', async () => {
  let uploaded = false;
  const core: CoreDeterministicImageClient = {
    prepareBackgroundIsolation: async () => ({ executionId: ticket.requestId, ticket }),
    uploadImage: async () => { uploaded = true; throw new Error('must not upload'); },
    submitBackgroundIsolation: async () => { throw new Error('must not submit'); },
  };
  const executor = new CoreAuthorizedBackgroundIsolation('project', core, { loadImage: async () => source, loadMask: async () => mask, sha256: async () => 'c'.repeat(64) });
  await assert.rejects(executor.run({ requestId: 'request', sourceArtifactId: 'source', maskArtifactId: 'mask' }), /SHA-256/);
  assert.equal(uploaded, false);
});
