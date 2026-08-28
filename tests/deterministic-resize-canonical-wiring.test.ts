import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalDecisionService, CanonicalPlanningService, CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type CreativeRequest, type LocalExecutionTicketV2 } from '../src/platform/creative/canonical/index.ts';
import { CoreAuthorizedResize, type CoreResizeClient } from '../src/application/local-execution/CoreAuthorizedResize.ts';
import { RESIZE_CAPABILITY, RESIZE_MAX_OUTPUT_PIXELS, resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { RESIZE_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const rgba = new Uint8ClampedArray([
  255,0,0,255, 0,255,0,128,
  0,0,255,64, 90,80,70,0,
]);
const sourceHash = 'a'.repeat(64);
const source: CreativeArtifact = Object.freeze({
  id: 'source-resize', kind: 'image', value: Object.freeze({ width: 2, height: 2, data: rgba }), producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'ORIGINAL',
  image: Object.freeze({ width: 2, height: 2, format: 'PNG_RGBA8_LOSSLESS', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: sourceHash, storageId: 'source-storage' }),
});

function request(target = { width: 3, height: 3 }): CreativeRequest {
  return Object.freeze({
    id: `resize-request-${target.width}-${target.height}`,
    intent: 'resize canonical image to exact dimensions', scope,
    inputArtifacts: Object.freeze([source]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({ operationIntent: 'RESIZE', sourceArtifactId: source.id, resizeDimensions: Object.freeze(target), idempotencyKey: 'resize-request', planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }) }),
  });
}

function dependencies(planner = new CanonicalPlanningService()): CreativeExecutionPlatformRuntimeDependencies {
  const admission = new LocalExecutionAdmissionRegistry();
  const tickets = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000, id: () => 'ticket-resize', nonce: () => 'nonce-resize', ttlMs: 60_000,
    modelsByCapability: {}, executorsByCapability: productionLocalExecutorsByCapability,
  });
  return {
    decision: new CanonicalDecisionService(), planning: planner,
    routeSelector: productionExecutionRoute, targetSelector: productionTargetSelection,
    providerSelector: { select: () => { throw new Error('provider selection must never run for Resize'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must never execute Resize candidate'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must never run for Resize'); },
      commit: async () => { throw new Error('external billing commit must never run for Resize'); },
      release: async () => { throw new Error('external billing release must never run for Resize'); },
    },
    localExecutionV2: tickets, now: () => 1_000, id: () => 'authority-resize',
  };
}

