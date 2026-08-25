import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionResultV2,
} from '../src/platform/creative/canonical/index.ts';
import { REAL_ESRGAN_UPSCALE_CAPABILITY } from '../src/platform/creative/super-resolution/SuperResolutionContract.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { LocalSuperResolutionExecutionService } from '../server/core/localExecution/LocalSuperResolutionExecutionService.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const auth = Object.freeze({ tenantId: 'tenant', userId: 'user' });
const scope = Object.freeze({ ...auth, projectId: 'project' });
const modelBinding = Object.freeze({ kind: 'MODEL' as const, modelId: 'realesr-general-x4v3', version: '1.0.0-candidate.1' });
const sourcePixels = new Uint8ClampedArray([
  10, 20, 30, 255,
  40, 50, 60, 255,
  70, 80, 90, 255,
  100, 110, 120, 255,
]);
const sourceHash = createHash('sha256').update(sourcePixels).digest('hex');
const source: CreativeArtifact = Object.freeze({
  id: 'source',
  kind: 'image',
  value: Object.freeze({ width: 2, height: 2, data: sourcePixels }),
  producerOperationId: 'seed',
  scope,
  state: 'AVAILABLE',
  role: 'ORIGINAL',
  image: Object.freeze({ width: 2, height: 2, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: false }),
  metadata: Object.freeze({ sha256: sourceHash, storageId: 'source-storage' }),
});

type Upload = Readonly<{
  uploadId: string; ticketId: string; scope: typeof scope; kind: 'image'; role: 'COMPOSITE'; mimeType: 'image/png';
  width: number; height: number; bytes: Uint8Array; sha256: string; sizeBytes: number; expiresAt: number;
}>;

