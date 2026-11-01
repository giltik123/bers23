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
const englishLocale = fs.readFileSync(new URL('../src/lib/i18n/locales/en/index.js', import.meta.url), 'utf8');
const russianLocale = fs.readFileSync(new URL('../src/lib/i18n/locales/ru/index.js', import.meta.url), 'utf8');

const OUTFIT_COPY_KEYS = Object.freeze([
  'outfitPanelLabel','outfits','reloadManagedOutfits','outfitAuthorityNotice','newOutfit','outfitLoading','outfitEmpty',
  'wardrobeLabelsUnavailable','outfitLoadFailed','outfitCreateUnconfirmed','outfitCreateUnconfirmedNoRefresh',
  'outfitMutationUnconfirmed','outfitMutationUnconfirmedNoRefresh','outfitReadinessLabel','outfitName','outfitStyle',
  'outfitSeason','outfitOccasion','saveOutfitMetadata','garmentToAdd','layerRoleForNewGarment','autoRole',
  'unsupportedOutfitLayerRole','emptyOutfitEntries','unavailableGarmentReference','review','layerRoleFor',
  'moveGarmentUp','moveGarmentDown','removeGarmentFromOutfit',
]);
const OUTFIT_TAXONOMIES = Object.freeze({
  outfitStyles: OUTFIT_STYLES,
  outfitSeasons: OUTFIT_SEASONS,
  outfitOccasions: OUTFIT_OCCASIONS,
  outfitLayerRoles: OUTFIT_LAYER_ROLES,
  outfitReadiness: ['REFERENCES_READY','EMPTY','GARMENT_UNAVAILABLE','ROLE_REVIEW_REQUIRED'],
  garmentCategories: ['tshirts','shirts','jackets','hoodies','sweaters','pants','shorts','jeans','skirts','dresses','shoes','boots','sneakers','sandals','hats','glasses','scarves','bags','belts','jewelry','gloves','socks','other'],
});

function parseFashionUi(source) {
  const match = source.match(/fashionUi:\s*(\{[\s\S]*?\n\}),\n  assetUi:/);
  assert.ok(match, 'fashionUi locale catalog exists');
  return JSON.parse(match[1]);
}

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

test('canonical Outfit panel localizes controls, readiness and taxonomies in English and Russian', () => {
  assert.match(panel, /useTranslation/);
  const english = parseFashionUi(englishLocale);
  const russian = parseFashionUi(russianLocale);
  for (const key of OUTFIT_COPY_KEYS) {
    assert.equal(typeof english[key], 'string', 'English fashionUi.' + key);
    assert.equal(typeof russian[key], 'string', 'Russian fashionUi.' + key);
    assert.ok(english[key].trim().length > 0, 'English fashionUi.' + key + ' is non-empty');
    assert.ok(russian[key].trim().length > 0, 'Russian fashionUi.' + key + ' is non-empty');
    assert.ok(panel.includes(key), 'OutfitPanel references ' + key);
  }
  for (const [group, values] of Object.entries(OUTFIT_TAXONOMIES)) {
    assert.ok(panel.includes("'" + group + "'"), 'OutfitPanel localizes ' + group);
    for (const value of values) {
      const key = value.toLowerCase();
      assert.equal(typeof english[group]?.[key], 'string', 'English fashionUi.' + group + '.' + key);
      assert.equal(typeof russian[group]?.[key], 'string', 'Russian fashionUi.' + group + '.' + key);
      assert.ok(english[group][key].trim().length > 0, 'English fashionUi.' + group + '.' + key + ' is non-empty');
      assert.ok(russian[group][key].trim().length > 0, 'Russian fashionUi.' + group + '.' + key + ' is non-empty');
    }
  }
  assert.match(panel, /localizedEnum\(t, 'outfitReadiness'/);
  assert.match(panel, /localizedEnum\(t, 'garmentCategories'/);
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
  assert.match(panel, /const reconcileQuietly = useCallback\(async \(\) => \{[\s\S]*return true;[\s\S]*return false;/);
  assert.match(panel, /setErrorKey\(reconciled \? 'outfitCreateUnconfirmed' : 'outfitCreateUnconfirmedNoRefresh'\)/);
  assert.match(panel, /setErrorKey\(reconciled \? 'outfitMutationUnconfirmed' : 'outfitMutationUnconfirmedNoRefresh'\)/);
  assert.doesNotMatch(panel, /cause\?\.message/);
  assert.match(panel, /fashionUi\.outfitAuthorityNotice/);
  assert.equal((model.match(/outfits\.create\(/g) ?? []).length, 1, 'create must have one dispatch site');
  assert.equal((model.match(/outfits\.addEntry\(/g) ?? []).length, 1, 'addEntry must have one dispatch site');
  assert.equal((model.match(/outfits\.removeEntry\(/g) ?? []).length, 1, 'removeEntry must have one dispatch site');
  assert.equal((model.match(/outfits\.reorderEntries\(/g) ?? []).length, 1, 'reorder must have one dispatch site');
});

test('Wardrobe projection is display-only and duplicate/unsupported garment choices are blocked in UX', () => {
  assert.match(model, /wardrobeError/);
  assert.match(panel, /fashionUi\.wardrobeLabelsUnavailable/);
  assert.match(panel, /fashionUi\.unavailableGarmentReference/);
  assert.match(panel, /!selectedGarmentIds\.has\(item\.garmentId\)/);
  assert.match(panel, /addAllowedRoles\.length === 0/);
  assert.match(panel, /fashionUi\.unsupportedOutfitLayerRole/);
});

test('metadata editing is canonical, revision-bound and unavailable for archived Outfits', () => {
  for (const marker of ['outfitName', 'outfitStyle', 'outfitSeason', 'outfitOccasion', 'saveOutfitMetadata']) assert.ok(panel.includes('fashionUi.' + marker));
  assert.match(panel, /model\.updateMetadata/);
  assert.match(panel, /selected\.status !== 'ACTIVE'/);
});
