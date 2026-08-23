import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ProductionExecutionCapabilityRegistry } from './productionExecutionCapabilities.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const request = Object.freeze({ id: 'capability-proof', intent: 'edit', scope, budget: { credits: 2, latencyMs: 1000, ramMb: 128, gpuMs: 0, aiCalls: 1, retries: 0 } });
const input = (operation, target = 'CLOUD', route = 'PROVIDER') => ({ request, operation, target, route });

test('production capability registry admits exactly the accepted provider and internal tuples', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  assert.deepEqual(registry.admit(input({ id: 'global', type: 'image-edit', providerId: 'fal' })), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'fal:image-edit:v1',
  });
  assert.deepEqual(registry.admit(input({ id: 'controlled', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal' })), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'fal:controlled-local-edit:v1',
  });
  assert.deepEqual(registry.admit(input({ id: 'verify', type: 'verify' }, 'LOCAL', 'INTERNAL')), { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'internal:verify:image:v1' });
  assert.deepEqual(registry.admit(input({ id: 'evil', type: 'verify', providerId: 'evil' }, 'LOCAL', 'INTERNAL')), { allowed: false, reasonCode: 'PROVIDER_FORBIDDEN' });
  assert.deepEqual(registry.admit(input({ id: 'cloud-verify', type: 'verify' }, 'CLOUD', 'INTERNAL')), { allowed: false, reasonCode: 'UNSUPPORTED_TARGET' });
  for (const type of ['segment', 'remove', 'background_replace', 'relight']) {
    assert.deepEqual(registry.admit(input({ id: type, type, providerId: 'fal' })), { allowed: false, reasonCode: 'UNSUPPORTED_OPERATION' });
  }
  assert.deepEqual(registry.admit(input({ id: 'wrong-target', type: 'image-edit', providerId: 'fal' }, 'LOCAL')), { allowed: false, reasonCode: 'UNSUPPORTED_TARGET' });
  assert.deepEqual(registry.admit(input({ id: 'missing-provider', type: 'image-edit' })), { allowed: false, reasonCode: 'PROVIDER_REQUIRED' });
  assert.deepEqual(registry.admit(input({ id: 'wrong-provider', type: 'image-edit', providerId: 'cloud' })), { allowed: false, reasonCode: 'UNSUPPORTED_PROVIDER' });
  assert.deepEqual(registry.admit(input({ id: 'blocked', type: 'image-edit', providerId: 'fal' }, 'BLOCKED')), { allowed: false, reasonCode: 'TARGET_BLOCKED' });
});

test('production capability admission has no security, persistence or financial authority imports', async () => {
  const source = await readFile('server/core/providers/productionExecutionCapabilities.ts', 'utf8');
  for (const marker of ['/auth/', '/projects/', '/artifacts/', '/transactions/', '/billing/', "from 'pg'", 'Postgres', 'TransactionService', 'ArtifactAuthority']) {
    assert.equal(source.includes(marker), false, `capability registry imports/owns forbidden authority surface ${marker}`);
  }
  const production = await readFile('server/core/composition/createProductionCore.ts', 'utf8');
  assert.equal(production.includes('providerSelector: productionProviderSelection'), true);
  assert.equal(production.includes('capabilityAdmission: productionExecutionCapabilities'), true);
  assert.equal(production.includes('new CanonicalPlanningService()'), true);
  assert.equal(production.includes('compositeExecutionEnabled: true'), false, '6.41C1 must not enable composite execution');
  const platform = await readFile('src/platform/creative/canonical/CreativeExecutionPlatform.ts', 'utf8');
  const providerIndex = platform.indexOf('providerSelector.select');
  const capabilityIndex = platform.indexOf('capabilityAdmission.admit');
  const securityIndex = platform.indexOf('securityGate.authorize');
  const reserveIndex = platform.indexOf('#authority.reserve');
  assert.ok(providerIndex >= 0 && capabilityIndex > providerIndex && securityIndex > capabilityIndex && reserveIndex > securityIndex, 'provider selection and capability admission must precede security and reservation');
  const runtime = await readFile('server/core/providers/falWorkflowRuntime.ts', 'utf8');
  assert.equal(runtime.includes("request.operation.type !== 'image-edit' && request.operation.type !== 'CONTROLLED_LOCAL_EDIT'"), true);
});
