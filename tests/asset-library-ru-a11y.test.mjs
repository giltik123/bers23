import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import enAssets from '../src/lib/i18n/locales/en/assets.js';
import { modules as ruModules } from '../src/lib/i18n/locales/ru/index.js';
import { assetTagLabel, assetTypeLabel } from '../src/components/assets/assetPresentation.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const identity = (key) => key;

test('Asset Library detail labels have matching English and Russian coverage', () => {
  const required = [
    'selectToViewDetails', 'favorite', 'addFavorite', 'removeFavorite',
    'tagsHeading', 'relatedAssets', 'addToCollection', 'usageHistory',
    'recentInteractions', 'noUsage',
  ];
  for (const key of required) {
    assert.equal(typeof enAssets[key], 'string', `English assets.${key}`);
    assert.equal(typeof ruModules.assets[key], 'string', `Russian assets.${key}`);
  }
  for (const group of ['types', 'tags']) {
    assert.deepEqual(
      Object.keys(ruModules.assets[group]).sort(),
      Object.keys(enAssets[group]).sort(),
      `RU/EN assets.${group} key parity`,
    );
    for (const key of Object.keys(enAssets[group])) {
      assert.equal(typeof ruModules.assets[group][key], 'string');
    }
  }
});

test('only known system asset types and tags are translated', () => {
  assert.equal(assetTypeLabel('project', identity), 'assets.types.project');
  assert.equal(assetTypeLabel('canonical_custom_type', identity), 'canonical custom type');
  assert.equal(assetTagLabel('canonical artifact', identity), 'assets.tags.canonicalArtifact');
  assert.equal(assetTagLabel('  PROJECT  ', identity), 'assets.tags.project');
  assert.equal(assetTagLabel('designer supplied tag', identity), 'designer supplied tag');
});

test('AssetCard exposes independent native selection and favorite buttons', async () => {
  const source = await read('../src/components/assets/AssetCard.jsx');
  assert.equal((source.match(/<button\b/gu) || []).length, 2);
  assert.match(source, /aria-label=\{favoriteLabel\}/u);
  assert.match(source, /aria-pressed=\{Boolean\(asset\.favorite\)\}/u);
  assert.match(source, /aria-pressed=\{Boolean\(selected\)\}/u);
  assert.doesNotMatch(source, /role=["']button["']/u);
  assert.match(source, /onFavorite\?\.\(asset\)/u);
});

test('AssetDetails localizes interface copy but preserves user relation labels', async () => {
  const source = await read('../src/components/assets/AssetDetails.jsx');
  for (const key of [
    'selectToViewDetails', 'tagsHeading', 'relatedAssets',
    'addToCollection', 'usageHistory', 'recentInteractions', 'noUsage',
  ]) assert.ok(source.includes(`assets.${key}`), `missing assets.${key}`);
  assert.match(source, /assetTagLabel\(tag, t\)/u);
  assert.match(source, /\{relation\.label\}/u);
  assert.doesNotMatch(source, />Tags</u);
  assert.doesNotMatch(source, />Related assets</u);
  assert.doesNotMatch(source, />Usage history</u);
});
