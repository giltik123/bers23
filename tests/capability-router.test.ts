import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../src/application/createApplication';
import { ServiceContainer } from '../src/core/container';
import { CapabilityRouter } from '../src/platform/router';

test('routes a hair color request through face, scene, and image editing', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Change hair color');

  assert.deepEqual(decision.capabilities, ['face-editing', 'scene-memory', 'image-edit']);
  assert.equal(decision.modules.includes('editing-engine'), true);
  assert.equal(decision.modules.includes('scene-memory'), true);
  assert.equal(decision.providers.includes('reve'), true);
  assert.equal(decision.fallback.required, false);
  assert.equal(decision.confidence, 0.96);
});

test('routes virtual try on through garment processing and person analysis', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Virtual try on');

  assert.deepEqual(decision.capabilities, ['virtual-try-on', 'garment-processing', 'person-analysis']);
  assert.equal(decision.modules.includes('editing-engine'), true);
  assert.equal(decision.modules.includes('image-pipeline'), true);
  assert.equal(decision.providers.includes('fashn'), true);
  assert.equal(decision.providers.includes('sam3'), true);
  assert.deepEqual(decision.executionOrder, ['garment-processing', 'person-analysis', 'virtual-try-on']);
  assert.equal(decision.fallback.required, false);
});

test('returns a fallback decision when FASHN is unavailable', async () => {
  const platform = await createApplication(new ServiceContainer());
  const router = new CapabilityRouter(platform.context, { providerAvailability: (id) => id !== 'fashn' });
  const decision = await router.route('Virtual try on');

  assert.equal(decision.fallback.required, true);
  assert.deepEqual(decision.fallback.unavailableProviders, ['fashn']);
  assert.match(decision.fallback.reason ?? '', /alternative route/i);
  assert.equal(decision.providers.includes('fashn'), false);
  assert.equal(decision.confidence, 0.5);
});
