import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const panel = fs.readFileSync(new URL('../src/components/editor/fashion/FashionPanel.jsx', import.meta.url), 'utf8');
const collections = fs.readFileSync(new URL('../src/components/editor/fashion/CanonicalCollectionsView.jsx', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../src/application/fashion/canonicalCollectionViewModel.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api/managedGarmentCollectionClient.js', import.meta.url), 'utf8');

test('Fashion mounts canonical collections over the narrow product client', () => {
  assert.match(panel, /CanonicalCollectionsView/);
  assert.match(collections, /coreClient\.fashion\.collections/);
  assert.match(collections, /createCanonicalCollectionViewModel/);
  assert.match(model, /collections\.moveGarment/);
  assert.match(client, /expectedSourceRevision/);
  assert.match(client, /expectedTargetRevision/);
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
  assert.match(collections, /Unavailable garment reference/);
  assert.doesNotMatch(collections, /model\.removeGarment\([^)]*garment\?\.id/);
});

test('ambiguous collection create refreshes canonical state and never automatically retries create', () => {
  const createBlock = collections.match(/const create = async \(event\) => \{([\s\S]*?)\n  \};/);
  assert.ok(createBlock, 'create handler must remain explicit');
  assert.match(createBlock[1], /await model\.create/);
  assert.match(createBlock[1], /await reconcileQuietly\(\)/);
  assert.match(createBlock[1], /check the list before retrying/);
  assert.equal((createBlock[1].match(/model\.create/g) || []).length, 1, 'create handler must issue at most one create side effect');
});
