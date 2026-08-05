import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../src/application/createApplication';
import { ServiceContainer } from '../src/core/container';

test('application bootstrap discovers all built-in platform metadata', async () => {
  const platform = await createApplication(new ServiceContainer());

  assert.deepEqual(platform.context.providers.getAll().map(({ id }) => id).sort(), ['fashn', 'reve', 'sam3']);
  assert.deepEqual(platform.context.recipes.getAll().map(({ id }) => id), ['recipe-library']);
  assert.deepEqual(platform.context.workspaces.getAll().map(({ id }) => id).sort(), [
    'automotive-workspace', 'creative-workspace', 'fashion-workspace', 'food-workspace', 'landscape-workspace',
    'portrait-workspace', 'product-workspace', 'real-estate-workspace', 'social-workspace', 'universal-workspace',
  ]);
  assert.deepEqual(platform.context.aiModules.getAll().map(({ id }) => id).sort(), [
    'ai-agent', 'editing-engine', 'image-pipeline', 'planner', 'scene-memory',
  ]);

  assert.equal(platform.context.providers.supports('sam3', 'segmentation'), true);
  assert.equal(platform.context.providers.supports('fashn', 'try-on'), true);
  assert.equal(platform.context.capabilities.find('automation').includes('ai-agent'), true);

  const inspection = platform.inspect();
  assert.deepEqual(inspection, {
    modules: 19,
    providers: 3,
    recipes: 1,
    workspaces: 10,
    automations: 0,
    aiModules: 5,
    capabilities: inspection.capabilities,
  });
  for (const capability of ['segmentation', 'editing', 'try-on', 'automation', 'metadata-management', 'template-processing']) {
    assert.equal(inspection.capabilities.includes(capability), true, `Missing capability: ${capability}`);
  }
});
