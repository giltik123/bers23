import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalOutfitViewModel } from '../src/application/fashion/canonicalOutfitViewModel.js';

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const G1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const G2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUTFIT = Object.freeze({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Travel',
  revision: 5,
  favorite: false,
  status: 'ACTIVE',
  entries: Object.freeze([
    Object.freeze({ entryId: E1, garmentId: G1, position: 0, layerRole: 'BASE_TOP', referenceReadiness: 'READY' }),
    Object.freeze({ entryId: E2, garmentId: G2, position: 1, layerRole: 'BOTTOM', referenceReadiness: 'READY' }),
  ]),
  updatedAt: '2026-09-03T01:00:00.000Z',
});

function harness({ wardrobeFails = false } = {}) {
  const calls = [];
  const outfits = {
    list: async () => [OUTFIT],
    create: async (input) => { calls.push(['create', input]); return OUTFIT; },
    updateMetadata: async (...args) => { calls.push(['updateMetadata', ...args]); return { ...OUTFIT, revision: 6, favorite: true }; },
    archive: async (...args) => { calls.push(['archive', ...args]); return { ...OUTFIT, revision: 6, status: 'ARCHIVED' }; },
    restore: async (...args) => { calls.push(['restore', ...args]); return { ...OUTFIT, revision: 6 }; },
    addEntry: async (...args) => { calls.push(['addEntry', ...args]); return { ...OUTFIT, revision: 6 }; },
    removeEntry: async (...args) => { calls.push(['removeEntry', ...args]); return { ...OUTFIT, revision: 6 }; },
    setEntryRole: async (...args) => { calls.push(['setEntryRole', ...args]); return { ...OUTFIT, revision: 6 }; },
    reorderEntries: async (...args) => { calls.push(['reorderEntries', ...args]); return { ...OUTFIT, revision: 6 }; },
  };
  const wardrobe = {
    list: async () => {
      if (wardrobeFails) throw new Error('wardrobe unavailable');
      return [
        { garmentId: G2, name: 'Pants', status: 'ACTIVE' },
        { garmentId: G1, name: 'Shirt', status: 'ACTIVE' },
      ];
    },
  };
  return { model: createCanonicalOutfitViewModel({ outfits, wardrobe }), calls };
}

test('Outfit authority remains usable when optional Wardrobe display projection fails', async () => {
  const { model } = harness({ wardrobeFails: true });
  const snapshot = await model.load();
  assert.equal(snapshot.outfits.length, 1);
  assert.deepEqual(snapshot.garments, []);
  assert.match(snapshot.wardrobeError.message, /wardrobe unavailable/);
});

test('favorite and add-entry bind exact Outfit revision', async () => {
  const { model, calls } = harness();
  await model.setFavorite(OUTFIT, true);
  await model.addEntry(OUTFIT, G1, 'OUTER_TOP');
  assert.deepEqual(calls, [
    ['updateMetadata', OUTFIT.id, 5, { favorite: true }],
    ['addEntry', OUTFIT.id, 5, { garmentId: G1, layerRole: 'OUTER_TOP' }],
  ]);
});

test('moveEntry derives one canonical reordered entry-id vector', async () => {
  const { model, calls } = harness();
  await model.moveEntry(OUTFIT, E2, -1);
  assert.deepEqual(calls, [
    ['reorderEntries', OUTFIT.id, 5, [E2, E1]],
  ]);
});

test('boundary reorder is a no-op and malformed revisions fail before side effects', async () => {
  const { model, calls } = harness();
  assert.equal(await model.moveEntry(OUTFIT, E1, -1), OUTFIT);
  await assert.rejects(
    () => model.addEntry({ ...OUTFIT, revision: 0 }, G1),
    /canonical Outfit snapshot/,
  );
  assert.deepEqual(calls, []);
});
