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
import {
  CoreAuthorizedOrthogonalTransform,
  type CoreOrthogonalTransformClient,
} from '../src/application/local-execution/CoreAuthorizedOrthogonalTransform.ts';
import {
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_MODES,
  ORTHOGONAL_TRANSFORM_TOOL_ID,
  ORTHOGONAL_TRANSFORM_TOOL_VERSION,
  orthogonalTransformRgba8,
  type OrthogonalTransformMode,
} from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { ORTHOGONAL_TRANSFORM_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const rgba = new Uint8ClampedArray([
  1, 11, 21, 31, 2, 12, 22, 32, 3, 13, 23, 33,
  4, 14, 24, 34, 5, 15, 25, 35, 90, 80, 70, 0,
]);
const sourceHash = 'a'.repeat(64);
const source: CreativeArtifact = Object.freeze({
  id: 'source-orthogonal',
  kind: 'image',
  value: Object.freeze({ width: 3, height: 2, data: rgba }),
  producerOperationId: 'seed',
  scope,
  state: 'AVAILABLE',
  role: 'ORIGINAL',
  image: Object.freeze({ width: 3, height: 2, format: 'PNG_RGBA8_LOSSLESS', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: sourceHash, storageId: 'source-storage' }),
});

function request(mode: unknown = 'ROTATE_90_CW', id = `orthogonal-${String(mode)}`): CreativeRequest {
  return Object.freeze({
    id,
    intent: 'apply exact orthogonal transform to canonical image',
    scope,
    inputArtifacts: Object.freeze([source]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({
      operationIntent: 'ORTHOGONAL_TRANSFORM',
      sourceArtifactId: source.id,
      orthogonalTransformMode: mode,
      idempotencyKey: id,
      planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }),
    }),
  });
}

function dependencies(planner = new CanonicalPlanningService()): CreativeExecutionPlatformRuntimeDependencies {
  const admission = new LocalExecutionAdmissionRegistry();
  const tickets = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000,
    id: () => 'ticket-orthogonal',
    nonce: () => 'nonce-orthogonal',
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: productionLocalExecutorsByCapability,
  });
  return {
    decision: new CanonicalDecisionService(),
    planning: planner,
    routeSelector: productionExecutionRoute,
    targetSelector: productionTargetSelection,
    providerSelector: { select: () => { throw new Error('provider selection must never run for orthogonal transform'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must never execute orthogonal-transform candidate'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must never run for orthogonal transform'); },
      commit: async () => { throw new Error('external billing commit must never run for orthogonal transform'); },
      release: async () => { throw new Error('external billing release must never run for orthogonal transform'); },
    },
    localExecutionV2: tickets,
    now: () => 1_000,
    id: () => 'authority-orthogonal',
  };
}

function expectedGeometry(mode: OrthogonalTransformMode) {
  return mode === 'ROTATE_90_CW' || mode === 'ROTATE_270_CW' ? { width: 2, height: 3 } : { width: 3, height: 2 };
}

