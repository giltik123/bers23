import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GARMENT_FOREGROUND_OCCLUSION_PRODUCTION_ADMISSION,
  restoreGarmentForegroundOcclusionRgba8,
} from '../src/platform/creative/deterministic/GarmentForegroundOcclusion.js';

function image(pixels, rgb, alpha = 255) {
  const result = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    result.set([...rgb, alpha], i * 4);
  }
  return result;
}

test('foreground occlusion stays explicitly non-production until mask lineage and visual review are accepted', () => {
  assert.equal(GARMENT_FOREGROUND_OCCLUSION_PRODUCTION_ADMISSION, 'NOT_ADMITTED');
});

test('known arm foreground restores exact original RGBA while preserving every other composite pixel', () => {
  const width = 3, height = 2, pixels = width * height;
  const original = image(pixels, [33, 44, 55], 100);
  const garment = image(pixels, [200, 80, 20], 255);
  const mask = Uint8Array.from([0, 255, 0, 0, 255, 0]);
  const originalBefore = Uint8ClampedArray.from(original);
  const garmentBefore = Uint8ClampedArray.from(garment);
  const maskBefore = Uint8Array.from(mask);

  const result = restoreGarmentForegroundOcclusionRgba8(original, garment, mask, width, height);
  assert.notEqual(result, garment);
  for (let i = 0; i < pixels; i += 1) {
    const actual = result.subarray(i * 4, i * 4 + 4);
    const reference = (mask[i] === 255 ? original : garment).subarray(i * 4, i * 4 + 4);
    assert.deepEqual(actual, reference, `pixel ${i} must follow exact foreground authority`);
  }
  assert.deepEqual(original, originalBefore, 'Project bytes must not be modified');
  assert.deepEqual(garment, garmentBefore, 'composite must not be modified');
  assert.deepEqual(mask, maskBefore, 'mask must not be modified');
});

test('zero and full masks have exact, deterministic results and do not alias original buffers', () => {
  const original = image(4, [1, 2, 3], 40);
  const composite = image(4, [80, 90, 100], 250);
  const zero = new Uint8Array(4);
  const full = Uint8Array.from([255, 255, 255, 255]);
  const empty = restoreGarmentForegroundOcclusionRgba8(original, composite, zero, 2, 2);
  const restore = restoreGarmentForegroundOcclusionRgba8(original, composite, full, 2, 2);
  assert.deepEqual(empty, composite);
  assert.deepEqual(restore, original);
  assert.notEqual(empty, composite);
  assert.notEqual(restore, original);
  assert.deepEqual(
    restoreGarmentForegroundOcclusionRgba8(original, composite, full, 2, 2),
    restore,
    'repeated operation must be bit-identical',
  );
});

test('partial or ambiguous masks fail closed; no silent alpha thresholding or antialias guess', () => {
  const original = image(4, [1, 2, 3]);
  const garment = image(4, [100, 120, 140]);
  for (const unexpected of [1, 20, 127, 254]) {
    assert.throws(
      () => restoreGarmentForegroundOcclusionRgba8(original, garment, Uint8Array.from([0, 255, unexpected, 0]), 2, 2),
      /only 0 or 255/,
    );
  }
  assert.throws(
    () => restoreGarmentForegroundOcclusionRgba8(original, garment, [0, 255, 0, 0], 2, 2),
    /must be binary R8/,
  );
});

test('invalid geometry, wrong color/image lengths and wrong mask dimensions fail before rendering', () => {
  const original = image(4, [10, 20, 30]);
  const garment = image(4, [110, 120, 130]);
  const mask = new Uint8Array(4);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(original, garment, mask, 0, 2), /bounded positive/);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(original, garment, mask, 2.5, 2), /bounded positive/);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(original, garment, mask, 4097, 2), /bounded positive/);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(original, garment, mask, 4096, 4096), /raster budget/);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(new Uint8Array(3), garment, mask, 2, 2), /Original Project RGBA byte length/);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(original, new Uint8Array(3), mask, 2, 2), /composite RGBA byte length/);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(original, garment, new Uint8Array(3), 2, 2), /mask R8 byte length/);
  assert.throws(() => restoreGarmentForegroundOcclusionRgba8(original, garment, mask, 1, 3), /geometry|length/i);
});

test('opaque garment region can restore foreground while preserving neighboring pattern pixels', () => {
  const original = Uint8Array.from([
    70, 72, 74, 255, 80, 82, 84, 255, 90, 92, 94, 255,
    30, 32, 34, 255, 40, 42, 44, 255, 50, 52, 54, 255,
  ]);
  const composited = Uint8Array.from([
    210, 40, 10, 255, 220, 50, 20, 255, 230, 60, 30, 255,
    240, 70, 40, 255, 250, 80, 50, 255, 200, 90, 60, 255,
  ]);
  const originalMask = Uint8Array.from([0, 255, 0, 255, 0, 0]);
  const expected = Uint8ClampedArray.from([
    ...composited.subarray(0, 4), ...original.subarray(4, 8),
    ...composited.subarray(8, 12), ...original.subarray(12, 16),
    ...composited.subarray(16, 20), ...composited.subarray(20, 24),
  ]);
  const result = restoreGarmentForegroundOcclusionRgba8(original, composited, originalMask, 3, 2);
  assert.deepEqual(result, expected);
});
