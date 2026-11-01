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

test('wardrobe writes require a freshly confirmed catalog, including dialog callbacks', () => {
  assert.match(panel, /const \[fresh, setFresh\] = useState\(false\)/);
  assert.match(panel, /const canMutate = fresh && !loading/);
  assert.match(panel, /setFresh\(false\);[\s\S]*?wardrobe\.load\(\)/);
  assert.match(panel, /ticket === catalogRequestRef\.current/);
  assert.match(panel, /if \(!canMutate\) throw new Error\('Reload wardrobe before creating a garment/);
  assert.match(panel, /if \(!canMutate\) throw new Error\('Reload wardrobe before adding a garment view/);
  assert.match(panel, /if \(!canMutate\) return;/);
  assert.match(panel, /<CanonicalCollectionsView garments=\{items\} disabled=\{!canMutate\}/);
  assert.match(panel, /busy=\{!canMutate \|\| busyId === item\.id\}/);
});

test('collection writes are disabled after failed refresh and recover only on a confirmed reload', () => {
  assert.match(collections, /const \[fresh, setFresh\] = useState\(false\)/);
  assert.match(collections, /const canMutate = fresh && !disabled && !busy/);
  assert.match(collections, /const reload = useCallback\(async \(\) => \{[\s\S]*?setFresh\(false\);[\s\S]*?await model\.load\(\)/);
  assert.match(collections, /const reconcileQuietly = useCallback\(async \(\) => \{[\s\S]*?setFresh\(false\)/);
  assert.match(collections, /ticket === requestRef\.current/);
  assert.match(collections, /if \(!newName\.trim\(\) \|\| !canMutate\) return/);
  assert.match(collections, /if \(!selected \|\| !canMutate\) return false/);
  assert.match(collections, /if \(!selected \|\| !canMutate\) return/);
  assert.match(collections, /if \(!selected \|\| !targetId \|\| !canMutate\) return/);
  assert.match(collections, /disabled=\{!canMutate \|\| availableToAdd\.length === 0\}/);
});
