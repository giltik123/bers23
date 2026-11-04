import assert from 'node:assert/strict';
import test from 'node:test';
import { creativeHistory } from '../src/lib/creative/CreativeHistory.js';

const KEY = 'creative_studio_history_v1';
const strategy = (id = 'strategy-1') => ({
  id, name: 'Test strategy', goalId: 'marketing', estimatedCredits: 3, executionOrder: [],
});
const originalStorage = () => Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const restoreStorage = (descriptor) => {
  if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
  else delete globalThis.localStorage;
};
const installStorage = (value) => Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, value,
});

test('throwing localStorage getter fails closed without writing', () => {
  const original = originalStorage();
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage blocked'); },
    });
    assert.deepEqual(creativeHistory.save(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
    assert.deepEqual(creativeHistory.favorite(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
    assert.deepEqual(creativeHistory.list(), []);
  } finally { restoreStorage(original); }
});

test('throwing read never overwrites inaccessible prior history', () => {
  const original = originalStorage();
  let writes = 0;
  try {
    installStorage({
      getItem() { throw new Error('read denied'); },
      setItem() { writes += 1; },
    });
    assert.deepEqual(creativeHistory.save(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
    assert.deepEqual(creativeHistory.favorite(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
    assert.equal(writes, 0);
  } finally { restoreStorage(original); }
});

test('malformed, non-array and invalid-entry payloads are never replaced', () => {
  const original = originalStorage();
  try {
    for (const raw of ['{broken-json', JSON.stringify({ entries: [] }), JSON.stringify([null]), JSON.stringify([{}])]) {
      let writes = 0;
      installStorage({
        getItem(key) { assert.equal(key, KEY); return raw; },
        setItem() { writes += 1; },
      });
      assert.deepEqual(creativeHistory.save(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
      assert.deepEqual(creativeHistory.favorite(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
      assert.equal(writes, 0);
    }
  } finally { restoreStorage(original); }
});

test('write failures return an unavailable result and never report success', () => {
  const original = originalStorage();
  try {
    installStorage({
      getItem() { return JSON.stringify([strategy()]); },
      setItem() { throw new Error('quota exceeded'); },
    });
    assert.deepEqual(creativeHistory.save(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
    assert.deepEqual(creativeHistory.favorite(strategy()), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
  } finally { restoreStorage(original); }
});

test('valid local history saves, de-duplicates and toggles favorites', () => {
  const original = originalStorage();
  const values = new Map();
  try {
    installStorage({
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
    });
    const saved = creativeHistory.save(strategy());
    assert.equal(saved.ok, true);
    assert.equal(saved.entry.id, 'strategy-1');
    assert.equal(typeof saved.entry.savedAt, 'string');

    const updated = creativeHistory.save({ ...strategy(), name: 'Updated strategy' });
    assert.equal(updated.ok, true);
    assert.equal(creativeHistory.list().length, 1);
    assert.equal(creativeHistory.list()[0].name, 'Updated strategy');

    const favorited = creativeHistory.favorite(updated.entry);
    assert.equal(favorited.ok, true);
    assert.equal(favorited.entry.favorite, true);
    const unfavorited = creativeHistory.favorite(favorited.entry);
    assert.equal(unfavorited.ok, true);
    assert.equal(unfavorited.entry.favorite, false);
    assert.deepEqual(creativeHistory.list()[0], unfavorited.entry);
  } finally { restoreStorage(original); }
});
