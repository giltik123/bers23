import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createLatestAssetLoadGate,
  projectAsset,
  projectConfirmedFavorite,
  selectionAfterFavorite,
} from '../src/application/assets/projectAssetIndex.js';

const project = (id, artifact, favorite = false) => ({
  id, current_image_artifact_id: artifact, current_image_url: `/api/core/artifacts/${artifact}`,
  name: `Project ${id}`, favorite,
});

test('Asset Library projects canonical current FINAL identity without inventing an asset authority', () => {
  const asset = projectAsset(project('A', 'final-1'));
  assert.equal(asset.id, 'project:A:final-1');
  assert.equal(asset.canonical_artifact_id, 'final-1');
  assert.equal(asset.project_id, 'A');
  assert.equal(asset.favorite, false);
  assert.ok(Object.isFrozen(asset));
});

test('favorite reconciliation refuses wrong Project or missing canonical Artifact', () => {
  const requested = projectAsset(project('A', 'final-1'));
  assert.throws(() => projectConfirmedFavorite(requested, project('B', 'final-2', true)), /does not match/);
  assert.throws(() => projectConfirmedFavorite(requested, project('A', '', true)), /no current canonical Artifact/);
  const confirmed = projectConfirmedFavorite(requested, project('A', 'final-2', true));
  assert.equal(confirmed.id, 'project:A:final-2');
  assert.equal(confirmed.favorite, true);
});

test('late favorite response never steals a newer Asset selection', () => {
  assert.equal(selectionAfterFavorite('project:B:final-9', 'project:A:final-1', 'project:A:final-2'), 'project:B:final-9');
  assert.equal(selectionAfterFavorite('project:A:final-1', 'project:A:final-1', 'project:A:final-2'), 'project:A:final-2');
  assert.equal(selectionAfterFavorite(null, 'project:A:final-1', 'project:A:final-2'), null);
});

test('latest-load gate rejects stale success, stale errors and unmounted completions', () => {
  const gate = createLatestAssetLoadGate();
  const first = gate.start();
  const second = gate.start();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
});

test('Asset Library wires confirmed Core mutations, serialized favorite requests and latest-only loads', async () => {
  const source = await readFile('src/pages/AssetLibrary.jsx', 'utf8');
  assert.match(source, /favoriteInFlight\.current = true/);
  assert.match(source, /if \(favoriteInFlight\.current \|\| loading \|\| error\) return/);
  assert.match(source, /projectConfirmedFavorite\(asset, project\)/);
  assert.match(source, /setSelectedId\(\(current\) => selectionAfterFavorite\(current, asset\.id, updated\.id\)\)/);
  assert.match(source, /loadGate\.current\.isCurrent\(requestId\)/);
  assert.match(source, /loadGate\.current\.invalidate\(\)/);
  assert.match(source, /await load\(\)/);
});


test('Asset Library presents allowlisted localized errors instead of raw backend messages', async () => {
  const [source, english, russian] = await Promise.all([
    readFile('src/pages/AssetLibrary.jsx', 'utf8'),
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  assert.doesNotMatch(source, /setError\(loadError\?\.message/);
  assert.doesNotMatch(source, /setActionError\(updateError\?\.message/);
  assert.match(source, /setActionError\(t\('assetUi\.favoriteFailed'\)\)/);
  assert.match(english, /favoriteFailed": "Unable to update the asset favorite\."/);
  assert.match(russian, /favoriteFailed": "Не удалось обновить избранное для материала\."/);
});
