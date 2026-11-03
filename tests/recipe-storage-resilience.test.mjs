import assert from 'node:assert/strict';
import test from 'node:test';
import { coreClient } from '../src/api/coreClient.js';
import { recipeAnalytics } from '../src/lib/recipes/recipeAnalytics.js';
import { recipeFavorites } from '../src/lib/recipes/recipeFavorites.js';
import { recipeHistory } from '../src/lib/recipes/recipeHistory.js';
import { recipeEngine } from '../src/lib/recipes/recipeEngine.js';

test('Recipe favorites and outcome history survive denied/quota Web Storage and persist when it returns', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalTrack = coreClient.analytics.track;
  let telemetryCalls = 0;
  coreClient.analytics.track = () => {
    telemetryCalls += 1;
    throw new Error('optional telemetry unavailable');
  };

  const restoreStorage = () => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  };

  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage access denied'); },
    });

    assert.equal(recipeFavorites.toggle('storage-fallback-favorite'), true);
    assert.equal(recipeFavorites.isFavorite('storage-fallback-favorite'), true);
    assert.doesNotThrow(() => recipeEngine.recordOutcome('storage-fallback-recipe', {
      success: true,
      durationMs: 1200,
      credits: 0,
    }));
    assert.equal(recipeHistory.successRate('storage-fallback-recipe'), 1);
    assert.equal(recipeAnalytics.stats('storage-fallback-recipe').uses, 1);

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem() { return null; },
        setItem() { throw new Error('storage quota exceeded'); },
      },
    });

    assert.equal(recipeFavorites.toggle('quota-fallback-favorite'), true);
    assert.doesNotThrow(() => recipeEngine.recordOutcome('storage-fallback-recipe', {
      success: false,
      durationMs: 800,
      credits: 0,
    }));
    assert.equal(recipeFavorites.isFavorite('storage-fallback-favorite'), true);
    assert.equal(recipeHistory.successRate('storage-fallback-recipe'), 0.5);
    assert.equal(recipeAnalytics.stats('storage-fallback-recipe').uses, 2);

    const persisted = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem(key) { return persisted.has(key) ? persisted.get(key) : null; },
        setItem(key, value) { persisted.set(key, String(value)); },
      },
    });

    assert.equal(recipeFavorites.toggle('persistent-favorite'), true);
    recipeEngine.recordOutcome('storage-fallback-recipe', { success: true, durationMs: 600, credits: 0 });
    assert.deepEqual(JSON.parse(persisted.get('recipe_favorites')), [
      'storage-fallback-favorite',
      'quota-fallback-favorite',
      'persistent-favorite',
    ]);
    assert.equal(JSON.parse(persisted.get('recipe_history'))['storage-fallback-recipe'].uses, 3);
    assert.equal(JSON.parse(persisted.get('recipe_analytics'))['storage-fallback-recipe'].uses, 3);
    assert.equal(telemetryCalls, 3);
  } finally {
    coreClient.analytics.track = originalTrack;
    restoreStorage();
  }
});
