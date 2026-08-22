import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CreativeExecutionPlatform } from '../../../src/platform/creative/canonical/CreativeExecutionPlatform.ts';
import { createFalWorkflowRuntime } from './falWorkflowRuntime.ts';
import { ProductionExecutionCapabilityRegistry, productionExecutionCapabilities } from './productionExecutionCapabilities.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const request = Object.freeze({ id: 'capability-proof', intent: 'edit', scope, budget: { credits: 2, latencyMs: 1000, ramMb: 128, gpuMs: 0, aiCalls: 1, retries: 0 } });

const input = (operation, target = 'CLOUD') => ({ request, operation, target });

test('production capability registry admits only the two currently real FAL contracts', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  assert.deepEqual(registry.admit(input({ id: 'global', type: 'image-edit', providerId: 'fal' })), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'fal:image-edit:v1',
  });
  assert.deepEqual(registry.admit(input({ id: 'controlled', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal' })), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'fal:controlled-local-edit:v1',
  });

  for (const type of ['segment', 'remove', 'background_replace', 'relight', 'verify']) {
    assert.deepEqual(registry.admit(input({ id: type, type, providerId: 'fal' })), { allowed: false, reasonCode: 'UNSUPPORTED_OPERATION' });
  }
  assert.deepEqual(registry.admit(input({ id: 'wrong-target', type: 'image-edit', providerId: 'fal' }, 'LOCAL')), { allowed: false, reasonCode: 'UNSUPPORTED_TARGET' });
  assert.deepEqual(registry.admit(input({ id: 'missing-provider', type: 'image-edit' })), { allowed: false, reasonCode: 'PROVIDER_REQUIRED' });
  assert.deepEqual(registry.admit(input({ id: 'wrong-provider', type: 'image-edit', providerId: 'cloud' })), { allowed: false, reasonCode: 'UNSUPPORTED_PROVIDER' });
  assert.deepEqual(registry.admit(input({ id: 'blocked', type: 'image-edit', providerId: 'fal' }, 'BLOCKED')), { allowed: false, reasonCode: 'TARGET_BLOCKED' });
});

test('unsupported operation stops before security, billing reservation and runtime', async () => {
  const calls = { capability: 0, security: 0, reserve: 0, runtime: 0 };
  const capabilityAdmission = {
    admit(value) {
      calls.capability += 1;
      return productionExecutionCapabilities.admit(value);
    },
  };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: { plan: async value => ({ requestId: value.id, status: 'READY', operations: [{ id: 'segment-1', type: 'segment', providerId: 'fal' }] }) },
    targetSelector: { select: () => 'CLOUD' },
    capabilityAdmission,
    securityGate: { authorize: () => { calls.security += 1; return true; } },
    runtime: { execute: async () => { calls.runtime += 1; return {}; } },
    providers: { isAvailable: () => true, fallback: () => undefined },
    recovery: { decide: () => 'ABORT' },
    billing: { reserve: async () => { calls.reserve += 1; }, commit: async () => {}, release: async () => {} },
  });
  platform.createExecution(request);
  await assert.rejects(platform.compile(request.id), /Execution capability blocked operation segment-1: UNSUPPORTED_OPERATION/);
  assert.deepEqual(calls, { capability: 1, security: 0, reserve: 0, runtime: 0 });
});

test('FAL runtime rejects unknown operation types before artifact resolution or provider transport', async () => {
  let fetchCalls = 0;
  let resolveCalls = 0;
  const runtime = createFalWorkflowRuntime({
    apiKey: 'server-secret',
    baseUrl: 'https://queue.fal.test',
    timeoutMs: 1000,
    artifacts: { resolve: () => { resolveCalls += 1; throw new Error('must not resolve'); } },
    fetcher: async () => { fetchCalls += 1; throw new Error('must not call provider transport'); },
  });
  await assert.rejects(runtime.execute({ workflowId: 'unsupported', scope, operation: { id: 'segment', type: 'segment', providerId: 'fal' }, artifacts: [] }), /Unsupported FAL workflow operation type: segment/);
  assert.equal(resolveCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('production capability admission has no security, persistence or financial authority imports', async () => {
  const source = await readFile('server/core/providers/productionExecutionCapabilities.ts', 'utf8');
  for (const marker of ['/auth/', '/projects/', '/artifacts/', '/transactions/', '/billing/', "from 'pg'", 'Postgres', 'TransactionService', 'ArtifactAuthority']) {
    assert.equal(source.includes(marker), false, `capability registry imports/owns forbidden authority surface ${marker}`);
  }
  const production = await readFile('server/core/composition/createProductionCore.ts', 'utf8');
  assert.equal(production.includes('capabilityAdmission: productionExecutionCapabilities'), true);
  assert.equal(production.includes('new CanonicalPlanningService()'), true);
  assert.equal(production.includes('compositeExecutionEnabled: true'), false, '6.41A must not enable composite execution');
  const runtime = await readFile('server/core/providers/falWorkflowRuntime.ts', 'utf8');
  assert.equal(runtime.includes("request.operation.type !== 'image-edit' && request.operation.type !== 'CONTROLLED_LOCAL_EDIT'"), true);
});
