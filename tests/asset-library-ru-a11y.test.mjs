import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const ASSET_KEYS = [
  'projectType', 'canonicalArtifactTag', 'selectAsset', 'tags', 'related',
  'addToCollection', 'usageHistory', 'usageCount', 'noUsage',
  'addFavorite', 'removeFavorite',
];

test('Asset Library favorite is a separate keyboard-accessible button', async () => {
  const card = await read('src/components/assets/AssetCard.jsx');
  assert.match(card, /useTranslation/);
  const selection = card.match(/<button type="button" onClick=\{\(\) => onSelect\(asset\)\}[\s\S]*?<\/button>/);
  assert.ok(selection, 'asset selection must be a real button');
  assert.doesNotMatch(selection[0].slice(selection[0].indexOf('>') + 1), /<button\b|role="button"/, 'no nested interactive controls');
  assert.match(card.slice(card.indexOf(selection[0]) + selection[0].length), /<button[\s\S]*?onClick=\{\(\) => onFavorite\(asset\)\}/);
  assert.match(card, /aria-label=\{t\(asset\.favorite \? 'assetUi\.removeFavorite' : 'assetUi\.addFavorite'/);
  assert.match(card, /aria-pressed=\{Boolean\(selected\)\}/);
  assert.match(card, /aria-pressed=\{Boolean\(asset\.favorite\)\}/);
  assert.match(card, /disabled=\{!onFavorite\}/);
  assert.match(card, /onFavorite\?\.\(asset\)/);
  assert.doesNotMatch(card, /<span role="button"/);
});

test('Asset Library details localize UI labels without rewriting user-provided names', async () => {
  const details = await read('src/components/assets/AssetDetails.jsx');
  for (const key of ['selectAsset', 'tags', 'related', 'addToCollection', 'usageHistory', 'usageCount', 'noUsage']) {
    assert.ok(details.includes("t('assetUi." + key + "'"), 'missing localized label ' + key);
  }
  assert.match(details, /\{asset\.name\}/);
  assert.match(details, /\{relation\.label\}/);
  assert.match(details, /return tag;/, 'unknown/user-supplied tags must remain unchanged');
  assert.doesNotMatch(details, />Select an asset to view details\.|>Usage history<|>No recorded usage yet</);
});

test('Asset Library RU and EN keys agree and preserve dynamic placeholders', async () => {
  const [en, ru] = await Promise.all([
    read('src/lib/i18n/locales/en/index.js'),
    read('src/lib/i18n/locales/ru/index.js'),
  ]);
  for (const [locale, source] of [['en', en], ['ru', ru]]) {
    const assetBlock = source.slice(source.lastIndexOf('  assetUi: {'));
    assert.ok(assetBlock.startsWith('  assetUi: {'), locale + ' assetUi missing');
    for (const key of ASSET_KEYS) {
      const match = assetBlock.match(new RegExp('"' + key + '":\\s*"([^"]+)"'));
      assert.ok(match, locale + ' missing assetUi.' + key);
      const expected = key === 'usageCount' ? ['count'] : ['addFavorite', 'removeFavorite'].includes(key) ? ['name'] : [];
      for (const param of expected) assert.ok(match[1].includes('{' + param + '}'), locale + ' missing placeholder ' + key + '.' + param);
    }
  }
});