test('Resize planner and production policies issue one exact zero-cloud v2 ticket with Core-owned target geometry', async () => {
  const input = request();
  const planner = new CanonicalPlanningService();
  const plan = await planner.plan(input, await new CanonicalDecisionService().decide(input));
  assert.equal(plan.status, 'READY');
  assert.equal(plan.operations.length, 1);
  assert.deepEqual(plan.operations[0], {
    id: 'resize', type: 'RESIZE', requiredArtifacts: [source.id], produces: ['image'], outputArtifacts: ['resize:composite'],
    verification: plan.operations[0].verification,
    input: {
      sourceArtifactId: source.id, width: 3, height: 3, deterministicTool: 'resize@1',
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_CENTERS', interpolation: 'BILINEAR_FIXED_16_16_PIXEL_CENTER', fixedPointBits: 16,
      rounding: 'ROUND_HALF_UP', borderPolicy: 'CLAMP_TO_EDGE', alphaPolicy: 'PREMULTIPLIED_ALPHA_WITH_STRAIGHT_RGB_WHEN_WEIGHTED_ALPHA_ZERO', maxOutputPixels: RESIZE_MAX_OUTPUT_PIXELS,
    },
  });
  assert.equal(productionExecutionRoute.select(plan.operations[0], input), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(plan.operations[0], input), 'LOCAL');
  const capability = productionExecutionCapabilities.admit({ request: input, operation: { ...plan.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.deepEqual(capability, { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: RESIZE_CAPABILITY });

  const platform = new CreativeExecutionPlatform(dependencies(planner));
  platform.createExecution(input);
  const [ticket] = await platform.prepareLocalExecutionV2(input.id);
  assert.equal(ticket.operation.capability, RESIZE_CAPABILITY);
  assert.deepEqual(ticket.allowedExecutors, [RESIZE_TOOL_DEFINITION.executor]);
  assert.deepEqual(ticket.inputs.map(value => ({ artifactId: value.artifactId, kind: value.kind, role: value.role, sha256: value.sha256 })), [{ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash }]);
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 3, height: 3 }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.idempotencyKey, 'resize-request:resize:local-v2');
});

test('Resize planner rejects malformed or oversized target dimensions before ticket issuance', async () => {
  const planner = new CanonicalPlanningService();
  for (const target of [{ width: 2.5, height: 2 }, { width: 0, height: 2 }, { width: 16385, height: 1 }, { width: 8192, height: 8192 }]) {
    const input = request(target);
    const blocked = await planner.plan(input, await new CanonicalDecisionService().decide(input));
    assert.equal(blocked.status, 'BLOCKED');
    assert.deepEqual(blocked.operations, []);
    assert.ok(blocked.confirmationReasons.includes('INVALID_RESIZE_DIMENSIONS'));
  }
});

test('Resize capability admission is purpose-bound and cannot be inherited by another operation intent', async () => {
  const input = request();
  const plan = await new CanonicalPlanningService().plan(input, await new CanonicalDecisionService().decide(input));
  const forgedRequest: CreativeRequest = Object.freeze({ ...input, metadata: Object.freeze({ ...input.metadata, operationIntent: 'CROP' }) });
  const decision = productionExecutionCapabilities.admit({ request: forgedRequest, operation: { ...plan.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.equal(decision.allowed, false);
});

test('browser Resize computes only after an exact Core ticket and returns the deterministic candidate preview', async () => {
  const events: string[] = [];
  let submitted: any;
  const exact = RESIZE_TOOL_DEFINITION.parameters.exact;
  const ticket: LocalExecutionTicketV2 = Object.freeze({
    ticketId: 'ticket-browser-resize', version: '2', issuer: 'CORE', requestId: 'resize-browser', workflowId: 'resize-browser', stepId: 'resize',
    operation: Object.freeze({ id: 'resize', version: '1', type: 'RESIZE', capability: RESIZE_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: source.id, width: 3, height: 3, ...exact }) }),
    scope, inputs: Object.freeze([Object.freeze({ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 3, height: 3 })]),
    allowedExecutors: Object.freeze([RESIZE_TOOL_DEFINITION.executor]), policy: 'LOCAL_ONLY', idempotencyKey: 'resize-browser:resize:local-v2', nonce: 'nonce', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
  const core: CoreResizeClient = {
    prepareResize: async payload => { events.push('prepare'); assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: source.id, clientRequestId: 'browser-request', width: 3, height: 3 }); return { executionId: ticket.requestId, ticket }; },
    uploadResizeImage: async payload => { events.push('upload'); assert.equal(payload.ticketId, ticket.ticketId); assert.ok(payload.bytes.byteLength > 0); return { uploadId: 'upload-resize', kind: 'image', role: 'COMPOSITE', sha256: 'b'.repeat(64), sizeBytes: payload.bytes.byteLength, mimeType: 'image/png', width: 3, height: 3 }; },
    submitResize: async payload => { events.push('submit'); submitted = payload.result; return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-resize', verification: { valid: true } }; },
  };
  const browser = new CoreAuthorizedResize('project', core, {
    loadImage: async artifactId => { events.push('load'); assert.equal(events[0], 'prepare'); assert.equal(artifactId, source.id); return { width: 2, height: 2, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }; },
    sha256: async () => { events.push('hash'); assert.equal(events[0], 'prepare'); return sourceHash; },
  }, (() => { let now = 100; return () => ++now; })());
  const result = await browser.run({ requestId: 'browser-request', sourceArtifactId: source.id, target: { width: 3, height: 3 } });
  assert.equal(result.canonicalArtifactId, 'canonical-resize');
  assert.deepEqual([...result.preview.data], [...resizeRgba8(rgba, 2, 2, { width: 3, height: 3 })]);
  assert.deepEqual(events.filter(value => value === 'prepare' || value === 'upload' || value === 'submit'), ['prepare', 'upload', 'submit']);
  assert.deepEqual(submitted.executor, RESIZE_TOOL_DEFINITION.executor);
  assert.equal(submitted.runtime, 'BROWSER_JS');
  assert.equal(submitted.accelerator, 'cpu');
});