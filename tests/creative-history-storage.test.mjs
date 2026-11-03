import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { creativeHistory } from '../src/lib/creative/CreativeHistory.js';
import englishCreative from '../src/lib/i18n/locales/en/creative.js';
import russian from '../src/lib/i18n/locales/ru/index.js';

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function installStorage(storage) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage, writable: true });
}

function strategy(id = 'creative-test') {
  return { id, name: 'Test strategy', executionOrder: [] };
}

afterEach(() => {
  if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor);
  else delete globalThis.localStorage;
});

test('blocked localStorage getter fails closed without throwing', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage denied'); },
  });
  assert.deepEqual(creativeHistory.list(), []);
  assert.equal(creativeHistory.save(strategy()), null);
  assert.equal(creativeHistory.favorite(strategy()), null);
});

test('a failed read never triggers a write that could overwrite inaccessible history', () => {
  let writes = 0;
  installStorage({
    getItem() { throw new Error('read denied'); },
    setItem() { writes += 1; },
  });
  assert.equal(creativeHistory.save(strategy()), null);
  assert.equal(creativeHistory.favorite(strategy()), null);
  assert.equal(writes, 0);
});

test('malformed or non-array history is not treated as empty and overwritten', () => {
  for (const raw of ['{broken', JSON.stringify({ id: 'not-an-array' }), JSON.stringify([null])]) {
    let writes = 0;
    installStorage({
      getItem() { return raw; },
      setItem() { writes += 1; },
    });
    assert.equal(creativeHistory.save(strategy()), null);
    assert.equal(writes, 0);
  }
});

test('failed writes return unavailable instead of optimistic saved/favorite entries', () => {
  installStorage({
    getItem() { return JSON.stringify([strategy()]); },
    setItem() { throw new Error('quota exceeded'); },
  });
  assert.equal(creativeHistory.save(strategy('creative-new')), null);
  assert.equal(creativeHistory.favorite(strategy()), null);
});

test('available storage preserves save and favorite behavior', () => {
  const values = new Map();
  installStorage({
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  });
  const saved = creativeHistory.save(strategy());
  assert.equal(saved.id, 'creative-test');
  assert.equal(saved.favorite, undefined);
  const favorited = creativeHistory.favorite(saved);
  assert.equal(favorited.favorite, true);
  assert.equal(creativeHistory.list()[0].favorite, true);
});

test('Creative Studio exposes the storage failure in both supported locales', async () => {
  const [panel, summary] = await Promise.all([
    readFile('src/components/editor/creative/CreativeStudioPanel.jsx', 'utf8'),
    readFile('src/components/editor/creative/CreativeStrategySummary.jsx', 'utf8'),
  ]);
  assert.equal(typeof englishCreative.storageUnavailable, 'string');
  assert.equal(typeof russian.creative.storageUnavailable, 'string');
  assert.match(panel, /t\('creative\.storageUnavailable'\)/);
  assert.match(summary, /role="status" aria-live="polite"/);
});
