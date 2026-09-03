import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FASHION = 'src/components/editor/fashion/FashionPanel.jsx';
const ADD = 'src/components/editor/fashion/AddGarmentDialog.jsx';
const VIEW_MODEL = 'src/application/fashion/canonicalWardrobeViewModel.js';

test('FashionPanel mounts only canonical Managed Garment and Wardrobe browser authorities', async () => {
  const source = await readFile(FASHION, 'utf8');
  assert.match(source, /coreClient\.fashion\.garments/);
  assert.match(source, /coreClient\.fashion\.wardrobe/);
  assert.match(source, /createCanonicalWardrobeViewModel/);
  assert.match(source, /Canonical fashion wardrobe/);
  assert.match(source, /captureAssessment/);
  assert.match(source, /wardrobe\.setFavorite/);
  assert.match(source, /wardrobe\.archive/);
  assert.match(source, /wardrobe\.restore/);

  for (const forbidden of [
    'coreClient.entities', 'integrations.Core.UploadFile', 'garmentManager', 'wardrobeManager',
    'garmentCollections', 'outfitManager', 'FASHN', '/assets', 'image_url', 'original_image_url',
  ]) {
    assert.equal(source.includes(forbidden), false, `FashionPanel must not contain ${forbidden}`);
  }
});

test('AddGarmentDialog is a pure intent surface and cannot create a generic Asset or legacy Garment record', async () => {
  const source = await readFile(ADD, 'utf8');
  assert.match(source, /onCreate/);
  assert.match(source, /URL\.createObjectURL\(image\)/);
  assert.match(source, /image\/png,image\/jpeg,image\/webp/);
  assert.match(source, /name: form\.name/);
  assert.match(source, /category: form\.category/);
  assert.match(source, /season: form\.season/);
  assert.match(source, /material: form\.material/);
  assert.match(source, /viewKind: form\.viewKind/);
  assert.match(source, /tags: form\.tags/);

  for (const forbidden of [
    "from '@/api/coreClient'", 'garmentManager', 'wardrobeManager', 'Core.UploadFile',
    'coreClient.entities', '/assets', 'original_image_url', 'dominant_color:', 'brand:', 'size:', 'source:',
  ]) {
    assert.equal(source.includes(forbidden), false, `AddGarmentDialog must not contain writable legacy authority ${forbidden}`);
  }
});

test('view model reconciles F1/F2 snapshots fail-closed and never rolls back an ambiguous partial create', async () => {
  const source = await readFile(VIEW_MODEL, 'utf8');
  assert.match(source, /WARDROBE_SNAPSHOT_MISMATCH/);
  assert.match(source, /GARMENT_CREATED_METADATA_PENDING/);
  assert.match(source, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(source, /image\.revision !== metadata\.revision/);
  assert.match(source, /image\.name !== metadata\.name/);
  assert.match(source, /image\.status !== metadata\.status/);
  assert.match(source, /wardrobe\.updateMetadata\(created\.id, created\.revision, patch\)/);
  assert.match(source, /return reloadOne\(created\.id, metadata\)/);
  assert.doesNotMatch(source, /garments\.remove\(/);
  assert.doesNotMatch(source, /wardrobe\.remove\(/);
  assert.doesNotMatch(source, /coreClient|fetch\(|\/assets|provider|billing/i);
});
