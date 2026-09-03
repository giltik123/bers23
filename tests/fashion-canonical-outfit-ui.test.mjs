import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  OUTFIT_LAYER_ROLES,
  OUTFIT_OCCASIONS,
  OUTFIT_SEASONS,
  OUTFIT_STYLES,
  allowedLayerRolesForCategory,
} from '../src/application/fashion/canonicalOutfitViewModel.js';

const panel = fs.readFileSync(new URL('../src/components/editor/outfits/OutfitPanel.jsx', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../src/application/fashion/canonicalOutfitViewModel.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api/managedOutfitClient.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/core/fashion/postgresOutfitStore.ts', import.meta.url), 'utf8');

function parseSet(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]+)\\]\\)`));
  assert.ok(match, `${name} must remain an explicit Managed Outfit client set`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

test('Outfit panel uses only canonical F3 and Wardrobe browser authorities', () => {
  assert.match(panel, /coreClient\.fashion\.outfits/);
  assert.match(panel, /coreClient\.fashion\.wardrobe/);
  assert.match(panel, /createCanonicalOutfitViewModel/);
  assert.match(model, /outfits\.reorderEntries/);
  assert.match(model, /outfits\.setEntryRole/);
  assert.match(model, /outfits\.updateMetadata/);
});

test('active Outfit UI cannot revive legacy entity, execution, provider or financial authority', () => {
  const active = `${panel}\n${model}`;
  for (const forbidden of [
    'outfitManager',
    'coreClient.entities',
    'FASHN',
    'billing',
    'credits',
    'onCommit',
    'onRollback',
    'fetch(',
  ]) {
    assert.equal(active.includes(forbidden), false, `active Outfit surface must not contain ${forbidden}`);
  }
});

test('UI taxonomies remain byte-for-value aligned with the accepted Managed Outfit client', () => {
  assert.deepEqual([...OUTFIT_STYLES], parseSet(client, 'STYLES'));
  assert.deepEqual([...OUTFIT_SEASONS], parseSet(client, 'SEASONS'));
  assert.deepEqual([...OUTFIT_OCCASIONS], parseSet(client, 'OCCASIONS'));
  assert.deepEqual([...OUTFIT_LAYER_ROLES], parseSet(client, 'LAYER_ROLES'));
});

test('category-aware role projection remains aligned with server admission semantics', () => {
  const expected = new Map([
    ['tshirts', ['BASE_TOP']],
    ['shirts', ['BASE_TOP', 'MID_TOP']],
    ['jackets', ['OUTER_TOP']],
    ['hoodies', ['MID_TOP', 'OUTER_TOP']],
    ['sweaters', ['MID_TOP']],
    ['pants', ['BOTTOM']], ['shorts', ['BOTTOM']], ['jeans', ['BOTTOM']], ['skirts', ['BOTTOM']],
    ['dresses', ['FULL_BODY']],
    ['shoes', ['FOOTWEAR']], ['boots', ['FOOTWEAR']], ['sneakers', ['FOOTWEAR']], ['sandals', ['FOOTWEAR']],
    ['hats', ['ACCESSORY']], ['glasses', ['ACCESSORY']], ['scarves', ['ACCESSORY']], ['bags', ['ACCESSORY']],
    ['belts', ['ACCESSORY']], ['jewelry', ['ACCESSORY']], ['gloves', ['ACCESSORY']], ['socks', ['ACCESSORY']],
    ['other', []],
  ]);
  for (const [category, roles] of expected) {
    assert.deepEqual(allowedLayerRolesForCategory(category), roles, `${category} UI role projection`);
  }
  for (const fragment of [
    "tshirts: roles('BASE_TOP')",
    "shirts: roles('BASE_TOP','MID_TOP')",
    "jackets: roles('OUTER_TOP')",
    "hoodies: roles('MID_TOP','OUTER_TOP')",
    "sweaters: roles('MID_TOP')",
    "pants: roles('BOTTOM'), shorts: roles('BOTTOM'), jeans: roles('BOTTOM'), skirts: roles('BOTTOM')",
    "dresses: roles('FULL_BODY')",
    "shoes: roles('FOOTWEAR'), boots: roles('FOOTWEAR'), sneakers: roles('FOOTWEAR'), sandals: roles('FOOTWEAR')",
    "belts: roles('ACCESSORY'), jewelry: roles('ACCESSORY'), gloves: roles('ACCESSORY'), socks: roles('ACCESSORY')",
    'other: roles()',
  ]) assert.ok(server.includes(fragment), `server role admission drifted: ${fragment}`);
});

test('lost or conflicted mutation outcomes reconcile by read only and never retry the mutation', () => {
  assert.match(panel, /catch \(cause\) \{\s*await reconcileQuietly\(\);[\s\S]*Creation result was not confirmed/);
  assert.match(panel, /const mutateSelected[\s\S]*catch \(cause\) \{\s*await reconcileQuietly\(\);/);
  assert.match(panel, /never retried automatically/);
  assert.equal((model.match(/outfits\.create\(/g) ?? []).length, 1, 'create must have one dispatch site');
  assert.equal((model.match(/outfits\.addEntry\(/g) ?? []).length, 1, 'addEntry must have one dispatch site');
  assert.equal((model.match(/outfits\.removeEntry\(/g) ?? []).length, 1, 'removeEntry must have one dispatch site');
  assert.equal((model.match(/outfits\.reorderEntries\(/g) ?? []).length, 1, 'reorder must have one dispatch site');
});

test('Wardrobe projection is display-only and duplicate/unsupported garment choices are blocked in UX', () => {
  assert.match(model, /wardrobeError/);
  assert.match(panel, /Outfit references remain canonical/);
  assert.match(panel, /Unavailable garment reference/);
  assert.match(panel, /!selectedGarmentIds\.has\(item\.garmentId\)/);
  assert.match(panel, /addAllowedRoles\.length === 0/);
  assert.match(panel, /Update its Wardrobe category before adding it/);
});

test('metadata editing is canonical, revision-bound and unavailable for archived Outfits', () => {
  for (const marker of ['Outfit name', 'Outfit style', 'Outfit season', 'Outfit occasion', 'Save metadata']) assert.ok(panel.includes(marker));
  assert.match(panel, /model\.updateMetadata/);
  assert.match(panel, /selected\.status !== 'ACTIVE'/);
});
