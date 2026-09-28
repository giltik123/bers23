import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type CreativeRequest,
  type LocalExecutionTicketV2,
} from '../src/platform/creative/canonical/index.ts';
import { CoreAuthorizedMaskedExposure, type CoreMaskedExposureClient } from '../src/application/local-execution/CoreAuthorizedMaskedExposure.ts';
import {
  MASKED_EXPOSURE_CAPABILITY,
  MASKED_EXPOSURE_OPERATION,
  maskedExposureRgba8,
  normalizeMaskedExposureEighthStops,
} from '../src/platform/creative/deterministic/MaskedExposure.ts';
import { MASKED_EXPOSURE_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const sourceHash = 'a'.repeat(64);
const maskHash = 'b'.repeat(64);
const rgba = new Uint8ClampedArray([
  100,120,200,255, 100,50,25,128,
  10,20,30,64, 200,100,50,32,
]);
const maskAlpha = new Uint8Array([255,128,0,255]);
const source: CreativeArtifact = Object.freeze({
  id: 'source-exposure', kind: 'image', value: Object.freeze({ width: 2, height: 2, data: rgba }), producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'ORIGINAL',
  image: Object.freeze({ width: 2, height: 2, format: 'PNG_RGBA8_LOSSLESS', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: sourceHash, storageId: 'source-storage' }),
});
const mask: CreativeArtifact = Object.freeze({
  id: 'mask-exposure', kind: 'mask', value: Object.freeze({ width: 2, height: 2, alpha: maskAlpha }), producerOperationId: 'mask', scope, state: 'AVAILABLE', role: 'MASK',
  image: Object.freeze({ width: 2, height: 2, format: 'ALPHA8', orientation: 1, colorSpace: 'gray', alpha: true }),
  metadata: Object.freeze({ sha256: maskHash, storageId: 'mask-storage', sourceImageStorageId: 'source-storage', parentArtifactIds: Object.freeze([source.id]) }),
});

function request(eighthStops = 8): CreativeRequest {
  return Object.freeze({
    id: `masked-exposure-request-${eighthStops}`,
    intent: 'adjust exposure inside the selected region',
    scope,
    inputArtifacts: Object.freeze([source, mask]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({
      operationIntent: MASKED_EXPOSURE_OPERATION,
      sourceArtifactId: source.id,
      maskArtifactId: mask.id,
      eighthStops,
      idempotencyKey: 'masked-exposure-request',
      planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }),
    }),
  });
}

function dependencies(planner = new CanonicalPlanningService()): CreativeExecutionPlatformRuntimeDependencies {
  const admission = new LocalExecutionAdmissionRegistry();
  const tickets = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000,
    id: () => 'ticket-exposure',
    nonce: () => 'nonce-exposure',
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: productionLocalExecutorsByCapability,
  });
  return {
    decision: new CanonicalDecisionService(), planning: planner,
    routeSelector: productionExecutionRoute, targetSelector: productionTargetSelection,
    providerSelector: { select: () => { throw new Error('provider selection must never run for Masked Exposure'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must never execute Masked Exposure'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must never run for Masked Exposure'); },
      commit: async () => { throw new Error('external billing commit must never run for Masked Exposure'); },
      release: async () => { throw new Error('external billing release must never run for Masked Exposure'); },
    },
    localExecutionV2: tickets,
    now: () => 1_000,
    id: () => 'authority-exposure',
  };
}

test('Masked Exposure reuses exact Exposure eighth-stop Q16 law, mask blend and alpha preservation', () => {
  const plusOne = maskedExposureRgba8(rgba, maskAlpha, 2, 2, 8);
  assert.deepEqual([...plusOne], [
    200,240,255,255,
    150,75,38,128,
    10,20,30,64,
    255,200,100,32,
  ]);
  assert.deepEqual([...maskedExposureRgba8(rgba, maskAlpha, 2, 2, 0)], [...rgba]);
  assert.equal(normalizeMaskedExposureEighthStops(-32), -32);
  assert.equal(normalizeMaskedExposureEighthStops(32), 32);
  for (const invalid of [-33, 33, .5, NaN]) assert.throws(() => normalizeMaskedExposureEighthStops(invalid), /eighth-stops/);
});

