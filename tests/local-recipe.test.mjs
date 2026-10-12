import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import {
  LOCAL_RECIPE_FORMAT, LOCAL_RECIPE_VERSION, MAX_LOCAL_RECIPE_BYTES,
  createLocalRecipe, parseLocalRecipe, fingerprintOriginalRgba,
} from '../src/lib/local-editor/localRecipe.js';
import { LOCAL_DEFAULTS } from '../src/lib/local-editor/localAdjustments.js';
import { LOCAL_ADVANCED_DEFAULTS, LOCAL_CURVE_DEFAULT } from '../src/lib/local-editor/localAdvanced.js';
import { centeredLocalAnnotation, applyLocalOpaqueCovers } from '../src/lib/local-editor/localAnnotations.js';

const pixels = new Uint8ClampedArray([44, 96, 148, 255, 100, 10, 200, 128]);
const image = { width: 2, height: 1, sha256: createHash('sha256').update(pixels).digest('hex') };
const vector = centeredLocalAnnotation('text', {
  color: '#ef4444', thickness: 1, opacity: 1, text: 'Review this area', fontSize: 7,
});
const advanced = {
  ...LOCAL_ADVANCED_DEFAULTS,
  curve: { ...LOCAL_CURVE_DEFAULT, midtones: 180 },
  channelCurves: { red: { ...LOCAL_CURVE_DEFAULT, shadows: 80 } },
  hsl: { blue: { hue: 12, saturation: -30, lightness: 10 } },
  gradient: { mode: 'left-right', start: 10, end: 90 },
  cloneStrokes: [{
    source: { x: 0, y: 0 }, points: [{ x: 1, y: 0 }],
    radius: .05, hardness: .8, opacity: .7, blendMode: 'color-match',
  }],
};

test('full-original RGBA SHA-256 is deterministic and changes with one source byte', async () => {
  const actual = await fingerprintOriginalRgba(pixels, 2, 1, webcrypto.subtle);
  assert.equal(actual, image.sha256);
  const changed = new Uint8ClampedArray(pixels);
  changed[7] ^= 1;
  assert.notEqual(await fingerprintOriginalRgba(changed, 2, 1, webcrypto.subtle), image.sha256);
});

test('recipe round trips all base, curves, selective color, gradient, stamped strokes and vectors', () => {
  const original = createLocalRecipe(image, { ...LOCAL_DEFAULTS, brightness: 40 }, advanced, [vector]);
  assert.equal(original.format, LOCAL_RECIPE_FORMAT);
  assert.equal(original.version, LOCAL_RECIPE_VERSION);
  const json = JSON.stringify(original);
  const imported = parseLocalRecipe(json, image);
  assert.deepEqual(imported, original);
  assert.equal(imported.edits.settings.brightness, 40);
  assert.equal(imported.edits.advanced.cloneStrokes[0].blendMode, 'color-match');
  assert.equal(imported.edits.annotations[0].text, 'Review this area');
  assert.ok(!json.includes('data:image') && !json.includes('access_token'), 'recipe contains metadata, not source pixels or credentials');
  assert.ok(!Object.hasOwn(original, 'imageUrl'));
});

test('recipe parser refuses same-size DIFFERENT pixel fingerprints without allowing silent reuse', () => {
  const recipe = JSON.stringify(createLocalRecipe(image, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, []));
  assert.throws(() => parseLocalRecipe(recipe, { ...image, sha256: 'b'.repeat(64) }), /different original image/);
  assert.throws(() => parseLocalRecipe(recipe, { ...image, width: 3 }), /different original image/);
  assert.throws(() => parseLocalRecipe(recipe, { ...image, height: 2 }), /different original image/);
});

