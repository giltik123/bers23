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

test('uncertain or committed append recovery closes stale capture intent without auto-retrying', () => {
  assert.match(model, /GARMENT_VIEW_APPEND_OUTCOME_UNCERTAIN/);
  assert.match(model, /GARMENT_VIEW_APPENDED_RELOAD_PENDING/);
  assert.match(panel, /CanonicalWardrobeAppendOutcomeUncertainError/);
  assert.match(panel, /CanonicalWardrobeAppendReloadError/);
  assert.match(panel, /cause\?\.recoveredItem/);
  assert.match(panel, /reload\(\{ quiet: true \}\)/);
  assert.match(panel, /setCaptureItem\(null\)/);
  assert.doesNotMatch(model, /for\s*\([^)]*\)[\s\S]{0,300}garments\.appendView/);
});

test('ordinary validation errors remain dialog-local instead of being mislabeled as uncertain persistence', () => {
  const catchBody = panel.match(/catch \(cause\) \{([\s\S]*?)\n\s*\} finally \{\n\s*setBusyId\(''\);/);
  assert.ok(catchBody, 'append catch must remain structurally inspectable');
  assert.match(catchBody[1], /outcomeUncertain/);
  assert.match(catchBody[1], /committedReloadPending/);
  assert.match(catchBody[1], /if \(outcomeUncertain \|\| committedReloadPending\)/);
  assert.doesNotMatch(catchBody[1], /setCaptureItem\(null\)[\s\S]*else/);
  assert.match(dialog, /setError\(cause\?\.message/);
});
