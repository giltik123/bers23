import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalPlanningService } from '../src/platform/creative/canonical/index.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { LocalSegmentationExecutionService } from '../server/core/localExecution/LocalSegmentationExecutionService.ts';

const scope = Object.freeze({ tenantId: 'tenant-restart', userId: 'user-restart', projectId: 'project-restart' });
const auth = Object.freeze({ tenantId: scope.tenantId, userId: scope.userId });
const inputHash = 'a'.repeat(64);
const source = Object.freeze({
  id: 'restart-input',
  kind: 'image',
  value: Object.freeze({ hash: inputHash }),
  producerOperationId: 'original',
  scope,
  state: 'AVAILABLE',
  role: 'WORKING',
  image: Object.freeze({ width: 2, height: 2, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: inputHash }),
});
const analysis = Object.freeze({ originalWidth: 2, originalHeight: 2, analysisWidth: 2, analysisHeight: 2, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
const points = Object.freeze([{ x: 0, y: 0, label: 'POSITIVE' as const, coordinateSpace: 'ORIGINAL' as const }]);

test('local segmentation reconstructs the same canonical execution after Core restart', async () => {
  const ledger = new LocalExecutionAdmissionRegistry();
  let ticketSequence = 0;
  const ticketAuthority = new LocalExecutionTicketAuthority(ledger, {
    now: () => 1_000,
    id: () => `ticket-${++ticketSequence}`,
    nonce: () => `nonce-${ticketSequence}`,
    ttlMs: 60_000,
    modelsByCapability: { 'local:mobilesam:segment:v1': [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }] },
  });
  let providerSelections = 0;
  let providerExecutions = 0;
  let billingCalls = 0;
  const platform = {
    runtime: { execute: async () => { providerExecutions += 1; throw new Error('provider runtime must not execute'); } },
    providers: { isAvailable: () => false, fallback: () => { throw new Error('provider fallback must not execute'); } },
    decision: { decide: async (request: { id: string; intent: string }) => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
    planning: new CanonicalPlanningService(),
    routeSelector: { select: (operation: { type: string }) => operation.type === 'segment' ? 'ON_DEVICE' as const : 'INTERNAL' as const },
    targetSelector: { select: () => 'LOCAL' as const },
    providerSelector: { select: () => { providerSelections += 1; throw new Error('provider selection must not execute'); } },
    capabilityAdmission: { admit: ({ operation, route, target }: { operation: { type: string }; route: string; target: string }) => operation.type === 'segment' && route === 'ON_DEVICE' && target === 'LOCAL' ? { allowed: true as const, reasonCode: 'CAPABILITY_SUPPORTED' as const, capabilityId: 'local:mobilesam:segment:v1' } : { allowed: false as const, reasonCode: 'UNSUPPORTED_OPERATION' as const } },
    securityGate: { authorize: () => true },
    recovery: { decide: () => 'ABORT' as const },
    verifier: { verify: async (operation: { id: string }) => ({ stepId: operation.id, valid: true, checks: ['LOCAL_RESTART_PROOF'], errors: [] }) },
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
  const uploads = {
    load: async (uploadId: string) => uploadId === 'restart-upload' ? Object.freeze({ uploadId, ticketId: 'unused', scope, kind: 'mask', role: 'MASK', mimeType: 'application/octet-stream', width: 2, height: 2, sizeBytes: 4, sha256: 'b'.repeat(64), bytes: new Uint8Array([255, 0, 0, 255]), expiresAt: 61_000 }) : undefined,
    consume: async () => true,
  } as never;
  const serviceDependencies = {
    platform,
    ownsArtifacts,
    hydrateArtifacts,
    admission: ledger,
    uploads,
    persistMask: async (_ticketId: string) => Object.freeze({ storageId: 'restart-mask-storage' }),
    issueMaskId: (storageId: string) => `canonical-mask:${storageId}`,
    now: () => 2_000,
  } as never;

  const firstCore = new LocalSegmentationExecutionService(serviceDependencies);
  const prepared = await firstCore.prepare({ projectId: scope.projectId, inputArtifactId: source.id, clientRequestId: 'restart-selection', analysis, points }, auth);
  assert.equal(prepared.ticket.ticketId, 'ticket-1');

  const secondCore = new LocalSegmentationExecutionService(serviceDependencies);
  const result = {
    ticketId: prepared.ticket.ticketId,
    ticketVersion: prepared.ticket.version,
    requestId: prepared.ticket.requestId,
    workflowId: prepared.ticket.workflowId,
    stepId: prepared.ticket.stepId,
    nonce: prepared.ticket.nonce,
    model: prepared.ticket.allowedModels[0],
    runtime: 'WASM',
    accelerator: 'wasm',
    outputs: [{ uploadId: 'restart-upload', kind: 'mask', role: 'MASK', sha256: 'b'.repeat(64), sizeBytes: 4, mimeType: 'application/octet-stream', width: 2, height: 2 }],
    metrics: { latencyMs: 12 },
  };
  const completed = await secondCore.submit({ ticketId: prepared.ticket.ticketId, projectId: scope.projectId, result }, auth);

  assert.equal(completed.status, 'SUCCESS');
  assert.equal(completed.artifactId, 'canonical-mask:restart-mask-storage');
  assert.equal(providerSelections, 0);
  assert.equal(providerExecutions, 0);
  assert.equal(billingCalls, 0);
  assert.equal(ledger.admit({ ticketId: prepared.ticket.ticketId, result, callerScope: scope, now: 2_001 }).reasonCode, 'REPLAYED_TICKET');
});
