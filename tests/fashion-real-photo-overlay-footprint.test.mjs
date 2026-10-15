import assert from 'node:assert/strict';
import test from 'node:test';
import { maskAndCheckTorso } from '../scripts/fashion-real-photo-overlay-footprint.mjs';

function rgba(width, height, changedPixels = []) {
  const pixels = new Uint8Array(width * height * 4);
  for (const [x, y] of changedPixels) pixels[(y * width + x) * 4] = 255;
  return pixels;
}

test('measures changed pixel fraction and rectangular extent without treating them as fit evidence', () => {
  const source = rgba(4, 3);
  const baseline = rgba(4, 3, [[0, 0], [1, 1], [2, 1]]);
  const result = maskAndCheckTorso(source, baseline, 4, 3, { left: 1, top: 0, right: 3, bottom: 2 });
  assert.equal(result.baselineChanged, 3);
  assert.equal(result.outsideTorso, 1);
  assert.deepEqual(Array.from(result.mask).filter(Boolean), [255, 255]);
  assert.deepEqual(result.overlayFootprint, {
    torsoPixels: 9,
    changedTorsoPixels: 2,
    changedTorsoFraction: 2 / 9,
    changedExtent: { left: 1, top: 1, right: 2, bottom: 1 },
    changedExtentWidthFraction: 2 / 3,
    changedExtentHeightFraction: 1 / 3,
  });
  assert.deepEqual(source, rgba(4, 3));
  assert.deepEqual(baseline, rgba(4, 3, [[0, 0], [1, 1], [2, 1]]));
});

test('unchanged source gets zero extent; full-rectangle edit gets full coverage', () => {
  const source = rgba(2, 2);
  const bounds = { left: 0, top: 0, right: 1, bottom: 1 };
  const none = maskAndCheckTorso(source, source, 2, 2, bounds);
  assert.equal(none.overlayFootprint.changedTorsoFraction, 0);
  assert.equal(none.overlayFootprint.changedExtent, null);
  assert.equal(none.overlayFootprint.changedExtentWidthFraction, 0);
  assert.equal(none.overlayFootprint.changedExtentHeightFraction, 0);
  const all = maskAndCheckTorso(source, rgba(2, 2, [[0, 0], [1, 0], [0, 1], [1, 1]]), 2, 2, bounds);
  assert.equal(all.overlayFootprint.changedTorsoFraction, 1);
  assert.equal(all.overlayFootprint.changedExtentWidthFraction, 1);
  assert.equal(all.overlayFootprint.changedExtentHeightFraction, 1);
});

test('invalid geometry, byte types, image lengths and torso coordinates fail closed', () => {
  const source = rgba(2, 2);
  const bounds = { left: 0, top: 0, right: 1, bottom: 1 };
  assert.throws(() => maskAndCheckTorso(source, source, 0, 2, bounds), /image geometry/);
  assert.throws(() => maskAndCheckTorso(source, source, 5000, 5000, bounds), /image geometry/);
  assert.throws(() => maskAndCheckTorso(source, new Uint8Array(3), 2, 2, bounds), /RGBA8/);
  assert.throws(() => maskAndCheckTorso([...source], source, 2, 2, bounds), /RGBA8/);
  assert.throws(() => maskAndCheckTorso(source, source, 2, 2, { ...bounds, right: 2 }), /torso rectangle/);
  assert.throws(() => maskAndCheckTorso(source, source, 2, 2, { ...bounds, left: 1, right: 0 }), /torso rectangle/);
  assert.throws(() => maskAndCheckTorso(source, source, 2, 2, { ...bounds, top: NaN }), /torso rectangle/);
});
