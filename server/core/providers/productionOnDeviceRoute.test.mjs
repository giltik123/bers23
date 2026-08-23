import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductionExecutionCapabilityRegistry } from './productionExecutionCapabilities.ts';
import { productionExecutionRoute } from './productionExecutionRoute.ts';
import { productionTargetSelection } from './productionTargetSelection.ts';

const request = Object.freeze({ id: 'request', intent: 'segment subject', scope: Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' }) });
const segment = Object.freeze({ id: 'segment-step', type: 'segment', requiredArtifacts: ['input'], produces: ['mask'] });

test('production segmentation selects ON_DEVICE + LOCAL', () => {
  assert.equal(productionExecutionRoute.select(segment, request), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(segment, request), 'LOCAL');
});

test('production capability admits only the ON_DEVICE + LOCAL segmentation tuple', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  const admitted = registry.admit({ request, operation: segment, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.deepEqual(admitted, { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'local:mobilesam:segment:v1' });
  assert.equal(registry.admit({ request, operation: segment, route: 'ON_DEVICE', target: 'CLOUD' }).reasonCode, 'UNSUPPORTED_TARGET');
  assert.equal(registry.admit({ request, operation: segment, route: 'ON_DEVICE', target: 'HYBRID' }).reasonCode, 'UNSUPPORTED_TARGET');
  assert.equal(registry.admit({ request, operation: segment, route: 'PROVIDER', target: 'LOCAL' }).reasonCode, 'PROVIDER_REQUIRED');
});

test('ON_DEVICE forbids provider identity and existing routes stay unchanged', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  assert.equal(registry.admit({ request, operation: { ...segment, providerId: 'fal' }, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'PROVIDER_FORBIDDEN');
  assert.equal(productionExecutionRoute.select({ id: 'edit', type: 'image-edit' }, request), 'PROVIDER');
  assert.equal(productionTargetSelection.select({ id: 'edit', type: 'image-edit' }, request), 'CLOUD');
  assert.equal(productionExecutionRoute.select({ id: 'verify', type: 'verify' }, request), 'INTERNAL');
  assert.equal(productionTargetSelection.select({ id: 'verify', type: 'verify' }, request), 'LOCAL');
});
