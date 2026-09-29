import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type CreativeRequest,
  type LocalExecutionResultV2,
  type LocalExecutionTicketV2,
} from '../src/platform/creative/canonical/index.ts';
import { CoreAuthorizedMaskedWhiteBalance, type CoreMaskedWhiteBalanceClient } from '../src/application/local-execution/CoreAuthorizedMaskedWhiteBalance.ts';
import {
  MASKED_WHITE_BALANCE_CAPABILITY,
  MASKED_WHITE_BALANCE_OPERATION,
  maskedWhiteBalanceRgba8,
  normalizeMaskedWhiteBalanceParameters,
} from '../src/platform/creative/deterministic/MaskedWhiteBalance.ts';
import { MASKED_WHITE_BALANCE_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
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
  100,100,100,255, 100,100,100,128,
  10,20,30,64, 200,100,50,32,
]);
const maskAlpha = new Uint8Array([255,128,0,255]);
const source: CreativeArtifact = Object.freeze({
  id: 'source-white-balance', kind: 'image', value: Object.freeze({ width: 2, height: 2, data: rgba }), producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'ORIGINAL',
  image: Object.freeze({ width: 2, height: 2, format: 'PNG_RGBA8_LOSSLESS', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: sourceHash, storageId: 'source-storage' }),
});
const mask: CreativeArtifact = Object.freeze({
  id: 'mask-white-balance', kind: 'mask', value: Object.freeze({ width: 2, height: 2, alpha: maskAlpha }), producerOperationId: 'mask', scope, state: 'AVAILABLE', role: 'MASK',
  image: Object.freeze({ width: 2, height: 2, format: 'ALPHA8', orientation: 1, colorSpace: 'gray', alpha: true }),
  metadata: Object.freeze({ sha256: maskHash, storageId: 'mask-storage', sourceImageStorageId: 'source-storage', parentArtifactIds: Object.freeze([source.id]) }),
});

function request(temperatureQ8 = 64, tintQ8 = 32): CreativeRequest {
  return Object.freeze({
    id: `masked-white-balance-request-${temperatureQ8}-${tintQ8}`,
    intent: 'adjust white balance inside the selected region',
    scope,
    inputArtifacts: Object.freeze([source, mask]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({
      operationIntent: MASKED_WHITE_BALANCE_OPERATION,
      sourceArtifactId: source.id,
      maskArtifactId: mask.id,
      temperatureQ8,
      tintQ8,
      idempotencyKey: 'masked-white-balance-request',
      planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }),
    }),
  });
}

function dependencies(planner = new CanonicalPlanningService()): CreativeExecutionPlatformRuntimeDependencies {
  const admission = new LocalExecutionAdmissionRegistry();
  const tickets = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000,
    id: () => 'ticket-white-balance',
    nonce: () => 'nonce-white-balance',
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: productionLocalExecutorsByCapability,
  });
  return {
    decision: new CanonicalDecisionService(), planning: planner,
    routeSelector: productionExecutionRoute, targetSelector: productionTargetSelection,
    providerSelector: { select: () => { throw new Error('provider selection must never run for Masked White Balance'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must never execute Masked White Balance'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('billing reserve must never run for Masked White Balance'); },
      commit: async () => { throw new Error('billing commit must never run for Masked White Balance'); },
      release: async () => { throw new Error('billing release must never run for Masked White Balance'); },
    },
    localExecutionV2: tickets,
    now: () => 1_000,
    id: () => 'authority-white-balance',
  };
}

test('Masked White Balance registry is explicitly admitted without widening the global White Balance candidate', () => {
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.inputs, [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ]);
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.parameters.integerRanges, [
    { parameter: 'temperatureQ8', min: -128, max: 128 },
    { parameter: 'tintQ8', min: -64, max: 64 },
  ]);
  assert.deepEqual(productionLocalExecutorsByCapability[MASKED_WHITE_BALANCE_CAPABILITY], [MASKED_WHITE_BALANCE_TOOL_DEFINITION.executor]);
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.lineage, { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: 'MASKED_WHITE_BALANCE' });
});

test('Masked White Balance planner issues one exact zero-cloud IMAGE+MASK ticket', async () => {
  const input = request(64, 32);
  const planner = new CanonicalPlanningService();
  const plan = await planner.plan(input, await new CanonicalDecisionService().decide(input));
  assert.equal(plan.status, 'READY');
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, MASKED_WHITE_BALANCE_OPERATION);
  assert.deepEqual(plan.operations[0].requiredArtifacts, [source.id, mask.id]);
  assert.deepEqual(plan.operations[0].input, {
    sourceArtifactId: source.id,
    maskArtifactId: mask.id,
    temperatureQ8: 64,
    tintQ8: 32,
    deterministicTool: 'masked-white-balance@1',
    coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8_PLUS_ALPHA8_MASK',
    transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
    parameterEncoding: 'SIGNED_Q8_RELATIVE_CHANNEL_BALANCE',
    parameterFractionBits: 8,
    gainEncoding: 'Q16_16_DERIVED_INTEGER',
    gainFixedPointBits: 16,
    temperatureLaw: 'RED_PLUS_BLUE_MINUS_EQUAL_Q8',
    tintLaw: 'MAGENTA_PLUS_HALF_GREEN_MINUS_FULL_Q8',
    gainRounding: 'ROUND_HALF_UP',
    maskBlend: 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP',
    alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
  });
  assert.equal(productionExecutionRoute.select(plan.operations[0], input), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(plan.operations[0], input, plan), 'LOCAL');
  assert.deepEqual(productionExecutionCapabilities.admit({ request: input, operation: { ...plan.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' }), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: MASKED_WHITE_BALANCE_CAPABILITY,
  });

  const platform = new CreativeExecutionPlatform(dependencies(planner));
  platform.createExecution(input);
  const [ticket] = await platform.prepareLocalExecutionV2(input.id);
  assert.equal(ticket.operation.capability, MASKED_WHITE_BALANCE_CAPABILITY);
  assert.equal(ticket.operation.parameters?.temperatureQ8, 64);
  assert.equal(ticket.operation.parameters?.tintQ8, 32);
  assert.deepEqual(ticket.allowedExecutors, [MASKED_WHITE_BALANCE_TOOL_DEFINITION.executor]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 2, height: 2 }]);
});

