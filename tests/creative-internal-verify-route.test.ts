import assert from 'node:assert/strict';
import { CreativeExecutionPlatform } from '../src/platform/creative/canonical/CreativeExecutionPlatform';
import { ProductionExecutionCapabilityRegistry } from '../server/core/providers/productionExecutionCapabilities';
import { ProductionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const image = { id: 'verified-input', kind: 'image', value: { url: 'https://assets.example/input.png', hash: 'a'.repeat(64), mimeType: 'image/png' }, producerOperationId: 'previous', scope, state: 'AVAILABLE' as const, role: 'WORKING' as const };
function fixture(valid = true, security = true) {
  const calls = { provider: 0, runtime: 0, available: 0, fallback: 0, security: 0, reserve: 0 };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
    planning: { plan: async request => ({ requestId: request.id, operations: [{ id: 'verify-step', type: 'verify', providerId: 'evil', requiredArtifacts: ['verified-input'], outputArtifacts: ['planner-output-id'], produces: ['image'], cost: { credits: 99, aiCalls: 99 }, input: { verificationPassed: true, quality: 1 } }] }) },
    routeSelector: productionExecutionRoute, targetSelector: productionTargetSelection,
    providerSelector: { select: () => { calls.provider++; return { allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'should-not-run' }; } },
    capabilityAdmission: { admit: input => { assert.equal(input.route, 'INTERNAL'); assert.equal(input.target, 'LOCAL'); assert.equal(input.operation.providerId, undefined); return new ProductionExecutionCapabilityRegistry().admit(input); } },
    securityGate: { authorize: (_request, operation, target) => { calls.security++; assert.equal(operation.providerId, undefined); assert.equal(operation.executionRoute, 'INTERNAL'); assert.equal(target, 'LOCAL'); return security; } },
    runtime: { execute: async () => { calls.runtime++; return {}; } }, providers: { isAvailable: () => { calls.available++; return true; }, fallback: () => { calls.fallback++; return undefined; } },
    verifier: { verify: async (operation, artifacts) => valid ? new ProductionWorkflowVerifier().verify(operation, artifacts) : ({ stepId: operation.id, valid: false, checks: [], errors: ['SERVER_VERIFICATION_FAILED'] }) },
    recovery: { decide: () => 'ABORT' }, billing: { reserve: async () => { calls.reserve++; }, commit: async () => {}, release: async () => {} }, now: (() => { let n = 0; return () => ++n; })(),
  });
  platform.createExecution({ id: 'verify-workflow', intent: 'verify', scope, inputArtifacts: [image], budget: { credits: 0, aiCalls: 0, retries: 0 } });
  return { platform, calls };
}

