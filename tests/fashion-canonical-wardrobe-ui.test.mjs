import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import enFashion from '../src/lib/i18n/locales/en/fashion.js';
import { modules as ruModules } from '../src/lib/i18n/locales/ru/index.js';
import { GARMENT_CATEGORIES } from '../src/lib/fashion/garmentCategories.js';

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


test('AddGarmentDialog localizes every supported category, season and initial view without changing canonical create intent', async () => {
  const source = await readFile(ADD, 'utf8');
  const en = enFashion.garmentDialog;
  const ru = ruModules.fashion.garmentDialog;
  const categoryIds = GARMENT_CATEGORIES.map((category) => category.id).sort();

  assert.deepEqual(Object.keys(en.categories).sort(), categoryIds);
  assert.deepEqual(Object.keys(ru.categories).sort(), categoryIds);
  assert.deepEqual(Object.keys(ru.viewKinds).sort(), Object.keys(en.viewKinds).sort());
  assert.deepEqual(Object.keys(ru.seasons).sort(), Object.keys(en.seasons).sort());
  assert.equal(Object.values(ru.categories).every((value) => typeof value === 'string' && value.length > 0), true);

  assert.match(source, /useTranslation/);
  assert.match(source, /fashion\.garmentDialog\.addTitle/);
  assert.ok(source.includes("fashion.garmentDialog.categories.' + category.id"));
  assert.ok(source.includes("fashion.garmentDialog.seasons.' + season"));
  assert.ok(source.includes("fashion.garmentDialog.viewKinds.' + key"));
  assert.match(source, /onCreate\(\{[\s\S]*name: form\.name[\s\S]*image,[\s\S]*viewKind: form\.viewKind[\s\S]*category: form\.category[\s\S]*season: form\.season[\s\S]*material: form\.material[\s\S]*tags:/);
  assert.match(source, /aria-label=\{t\('fashion\.garmentDialog\.selectPhoto'\)\}/);
});
