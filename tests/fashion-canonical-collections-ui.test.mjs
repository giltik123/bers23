import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const panel = fs.readFileSync(new URL('../src/components/editor/fashion/FashionPanel.jsx', import.meta.url), 'utf8');
const collections = fs.readFileSync(new URL('../src/components/editor/fashion/CanonicalCollectionsView.jsx', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../src/application/fashion/canonicalCollectionViewModel.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api/managedGarmentCollectionClient.js', import.meta.url), 'utf8');
const englishLocale = fs.readFileSync(new URL('../src/lib/i18n/locales/en/index.js', import.meta.url), 'utf8');
const russianLocale = fs.readFileSync(new URL('../src/lib/i18n/locales/ru/index.js', import.meta.url), 'utf8');

const COLLECTION_COPY_KEYS = Object.freeze([
  'collectionsPanelLabel','collections','reloadCollections','newCollection','noCollections','collectionLoadFailed',
  'collectionCreateUnconfirmed','collectionCreateUnconfirmedNoRefresh','collectionMutationUnconfirmed',
  'collectionMutationUnconfirmedNoRefresh','deleteCollection','confirmDeleteCollection','garmentToAddToCollection',
  'collectionEmpty','moveGarmentToCollection','moveToCollection','removeGarmentFromCollection','unavailableGarmentReference',
]);

function parseFashionUi(source) {
  const match = source.match(/fashionUi:\s*(\{[\s\S]*?\n\}),\n  assetUi:/);
  assert.ok(match, 'fashionUi locale catalog exists');
  return JSON.parse(match[1]);
}

test('Fashion mounts canonical collections over the narrow product client', () => {
  assert.match(panel, /CanonicalCollectionsView/);
  assert.match(collections, /coreClient\.fashion\.collections/);
  assert.match(collections, /createCanonicalCollectionViewModel/);
  assert.match(model, /collections\.moveGarment/);
  assert.match(client, /expectedSourceRevision/);
  assert.match(client, /expectedTargetRevision/);
});

test('canonical Collections UI localizes controls and recovery states in English and Russian', () => {
  assert.match(collections, /useTranslation/);
  const english = parseFashionUi(englishLocale);
  const russian = parseFashionUi(russianLocale);
  for (const key of COLLECTION_COPY_KEYS) {
    assert.equal(typeof english[key], 'string', 'English fashionUi.' + key);
    assert.equal(typeof russian[key], 'string', 'Russian fashionUi.' + key);
    assert.ok(english[key].trim().length > 0, 'English fashionUi.' + key + ' is non-empty');
    assert.ok(russian[key].trim().length > 0, 'Russian fashionUi.' + key + ' is non-empty');
    assert.ok(collections.includes(key), 'Collections UI references ' + key);
  }
  assert.doesNotMatch(collections, /cause\?\.message/);
});

test('active Collections surface cannot use legacy browser-owned membership authority', () => {
  const active = `${panel}\n${collections}\n${model}`;
  for (const forbidden of [
    'garmentCollections',
    'wardrobeManager',
    'garmentManager',
    'coreClient.entities',
    'Core.UploadFile',
    'original_image_url',
  ]) {
    assert.equal(active.includes(forbidden), false, `active Collections surface must not contain ${forbidden}`);
  }
  assert.doesNotMatch(active, /removeGarment[\s\S]{0,240}addGarment[\s\S]{0,240}move/i);
});

test('unavailable membership references are display-only rather than silently deleted', () => {
  assert.match(collections, /fashionUi\.unavailableGarmentReference/);
  assert.doesNotMatch(collections, /model\.removeGarment\([^)]*garment\?\.id/);
});

test('ambiguous collection create refreshes canonical state and never automatically retries create', () => {
  const createBlock = collections.match(/const create = async \(event\) => \{([\s\S]*?)\n  \};/);
  assert.ok(createBlock, 'create handler must remain explicit');
  assert.match(createBlock[1], /await model\.create/);
  assert.match(createBlock[1], /await reconcileQuietly\(\)/);
  assert.match(createBlock[1], /setErrorKey\(reconciled \? 'collectionCreateUnconfirmed' : 'collectionCreateUnconfirmedNoRefresh'\)/);
  assert.doesNotMatch(collections, /cause\?\.message/);
  assert.match(collections, /return true;[\s\S]*return false;/);
  assert.equal((createBlock[1].match(/model\.create/g) || []).length, 1, 'create handler must issue at most one create side effect');
});
