import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalDecisionService, CanonicalPlanningService, CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type CreativeRequest, type LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';
import { CoreAuthorizedCrop, type CoreCropClient } from '../src/application/local-execution/CoreAuthorizedCrop.ts';
import { CROP_CAPABILITY, cropRgba8 } from '../src/platform/creative/deterministic/Crop.ts';
import { CROP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const rgba = new Uint8ClampedArray([
  1,2,3,0, 11,12,13,1, 21,22,23,2, 31,32,33,3,
  41,42,43,4, 51,52,53,5, 61,62,63,6, 71,72,73,7,
  81,82,83,8, 91,92,93,9, 101,102,103,10, 111,112,113,11,
]);
const sourceHash = 'a'.repeat(64);
const source: CreativeArtifact = Object.freeze({
  id: 'source-crop', kind: 'image', value: Object.freeze({ width: 4, height: 3, data: rgba }), producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'ORIGINAL',
  image: Object.freeze({ width: 4, height: 3, format: 'PNG_RGBA8_LOSSLESS', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: sourceHash, storageId: 'source-storage' }),
});

function request(rect = { x: 1, y: 1, width: 2, height: 2 }): CreativeRequest {
  return Object.freeze({
    id: `crop-request-${rect.x}-${rect.y}-${rect.width}-${rect.height}`,
    intent: 'crop exact rectangle', scope,
    inputArtifacts: Object.freeze([source]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({ operationIntent: 'CROP', sourceArtifactId: source.id, cropRect: Object.freeze(rect), idempotencyKey: 'crop-request', planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }) }),
  });
}

function dependencies(planner = new CanonicalPlanningService()): CreativeExecutionPlatformRuntimeDependencies {
  const admission = new LocalExecutionAdmissionRegistry();
  const tickets = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000, id: () => 'ticket-crop', nonce: () => 'nonce-crop', ttlMs: 60_000,
    modelsByCapability: {}, executorsByCapability: productionLocalExecutorsByCapability,
  });
  return {
    decision: new CanonicalDecisionService(), planning: planner,
    routeSelector: productionExecutionRoute, targetSelector: productionTargetSelection,
    providerSelector: { select: () => { throw new Error('provider selection must never run for Crop'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must never execute Crop'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must never run for Crop'); },
      commit: async () => { throw new Error('external billing commit must never run for Crop'); },
      release: async () => { throw new Error('external billing release must never run for Crop'); },
    },
    localExecutionV2: tickets, now: () => 1_000, id: () => 'authority-crop',
  };
}

