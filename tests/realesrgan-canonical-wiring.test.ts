import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type CreativeRequest,
} from '../src/platform/creative/canonical/index.ts';
import {
  MAX_SUPER_RESOLUTION_OUTPUT_PIXELS,
  REAL_ESRGAN_UPSCALE_CAPABILITY,
  SUPER_RESOLUTION_ALPHA_POLICY,
  SUPER_RESOLUTION_OPERATION,
  SUPER_RESOLUTION_SCALE,
  SUPER_RESOLUTION_STEP_ID,
} from '../src/platform/creative/super-resolution/SuperResolutionContract.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionExecutorUnavailableError, LocalExecutionModelUnavailableError, LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const modelBinding = Object.freeze({ kind: 'MODEL' as const, modelId: 'realesr-general-x4v3', version: '1.0.0-candidate.1' });

function source(width = 64, height = 48): CreativeArtifact {
  return Object.freeze({
    id: 'source-upscale', kind: 'image', value: Object.freeze({ width, height }), producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'ORIGINAL',
    image: Object.freeze({ width, height, format: 'PNG_RGBA8_LOSSLESS', orientation: 1, colorSpace: 'srgb', alpha: false }),
    metadata: Object.freeze({ sha256: 'a'.repeat(64), storageId: 'source-storage-upscale' }),
  });
}

function request(image = source(), id = 'super-resolution-request'): CreativeRequest {
  return Object.freeze({
    id,
    intent: 'upscale this image four times locally',
    scope,
    inputArtifacts: Object.freeze([image]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, latencyMs: 10_000, ramMb: 512, gpuMs: 10_000, retries: 0 }),
    metadata: Object.freeze({
      operationIntent: 'SUPER_RESOLUTION',
      sourceArtifactId: image.id,
      idempotencyKey: id,
      planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK' }),
    }),
  });
}

function platformDependencies(localExecutionV2: CreativeExecutionPlatformRuntimeDependencies['localExecutionV2'], localExecution?: CreativeExecutionPlatformRuntimeDependencies['localExecution']): CreativeExecutionPlatformRuntimeDependencies {
  return {
    decision: new CanonicalDecisionService(),
    planning: new CanonicalPlanningService(),
    routeSelector: productionExecutionRoute,
    targetSelector: productionTargetSelection,
    providerSelector: { select: () => { throw new Error('provider selection must not run for local super-resolution'); } },
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must not execute ON_DEVICE super-resolution'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external paid billing reserve must not run for local super-resolution'); },
      commit: async () => { throw new Error('external paid billing commit must not run for local super-resolution'); },
      release: async () => { throw new Error('external paid billing release must not run for local super-resolution'); },
    },
    localExecution,
    localExecutionV2,
    now: () => 1_000,
    id: () => 'authority-c3',
  };
}

function testTicketAuthority() {
  return new LocalExecutionTicketAuthority(new LocalExecutionAdmissionRegistry(), {
    now: () => 1_000,
    id: () => 'ticket-c3',
    nonce: () => 'nonce-c3',
    ttlMs: 60_000,
    modelsByCapability: {},
    executorsByCapability: Object.freeze({ [REAL_ESRGAN_UPSCALE_CAPABILITY]: Object.freeze([modelBinding]) }),
  });
}