function onDeviceFixture() {
  const calls = { provider: 0, runtime: 0, available: 0, fallback: 0, security: 0, reserve: 0, ticket: 0 };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
    planning: { plan: async request => ({ requestId: request.id, planningConstraints: { preserveMode: 'STRICT', mustPreserve: [], mustChange: [], forbiddenTargets: [], forbiddenRegions: [], executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK' }, operations: [{ id: 'segment-step', type: 'segment', providerId: 'evil', requiredArtifacts: ['verified-input'], produces: ['mask'], cost: { credits: 99, aiCalls: 99 } }] }) },
    routeSelector: productionExecutionRoute,
    targetSelector: productionTargetSelection,
    providerSelector: { select: () => { calls.provider++; return { allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'must-not-run' }; } },
    capabilityAdmission: { admit: input => new ProductionExecutionCapabilityRegistry().admit(input) },
    securityGate: { authorize: (_request, operation, target) => { calls.security++; assert.equal(operation.providerId, undefined); assert.equal(operation.executionRoute, 'ON_DEVICE'); assert.equal(target, 'LOCAL'); return true; } },
    localExecution: { issue: input => { calls.ticket++; return Object.freeze({ ticketId: 'ticket-segment', version: '1' as const, issuer: 'CORE' as const, requestId: input.requestId, workflowId: input.workflowId, stepId: input.stepId, operation: input.operation, scope: input.scope, inputs: input.inputs, expectedOutputs: input.expectedOutputs, allowedModels: [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }], policy: input.policy, idempotencyKey: input.idempotencyKey, nonce: 'nonce-segment', issuedAt: 1, expiresAt: 60_001, cost: { paidCloudCredits: 0 as const, providerCalls: 0 as const } }); } },
    runtime: { execute: async () => { calls.runtime++; return {}; } },
    providers: { isAvailable: () => { calls.available++; return true; }, fallback: () => { calls.fallback++; return 'fal'; } },
    recovery: { decide: () => 'FALLBACK' },
    billing: { reserve: async () => { calls.reserve++; }, commit: async () => {}, release: async () => {} },
    now: (() => { let n = 100; return () => ++n; })(),
  });
  platform.createExecution({ id: 'segment-workflow', intent: 'select the subject', scope, inputArtifacts: [image], budget: { credits: 100, aiCalls: 100, retries: 3 }, metadata: { idempotencyKey: 'segment-idem' } });
  return { platform, calls };
}

{
  const { platform, calls } = fixture(); const outcome = await platform.execute('verify-workflow');
  assert.equal(outcome.status, 'SUCCESS'); assert.deepEqual(calls, { provider: 0, runtime: 0, available: 0, fallback: 0, security: 1, reserve: 0 });
  assert.equal(outcome.workflow?.metrics.aiCalls, 0); assert.deepEqual(outcome.workflow?.metrics.providerUsage, {});
  const output = outcome.workflow!.steps[0].artifacts[0]; assert.notEqual(output.id, image.id); assert.notEqual(output.id, 'planner-output-id'); assert.deepEqual(output.metadata?.parentArtifactIds, [image.id]);
}
{
  const { platform, calls } = fixture(false); const outcome = await platform.execute('verify-workflow'); assert.equal(outcome.status, 'FAILED'); assert.equal(outcome.workflow?.steps[0].artifacts.length, 0); assert.equal(calls.runtime, 0);
}
{
  const { platform, calls } = fixture(true, false); await assert.rejects(platform.compile('verify-workflow'), /blocked/); assert.deepEqual({ runtime: calls.runtime, provider: calls.provider, reserve: calls.reserve }, { runtime: 0, provider: 0, reserve: 0 });
}
{
  const { platform, calls } = onDeviceFixture();
  const tickets = await platform.prepareLocalExecution('segment-workflow');
  assert.equal(platform.status('segment-workflow'), 'WAITING');
  assert.equal(tickets.length, 1); assert.equal(tickets[0].operation.capability, 'local:mobilesam:segment:v1'); assert.deepEqual(tickets[0].cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.equal(tickets[0].inputs[0].sha256, 'a'.repeat(64)); assert.deepEqual(tickets[0].expectedOutputs, [{ kind: 'mask', role: 'MASK', count: 1 }]);
  assert.deepEqual({ provider: calls.provider, runtime: calls.runtime, available: calls.available, fallback: calls.fallback, reserve: calls.reserve, ticket: calls.ticket }, { provider: 0, runtime: 0, available: 0, fallback: 0, reserve: 0, ticket: 1 });
  await assert.rejects(platform.execute('segment-workflow'), /paused/);
  platform.resume('segment-workflow');
  await assert.rejects(platform.execute('segment-workflow'), /server runtime execution is forbidden/);
  assert.deepEqual({ provider: calls.provider, runtime: calls.runtime, available: calls.available, fallback: calls.fallback, reserve: calls.reserve }, { provider: 0, runtime: 0, available: 0, fallback: 0, reserve: 0 });
}
{
  assert.equal(productionExecutionRoute.select({ id: 'provider', type: 'image-edit', executionRoute: 'INTERNAL' } as never, {} as never), 'PROVIDER');
  assert.equal(productionExecutionRoute.select({ id: 'segment', type: 'segment' } as never, {} as never), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select({ id: 'segment', type: 'segment' } as never, {} as never), 'LOCAL');
  assert.throws(() => productionExecutionRoute.select({ id: 'unsupported', type: 'unknown-operation' } as never, {} as never), /Unsupported/);
  const verifier = new ProductionWorkflowVerifier();
  const operation = { id: 'verify', type: 'verify', executionRoute: 'INTERNAL', requiredArtifacts: ['input'], outputBindings: [{ logicalId: 'out', artifactId: 'canonical', kind: 'image', slot: 0 }] } as const;
  assert.equal((await verifier.verify(operation, [])).valid, false);
  assert.equal((await verifier.verify(operation, [{ id: 'wrong', kind: 'mask', value: {}, producerStepId: 'seed', scope }])).valid, false);
  assert.equal((await verifier.verify(operation, [{ id: 'bad', kind: 'image', value: { url: 'http://bad' }, producerStepId: 'seed', scope }])).valid, false);
  assert.equal((await verifier.verify({ ...operation, type: 'remove' }, [image as never])).valid, false);
}
console.log('creative internal/on-device route tests passed');
