import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalDecisionService, CanonicalPlanningService, CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type CreativeRequest } from '../src/platform/creative/canonical/index.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../src/platform/creative/canonical/localComposite.ts';
import { BACKGROUND_ISOLATION_CAPABILITY, BACKGROUND_ISOLATION_TOOL_ID, BACKGROUND_ISOLATION_TOOL_VERSION } from '../src/platform/creative/deterministic/BackgroundIsolation.ts';
import { BACKGROUND_ISOLATION_TOOL_DEFINITION, DETERMINISTIC_TOOL_REGISTRY, requireDeterministicToolByCapability, requireDeterministicToolByExecutor } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const source: CreativeArtifact = Object.freeze({
  id: 'source-original', kind: 'image', value: Object.freeze({ width: 2, height: 2 }), producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'ORIGINAL',
  image: Object.freeze({ width: 2, height: 2, format: 'PNG_RGBA8_LOSSLESS', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: 'a'.repeat(64), storageId: 'source-storage' }),
});
const mask: CreativeArtifact = Object.freeze({
  id: 'mask-1', kind: 'mask', value: Object.freeze({ width: 2, height: 2 }), producerOperationId: 'mask-refinement', scope, state: 'AVAILABLE', role: 'MASK',
  image: Object.freeze({ width: 2, height: 2, format: 'ALPHA8', orientation: 1, colorSpace: 'gray', alpha: true }),
  metadata: Object.freeze({ sha256: 'b'.repeat(64), storageId: 'mask-storage', sourceImageStorageId: 'source-storage', parentArtifactIds: Object.freeze(['source-original']) }),
});

