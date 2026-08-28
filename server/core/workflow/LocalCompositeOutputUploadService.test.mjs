import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import { LocalCompositeOutputUploadService } from './LocalCompositeOutputUploadService.ts';

const scope = Object.freeze({ tenantId: 'tenant-upload', userId: 'user-upload', projectId: 'project-upload' });

function segmentTicket() {
  return Object.freeze({
    ticketId: 'segment-ticket', version: '1', issuer: 'CORE', requestId: 'exec-upload', workflowId: 'exec-upload', stepId: 'local-continuation-01-segment',
    operation: Object.freeze({ id: 'local-continuation-01-segment', version: '1', type: 'segment', capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment, parameters: Object.freeze({}) }),
    scope, inputs: Object.freeze([]), expectedOutputs: Object.freeze([Object.freeze({ kind: 'mask', role: 'MASK', count: 1, mimeTypes: Object.freeze(['application/octet-stream']), width: 2, height: 2 })]),
    allowedModels: Object.freeze([Object.freeze({ modelId: 'mobilesam-vit-t', version: '1.0.2' })]), policy: 'LOCAL_ONLY', idempotencyKey: 'segment-idem', nonce: 'segment-nonce', issuedAt: 1_000, expiresAt: 5_000, cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}
function imageTicket() {
  return Object.freeze({
    ticketId: 'image-ticket', version: '2', issuer: 'CORE', requestId: 'exec-image', workflowId: 'exec-image', stepId: 'local-continuation-02-background-isolation',
    operation: Object.freeze({ id: 'local-continuation-02-background-isolation', version: '1', type: 'BACKGROUND_ISOLATION', capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation, parameters: Object.freeze({}) }),
    scope, inputs: Object.freeze([]), expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' })]), policy: 'LOCAL_ONLY', idempotencyKey: 'image-idem', nonce: 'image-nonce', issuedAt: 1_000, expiresAt: 5_000, cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function waiting(executionId, ticket) { return Object.freeze({ executionId, revision: 1, state: 'WAITING_FOR_LOCAL_RESULT', nextAction: Object.freeze({ type: 'LOCAL_EXECUTION', ticket }) }); }

test('composite output upload resolves the current ticket and owns MASK/PNG quarantine contract', async () => {
  const persisted = [];
  const continuation = {
    async resume(executionId) {
      if (executionId === 'exec-upload') return waiting(executionId, segmentTicket());
      if (executionId === 'exec-image') return waiting(executionId, imageTicket());
      return Object.freeze({ executionId, revision: 4, state: 'SUCCESS', terminalArtifactId: 'final' });
    },
  };
  const uploads = {
    async persist(input) {
      persisted.push(input);
      return Object.freeze({ uploadId: `upload-${persisted.length}`, ...input, sizeBytes: input.bytes.byteLength, sha256: 'a'.repeat(64) });
    },
  };
  const service = new LocalCompositeOutputUploadService({ continuation, uploads, now: () => 2_000 });

  await assert.rejects(
    () => service.upload({ executionId: 'exec-upload', scope, bytes: new Uint8Array(4), mimeType: 'image/png' }),
    error => error?.code === 'local_composite_upload_media_type' && error?.status === 415,
  );
  await assert.rejects(
    () => service.upload({ executionId: 'exec-upload', scope, bytes: new Uint8Array(3), mimeType: 'application/octet-stream' }),
    error => error?.code === 'local_composite_mask_size' && error?.status === 400,
  );
  assert.equal(persisted.length, 0);

  const maskEvidence = await service.upload({ executionId: 'exec-upload', scope, bytes: new Uint8Array([255,0,0,255]), mimeType: 'application/octet-stream' });
  assert.equal(maskEvidence.kind, 'mask'); assert.equal(maskEvidence.role, 'MASK'); assert.equal(persisted[0].ticketId, 'segment-ticket'); assert.deepEqual(persisted[0].scope, scope);

  const pngBytes = new Uint8Array([137,80,78,71]);
  const imageEvidence = await service.upload({ executionId: 'exec-image', scope, bytes: pngBytes, mimeType: 'image/png' });
  assert.equal(imageEvidence.kind, 'image'); assert.equal(imageEvidence.role, 'COMPOSITE'); assert.equal(imageEvidence.width, 2); assert.equal(imageEvidence.height, 2); assert.equal(persisted[1].ticketId, 'image-ticket');

  await assert.rejects(
    () => service.upload({ executionId: 'terminal', scope, bytes: pngBytes, mimeType: 'image/png' }),
    error => error?.code === 'local_composite_upload_not_expected' && error?.status === 409,
  );
});

test('composite output upload rejects expired outstanding tickets before quarantine persistence', async () => {
  let persisted = false;
  const continuation = { async resume(executionId) { return waiting(executionId, segmentTicket()); } };
  const uploads = { async persist() { persisted = true; throw new Error('must not persist'); } };
  const service = new LocalCompositeOutputUploadService({ continuation, uploads, now: () => 5_000 });
  await assert.rejects(
    () => service.upload({ executionId: 'exec-upload', scope, bytes: new Uint8Array(4), mimeType: 'application/octet-stream' }),
    error => error?.code === 'local_composite_ticket_expired' && error?.status === 410,
  );
  assert.equal(persisted, false);
});
