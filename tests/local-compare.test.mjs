import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeLocalSplitPreview,
  splitComparisonColumn,
  normalizeSplitPosition,
} from '../src/lib/local-editor/localCompare.js';

const pixel = (...values) => new Uint8ClampedArray(values);

test('split comparison is byte-exact on the left and right for RGBA, including transparent pixels', () => {
  const original = pixel(
    1, 2, 3, 0,
    10, 20, 30, 64,
    40, 50, 60, 128,
    70, 80, 90, 255,
    100, 110, 120, 0,
    130, 140, 150, 255,
  );
  const edited = pixel(
    201, 202, 203, 255,
    210, 220, 230, 0,
    240, 250, 1, 32,
    2, 3, 4, 8,
    5, 6, 7, 123,
    8, 9, 10, 200,
  );
  const result = composeLocalSplitPreview(original, edited, 3, 2, 50);
  assert.deepEqual([...result], [
    ...original.slice(0, 8), ...edited.slice(8, 12),
    ...original.slice(12, 20), ...edited.slice(20, 24),
  ]);
  assert.deepEqual([...original.slice(0, 4)], [1, 2, 3, 0]);
  assert.deepEqual([...edited.slice(0, 4)], [201, 202, 203, 255]);
  assert.notStrictEqual(result, edited);
});

test('0 percent is entirely edited, 100 percent is entirely original, without aliasing', () => {
  const original = pixel(255, 0, 0, 255, 0, 0, 0, 0);
  const edited = pixel(0, 0, 255, 255, 200, 30, 50, 255);
  const allEdited = composeLocalSplitPreview(original, edited, 2, 1, 0);
  const allOriginal = composeLocalSplitPreview(original, edited, 2, 1, 100);
  assert.deepEqual([...allEdited], [...edited]);
  assert.deepEqual([...allOriginal], [...original]);
  assert.notStrictEqual(allEdited.buffer, edited.buffer);
  assert.notStrictEqual(allOriginal.buffer, original.buffer);
});

test('comparison column rounds once per row with exactly preserved source boundaries', () => {
  assert.equal(splitComparisonColumn(3, 50), 2);
  assert.equal(splitComparisonColumn(7, 25), 2);
  assert.equal(splitComparisonColumn(7, 0), 0);
  assert.equal(splitComparisonColumn(7, 100), 7);
  assert.equal(splitComparisonColumn(1100, 63), 693);
  assert.equal(normalizeSplitPosition(37), 37);
});

test('comparison handles single-pixel, tiny and uneven image geometry', () => {
  const source = pixel(11, 22, 33, 44);
  const edited = pixel(55, 66, 77, 88);
  assert.deepEqual([...composeLocalSplitPreview(source, edited, 1, 1, 50)], [...source]);
  const twoRow = composeLocalSplitPreview(
    pixel(1, 2, 3, 4, 5, 6, 7, 8),
    pixel(9, 10, 11, 12, 13, 14, 15, 16),
    1, 2, 0,
  );
  assert.deepEqual([...twoRow], [9, 10, 11, 12, 13, 14, 15, 16]);
});

test('comparison rejects NaN, fractions, invalid pixels and excessive geometry', () => {
  const a = pixel(1, 2, 3, 4);
  for (const position of [-1, 101, 50.5, NaN, Infinity, -Infinity, '50', null, undefined]) {
    if (position === undefined) continue; // default 50 is explicitly supported
    assert.throws(() => normalizeSplitPosition(position), /Split position/);
    assert.throws(() => composeLocalSplitPreview(a, a, 1, 1, position), /Split position/);
  }
  for (const [w, h] of [[0, 1], [1, 0], [2, 2], [12_000_001, 1], [Infinity, 1], [1.5, 1]]) {
    assert.throws(() => composeLocalSplitPreview(a, a, w, h, 50), /bounded RGBA8/);
  }
  assert.throws(() => composeLocalSplitPreview([1, 2, 3, 4], a, 1, 1, 50), /RGBA8/);
  assert.throws(() => splitComparisonColumn(0, 50), /Invalid split/);
  assert.throws(() => splitComparisonColumn(1100, 101), /Split position/);
});

test('split preview does not change full image export or Core-owned project authority', () => {
  // The function is pure by contract; no method can encode, upload, accept,
  // mutate a Core project, persist edits or change an image lineage.
  const input = pixel(40, 50, 60, 255, 80, 90, 100, 255);
  const exported = pixel(90, 100, 110, 255, 150, 160, 170, 255);
  const copy = [...exported];
  composeLocalSplitPreview(input, exported, 2, 1, 65);
  assert.deepEqual([...exported], copy);
});