function platform(admission: LocalExecutionAdmissionRegistry, counters: { provider: number; billing: number }): CreativeExecutionPlatformRuntimeDependencies {
  const tickets = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000,
    id: () => 'ticket-c3-service',
    nonce: () => 'nonce-c3-service',
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: Object.freeze({ [REAL_ESRGAN_UPSCALE_CAPABILITY]: Object.freeze([modelBinding]) }),
  });
  return {
    decision: new CanonicalDecisionService(),
    planning: new CanonicalPlanningService(),
    routeSelector: productionExecutionRoute,
    targetSelector: productionTargetSelection,
    providerSelector: { select: () => { counters.provider += 1; throw new Error('provider selection must not run'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { counters.provider += 1; throw new Error('provider runtime must not run'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { counters.billing += 1; throw new Error('paid billing reserve must not run'); },
      commit: async () => { counters.billing += 1; throw new Error('paid billing commit must not run'); },
      release: async () => { counters.billing += 1; throw new Error('paid billing release must not run'); },
    },
    localExecutionV2: tickets,
    now: () => 1_000,
    id: () => 'authority-c3-service',
  };
}

async function candidatePng(): Promise<Uint8Array> {
  const data = new Uint8Array(8 * 8 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 12; data[offset + 1] = 34; data[offset + 2] = 56; data[offset + 3] = 255;
  }
  return new Uint8Array(await sharp(Buffer.from(data), { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer());
}

function createHarness(admission = new LocalExecutionAdmissionRegistry(), finalStore = new Map<string, Readonly<{ storageId: string; width: number; height: number }>>()) {
  const counters = { provider: 0, billing: 0, persistFinal: 0, consume: 0 };
  const uploads = new Map<string, Upload>();
  const uploadStore = {
    persist: async (input: any) => {
      const value: Upload = Object.freeze({
        uploadId: 'upload-c3-service', ticketId: input.ticketId, scope: input.scope, kind: 'image', role: 'COMPOSITE', mimeType: 'image/png',
        width: input.width, height: input.height, bytes: Uint8Array.from(input.bytes), sha256: createHash('sha256').update(input.bytes).digest('hex'),
        sizeBytes: input.bytes.byteLength, expiresAt: input.expiresAt,
      });
      uploads.set(value.uploadId, value); return value;
    },
    load: async (uploadId: string, ticketId: string) => {
      const value = uploads.get(uploadId); return value?.ticketId === ticketId ? value : undefined;
    },
    consume: async (uploadId: string) => { counters.consume += 1; uploads.delete(uploadId); },
  };
  const service = new LocalSuperResolutionExecutionService({
    platform: platform(admission, counters),
    ownsArtifacts: async (_candidateScope, ids) => ids.length === 1 && ids[0] === source.id,
    hydrateArtifacts: async (_candidateScope, sourceId, masks) => {
      assert.equal(sourceId, source.id); assert.deepEqual(masks, []); return Object.freeze([source]);
    },
    admission,
    uploads: uploadStore as any,
    persistFinal: async (_candidateScope, executionId, operationId, image) => {
      counters.persistFinal += 1;
      assert.equal(operationId, 'super-resolution'); assert.equal(image.width, 8); assert.equal(image.height, 8);
      const stored = Object.freeze({ storageId: `stored:${executionId}`, width: image.width, height: image.height }); finalStore.set(executionId, stored); return stored;
    },
    loadPersistedFinal: async executionId => finalStore.get(executionId),
    issueFinalId: storageId => `final:${storageId}`,
    now: () => 1_000,
  });
  return { service, counters, admission, finalStore };
}

test('C3 server service accepts a ticket-bound MODEL candidate without mutating frozen canonical source or claiming byte-exact proof', async () => {
  const harness = createHarness();
  assert.equal(Object.isFrozen(source), true);
  const prepared = await harness.service.prepare({ projectId: 'project', sourceArtifactId: 'source', clientRequestId: 'client-c3' }, auth);
  assert.equal(prepared.ticket.allowedExecutors[0].kind, 'MODEL');
  assert.deepEqual(prepared.ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 8, height: 8 }]);

  const bytes = await candidatePng();
  const evidence = await harness.service.uploadImage({ ticketId: prepared.ticket.ticketId, projectId: 'project', bytes }, auth);
  const result: LocalExecutionResultV2 = Object.freeze({
    ticketId: prepared.ticket.ticketId,
    ticketVersion: '2',
    requestId: prepared.ticket.requestId,
    workflowId: prepared.ticket.workflowId,
    stepId: prepared.ticket.stepId,
    nonce: prepared.ticket.nonce,
    executor: modelBinding,
    runtime: 'WASM',
    accelerator: 'wasm',
    outputs: Object.freeze([evidence]),
    metrics: Object.freeze({ latencyMs: 25, memoryBytes: 8_000_000 }),
  });
  const finalized = await harness.service.submit({ ticketId: prepared.ticket.ticketId, projectId: 'project', result }, auth);
  assert.equal(finalized.status, 'SUCCESS');
  assert.ok(finalized.artifactId?.startsWith('final:stored:'));
  assert.equal(finalized.outcome.verification.valid, true);
  assert.equal(finalized.outcome.verification.checks.includes('LOCAL_MODEL_CONTRACT_ADMITTED'), true);
  assert.equal(finalized.outcome.verification.checks.includes('DETERMINISTIC_PIXELS_VERIFIED'), false);
  assert.equal(harness.counters.persistFinal, 1);
  assert.equal(harness.counters.consume, 1);
  assert.equal(harness.counters.provider, 0);
  assert.equal(harness.counters.billing, 0);
  assert.equal(Object.isFrozen(source), true);
  assert.equal(source.value instanceof Object, true);
});

test('C3 service replay returns the same FINAL identity without duplicate persistence', async () => {
  const admission = new LocalExecutionAdmissionRegistry();
  const finalStore = new Map<string, Readonly<{ storageId: string; width: number; height: number }>>();
  const first = createHarness(admission, finalStore);
  const prepared = await first.service.prepare({ projectId: 'project', sourceArtifactId: 'source', clientRequestId: 'client-replay-c3' }, auth);
  const evidence = await first.service.uploadImage({ ticketId: prepared.ticket.ticketId, projectId: 'project', bytes: await candidatePng() }, auth);
  const result: LocalExecutionResultV2 = Object.freeze({
    ticketId: prepared.ticket.ticketId, ticketVersion: '2', requestId: prepared.ticket.requestId, workflowId: prepared.ticket.workflowId,
    stepId: prepared.ticket.stepId, nonce: prepared.ticket.nonce, executor: modelBinding, runtime: 'WASM', accelerator: 'wasm',
    outputs: Object.freeze([evidence]), metrics: Object.freeze({ latencyMs: 10 }),
  });
  const completed = await first.service.submit({ ticketId: prepared.ticket.ticketId, projectId: 'project', result }, auth);
  assert.equal(first.counters.persistFinal, 1);

  const restarted = createHarness(admission, finalStore);
  const replay = await restarted.service.submit({ ticketId: prepared.ticket.ticketId, projectId: 'project', result }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.artifactId, completed.artifactId);
  assert.equal(restarted.counters.persistFinal, 0);
  assert.equal(restarted.counters.provider, 0);
  assert.equal(restarted.counters.billing, 0);
});
