import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
  orthogonalTransformRgba8,
  type OrthogonalTransformMode,
} from '../src/platform/creative/deterministic/OrthogonalTransform.ts';

const source = new Uint8ClampedArray([
  1,11,21,31, 2,12,22,32, 3,13,23,33,
  4,14,24,34, 5,15,25,35, 6,16,26,36,
]);

const cases: readonly Readonly<{ mode: OrthogonalTransformMode; width: number; height: number; pixels: number[] }>[] = Object.freeze([
  { mode: 'FLIP_HORIZONTAL', width: 3, height: 2, pixels: [3,13,23,33, 2,12,22,32, 1,11,21,31, 6,16,26,36, 5,15,25,35, 4,14,24,34] },
  { mode: 'FLIP_VERTICAL', width: 3, height: 2, pixels: [4,14,24,34, 5,15,25,35, 6,16,26,36, 1,11,21,31, 2,12,22,32, 3,13,23,33] },
  { mode: 'ROTATE_90_CW', width: 2, height: 3, pixels: [4,14,24,34, 1,11,21,31, 5,15,25,35, 2,12,22,32, 6,16,26,36, 3,13,23,33] },
  { mode: 'ROTATE_180', width: 3, height: 2, pixels: [6,16,26,36, 5,15,25,35, 4,14,24,34, 3,13,23,33, 2,12,22,32, 1,11,21,31] },
  { mode: 'ROTATE_270_CW', width: 2, height: 3, pixels: [3,13,23,33, 6,16,26,36, 2,12,22,32, 5,15,25,35, 1,11,21,31, 4,14,24,34] },
]);

test('orthogonal transform v1 copies complete RGBA tuples exactly for every admitted mode', () => {
  for (const vector of cases) {
    assert.equal(normalizeOrthogonalTransformMode(vector.mode), vector.mode);
    assert.deepEqual(orthogonalTransformOutputGeometry(3, 2, vector.mode), { width: vector.width, height: vector.height });
    assert.deepEqual([...orthogonalTransformRgba8(source, 3, 2, vector.mode)], vector.pixels, vector.mode);
  }
});

test('orthogonal transform v1 preserves hidden RGB bytes and never aliases the source', () => {
  const transparent = new Uint8ClampedArray([90,80,70,0, 1,2,3,255]);
  const output = orthogonalTransformRgba8(transparent, 2, 1, 'FLIP_HORIZONTAL');
  assert.deepEqual([...output], [1,2,3,255, 90,80,70,0]);
  output[4] = 0;
  assert.equal(transparent[0], 90);
});

test('orthogonal transform v1 rejects unknown modes and invalid source geometry/bytes', () => {
  assert.throws(() => normalizeOrthogonalTransformMode('ROTATE_45' as never), /unsupported/);
  assert.throws(() => orthogonalTransformRgba8(source, 0, 2, 'ROTATE_180'), /dimensions/);
  assert.throws(() => orthogonalTransformRgba8(source.subarray(0, 20), 3, 2, 'ROTATE_180'), /RGBA length/);
});
