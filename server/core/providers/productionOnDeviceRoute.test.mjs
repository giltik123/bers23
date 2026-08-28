import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT } from '../../../src/platform/creative/canonical/localComposite.ts';
import { CROP_CAPABILITY } from '../../../src/platform/creative/deterministic/Crop.ts';
import { ProductionExecutionCapabilityRegistry } from './productionExecutionCapabilities.ts';
import { productionExecutionRoute } from './productionExecutionRoute.ts';
import { productionTargetSelection } from './productionTargetSelection.ts';

const request = Object.freeze({ id: 'request', intent: 'segment subject', scope: Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' }), metadata: Object.freeze({ operationIntent: 'INTERACTIVE_SEGMENTATION' }) });
const segment = Object.freeze({ id: 'segment-step', type: 'segment', requiredArtifacts: ['input'], produces: ['mask'] });
const backgroundIsolation = Object.freeze({ id: 'background-isolation-step', type: 'BACKGROUND_ISOLATION', requiredArtifacts: ['input', 'mask'], produces: ['image'] });
const crop = Object.freeze({ id: 'crop', type: 'CROP', requiredArtifacts: ['input'], produces: ['image'] });
const verify = Object.freeze({ id: 'verify-step', type: 'verify', requiredArtifacts: ['composite'], produces: ['image'] });

test('production segmentation selects ON_DEVICE + LOCAL', () => {
  assert.equal(productionExecutionRoute.select(segment, request), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(segment, request), 'LOCAL');
});

test('production capability admits only the ON_DEVICE + LOCAL interactive segmentation tuple', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  const admitted = registry.admit({ request, operation: segment, route: 'ON_DEVICE', target: 'LOCAL' });
  assert.deepEqual(admitted, { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'local:mobilesam:segment:v1' });
  assert.equal(registry.admit({ request, operation: segment, route: 'ON_DEVICE', target: 'CLOUD' }).reasonCode, 'UNSUPPORTED_TARGET');
  assert.equal(registry.admit({ request, operation: segment, route: 'ON_DEVICE', target: 'HYBRID' }).reasonCode, 'UNSUPPORTED_TARGET');
  assert.equal(registry.admit({ request, operation: segment, route: 'PROVIDER', target: 'LOCAL' }).reasonCode, 'PROVIDER_REQUIRED');
});

test('deterministic Crop is admitted only for its exact CROP purpose and LOCAL ON_DEVICE tuple', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  const cropRequest = { ...request, metadata: { operationIntent: 'CROP' } };
  assert.equal(productionExecutionRoute.select(crop, cropRequest), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(crop, cropRequest), 'LOCAL');
  assert.deepEqual(registry.admit({ request: cropRequest, operation: crop, route: 'ON_DEVICE', target: 'LOCAL' }), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: CROP_CAPABILITY,
  });
  assert.equal(registry.admit({ request, operation: crop, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'UNSUPPORTED_OPERATION');
  assert.equal(registry.admit({ request: cropRequest, operation: crop, route: 'ON_DEVICE', target: 'CLOUD' }).reasonCode, 'UNSUPPORTED_TARGET');
  assert.equal(registry.admit({ request: cropRequest, operation: crop, route: 'PROVIDER', target: 'LOCAL' }).reasonCode, 'PROVIDER_REQUIRED');
  assert.equal(registry.admit({ request: cropRequest, operation: { ...crop, providerId: 'fal' }, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'PROVIDER_FORBIDDEN');
});

test('narrow C5B composite receives only its exact purpose-bound segment, isolation and verify capabilities', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  const narrowComposite = { ...request, metadata: { operationIntent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT } };
  assert.deepEqual(registry.admit({ request: narrowComposite, operation: segment, route: 'ON_DEVICE', target: 'LOCAL' }), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment,
  });
  assert.deepEqual(registry.admit({ request: narrowComposite, operation: backgroundIsolation, route: 'ON_DEVICE', target: 'LOCAL' }), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation,
  });
  assert.deepEqual(registry.admit({ request: narrowComposite, operation: verify, route: 'INTERNAL', target: 'LOCAL' }), {
    allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.verify,
  });
  assert.equal(registry.admit({ request: narrowComposite, operation: crop, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'UNSUPPORTED_OPERATION');
});

test('generic and broad composite operations cannot inherit narrow or standalone local model/tool authority', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  const generic = { ...request, metadata: {} };
  const broadComposite = { ...request, metadata: { operationIntent: 'COMPOSITE_REPLACE_RELIGHT' } };
  for (const candidateRequest of [generic, broadComposite]) {
    assert.equal(registry.admit({ request: candidateRequest, operation: segment, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'UNSUPPORTED_OPERATION');
    assert.equal(registry.admit({ request: candidateRequest, operation: backgroundIsolation, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'UNSUPPORTED_OPERATION');
    assert.equal(registry.admit({ request: candidateRequest, operation: crop, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'UNSUPPORTED_OPERATION');
  }
});

test('ON_DEVICE forbids provider identity and existing routes stay unchanged', () => {
  const registry = new ProductionExecutionCapabilityRegistry();
  assert.equal(registry.admit({ request, operation: { ...segment, providerId: 'fal' }, route: 'ON_DEVICE', target: 'LOCAL' }).reasonCode, 'PROVIDER_FORBIDDEN');
  assert.equal(productionExecutionRoute.select({ id: 'edit', type: 'image-edit' }, request), 'PROVIDER');
  assert.equal(productionTargetSelection.select({ id: 'edit', type: 'image-edit' }, request), 'CLOUD');
  assert.equal(productionExecutionRoute.select({ id: 'verify', type: 'verify' }, request), 'INTERNAL');
  assert.equal(productionTargetSelection.select({ id: 'verify', type: 'verify' }, request), 'LOCAL');
});