test('Crop planner and production policies issue one exact zero-cloud v2 ticket with Core-owned output geometry', async () => {
  const input = request();
  const planner = new CanonicalPlanningService();
  const plan = await planner.plan(input, await new CanonicalDecisionService().decide(input));
  assert.equal(plan.status, 'READY');
  assert.equal(plan.operations.length, 1);
  assert.deepEqual(plan.operations[0], {
    id: 'crop', type: 'CROP', requiredArtifacts: [source.id], produces: ['image'], outputArtifacts: ['crop:composite'],
    verification: plan.operations[0].verification,
    input: {
      sourceArtifactId: source.id, x: 1, y: 1, width: 2, height: 2, deterministicTool: 'crop@1',
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES', rectangleSemantics: 'HALF_OPEN',
    },
  });
  assert.equal(productionExecutionRoute.select(plan.operations[0], input), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(plan.operations[0], input), 'LOCAL');
  const capability = productionExecutionCapabilities.admit({ request: input, operation: { ...plan.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.deepEqual(capability, { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: CROP_CAPABILITY });

  const platform = new CreativeExecutionPlatform(dependencies(planner));
  platform.createExecution(input);
  const [ticket] = await platform.prepareLocalExecutionV2(input.id);
  assert.equal(ticket.operation.capability, CROP_CAPABILITY);
  assert.deepEqual(ticket.allowedExecutors, [CROP_TOOL_DEFINITION.executor]);
  assert.deepEqual(ticket.inputs.map(value => ({ artifactId: value.artifactId, kind: value.kind, role: value.role, sha256: value.sha256 })), [{ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash }]);
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 2, height: 2 }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.idempotencyKey, 'crop-request:crop:local-v2');
});

test('Crop planner rejects malformed integer shape and Core ticket issuance rejects canonical out-of-bounds geometry', async () => {
  const planner = new CanonicalPlanningService();
  const malformed = request({ x: .5, y: 0, width: 1, height: 1 });
  const blocked = await planner.plan(malformed, await new CanonicalDecisionService().decide(malformed));
  assert.equal(blocked.status, 'BLOCKED');
  assert.deepEqual(blocked.operations, []);
  assert.ok(blocked.confirmationReasons.includes('INVALID_CROP_RECT'));

  const outOfBounds = request({ x: 3, y: 2, width: 2, height: 2 });
  const planned = await planner.plan(outOfBounds, await new CanonicalDecisionService().decide(outOfBounds));
  assert.equal(planned.status, 'READY', 'planner validates shape; canonical source bounds are Core ticket authority');
  const platform = new CreativeExecutionPlatform(dependencies(planner));
  platform.createExecution(outOfBounds);
  await assert.rejects(platform.prepareLocalExecutionV2(outOfBounds.id), /CROP rectangle exceeds canonical source bounds/);
});

test('Crop capability admission is purpose-bound and cannot be inherited by another operation intent', async () => {
  const input = request();
  const plan = await new CanonicalPlanningService().plan(input, await new CanonicalDecisionService().decide(input));
  const forgedRequest: CreativeRequest = Object.freeze({ ...input, metadata: Object.freeze({ ...input.metadata, operationIntent: 'BACKGROUND_ISOLATION' }) });
  const decision = productionExecutionCapabilities.admit({ request: forgedRequest, operation: { ...plan.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.equal(decision.allowed, false);
});

test('browser Crop computes only after exact Core ticket and preserves byte-exact preview', async () => {
  const events: string[] = [];
  let submitted: any;
  const ticket: LocalExecutionTicketV2 = Object.freeze({
    ticketId: 'ticket-browser-crop', version: '2', issuer: 'CORE', requestId: 'crop-browser', workflowId: 'crop-browser', stepId: 'crop',
    operation: Object.freeze({ id: 'crop', version: '1', type: 'CROP', capability: CROP_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: source.id, x: 1, y: 1, width: 2, height: 2, deterministicTool: 'crop@1', coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES', rectangleSemantics: 'HALF_OPEN' }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([CROP_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'crop-browser:crop:local-v2', nonce: 'nonce', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
  const core: CoreCropClient = {
    prepareCrop: async payload => { events.push('prepare'); assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: source.id, clientRequestId: 'browser-request', x: 1, y: 1, width: 2, height: 2 }); return { executionId: ticket.requestId, ticket }; },
    uploadCropImage: async payload => { events.push('upload'); assert.equal(payload.ticketId, ticket.ticketId); assert.ok(payload.bytes.byteLength > 0); return { uploadId: 'upload-crop', kind: 'image', role: 'COMPOSITE', sha256: 'b'.repeat(64), sizeBytes: payload.bytes.byteLength, mimeType: 'image/png', width: 2, height: 2 }; },
    submitCrop: async payload => { events.push('submit'); submitted = payload.result; return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-crop', verification: { valid: true } }; },
  };
  const browser = new CoreAuthorizedCrop('project', core, {
    loadImage: async artifactId => { events.push('load'); assert.equal(events[0], 'prepare'); assert.equal(artifactId, source.id); return { width: 4, height: 3, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }; },
    sha256: async () => { events.push('hash'); assert.equal(events[0], 'prepare'); return sourceHash; },
  }, (() => { let now = 100; return () => ++now; })());
  const result = await browser.run({ requestId: 'browser-request', sourceArtifactId: source.id, rect: { x: 1, y: 1, width: 2, height: 2 } });
  assert.equal(result.canonicalArtifactId, 'canonical-crop');
  assert.deepEqual([...result.preview.data], [...cropRgba8(rgba, 4, 3, { x: 1, y: 1, width: 2, height: 2 })]);
  assert.deepEqual(events.filter(value => value === 'prepare' || value === 'upload' || value === 'submit'), ['prepare', 'upload', 'submit']);
  assert.deepEqual(submitted.executor, CROP_TOOL_DEFINITION.executor);
  assert.equal(submitted.runtime, 'BROWSER_JS');
  assert.equal(submitted.accelerator, 'cpu');
});