test('Masked White Balance planner fails closed on missing inputs and hostile Q8 values', async () => {
  const planner = new CanonicalPlanningService();
  for (const candidate of [
    Object.freeze({ ...request(), id: 'missing-mask', inputArtifacts: Object.freeze([source]) }),
    Object.freeze({ ...request(), id: 'missing-source', inputArtifacts: Object.freeze([mask]) }),
    request(129, 0), request(-129, 0), request(0, 65), request(0, -65), request(.5, 0),
  ]) {
    const plan = await planner.plan(candidate, await new CanonicalDecisionService().decide(candidate));
    assert.equal(plan.status, 'BLOCKED');
    assert.deepEqual(plan.operations, []);
  }
});

test('browser Masked White Balance loads bytes only after Core ticket and submits exact deterministic evidence', async () => {
  const events: string[] = [];
  let submitted: LocalExecutionResultV2 | undefined;
  const exact = MASKED_WHITE_BALANCE_TOOL_DEFINITION.parameters.exact;
  const ticket: LocalExecutionTicketV2 = Object.freeze({
    ticketId: 'ticket-browser-white-balance', version: '2', issuer: 'CORE', requestId: 'white-balance-browser', workflowId: 'white-balance-browser', stepId: 'masked-white-balance',
    operation: Object.freeze({
      id: 'masked-white-balance', version: '1', type: MASKED_WHITE_BALANCE_OPERATION, capability: MASKED_WHITE_BALANCE_CAPABILITY,
      parameters: Object.freeze({ sourceArtifactId: source.id, maskArtifactId: mask.id, temperatureQ8: 64, tintQ8: 32, ...exact }),
    }),
    scope,
    inputs: Object.freeze([
      Object.freeze({ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash }),
      Object.freeze({ artifactId: mask.id, kind: 'mask', role: 'MASK', sha256: maskHash }),
    ]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([MASKED_WHITE_BALANCE_TOOL_DEFINITION.executor]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: 'white-balance-browser:masked-white-balance:local-v2',
    nonce: 'nonce',
    issuedAt: 1,
    expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
  const core: CoreMaskedWhiteBalanceClient = {
    prepareMaskedWhiteBalance: async payload => {
      events.push('prepare');
      assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: source.id, maskArtifactId: mask.id, temperatureQ8: 64, tintQ8: 32, clientRequestId: 'browser-request' });
      return { executionId: ticket.requestId, ticket };
    },
    uploadMaskedWhiteBalanceImage: async payload => {
      events.push('upload');
      assert.ok(payload.bytes.byteLength > 0);
      return { uploadId: 'upload-white-balance', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), sizeBytes: payload.bytes.byteLength, mimeType: 'image/png', width: 2, height: 2 };
    },
    submitMaskedWhiteBalance: async payload => {
      events.push('submit');
      submitted = payload.result;
      return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-white-balance', verification: { valid: true } };
    },
  };
  const browser = new CoreAuthorizedMaskedWhiteBalance('project', core, {
    loadImage: async artifactId => {
      events.push('load-image'); assert.equal(events[0], 'prepare'); assert.equal(artifactId, source.id);
      return { width: 2, height: 2, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' };
    },
    loadMask: async artifactId => {
      events.push('load-mask'); assert.equal(events[0], 'prepare'); assert.equal(artifactId, mask.id);
      return { width: 2, height: 2, alpha: maskAlpha };
    },
    sha256: async artifactId => {
      events.push('hash'); assert.equal(events[0], 'prepare');
      return artifactId === source.id ? sourceHash : maskHash;
    },
  }, (() => { let now = 100; return () => ++now; })());

  const normalized = normalizeMaskedWhiteBalanceParameters(64, 32);
  const result = await browser.run({ requestId: 'browser-request', sourceArtifactId: source.id, maskArtifactId: mask.id, ...normalized });
  assert.equal(result.canonicalArtifactId, 'canonical-white-balance');
  assert.deepEqual([...result.preview.data], [...maskedWhiteBalanceRgba8(rgba, maskAlpha, 2, 2, 64, 32)]);
  assert.deepEqual(events.filter(value => value === 'prepare' || value === 'upload' || value === 'submit'), ['prepare', 'upload', 'submit']);
  assert.deepEqual(submitted?.executor, MASKED_WHITE_BALANCE_TOOL_DEFINITION.executor);
  assert.equal(submitted?.runtime, 'BROWSER_JS');
  assert.equal(submitted?.accelerator, 'cpu');
});
