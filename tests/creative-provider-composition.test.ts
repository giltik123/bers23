import assert from 'node:assert/strict';
import test from 'node:test';
import { composeCreativeProviders } from '../src/platform/creative/composition';

test('composition root registers Fal through provider platform DI', () => {
  const composed = composeCreativeProviders({ fetcher: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }), api: { apiKey: 'secret', baseUrl: 'https://queue.test' }, clock: () => 1, random: () => 0, id: () => 'id', sleep: async () => undefined });
  assert.equal(composed.registry.provider('fal')?.name, 'fal');
  assert.equal(composed.registry.resolve('upscale').name, 'fal');
});
