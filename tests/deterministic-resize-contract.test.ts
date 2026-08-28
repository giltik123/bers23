import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESIZE_CAPABILITY,
  RESIZE_FIXED_POINT_BITS,
  RESIZE_MAX_DIMENSION,
  RESIZE_MAX_OUTPUT_PIXELS,
  RESIZE_OPERATION,
  RESIZE_STEP_ID,
  RESIZE_TOOL_ID,
  RESIZE_TOOL_VERSION,
  normalizeResizeDimensions,
  resizeRgba8,
} from '../src/platform/creative/deterministic/Resize.ts';

test('Resize v1 identity and hard arithmetic bounds are exact', () => {
  assert.equal(RESIZE_TOOL_ID, 'resize');
  assert.equal(RESIZE_TOOL_VERSION, '1');
  assert.equal(RESIZE_CAPABILITY, 'local:tool:resize:v1');
  assert.equal(RESIZE_OPERATION, 'RESIZE');
  assert.equal(RESIZE_STEP_ID, 'resize');
  assert.equal(RESIZE_FIXED_POINT_BITS, 16);
  assert.equal(RESIZE_MAX_DIMENSION, 16384);
  assert.equal(RESIZE_MAX_OUTPUT_PIXELS, 16777216);
});

test('Resize v1 uses exact pixel-center fixed-point bilinear premultiplied-alpha semantics', () => {
  const source = Uint8Array.from([
    255, 0, 0, 255,       0, 255, 0, 128,
    250, 10, 200, 0,      255, 255, 255, 255,
  ]);
  const resized = resizeRgba8(source, 2, 2, { width: 3, height: 3 });
  assert.deepEqual([...resized], [
    255, 0, 0, 255,       170, 85, 0, 192,      0, 255, 0, 128,
    255, 0, 0, 128,       204, 153, 102, 160,   170, 255, 170, 192,
    250, 10, 200, 0,      255, 255, 255, 128,   255, 255, 255, 255,
  ]);
});

test('Resize v1 preserves deterministic hidden RGB when weighted alpha is exactly zero', () => {
  const source = Uint8Array.from([10, 20, 30, 0, 250, 240, 230, 0]);
  assert.deepEqual([...resizeRgba8(source, 2, 1, { width: 3, height: 1 })], [
    10, 20, 30, 0,
    130, 130, 130, 0,
    250, 240, 230, 0,
  ]);
});

test('Resize identity geometry is a byte copy but never aliases source storage', () => {
  const source = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const resized = resizeRgba8(source, 2, 1, { width: 2, height: 1 });
  assert.deepEqual([...resized], [...source]);
  resized[0] = 99;
  assert.equal(source[0], 1);
});

test('Resize dimensions reject fractions, zero, unsafe dimensions and oversized outputs without clamping', () => {
  for (const target of [
    { width: 0, height: 1 },
    { width: 1.5, height: 1 },
    { width: 1, height: -1 },
    { width: RESIZE_MAX_DIMENSION + 1, height: 1 },
    { width: 4097, height: 4096 },
  ]) assert.throws(() => normalizeResizeDimensions(target, 2, 2));
  assert.throws(() => normalizeResizeDimensions({ width: 1, height: 1 }, 0, 2));
  assert.throws(() => resizeRgba8(Uint8Array.of(1, 2, 3), 1, 1, { width: 1, height: 1 }));
});
