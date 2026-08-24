import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createBackgroundIsolation } from '../src/application/createBackgroundIsolation.ts';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';

const sourceSha256 = 'a'.repeat(64);
const maskSha256 = 'b'.repeat(64);
const ticket: LocalExecutionTicketV2 = Object.freeze({
  ticketId: 'ticket-browser-composition', version: '2', issuer: 'CORE', requestId: 'execution-browser-composition', workflowId: 'execution-browser-composition', stepId: 'background-isolation',
  operation: Object.freeze({ id: 'background-isolation', version: '1', type: 'BACKGROUND_ISOLATION', capability: 'local:tool:background-isolation:v1', parameters: Object.freeze({ sourceArtifactId: 'source-final', maskArtifactId: 'mask-exact', deterministicTool: 'background-isolation@1' }) }),
  scope: Object.freeze({ tenantId: 'tenant', userId: 'user', projectId: 'project' }),
  inputs: Object.freeze([
    Object.freeze({ artifactId: 'source-final', kind: 'image', role: 'ORIGINAL', sha256: sourceSha256 }),
    Object.freeze({ artifactId: 'mask-exact', kind: 'mask', role: 'MASK', sha256: maskSha256 }),
  ]),
  expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 1 })]),
  allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' })]),
  policy: 'LOCAL_ONLY', idempotencyKey: 'request:background-isolation:local-v2', nonce: 'nonce', issuedAt: 1, expiresAt: 9_999_999_999_999,
  cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
});

test('browser composition loads canonical bytes only after Core ticket and submits deterministic v2 result', async () => {
  const calls: string[] = [];
  let uploaded: Uint8Array | undefined;
  const client = {
    localExecution: {
      prepareBackgroundIsolation: async (payload: any) => {
        calls.push('prepare');
        assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: 'source-final', maskArtifactId: 'mask-exact', clientRequestId: 'request-1' });
        return { executionId: ticket.requestId, ticket };
      },
      loadBackgroundIsolationInputs: async (payload: any) => {
        calls.push('inputs');
        assert.deepEqual(payload, { ticketId: ticket.ticketId, projectId: 'project' });
        return Object.freeze({
          width: 2, height: 1, sourceSha256, maskSha256,
          sourceRgba: new Uint8ClampedArray([10,20,30,255, 40,50,60,128]),
          maskAlpha: new Uint8Array([255,128]),
        });
      },
      uploadBackgroundIsolationImage: async (payload: any) => {
        calls.push('upload'); uploaded = payload.bytes;
        assert.equal(payload.ticketId, ticket.ticketId); assert.equal(payload.projectId, 'project');
        return Object.freeze({ uploadId: 'upload', kind: 'image', role: 'COMPOSITE', sha256: createHash('sha256').update(payload.bytes).digest('hex'), sizeBytes: payload.bytes.length, mimeType: 'image/png', width: 2, height: 1 });
      },
      submitBackgroundIsolation: async (payload: any) => {
        calls.push('submit');
        assert.equal(payload.ticketId, ticket.ticketId); assert.equal(payload.projectId, 'project');
        assert.equal(payload.result.executor.kind, 'DETERMINISTIC_TOOL');
        assert.equal(payload.result.executor.toolId, 'background-isolation');
        assert.equal(payload.result.executor.version, '1');
        assert.equal(payload.result.runtime, 'BROWSER_JS');
        return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-final', verification: Object.freeze({ valid: true }) });
      },
    },
  };

  const local = createBackgroundIsolation({ projectId: 'project', client: client as any });
  assert.deepEqual(calls, [], 'composition must remain lazy before user intent');
  const result = await local.run({ requestId: 'request-1', sourceArtifactId: 'source-final', maskArtifactId: 'mask-exact' });
  assert.equal(result.canonicalArtifactId, 'canonical-final');
  assert.equal(result.target, 'LOCAL');
  assert.ok(uploaded && uploaded.length > 0);
  assert.deepEqual(calls, ['prepare', 'inputs', 'upload', 'submit']);
});

test('browser composition never requests delivered bytes for identities outside the active request', async () => {
  let deliveries = 0; let uploads = 0;
  const forgedTicket = Object.freeze({ ...ticket, inputs: Object.freeze([
    Object.freeze({ artifactId: 'other-source', kind: 'image', role: 'ORIGINAL', sha256: sourceSha256 }),
    ticket.inputs[1],
  ]) }) as LocalExecutionTicketV2;
  const client = {
    localExecution: {
      prepareBackgroundIsolation: async () => ({ executionId: forgedTicket.requestId, ticket: forgedTicket }),
      loadBackgroundIsolationInputs: async () => { deliveries += 1; throw new Error('must not deliver'); },
      uploadBackgroundIsolationImage: async () => { uploads += 1; throw new Error('must not upload'); },
      submitBackgroundIsolation: async () => { throw new Error('must not submit'); },
    },
  };
  const local = createBackgroundIsolation({ projectId: 'project', client: client as any });
  await assert.rejects(local.run({ requestId: 'request-2', sourceArtifactId: 'source-final', maskArtifactId: 'mask-exact' }), /input bindings|parameters|source/i);
  assert.equal(deliveries, 0);
  assert.equal(uploads, 0);
});
