import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalPlanningService } from '../src/platform/creative/canonical/index.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { LocalSegmentationExecutionService } from '../server/core/localExecution/LocalSegmentationExecutionService.ts';

const scope = Object.freeze({ tenantId: 'tenant-finalize', userId: 'user-finalize', projectId: 'project-finalize' });
const auth = Object.freeze({ tenantId: scope.tenantId, userId: scope.userId });
const inputHash = 'a'.repeat(64);
const outputHash = 'b'.repeat(64);
const source = Object.freeze({
  id: 'finalize-input', kind: 'image', value: Object.freeze({ hash: inputHash }), producerOperationId: 'original', scope,
  state: 'AVAILABLE', role: 'WORKING',
  image: Object.freeze({ width: 2, height: 2, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: inputHash }),
});
const analysis = Object.freeze({ originalWidth: 2, originalHeight: 2, analysisWidth: 2, analysisHeight: 2, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
const points = Object.freeze([{ x: 0, y: 0, label: 'POSITIVE' as const, coordinateSpace: 'ORIGINAL' as const }]);

test('successful local workflow survives transient ledger commit failure and committed replay returns the same canonical MASK', async () => {
  const registry = new LocalExecutionAdmissionRegistry();
  let commitAttempts = 0;
  const ledger = {
    issue: (ticket: never) => registry.issue(ticket),
    get: (ticketId: string) => registry.get(ticketId),
    getByIdempotencyKey: (ticketScope: never, key: string) => registry.getByIdempotencyKey(ticketScope, key),
    getFinalization: (ticketId: string) => registry.getFinalization(ticketId),
    claim: (input: never) => registry.claim(input),
    commit: async (ticketId: string, status: 'SUCCESS' | 'FAILED') => {
      commitAttempts += 1;
      if (commitAttempts === 1) throw new Error('transient ledger commit failure');
      await registry.commit(ticketId, status);
    },
    release: (ticketId: string) => registry.release(ticketId),
  };
  let ticketSequence = 0;
  const ticketAuthority = new LocalExecutionTicketAuthority(ledger, {
    now: () => 1_000,
    id: () => `finalize-ticket-${++ticketSequence}`,
    nonce: () => `finalize-nonce-${ticketSequence}`,
    ttlMs: 60_000,
    modelsByCapability: { 'local:mobilesam:segment:v1': [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }] },
  });
  let providerSelections = 0;
  let providerExecutions = 0;
  let billingCalls = 0;
  let verificationCalls = 0;
  const platform = {
    runtime: { execute: async () => { providerExecutions += 1; throw new Error('provider runtime must not execute'); } },
    providers: { isAvailable: () => false, fallback: () => { throw new Error('provider fallback must not execute'); } },
    decision: { decide: async (request: { id: string; intent: string }) => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
    planning: new CanonicalPlanningService(),
    routeSelector: { select: (operation: { type: string }) => operation.type === 'segment' ? 'ON_DEVICE' as const : 'INTERNAL' as const },
    targetSelector: { select: () => 'LOCAL' as const },
    providerSelector: { select: () => { providerSelections += 1; throw new Error('provider selection must not execute'); } },
    capabilityAdmission: { admit: ({ request, operation, route, target }: { request: { metadata?: Record<string, unknown> }; operation: { type: string }; route: string; target: string }) => operation.type === 'segment' && request.metadata?.operationIntent === 'INTERACTIVE_SEGMENTATION' && route === 'ON_DEVICE' && target === 'LOCAL' ? { allowed: true as const, reasonCode: 'CAPABILITY_SUPPORTED' as const, capabilityId: 'local:mobilesam:segment:v1' } : { allowed: false as const, reasonCode: 'UNSUPPORTED_OPERATION' as const } },
    securityGate: { authorize: () => true },
    recovery: { decide: () => 'ABORT' as const },
    verifier: { verify: async (operation: { id: string }) => { verificationCalls += 1; return { stepId: operation.id, valid: true, checks: ['LOCAL_FINALIZATION_RETRY_PROOF'], errors: [] }; } },
    localExecution: ticketAuthority,
    billing: {
      reserve: async () => { billingCalls += 1; throw new Error('external billing reserve must not execute'); },
      commit: async () => { billingCalls += 1; throw new Error('external billing commit must not execute'); },
      release: async () => { billingCalls += 1; throw new Error('external billing release must not execute'); },
      unknown: async () => { billingCalls += 1; throw new Error('external billing unknown must not execute'); },
    },
    now: () => 1_000,
    id: (() => { let value = 0; return () => `authority-${++value}`; })(),
  } as never;
  const ownsArtifacts = async (_scope: unknown, ids: readonly string[]) => ids.length === 1 && ids[0] === source.id;
  const hydrateArtifacts = async () => [source] as never;
  let consumed = 0;
  const upload = Object.freeze({ uploadId: 'finalize-upload', ticketId: 'unused', scope, kind: 'mask', role: 'MASK', mimeType: 'application/octet-stream', width: 2, height: 2, sizeBytes: 4, sha256: outputHash, bytes: new Uint8Array([255, 0, 0, 255]), expiresAt: 61_000 });
  const uploads = { persist: async () => upload, load: async (uploadId: string) => uploadId === upload.uploadId ? upload : undefined, consume: async () => { consumed += 1; return true; } } as never;
  let maskPersists = 0;
  const service = new LocalSegmentationExecutionService({
    platform,
    ownsArtifacts,
    hydrateArtifacts,
    admission: ledger,
    uploads,
    persistMask: async () => { maskPersists += 1; return Object.freeze({ storageId: 'finalize-mask-storage' }); },
    loadPersistedMask: async () => Object.freeze({ storageId: 'finalize-mask-storage' }),
    issueMaskId: (storageId: string) => `canonical-mask:${storageId}`,
    now: () => 2_000,
  } as never);

  const prepared = await service.prepare({ projectId: scope.projectId, inputArtifactId: source.id, clientRequestId: 'finalize-selection', analysis, points }, auth);
  const result = {
    ticketId: prepared.ticket.ticketId, ticketVersion: prepared.ticket.version, requestId: prepared.ticket.requestId,
    workflowId: prepared.ticket.workflowId, stepId: prepared.ticket.stepId, nonce: prepared.ticket.nonce,
    model: prepared.ticket.allowedModels[0], runtime: 'WASM', accelerator: 'wasm',
    outputs: [{ uploadId: upload.uploadId, kind: 'mask', role: 'MASK', sha256: outputHash, sizeBytes: 4, mimeType: 'application/octet-stream', width: 2, height: 2 }],
    metrics: { latencyMs: 12 },
  };

  await assert.rejects(() => service.submit({ ticketId: prepared.ticket.ticketId, projectId: scope.projectId, result }, auth), /transient ledger commit failure/);
  assert.equal(registry.getFinalization(prepared.ticket.ticketId), undefined);
  assert.equal(verificationCalls, 1, 'first attempt completed canonical workflow before transient ledger failure');

  const retry = await service.submit({ ticketId: prepared.ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(retry.status, 'SUCCESS');
  assert.equal(retry.artifactId, 'canonical-mask:finalize-mask-storage');
  assert.equal(verificationCalls, 1, 'retry must reuse the completed in-memory canonical workflow');
  assert.equal(registry.getFinalization(prepared.ticket.ticketId)?.status, 'SUCCESS');

  const replay = await service.submit({ ticketId: prepared.ticket.ticketId, projectId: scope.projectId, result: { ignored: 'already committed' } }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.artifactId, retry.artifactId, 'committed replay must recover the same server-owned canonical MASK');
  assert.equal(verificationCalls, 1, 'committed replay must not execute workflow verification again');
  assert.equal(commitAttempts, 2);
  assert.equal(consumed, 1);
  assert.equal(maskPersists, 2, 'pre-commit retry may re-enter idempotent MASK persistence but must not mint another canonical identity');
  assert.equal(providerSelections, 0);
  assert.equal(providerExecutions, 0);
  assert.equal(billingCalls, 0);
});