function request(): CreativeRequest {
  return Object.freeze({
    id: 'background-isolation-request', intent: 'remove the background', scope,
    inputArtifacts: Object.freeze([source, mask]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, latencyMs: 1000, ramMb: 64, gpuMs: 0, retries: 0 }),
    metadata: Object.freeze({ operationIntent: 'BACKGROUND_ISOLATION', sourceArtifactId: source.id, maskArtifactId: mask.id, idempotencyKey: 'background-isolation-request', planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK' }) }),
  });
}

test('C2 deterministic registry is data-only and does not widen production admission', () => {
  assert.equal(DETERMINISTIC_TOOL_REGISTRY.length, 1, 'registry extraction must not add a second production tool');
  const definition = requireDeterministicToolByCapability(BACKGROUND_ISOLATION_CAPABILITY);
  assert.equal(definition, BACKGROUND_ISOLATION_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor(definition.executor), definition);
  assert.deepEqual(definition.operation, { id: 'background-isolation', type: 'BACKGROUND_ISOLATION', version: '1' });
  assert.deepEqual(definition.executor, { kind: 'DETERMINISTIC_TOOL', toolId: BACKGROUND_ISOLATION_TOOL_ID, version: BACKGROUND_ISOLATION_TOOL_VERSION });
  assert.deepEqual(definition.inputs, [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ]);
  assert.deepEqual(definition.output, { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' });
  assert.deepEqual(definition.parameters, {
    artifactIdBindings: [{ parameter: 'sourceArtifactId', input: 'source' }, { parameter: 'maskArtifactId', input: 'mask' }],
    exact: { deterministicTool: 'background-isolation@1' },
  });
  assert.deepEqual(definition.browser, { executorId: 'background-isolation-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' });
  assert.deepEqual(definition.verification, { verifierId: 'background-isolation-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' });
  assert.deepEqual(definition.lineage, { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: 'BACKGROUND_ISOLATION' });
  assert.equal(containsFunction(definition), false, 'registry definitions must not contain executable callbacks');
  assert.equal(isDeepFrozen(definition), true, 'registry contracts must be immutable');
  assert.throws(() => requireDeterministicToolByCapability('local:tool:crop:v1'), /not registered/);
  assert.throws(() => requireDeterministicToolByExecutor({ kind: 'DETERMINISTIC_TOOL', toolId: 'crop', version: '1' }), /not registered/);

  const deterministicCapabilities = Object.entries(productionLocalExecutorsByCapability)
    .filter(([, bindings]) => bindings.some(binding => binding.kind === 'DETERMINISTIC_TOOL'))
    .map(([capability]) => capability)
    .sort();
  assert.deepEqual(deterministicCapabilities, [
    BACKGROUND_ISOLATION_CAPABILITY,
    LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation,
  ].sort(), 'registry presence alone must not create a production capability');
  assert.deepEqual(productionLocalExecutorsByCapability[BACKGROUND_ISOLATION_CAPABILITY], [definition.executor]);
  assert.deepEqual(productionLocalExecutorsByCapability[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation], [definition.executor]);
});

test('C2 planner and production policy bind background isolation to LOCAL ON_DEVICE deterministic v2 executor', async () => {
  const input = request();
  const planner = new CanonicalPlanningService();
  const decision = await new CanonicalDecisionService().decide(input);
  const planned = await planner.plan(input, decision);
  assert.equal(planned.status, 'READY');
  assert.equal(planned.operations.length, 1);
  assert.equal(planned.operations[0].type, 'BACKGROUND_ISOLATION');
  assert.deepEqual(planned.operations[0].requiredArtifacts, [source.id, mask.id]);
  assert.equal(productionExecutionRoute.select(planned.operations[0], input), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(planned.operations[0], input), 'LOCAL');
  const capability = productionExecutionCapabilities.admit({ request: input, operation: { ...planned.operations[0], executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.equal(capability.allowed, true);
  assert.equal(capability.capabilityId, BACKGROUND_ISOLATION_CAPABILITY);

  const admission = new LocalExecutionAdmissionRegistry();
  const localExecution = new LocalExecutionTicketAuthority(admission, {
    now: () => 1_000,
    id: () => 'ticket-c2',
    nonce: () => 'nonce-c2',
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: productionLocalExecutorsByCapability,
  });
  const dependencies: CreativeExecutionPlatformRuntimeDependencies = {
    decision: new CanonicalDecisionService(), planning: planner,
    routeSelector: productionExecutionRoute, targetSelector: productionTargetSelection,
    providerSelector: { select: () => { throw new Error('provider selection must not run for deterministic local C2'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must not execute deterministic ON_DEVICE work'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must not run'); },
      commit: async () => { throw new Error('external billing commit must not run'); },
      release: async () => { throw new Error('external billing release must not run'); },
    },
    localExecutionV2: localExecution,
    now: () => 1_000,
    id: () => 'authority-c2',
  };
  const platform = new CreativeExecutionPlatform(dependencies);
  platform.createExecution(input);
  const [ticket] = await platform.prepareLocalExecutionV2(input.id);
  assert.equal(ticket.version, '2');
  assert.equal(ticket.operation.capability, BACKGROUND_ISOLATION_CAPABILITY);
  assert.deepEqual(ticket.allowedExecutors, [BACKGROUND_ISOLATION_TOOL_DEFINITION.executor]);
  assert.deepEqual(ticket.inputs.map(value => ({ id: value.artifactId, kind: value.kind, sha256: value.sha256 })), [
    { id: source.id, kind: 'image', sha256: 'a'.repeat(64) },
    { id: mask.id, kind: 'mask', sha256: 'b'.repeat(64) },
  ]);
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 2, height: 2 }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.equal(ticket.idempotencyKey, 'background-isolation-request:background-isolation:local-v2');
});

test('C2 planner fails closed when either exact source IMAGE or canonical MASK is absent', async () => {
  const planner = new CanonicalPlanningService();
  for (const inputArtifacts of [[source], [mask]] as const) {
    const input = Object.freeze({ ...request(), id: `missing-${inputArtifacts[0].kind}`, inputArtifacts });
    const result = await planner.plan(input, await new CanonicalDecisionService().decide(input));
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.operations.length, 0);
  }
});

test('C2 planner fails closed on stale explicit source or mask identity even when another valid IMAGE and MASK are present', async () => {
  const planner = new CanonicalPlanningService();
  for (const metadataPatch of [{ sourceArtifactId: 'stale-source' }, { maskArtifactId: 'stale-mask' }]) {
    const base = request();
    const input: CreativeRequest = Object.freeze({
      ...base,
      id: `stale-${Object.keys(metadataPatch)[0]}`,
      metadata: Object.freeze({ ...base.metadata, ...metadataPatch }),
    });
    const result = await planner.plan(input, await new CanonicalDecisionService().decide(input));
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.operations.length, 0);
  }
});

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(containsFunction);
}

function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}