test('recipe is explicit JSON, bounded to 2MB, rejects extra fields, unknown versions and partial edits', () => {
  const good = createLocalRecipe(image, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, []);
  for (const document of [
    '{}', 'null', '[]', '{oops}', '',
    JSON.stringify({ ...good, format: 'unknown' }),
    JSON.stringify({ ...good, version: 2 }),
    JSON.stringify({ ...good, unrelated: 'malicious' }),
    JSON.stringify({ ...good, source: { ...good.source, url: 'https://evil.example' } }),
    JSON.stringify({ ...good, edits: { settings: LOCAL_DEFAULTS } }),
    JSON.stringify({ ...good, edits: { ...good.edits, script: 'ignored?' } }),
  ]) assert.throws(() => parseLocalRecipe(document, image), /Invalid|Unsupported|valid JSON|Incomplete|nonempty|at most/);
  assert.throws(() => parseLocalRecipe(' '.repeat(MAX_LOCAL_RECIPE_BYTES + 1), image), /at most 2 MB/);
});

test('normalize when constructing refuses invalid sliders, semantic AI operations, alpha abuse and untrusted vectors', () => {
  assert.throws(() => createLocalRecipe(image, { ...LOCAL_DEFAULTS, brightness: Infinity }, advanced, []), /Invalid/);
  assert.throws(() => createLocalRecipe(image, { ...LOCAL_DEFAULTS, provider: 'fal' }, advanced, []), /Unsupported/);
  assert.throws(() => createLocalRecipe(image, LOCAL_DEFAULTS, { ...advanced, aiFill: true }, []), /Unsupported/);
  assert.throws(() => createLocalRecipe(image, LOCAL_DEFAULTS, advanced, [{ ...vector, color: 'url(javascript:1)' }]), /Invalid/);
  assert.throws(() => createLocalRecipe({ ...image, sha256: 'xx' }, LOCAL_DEFAULTS, advanced, []), /Invalid/);
});

test('rejects mismatched source RGBA buffer, huge raster and missing trusted browser digest', async () => {
  await assert.rejects(() => fingerprintOriginalRgba(pixels, 1, 1, webcrypto.subtle), /full-size RGBA8/);
  await assert.rejects(() => fingerprintOriginalRgba(pixels, 0, 1, webcrypto.subtle), /geometry/);
  await assert.rejects(() => fingerprintOriginalRgba(pixels, 12_000_001, 1, webcrypto.subtle), /geometry/);
  await assert.rejects(() => fingerprintOriginalRgba(pixels, 2, 1, null), /SHA-256 is unavailable/);
  assert.throws(() => createLocalRecipe({ ...image, width: NaN }, LOCAL_DEFAULTS, advanced, []), /geometry/);
});

test('recipe parsing returns fresh immutable state with no effect on input objects', () => {
  const source = JSON.stringify(createLocalRecipe(image, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, [vector]));
  const imported = parseLocalRecipe(source, image);
  assert.ok(Object.isFrozen(imported));
  assert.ok(Object.isFrozen(imported.edits.settings));
  assert.ok(Object.isFrozen(imported.edits.advanced));
  assert.ok(Object.isFrozen(imported.edits.annotations));
  assert.equal(imported.edits.annotations[0].text, 'Review this area');
});


test('portable recipe restores an opaque privacy cover without exposing any original RGBA bytes', () => {
  const cover = centeredLocalAnnotation('redact', {
    color: '#ffffff', opacity: .4, thickness: 4,
  });
  const exported = JSON.stringify(createLocalRecipe(image, LOCAL_DEFAULTS, LOCAL_ADVANCED_DEFAULTS, [cover]));
  const reloaded = parseLocalRecipe(exported, image);
  assert.equal(reloaded.edits.annotations.length, 1);
  assert.equal(reloaded.edits.annotations[0].type, 'redact');
  assert.equal(reloaded.edits.annotations[0].color, '#000000');
  assert.equal(reloaded.edits.annotations[0].opacity, 1);
  assert.equal(reloaded.edits.annotations[0].thickness, 1);
  const censored = applyLocalOpaqueCovers(pixels, 2, 1, reloaded.edits.annotations);
  assert.deepEqual([...censored], [0, 0, 0, 255, 0, 0, 0, 255]);
  assert.deepEqual([...pixels], [44, 96, 148, 255, 100, 10, 200, 128]);
  assert.ok(!exported.includes('data:image') && !exported.includes('access_token'));
});
