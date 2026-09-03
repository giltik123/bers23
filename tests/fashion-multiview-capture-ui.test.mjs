import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const panel = fs.readFileSync(new URL('../src/components/editor/fashion/FashionPanel.jsx', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('../src/components/editor/fashion/GarmentCaptureDialog.jsx', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../src/application/fashion/canonicalWardrobeViewModel.js', import.meta.url), 'utf8');

test('Fashion mounts guided multi-view capture over the accepted Wardrobe view model', () => {
  assert.match(panel, /GarmentCaptureDialog/);
  assert.match(panel, /wardrobe\.appendView/);
  assert.match(model, /garments\.appendView/);
  assert.match(dialog, /nextCaptureRequests/);
  assert.match(dialog, /LOW_RESOLUTION_CARDINAL_VIEW/);
});

test('additional capture offers only concrete Managed Garment view kinds', () => {
  for (const kind of ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'DETAIL']) assert.match(dialog, new RegExp(`'${kind}'`));
  assert.equal(dialog.includes("'UNSPECIFIED'"), false);
  assert.match(dialog, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(dialog, /URL\.createObjectURL/);
  assert.match(dialog, /URL\.revokeObjectURL/);
});

test('active multi-view path cannot revive generic upload or legacy Fashion authority', () => {
  const active = `${panel}\n${dialog}\n${model}`;
  for (const forbidden of [
    'Core.UploadFile',
    'coreClient.entities',
    'garmentManager',
    'wardrobeManager',
    'original_image_url',
    '/assets',
  ]) {
    assert.equal(active.includes(forbidden), false, `multi-view path must not contain ${forbidden}`);
  }
});

test('ambiguous append recovery refreshes state and closes stale capture intent instead of auto-retrying', () => {
  assert.match(panel, /reload\(\{ quiet: true \}\)/);
  assert.match(panel, /setCaptureItem\(null\)/);
  assert.doesNotMatch(model, /for\s*\([^)]*\)[\s\S]{0,300}garments\.appendView/);
});
