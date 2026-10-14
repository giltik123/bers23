import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  LOCAL_DEVICE_DRAFT_KEY, hasLocalDeviceDraft, saveLocalDeviceDraft,
  restoreLocalDeviceDraft, clearLocalDeviceDraft,
} from '../src/lib/local-editor/localDraftStorage.js';
import { createLocalRecipe } from '../src/lib/local-editor/localRecipe.js';
import { LOCAL_DEFAULTS } from '../src/lib/local-editor/localAdjustments.js';
import { LOCAL_ADVANCED_DEFAULTS, LOCAL_CURVE_DEFAULT } from '../src/lib/local-editor/localAdvanced.js';
import { centeredLocalAnnotation } from '../src/lib/local-editor/localAnnotations.js';

const pixels = new Uint8ClampedArray([44, 96, 148, 255, 20, 30, 40, 255]);
const original = {
  width: 2, height: 1,
  sha256: createHash('sha256').update(pixels).digest('hex'),
};
function storage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}
const note = centeredLocalAnnotation('text', {
  text: 'Local note', fontSize: 7, color: '#0f766e', thickness: 1, opacity: .8,
});
const advanced = {
  ...LOCAL_ADVANCED_DEFAULTS,
  curve: { ...LOCAL_CURVE_DEFAULT, midtones: 190 },
  cloneStrokes: [{
    source: { x: 0, y: 0 }, points: [{ x: 1, y: 0 }],
    radius: .05, hardness: 1, opacity: .5, blendMode: 'color-match',
  }],
};

test('browser draft is explicit, single-slot and restores ALL corrections, strokes and vector labels', () => {
  const fake = storage();
  assert.equal(hasLocalDeviceDraft(fake), false);
  assert.equal(fake.values.size, 0, 'no automatic persistence');
  const recipe = createLocalRecipe(original, { ...LOCAL_DEFAULTS, brightness: 40 }, advanced, [note]);
  assert.ok(saveLocalDeviceDraft(fake, recipe) > 0);
  assert.equal(hasLocalDeviceDraft(fake), true);
  assert.deepEqual([...fake.values.keys()], [LOCAL_DEVICE_DRAFT_KEY]);
  assert.deepEqual(restoreLocalDeviceDraft(fake, original), recipe);
  assert.equal(restoreLocalDeviceDraft(fake, original).edits.settings.brightness, 40);
  assert.equal(restoreLocalDeviceDraft(fake, original).edits.advanced.cloneStrokes[0].blendMode, 'color-match');
  assert.equal(restoreLocalDeviceDraft(fake, original).edits.annotations[0].text, 'Local note');
  const raw = fake.getItem(LOCAL_DEVICE_DRAFT_KEY);
  assert.ok(!raw.includes('data:image') && !raw.includes('https://') && !raw.includes('access_token'));
  assert.equal(raw.includes('Local note'), true, 'annotation text is explicitly stored in the browser; UI must warn');
});

test('saving new photo overwrites the previous single-slot draft; old image can no longer restore', () => {
  const fake = storage();
  const first = createLocalRecipe(original, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, []);
  const different = { ...original, sha256: 'b'.repeat(64) };
  const second = createLocalRecipe(different, { ...LOCAL_DEFAULTS, contrast: 30 }, LOCAL_ADVANCED_DEFAULTS, []);
  saveLocalDeviceDraft(fake, first);
  saveLocalDeviceDraft(fake, second);
  assert.equal(fake.values.size, 1);
  assert.throws(() => restoreLocalDeviceDraft(fake, original), /different original image/);
  assert.equal(restoreLocalDeviceDraft(fake, different).edits.settings.contrast, 30);
});

test('fingerprint mismatch, malformed saved JSON and unrecognized schema must never restore', () => {
  const fake = storage();
  const recipe = createLocalRecipe(original, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, []);
  saveLocalDeviceDraft(fake, recipe);
  assert.throws(() => restoreLocalDeviceDraft(fake, { ...original, sha256: 'c'.repeat(64) }), /different original image/);
  fake.setItem(LOCAL_DEVICE_DRAFT_KEY, '{"format":"evil"}');
  assert.throws(() => restoreLocalDeviceDraft(fake, original), /Unsupported|Invalid/);
  fake.setItem(LOCAL_DEVICE_DRAFT_KEY, '{broken');
  assert.throws(() => restoreLocalDeviceDraft(fake, original), /valid JSON/);
  assert.equal(hasLocalDeviceDraft(fake), true, 'corrupted draft is not silently deleted');
});

test('malformed recipe never writes and cannot downgrade the version or add an external origin', () => {
  const fake = storage();
  const valid = createLocalRecipe(original, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, []);
  for (const invalid of [
    { ...valid, version: 42 },
    { ...valid, format: 'other-editor' },
    { ...valid, imageUrl: 'https://attacker.example/secret' },
    { ...valid, edits: { settings: LOCAL_DEFAULTS } },
    null,
  ]) {
    assert.throws(() => saveLocalDeviceDraft(fake, invalid), /Invalid|Unsupported|recipe/i);
    assert.equal(fake.values.size, 0);
  }
});

test('private browsing, quota and blocked localStorage raise a useful error without unsafe fallback', () => {
  const valid = createLocalRecipe(original, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, []);
  assert.throws(() => hasLocalDeviceDraft(null), /not available/);
  assert.throws(() => restoreLocalDeviceDraft(null, original), /not available/);
  const denied = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.throws(() => saveLocalDeviceDraft(denied, valid), /full or disabled/);
  assert.throws(() => restoreLocalDeviceDraft(denied, original), /unavailable/);
  assert.throws(() => clearLocalDeviceDraft(denied), /would not clear/);
});

test('deleting a draft affects only the one BERS key, not other local browser data', () => {
  const fake = storage();
  fake.setItem('other-provider', 'untouched');
  saveLocalDeviceDraft(fake, createLocalRecipe(original, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, []));
  assert.equal(hasLocalDeviceDraft(fake), true);
  clearLocalDeviceDraft(fake);
  assert.equal(hasLocalDeviceDraft(fake), false);
  assert.equal(fake.getItem('other-provider'), 'untouched');
  assert.throws(() => restoreLocalDeviceDraft(fake, original), /No local edit draft/);
});