test('C3 planner and canonical production tuple bind x4 super-resolution to LOCAL ON_DEVICE v2 MODEL execution', async () => {
  const input = request();
  const planner = new CanonicalPlanningService();
  const planned = await planner.plan(input, await new CanonicalDecisionService().decide(input));
  assert.equal(planned.status, 'READY');
  assert.equal(planned.operations.length, 1);
  const operation = planned.operations[0];
  assert.equal(operation.id, SUPER_RESOLUTION_STEP_ID);
  assert.equal(operation.type, SUPER_RESOLUTION_OPERATION);
  assert.deepEqual(operation.requiredArtifacts, ['source-upscale']);
  assert.deepEqual(operation.input, { sourceArtifactId: 'source-upscale', scale: SUPER_RESOLUTION_SCALE, alphaPolicy: SUPER_RESOLUTION_ALPHA_POLICY });
  assert.equal(productionExecutionRoute.select(operation, input), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(operation, input), 'LOCAL');
  const capability = productionExecutionCapabilities.admit({ request: input, operation: { ...operation, executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.equal(capability.allowed, true);
  assert.equal(capability.capabilityId, REAL_ESRGAN_UPSCALE_CAPABILITY);

  const authority = testTicketAuthority();
  const platform = new CreativeExecutionPlatform(platformDependencies(authority));
  platform.createExecution(input);
  const [ticket] = await platform.prepareLocalExecutionV2(input.id);
  assert.equal(ticket.version, '2');
  assert.equal(ticket.operation.type, SUPER_RESOLUTION_OPERATION);
  assert.equal(ticket.operation.capability, REAL_ESRGAN_UPSCALE_CAPABILITY);
  assert.deepEqual(ticket.allowedExecutors, [modelBinding]);
  assert.deepEqual(ticket.inputs, [{ artifactId: 'source-upscale', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64) }]);
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 256, height: 192 }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.equal(ticket.idempotencyKey, `${input.id}:${SUPER_RESOLUTION_STEP_ID}:local-v2`);
});

test('C3 production CANDIDATE cannot mint a v2 executor ticket and cannot downgrade into legacy v1 issuance', async () => {
  assert.deepEqual(productionLocalExecutorsByCapability[REAL_ESRGAN_UPSCALE_CAPABILITY], []);
  assert.equal(productionLocalModelsByCapability[REAL_ESRGAN_UPSCALE_CAPABILITY], undefined);

  const productionAuthority = new LocalExecutionTicketAuthority(new LocalExecutionAdmissionRegistry(), {
    now: () => 1_000,
    id: () => 'ticket-prod-c3',
    nonce: () => 'nonce-prod-c3',
    ttlMs: 60_000,
    modelsByCapability: productionLocalModelsByCapability,
    executorsByCapability: productionLocalExecutorsByCapability,
  });
  const v2 = new CreativeExecutionPlatform(platformDependencies(productionAuthority));
  v2.createExecution(request(source(), 'production-candidate-v2'));
  await assert.rejects(v2.prepareLocalExecutionV2('production-candidate-v2'), error => error instanceof LocalExecutionExecutorUnavailableError && error.code === 'local_executor_unavailable');

  const v1 = new CreativeExecutionPlatform(platformDependencies(productionAuthority, productionAuthority));
  v1.createExecution(request(source(), 'production-candidate-v1'));
  await assert.rejects(v1.prepareLocalExecution('production-candidate-v1'), error => error instanceof LocalExecutionModelUnavailableError && error.code === 'local_model_unavailable');
});

test('C3 refuses unsafe full-frame x4 geometry before calling the v2 ticket issuer', async () => {
  const width = 1025; const height = 1024;
  assert.ok(width * SUPER_RESOLUTION_SCALE * height * SUPER_RESOLUTION_SCALE > MAX_SUPER_RESOLUTION_OUTPUT_PIXELS);
  let issueCalls = 0;
  const issuer = Object.freeze({ issue: async () => { issueCalls += 1; throw new Error('ticket issuer must not be reached for unsafe geometry'); } });
  const input = request(source(width, height), 'unsafe-full-frame-c3');
  const platform = new CreativeExecutionPlatform(platformDependencies(issuer));
  platform.createExecution(input);
  await assert.rejects(platform.prepareLocalExecutionV2(input.id), /safe full-frame output limit/);
  assert.equal(issueCalls, 0);
});

test('C3 planner blocks missing or stale explicit canonical source identity', async () => {
  const planner = new CanonicalPlanningService();
  const missing: CreativeRequest = Object.freeze({ ...request(), id: 'missing-source-c3', inputArtifacts: Object.freeze([]) });
  const missingPlan = await planner.plan(missing, await new CanonicalDecisionService().decide(missing));
  assert.equal(missingPlan.status, 'BLOCKED'); assert.deepEqual(missingPlan.operations, []);

  const base = request();
  const stale: CreativeRequest = Object.freeze({ ...base, id: 'stale-source-c3', metadata: Object.freeze({ ...base.metadata, sourceArtifactId: 'stale-source' }) });
  const stalePlan = await planner.plan(stale, await new CanonicalDecisionService().decide(stale));
  assert.equal(stalePlan.status, 'BLOCKED'); assert.deepEqual(stalePlan.operations, []);
});