test('Masked Exposure registry semantics bind the accepted Exposure law to exact IMAGE+MASK lineage', () => {
  assert.deepEqual(MASKED_EXPOSURE_TOOL_DEFINITION.inputs, [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ]);
  assert.deepEqual(MASKED_EXPOSURE_TOOL_DEFINITION.parameters.exact, {
    deterministicTool: 'masked-exposure@1',
    coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8_PLUS_ALPHA8_MASK',
    transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
    gainEncoding: 'Q16_16_COMMITTED_EIGHTH_STOP_TABLE',
    stopDenominator: 8,
    gainRounding: 'ROUND_HALF_UP',
    maskBlend: 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP',
    alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
  });
  assert.deepEqual(MASKED_EXPOSURE_TOOL_DEFINITION.parameters.integerRanges, [{ parameter: 'eighthStops', min: -32, max: 32 }]);
  assert.deepEqual(MASKED_EXPOSURE_TOOL_DEFINITION.lineage, { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: 'MASKED_EXPOSURE' });
  assert.deepEqual(productionLocalExecutorsByCapability[MASKED_EXPOSURE_CAPABILITY], [MASKED_EXPOSURE_TOOL_DEFINITION.executor]);
});

test('Masked Exposure planner and production policy issue one exact zero-cloud IMAGE+MASK ticket', async () => {
  const input = request(8);
  const planner = new CanonicalPlanningService();
  const plan = await planner.plan(input, await new CanonicalDecisionService().decide(input));
  assert.equal(plan.status, 'READY');
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, MASKED_EXPOSURE_OPERATION);
  assert.deepEqual(plan.operations[0].requiredArtifacts, [source.id, mask.id]);
  assert.equal(plan.operations[0].input?.eighthStops, 8);
  assert.deepEqual(plan.operations[0].input, {
    sourceArtifactId: source.id,
    maskArtifactId: mask.id,
    eighthStops: 8,
    deterministicTool: 'masked-exposure@1',
    coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8_PLUS_ALPHA8_MASK',
    transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
    gainEncoding: 'Q16_16_COMMITTED_EIGHTH_STOP_TABLE',
    stopDenominator: 8,
    gainRounding: 'ROUND_HALF_UP',
    maskBlend: 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP',
    alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
  });
  assert.equal(productionExecutionRoute.select(plan.operations[0], input), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(plan.operations[0], input, plan), 'LOCAL');
  assert.deepEqual(
    productionExecutionCapabilities.admit({ request: input, operation: { ...plan.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' }),
    { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: MASKED_EXPOSURE_CAPABILITY },
  );

  const platform = new CreativeExecutionPlatform(dependencies(planner));
  platform.createExecution(input);
  const [ticket] = await platform.prepareLocalExecutionV2(input.id);
  assert.equal(ticket.version, '2');
  assert.equal(ticket.issuer, 'CORE');
  assert.equal(ticket.operation.capability, MASKED_EXPOSURE_CAPABILITY);
  assert.equal(ticket.operation.parameters?.eighthStops, 8);
  assert.deepEqual(ticket.allowedExecutors, [MASKED_EXPOSURE_TOOL_DEFINITION.executor]);
  assert.deepEqual(ticket.inputs.map(value => ({ id: value.artifactId, kind: value.kind, sha256: value.sha256 })), [
    { id: source.id, kind: 'image', sha256: sourceHash },
    { id: mask.id, kind: 'mask', sha256: maskHash },
  ]);
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 2, height: 2 }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.equal(ticket.policy, 'LOCAL_ONLY');
});

test('Masked Exposure planner fails closed on missing exact inputs and invalid eighth-stop precision', async () => {
  const planner = new CanonicalPlanningService();
  for (const candidate of [
    Object.freeze({ ...request(), id: 'missing-mask', inputArtifacts: Object.freeze([source]) }),
    Object.freeze({ ...request(), id: 'missing-source', inputArtifacts: Object.freeze([mask]) }),
    request(33),
    request(-33),
    request(.5),
  ]) {
    const plan = await planner.plan(candidate, await new CanonicalDecisionService().decide(candidate));
    assert.equal(plan.status, 'BLOCKED');
    assert.deepEqual(plan.operations, []);
  }
});

test('browser Masked Exposure loads bytes only after exact Core ticket and submits deterministic evidence', async () => {
  const events: string[] = [];
  let submitted: LocalExecutionResultV2 | undefined;
  const ticket: LocalExecutionTicketV2 = Object.freeze({
    ticketId: 'ticket-browser-exposure', version: '2', issuer: 'CORE', requestId: 'exposure-browser', workflowId: 'exposure-browser', stepId: 'masked-exposure',
    operation: Object.freeze({
      id: 'masked-exposure', version: '1', type: MASKED_EXPOSURE_OPERATION, capability: MASKED_EXPOSURE_CAPABILITY,
      parameters: Object.freeze({
        sourceArtifactId: source.id,
        maskArtifactId: mask.id,
        eighthStops: 8,
        deterministicTool: 'masked-exposure@1',
        coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8_PLUS_ALPHA8_MASK',
        transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
        gainEncoding: 'Q16_16_COMMITTED_EIGHTH_STOP_TABLE',
        stopDenominator: 8,
        gainRounding: 'ROUND_HALF_UP',
        maskBlend: 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP',
        alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
      }),
    }),
    scope,
    inputs: Object.freeze([
      Object.freeze({ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash }),
      Object.freeze({ artifactId: mask.id, kind: 'mask', role: 'MASK', sha256: maskHash }),
    ]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([MASKED_EXPOSURE_TOOL_DEFINITION.executor]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: 'exposure-browser:masked-exposure:local-v2',
    nonce: 'nonce',
    issuedAt: 1,
    expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
  const core: CoreMaskedExposureClient = {
    prepareMaskedExposure: async payload => {
      events.push('prepare');
      assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: source.id, maskArtifactId: mask.id, eighthStops: 8, clientRequestId: 'browser-request' });
      return { executionId: ticket.requestId, ticket };
    },
    uploadMaskedExposureImage: async payload => {
      events.push('upload');
      assert.equal(payload.ticketId, ticket.ticketId);
      assert.ok(payload.bytes.byteLength > 0);
      return { uploadId: 'upload-exposure', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), sizeBytes: payload.bytes.byteLength, mimeType: 'image/png', width: 2, height: 2 };
    },
    submitMaskedExposure: async payload => {
      events.push('submit');
      submitted = payload.result;
      return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-exposure', verification: { valid: true } };
    },
  };
  const browser = new CoreAuthorizedMaskedExposure('project', core, {
    loadImage: async artifactId => {
      events.push('load-image');
      assert.equal(events[0], 'prepare');
      assert.equal(artifactId, source.id);
      return { width: 2, height: 2, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' };
    },
    loadMask: async artifactId => {
      events.push('load-mask');
      assert.equal(events[0], 'prepare');
      assert.equal(artifactId, mask.id);
      return { width: 2, height: 2, alpha: maskAlpha };
    },
    sha256: async artifactId => {
      events.push('hash');
      assert.equal(events[0], 'prepare');
      return artifactId === source.id ? sourceHash : maskHash;
    },
  }, (() => { let now = 100; return () => ++now; })());

  const result = await browser.run({ requestId: 'browser-request', sourceArtifactId: source.id, maskArtifactId: mask.id, eighthStops: 8 });
  assert.equal(result.canonicalArtifactId, 'canonical-exposure');
  assert.equal(result.eighthStops, 8);
  assert.deepEqual([...result.preview.data], [...maskedExposureRgba8(rgba, maskAlpha, 2, 2, 8)]);
  assert.deepEqual(events.filter(value => value === 'prepare' || value === 'upload' || value === 'submit'), ['prepare', 'upload', 'submit']);
  assert.deepEqual(submitted?.executor, MASKED_EXPOSURE_TOOL_DEFINITION.executor);
  assert.equal(submitted?.runtime, 'BROWSER_JS');
  assert.equal(submitted?.accelerator, 'cpu');
});