test('orthogonal planner and production policies issue one exact zero-cloud v2 ticket with Core-derived mode geometry', async () => {
  for (const mode of ORTHOGONAL_TRANSFORM_MODES as readonly OrthogonalTransformMode[]) {
    const input = request(mode, `request-${mode}`);
    const planner = new CanonicalPlanningService();
    const plan = await planner.plan(input, await new CanonicalDecisionService().decide(input));
    assert.equal(plan.status, 'READY', mode);
    assert.equal(plan.operations.length, 1, mode);
    const operation = plan.operations[0];
    assert.equal(operation.id, 'orthogonal-transform');
    assert.equal(operation.type, 'ORTHOGONAL_TRANSFORM');
    assert.deepEqual(operation.requiredArtifacts, [source.id]);
    assert.deepEqual(operation.produces, ['image']);
    assert.deepEqual(operation.outputArtifacts, ['orthogonal-transform:composite']);
    assert.deepEqual(operation.input, {
      sourceArtifactId: source.id,
      mode,
      deterministicTool: 'orthogonal-transform@1',
      coordinateSpace: 'CANONICAL_ORIENTATION_1_INTEGER_PIXEL_INDICES',
      mapping: 'ORTHOGONAL_INVERSE_INDEX_PERMUTATION',
      interpolation: 'NONE',
      rounding: 'INTEGER_EXACT',
      alphaPolicy: 'COPY_RGBA_TUPLE_EXACTLY',
    });
    assert.equal('width' in (operation.input ?? {}), false, 'orthogonal request must not control output width');
    assert.equal('height' in (operation.input ?? {}), false, 'orthogonal request must not control output height');
    assert.equal(productionExecutionRoute.select(operation, input), 'ON_DEVICE');
    assert.equal(productionTargetSelection.select(operation, input), 'LOCAL');
    assert.deepEqual(productionExecutionCapabilities.admit({ request: input, operation: { ...operation, executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' }), { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: ORTHOGONAL_TRANSFORM_CAPABILITY });

    const platform = new CreativeExecutionPlatform(dependencies(planner));
    platform.createExecution(input);
    const [ticket] = await platform.prepareLocalExecutionV2(input.id);
    assert.equal(ticket.operation.capability, ORTHOGONAL_TRANSFORM_CAPABILITY);
    assert.deepEqual(ticket.allowedExecutors, [ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor]);
    assert.deepEqual(ticket.inputs.map(value => ({ artifactId: value.artifactId, kind: value.kind, role: value.role, sha256: value.sha256 })), [{ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash }]);
    assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], ...expectedGeometry(mode) }]);
    assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
    assert.equal(ticket.policy, 'LOCAL_ONLY');
    assert.equal(ticket.operation.parameters.mode, mode);
  }
});

test('orthogonal planner fails closed for unknown transform modes before ticket issuance', async () => {
  const input = request('ROTATE_45');
  const plan = await new CanonicalPlanningService().plan(input, await new CanonicalDecisionService().decide(input));
  assert.equal(plan.status, 'BLOCKED');
  assert.deepEqual(plan.operations, []);
  assert.ok(plan.confirmationReasons.includes('INVALID_ORTHOGONAL_TRANSFORM_MODE'));
});

test('orthogonal capability admission is purpose-bound and cannot be inherited by another operation intent', async () => {
  const input = request('ROTATE_180');
  const plan = await new CanonicalPlanningService().plan(input, await new CanonicalDecisionService().decide(input));
  const forgedRequest: CreativeRequest = Object.freeze({ ...input, metadata: Object.freeze({ ...input.metadata, operationIntent: 'RESIZE' }) });
  const decision = productionExecutionCapabilities.admit({ request: forgedRequest, operation: { ...plan.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.equal(decision.allowed, false);
});

test('browser orthogonal executor reads source only after exact Core ticket and submits the exact candidate', async () => {
  const events: string[] = [];
  let submitted: any;
  const mode: OrthogonalTransformMode = 'ROTATE_90_CW';
  const exact = ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.parameters.exact;
  const ticket: LocalExecutionTicketV2 = Object.freeze({
    ticketId: 'ticket-browser-orthogonal', version: '2', issuer: 'CORE', requestId: 'orthogonal-browser', workflowId: 'orthogonal-browser', stepId: 'orthogonal-transform',
    operation: Object.freeze({ id: 'orthogonal-transform', version: '1', type: 'ORTHOGONAL_TRANSFORM', capability: ORTHOGONAL_TRANSFORM_CAPABILITY, parameters: Object.freeze({ sourceArtifactId: source.id, mode, ...exact }) }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: source.id, kind: 'image', role: 'ORIGINAL', sha256: sourceHash })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 3 })]),
    allowedExecutors: Object.freeze([ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor]),
    policy: 'LOCAL_ONLY', idempotencyKey: 'orthogonal-browser:orthogonal-transform:local-v2', nonce: 'nonce', issuedAt: 1, expiresAt: 9_999_999_999,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
  const core: CoreOrthogonalTransformClient = {
    prepareOrthogonalTransform: async payload => { events.push('prepare'); assert.deepEqual(payload, { projectId: 'project', sourceArtifactId: source.id, clientRequestId: 'browser-request', mode }); return { executionId: ticket.requestId, ticket }; },
    uploadOrthogonalTransformImage: async payload => { events.push('upload'); assert.equal(payload.ticketId, ticket.ticketId); assert.ok(payload.bytes.byteLength > 0); return { uploadId: 'upload-orthogonal', kind: 'image', role: 'COMPOSITE', sha256: 'b'.repeat(64), sizeBytes: payload.bytes.byteLength, mimeType: 'image/png', width: 2, height: 3 }; },
    submitOrthogonalTransform: async payload => { events.push('submit'); submitted = payload.result; return { executionId: ticket.requestId, status: 'SUCCESS', artifactId: 'canonical-orthogonal', verification: { valid: true } }; },
  };
  const browser = new CoreAuthorizedOrthogonalTransform('project', core, {
    loadImage: async artifactId => { events.push('load'); assert.equal(events[0], 'prepare'); assert.equal(artifactId, source.id); return { width: 3, height: 2, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }; },
    sha256: async artifactId => { events.push('hash'); assert.equal(events[0], 'prepare'); assert.equal(artifactId, source.id); return sourceHash; },
  }, (() => { let now = 100; return () => ++now; })());
  const result = await browser.run({ requestId: 'browser-request', sourceArtifactId: source.id, mode });
  assert.equal(result.canonicalArtifactId, 'canonical-orthogonal');
  assert.deepEqual([...result.preview.data], [...orthogonalTransformRgba8(rgba, 3, 2, mode)]);
  assert.equal(result.preview.width, 2);
  assert.equal(result.preview.height, 3);
  assert.deepEqual(events.filter(value => value === 'prepare' || value === 'upload' || value === 'submit'), ['prepare', 'upload', 'submit']);
  assert.deepEqual(submitted.executor, ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor);
  assert.equal(submitted.runtime, 'BROWSER_JS');
  assert.equal(submitted.accelerator, 'cpu');
  assert.equal(submitted.benchmarkEvidence.mode, mode);
});

