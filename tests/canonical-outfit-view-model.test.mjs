import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedLayerRolesForCategory,
  createCanonicalOutfitViewModel,
} from '../src/application/fashion/canonicalOutfitViewModel.js';

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const G1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const G2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUTFIT = Object.freeze({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Travel',
  style: 'casual',
  season: 'all_season',
  occasion: 'travel',
  revision: 5,
  favorite: false,
  status: 'ACTIVE',
  referenceReadiness: 'REFERENCES_READY',
  entries: Object.freeze([
    Object.freeze({ entryId: E1, garmentId: G1, position: 0, layerRole: 'BASE_TOP', garmentCategory: 'shirts', referenceReadiness: 'READY' }),
    Object.freeze({ entryId: E2, garmentId: G2, position: 1, layerRole: 'BOTTOM', garmentCategory: 'pants', referenceReadiness: 'READY' }),
  ]),
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T01:00:00.000Z',
});

function harness({ wardrobeFails = false } = {}) {
  const calls = [];
  const next = (overrides = {}) => Object.freeze({ ...OUTFIT, revision: OUTFIT.revision + 1, ...overrides });
  const outfits = {
    list: async () => [OUTFIT],
    create: async (input) => { calls.push(['create', input]); return next({ revision: 1, entries: Object.freeze([]), referenceReadiness: 'EMPTY' }); },
    updateMetadata: async (...args) => { calls.push(['updateMetadata', ...args]); return next(args[2]); },
    archive: async (...args) => { calls.push(['archive', ...args]); return next({ status: 'ARCHIVED' }); },
    restore: async (...args) => { calls.push(['restore', ...args]); return next(); },
    addEntry: async (...args) => { calls.push(['addEntry', ...args]); return next(); },
    removeEntry: async (...args) => { calls.push(['removeEntry', ...args]); return next(); },
    setEntryRole: async (...args) => { calls.push(['setEntryRole', ...args]); return next(); },
    reorderEntries: async (...args) => { calls.push(['reorderEntries', ...args]); return next(); },
  };
  const wardrobe = {
    list: async () => {
      if (wardrobeFails) throw new Error('wardrobe unavailable');
      return [
        { garmentId: G2, name: 'Pants', category: 'pants', status: 'ACTIVE' },
        { garmentId: G1, name: 'Shirt', category: 'shirts', status: 'ACTIVE' },
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

test('create canonicalizes metadata and rejects unsupported fields before side effects', async () => {
  const { model, calls } = harness();
  await model.create({ name: '  City   Night ', style: ' SMART_CASUAL ', season: 'WINTER', occasion: 'NIGHT_OUT' });
  assert.deepEqual(calls, [[
    'create',
    { name: 'City Night', style: 'smart_casual', season: 'winter', occasion: 'night_out' },
  ]]);
  calls.length = 0;
  await assert.rejects(() => model.create({ name: 'Bad', provider: 'cloud' }), /canonical metadata only/);
  assert.deepEqual(calls, []);
});

test('metadata diff is revision-bound and canonical no-op avoids network mutation', async () => {
  const { model, calls } = harness();
  assert.equal(await model.updateMetadata(OUTFIT, { name: '  Travel  ' }), OUTFIT);
  assert.deepEqual(calls, []);
  await model.updateMetadata(OUTFIT, { name: 'Travel', style: 'modern', season: 'winter', occasion: 'business' });
  assert.deepEqual(calls, [[
    'updateMetadata', OUTFIT.id, 5,
    { style: 'modern', season: 'winter', occasion: 'business' },
  ]]);
});

test('favorite requires a real boolean and binds the exact Outfit revision', async () => {
  const { model, calls } = harness();
  await model.setFavorite(OUTFIT, true);
  assert.deepEqual(calls, [['updateMetadata', OUTFIT.id, 5, { favorite: true }]]);
  calls.length = 0;
  await assert.rejects(() => model.setFavorite(OUTFIT, 'true'), /favorite must be boolean/);
  assert.deepEqual(calls, []);
});

test('entry and lifecycle mutations bind exactly one caller snapshot revision', async () => {
  const { model, calls } = harness();
  await model.addEntry(OUTFIT, G1, 'outer_top');
  await model.removeEntry(OUTFIT, E2);
  await model.setEntryRole(OUTFIT, E1, 'mid_top');
  await model.archive(OUTFIT);
  await model.restore(OUTFIT);
  assert.deepEqual(calls, [
    ['addEntry', OUTFIT.id, 5, { garmentId: G1, layerRole: 'OUTER_TOP' }],
    ['removeEntry', OUTFIT.id, E2, 5],
    ['setEntryRole', OUTFIT.id, E1, 5, 'MID_TOP'],
    ['archive', OUTFIT.id, 5],
    ['restore', OUTFIT.id, 5],
  ]);
});

test('moveEntry derives one complete canonical reordered entry-id vector and never retries', async () => {
  const { model, calls } = harness();
  await model.moveEntry(OUTFIT, E2, -1);
  assert.deepEqual(calls, [['reorderEntries', OUTFIT.id, 5, [E2, E1]]]);
  calls.length = 0;
  assert.equal(await model.moveEntry(OUTFIT, E1, -1), OUTFIT);
  assert.deepEqual(calls, []);
});

test('malformed revisions and roles fail before side effects', async () => {
  const { model, calls } = harness();
  await assert.rejects(() => model.addEntry({ ...OUTFIT, revision: 0 }, G1), /canonical Outfit snapshot/);
  await assert.rejects(() => model.setEntryRole(OUTFIT, E1, 'PROVIDER_DEFINED'), /accepted Outfit role set/);
  assert.deepEqual(calls, []);
});

test('category-aware role projection matches the accepted Fashion semantics', () => {
  assert.deepEqual(allowedLayerRolesForCategory('tshirts'), ['BASE_TOP']);
  assert.deepEqual(allowedLayerRolesForCategory('shirts'), ['BASE_TOP', 'MID_TOP']);
  assert.deepEqual(allowedLayerRolesForCategory('hoodies'), ['MID_TOP', 'OUTER_TOP']);
  assert.deepEqual(allowedLayerRolesForCategory('jackets'), ['OUTER_TOP']);
  for (const category of ['pants', 'shorts', 'jeans', 'skirts']) assert.deepEqual(allowedLayerRolesForCategory(category), ['BOTTOM']);
  assert.deepEqual(allowedLayerRolesForCategory('dresses'), ['FULL_BODY']);
  for (const category of ['shoes', 'boots', 'sneakers', 'sandals']) assert.deepEqual(allowedLayerRolesForCategory(category), ['FOOTWEAR']);
  for (const category of ['hats', 'glasses', 'scarves', 'bags', 'belts', 'jewelry', 'gloves', 'socks']) assert.deepEqual(allowedLayerRolesForCategory(category), ['ACCESSORY']);
  assert.deepEqual(allowedLayerRolesForCategory('other'), []);
});
