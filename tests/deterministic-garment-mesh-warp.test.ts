import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GARMENT_MESH_WARP_FIXED_POINT_ONE,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
  GARMENT_MESH_WARP_PRODUCTION_ADMISSION,
  garmentMeshWarpRgba8,
  normalizeGarmentMeshWarpSpec,
  quantizeNormalizedGarmentMeshPoints,
} from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';

const ONE = GARMENT_MESH_WARP_FIXED_POINT_ONE;
const fullFramePoints = Object.freeze([
  Object.freeze([0, 0] as const),
  Object.freeze([ONE, 0] as const),
  Object.freeze([ONE, ONE] as const),
  Object.freeze([0, ONE] as const),
]);
const fullFrameTriangles = Object.freeze([
  Object.freeze([0, 1, 2] as const),
  Object.freeze([0, 2, 3] as const),
]);

test('F4b.1 garment mesh warp identity is explicitly non-admitted', () => {
  assert.equal(GARMENT_MESH_WARP_PRODUCTION_ADMISSION, 'NOT_ADMITTED');
});

test('F4a normalized PARAMETRIC points quantize deterministically to Q16', () => {
  assert.deepEqual(
    quantizeNormalizedGarmentMeshPoints([[0, 0], [0.5, 0.5], [1, 1], [0.25, 0.75]]),
    [[0, 0], [32768, 32768], [65536, 65536], [16384, 49152]],
  );
  assert.throws(() => quantizeNormalizedGarmentMeshPoints([[0, 0], [1, 0], [1.00001, 1]]), /escapes/);
  assert.throws(() => quantizeNormalizedGarmentMeshPoints([[0, 0], [1, 0]]), /3 to/);
});

test('full-frame identity garment mesh is byte exact and never aliases source bytes', () => {
  const source = new Uint8ClampedArray([
    1, 2, 3, 4,    5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  const spec = { sourcePointsQ16: fullFramePoints, destinationPointsQ16: fullFramePoints, triangles: fullFrameTriangles, outputWidth: 2, outputHeight: 2 } as const;
  const output = garmentMeshWarpRgba8(source, 2, 2, spec);
  assert.deepEqual([...output], [...source]);
  output[0] = 255;
  assert.equal(source[0], 1);
});

test('repeated nontrivial garment mesh warp is byte-identical', () => {
  const source = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 255,
    70, 80, 90, 255, 100, 110, 120, 255,
  ]);
  const destination = Object.freeze([
    Object.freeze([0, 0] as const),
    Object.freeze([ONE, 0] as const),
    Object.freeze([Math.floor(ONE * 0.75), ONE] as const),
    Object.freeze([Math.floor(ONE * 0.25), ONE] as const),
  ]);
  const spec = { sourcePointsQ16: fullFramePoints, destinationPointsQ16: destination, triangles: fullFrameTriangles, outputWidth: 5, outputHeight: 5 } as const;
  const first = garmentMeshWarpRgba8(source, 2, 2, spec);
  const second = garmentMeshWarpRgba8(source, 2, 2, spec);
  assert.deepEqual([...first], [...second]);
  assert.ok(first.some(value => value !== 0));
  assert.deepEqual([...first.slice(0, 4)], [10, 20, 30, 255]);
  assert.deepEqual([...first.slice(16, 20)], [40, 50, 60, 255]);
});

test('pixels outside a destination triangle remain transparent and winding is normalized', () => {
  const color = [25, 50, 75, 200] as const;
  const source = new Uint8ClampedArray(Array.from({ length: 9 }, () => color).flat());
  const points = Object.freeze([
    Object.freeze([0, 0] as const),
    Object.freeze([ONE / 2, 0] as const),
    Object.freeze([0, ONE] as const),
  ]);
  const forward = { sourcePointsQ16: points, destinationPointsQ16: points, triangles: [[0, 1, 2] as const], outputWidth: 3, outputHeight: 3 } as const;
  const reversed = { sourcePointsQ16: points, destinationPointsQ16: points, triangles: [[0, 2, 1] as const], outputWidth: 3, outputHeight: 3 } as const;
  const a = garmentMeshWarpRgba8(source, 3, 3, forward);
  const b = garmentMeshWarpRgba8(source, 3, 3, reversed);
  assert.deepEqual([...a], [...b]);

  const pixel = (bytes: Uint8ClampedArray, x: number, y: number) => [...bytes.slice((y * 3 + x) * 4, (y * 3 + x + 1) * 4)];
  assert.deepEqual(pixel(a, 0, 0), [...color]);
  assert.deepEqual(pixel(a, 1, 0), [...color]);
  assert.deepEqual(pixel(a, 0, 1), [...color]);
  assert.deepEqual(pixel(a, 0, 2), [...color]);
  assert.deepEqual(pixel(a, 2, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(a, 1, 1), [0, 0, 0, 0]);
  assert.deepEqual(pixel(a, 2, 2), [0, 0, 0, 0]);
});

test('bilinear garment sampling uses premultiplied alpha and preserves hidden RGB at zero alpha', () => {
  const source = new Uint8ClampedArray([
    200, 0, 0, 0,      0, 200, 0, 0,
    0, 0, 200, 0,      100, 120, 140, 0,
  ]);
  const center = ONE / 2;
  const sourcePoints = Object.freeze([
    Object.freeze([center, center] as const),
    Object.freeze([center + 1, center] as const),
    Object.freeze([center, center + 1] as const),
  ]);
  const destinationPoints = Object.freeze([
    Object.freeze([0, 0] as const),
    Object.freeze([ONE, 0] as const),
    Object.freeze([0, ONE] as const),
  ]);
  const output = garmentMeshWarpRgba8(source, 2, 2, {
    sourcePointsQ16: sourcePoints,
    destinationPointsQ16: destinationPoints,
    triangles: [[0, 1, 2]],
    outputWidth: 2,
    outputHeight: 2,
  });
  assert.deepEqual([...output.slice(0, 4)], [75, 80, 85, 0]);
});

test('garment mesh warp rejects malformed topology geometry dimensions and source bytes', () => {
  const valid = { sourcePointsQ16: fullFramePoints, destinationPointsQ16: fullFramePoints, triangles: fullFrameTriangles, outputWidth: 2, outputHeight: 2 } as const;
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, destinationPointsQ16: fullFramePoints.slice(0, 3) }), /point counts/);
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, destinationPointsQ16: [[0, 0], [ONE + 1, 0], [ONE, ONE], [0, ONE]] }), /escapes/);
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, triangles: [[0, 0, 2]] }), /invalid point references/);
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, triangles: [[0, 1, 9]] }), /invalid point references/);
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, sourcePointsQ16: [[0, 0], [ONE, 0], [ONE / 2, 0], [0, ONE]], triangles: [[0, 1, 2]] }), /source triangle.*degenerate/);
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, destinationPointsQ16: [[0, 0], [ONE, 0], [ONE / 2, 0], [0, ONE]], triangles: [[0, 1, 2]] }), /destination triangle.*degenerate/);
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, outputWidth: 4097 }), /between 1 and 4096/);
  assert.throws(() => normalizeGarmentMeshWarpSpec({ ...valid, outputWidth: 4096, outputHeight: 4096 }), new RegExp(String(GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS)));
  assert.throws(() => garmentMeshWarpRgba8(new Uint8ClampedArray(15), 2, 2, valid), /RGBA length/);
});