test('production verifier accepts exact orthogonal metadata and rejects forged mode or geometry', async () => {
  const mode: OrthogonalTransformMode = 'ROTATE_90_CW';
  const input = request(mode, 'verify-orthogonal');
  const plan = await new CanonicalPlanningService().plan(input, await new CanonicalDecisionService().decide(input));
  const operation = Object.freeze({ ...plan.operations[0], executionRoute: 'ON_DEVICE' as const });
  const exact = ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.parameters.exact;
  const data = orthogonalTransformRgba8(rgba, 3, 2, mode);
  const artifact = Object.freeze({
    id: 'verified-orthogonal', kind: 'image', producerStepId: 'orthogonal-transform', scope,
    value: Object.freeze({ width: 2, height: 3, data }),
    metadata: Object.freeze({
      artifactRole: 'COMPOSITE', localExecutionAdmission: 'ADMITTED', admissionClass: 'DETERMINISTIC_BYTE_EXACT', verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
      executorKind: 'DETERMINISTIC_TOOL', toolId: ORTHOGONAL_TRANSFORM_TOOL_ID, toolVersion: ORTHOGONAL_TRANSFORM_TOOL_VERSION,
      runtime: 'BROWSER_JS', accelerator: 'cpu', candidateSha256: 'b'.repeat(64), verifiedPixelSha256: 'c'.repeat(64),
      sourceWidth: 3, sourceHeight: 2, orthogonalTransformMode: mode,
      coordinateSpace: exact.coordinateSpace, mapping: exact.mapping, interpolation: exact.interpolation, rounding: exact.rounding, alphaPolicy: exact.alphaPolicy,
      integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }), parentArtifactIds: Object.freeze([source.id]),
    }),
  });
  assert.equal((await productionWorkflowVerifier.verify(operation as never, [artifact] as never)).valid, true);
  const forgedMode = Object.freeze({ ...artifact, metadata: Object.freeze({ ...artifact.metadata, orthogonalTransformMode: 'ROTATE_180' }) });
  assert.equal((await productionWorkflowVerifier.verify(operation as never, [forgedMode] as never)).valid, false);
  const forgedGeometry = Object.freeze({ ...artifact, value: Object.freeze({ width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4) }) });
  assert.equal((await productionWorkflowVerifier.verify(operation as never, [forgedGeometry] as never)).valid, false);
});
