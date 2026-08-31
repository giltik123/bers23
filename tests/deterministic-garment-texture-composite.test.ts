import assert from 'node:assert/strict';
import test from 'node:test';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FEATHER_DISTANCE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
  GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_PRODUCTION_ADMISSION,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_OUTPUT_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_SAMPLE_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
  compositeSourceOverSrgbRgba8,
  garmentEdgeFeatherRgba8,
  garmentTextureCompositeRgba8,
  garmentTextureMapRgba8,
  normalizeGarmentTextureCompositeSpec,
  normalizeGarmentTextureTransform,
} from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';

const ONE = GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE;
const identityTransform = Object.freeze({
  scaleXQ16: ONE,
  scaleYQ16: ONE,
  offsetXQ16: 0,
  offsetYQ16: 0,
  wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
  alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
});

const identitySpec = Object.freeze({
  textureTransform: identityTransform,
  featherRadius: 0,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});

const fullFrameWarp3x3 = Object.freeze({
  sourcePointsQ16: Object.freeze([
    Object.freeze([0, 0] as const),
    Object.freeze([ONE, 0] as const),
    Object.freeze([0, ONE] as const),
    Object.freeze([ONE, ONE] as const),
  ]),
  destinationPointsQ16: Object.freeze([
    Object.freeze([0, 0] as const),
    Object.freeze([ONE, 0] as const),
    Object.freeze([0, ONE] as const),
    Object.freeze([ONE, ONE] as const),
  ]),
  triangles: Object.freeze([
    Object.freeze([0, 1, 2] as const),
    Object.freeze([1, 3, 2] as const),
  ]),
  outputWidth: 3,
  outputHeight: 3,
});

test('F4b.5a identity and pixel policies remain explicit after F4b.5b gated admission', () => {
  assert.equal(GARMENT_TEXTURE_COMPOSITE_PRODUCTION_ADMISSION, 'ADMITTED');
  assert.equal(GARMENT_TEXTURE_COMPOSITE_WRAP_MODE, 'CLAMP');
  assert.equal(GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY, 'PRESERVE_BASE_ALPHA');
  assert.equal(GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_SAMPLE_RGB_POLICY, 'PRESERVE_BASE_RGB');
  assert.equal(GARMENT_TEXTURE_COMPOSITE_FEATHER_DISTANCE_POLICY, 'MANHATTAN_4_NEIGHBOR_HALF_PIXEL_LINEAR');
  assert.equal(GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_OUTPUT_RGB_POLICY, 'ZERO_RGB_WHEN_OUTPUT_ALPHA_ZERO');
  assert.equal(GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY, 'SRGB_GAMMA_ENCODED_RGBA8');
});

test('identity texture transform is byte exact and never aliases source bytes', () => {
  const source = new Uint8ClampedArray([
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  const output = garmentTextureMapRgba8(source, 2, 2, identityTransform);
  assert.deepEqual([...output], [...source]);
  output[0] = 255;
  assert.equal(source[0], 1);
});

test('Q16 texture mapping uses premultiplied bilinear sampling while preserving source-view alpha', () => {
  const source = new Uint8ClampedArray([
    0, 0, 0, 255,
    200, 0, 0, 64,
  ]);
  const output = garmentTextureMapRgba8(source, 2, 1, {
    ...identityTransform,
    scaleXQ16: ONE / 2,
    offsetXQ16: ONE / 4,
  });
  assert.deepEqual([...output], [
    15, 0, 0, 255,
    86, 0, 0, 64,
  ]);
});

test('CLAMP and transparent transformed samples cannot surface hidden RGB through preserved base alpha', () => {
  const source = new Uint8ClampedArray([
    10, 0, 0, 255,
    20, 0, 0, 128,
    30, 0, 0, 0,
  ]);
  const output = garmentTextureMapRgba8(source, 3, 1, {
    ...identityTransform,
    offsetXQ16: ONE,
  });
  assert.deepEqual([...output], [
    10, 0, 0, 255,
    20, 0, 0, 128,
    30, 0, 0, 0,
  ]);
});

test('bounded half-pixel Manhattan feather has exact radius-1 and radius-2 vectors', () => {
  const opaque3 = new Uint8ClampedArray(Array.from({ length: 9 }, () => [7, 8, 9, 255]).flat());
  const r1 = garmentEdgeFeatherRgba8(opaque3, 3, 3, 1);
  assert.deepEqual(
    Array.from({ length: 9 }, (_, index) => r1[index * 4 + 3]),
    [128, 128, 128, 128, 255, 128, 128, 128, 128],
  );
  for (let index = 0; index < 9; index += 1) assert.deepEqual([...r1.slice(index * 4, index * 4 + 3)], [7, 8, 9]);

  const opaque5 = new Uint8ClampedArray(Array.from({ length: 25 }, () => [1, 2, 3, 255]).flat());
  const r2 = garmentEdgeFeatherRgba8(opaque5, 5, 5, 2);
  assert.deepEqual(
    Array.from({ length: 25 }, (_, index) => r2[index * 4 + 3]),
    [
      64, 64, 64, 64, 64,
      64, 191, 191, 191, 64,
      64, 191, 255, 191, 64,
      64, 191, 191, 191, 64,
      64, 64, 64, 64, 64,
    ],
  );
});

test('zero-radius feather is byte exact and zero-alpha holes define inward edges without changing RGB', () => {
  const source = new Uint8ClampedArray([
    100, 101, 102, 255, 110, 111, 112, 255, 120, 121, 122, 255,
    130, 131, 132, 255, 140, 141, 142, 0,   150, 151, 152, 255,
    160, 161, 162, 255, 170, 171, 172, 255, 180, 181, 182, 255,
  ]);
  assert.deepEqual([...garmentEdgeFeatherRgba8(source, 3, 3, 0)], [...source]);
  const feathered = garmentEdgeFeatherRgba8(source, 3, 3, 1);
  assert.equal(feathered[4 * 4 + 3], 0);
  assert.equal(feathered[1 * 4 + 3], 128);
  assert.deepEqual([...feathered.slice(4 * 4, 4 * 4 + 3)], [140, 141, 142]);
  assert.deepEqual([...feathered.slice(1 * 4, 1 * 4 + 3)], [110, 111, 112]);
});

test('gamma-encoded sRGB source-over uses deterministic integer premultiply/unpremultiply and zero transparent RGB', () => {
  const destination = new Uint8ClampedArray([0, 0, 255, 255]);
  const source = new Uint8ClampedArray([255, 0, 0, 128]);
  assert.deepEqual([...compositeSourceOverSrgbRgba8(destination, source, 1, 1)], [128, 0, 127, 255]);

  const hidden = new Uint8ClampedArray([9, 8, 7, 0]);
  assert.deepEqual([...compositeSourceOverSrgbRgba8(destination, hidden, 1, 1)], [...destination]);
  assert.deepEqual([...compositeSourceOverSrgbRgba8(hidden, source, 1, 1)], [...source]);
  assert.deepEqual([...compositeSourceOverSrgbRgba8(hidden, hidden, 1, 1)], [0, 0, 0, 0]);
});

test('composed law texture-maps the exact Garment source view before the existing topology warp', () => {
  const project = new Uint8ClampedArray(Array.from({ length: 9 }, () => [10, 20, 30, 255]).flat());
  const garmentSource = new Uint8ClampedArray([
    200, 40, 20, 255,
    100, 80, 40, 255,
    50, 120, 80, 128,
    220, 30, 10, 64,
  ]);
  const expectedWarp = garmentMeshWarpRgba8(garmentSource, 2, 2, fullFrameWarp3x3);
  const expected = compositeSourceOverSrgbRgba8(project, expectedWarp, 3, 3);
  const actual = garmentTextureCompositeRgba8(
    project,
    3,
    3,
    garmentSource,
    2,
    2,
    fullFrameWarp3x3,
    identitySpec,
  );
  assert.deepEqual([...actual], [...expected]);
});

test('non-identity topology-bound composition is byte-identical across repeated execution', () => {
  const project = new Uint8ClampedArray(Array.from({ length: 9 }, () => [10, 20, 30, 255]).flat());
  const garmentSource = new Uint8ClampedArray([
    200, 40, 20, 255,
    100, 80, 40, 255,
    50, 120, 80, 128,
    220, 30, 10, 64,
  ]);
  const spec = Object.freeze({
    textureTransform: Object.freeze({
      ...identityTransform,
      scaleXQ16: ONE / 2,
      scaleYQ16: ONE / 2,
      offsetXQ16: ONE / 4,
      offsetYQ16: ONE / 4,
    }),
    featherRadius: 1,
    colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  });
  const first = garmentTextureCompositeRgba8(project, 3, 3, garmentSource, 2, 2, fullFrameWarp3x3, spec);
  const second = garmentTextureCompositeRgba8(project, 3, 3, garmentSource, 2, 2, fullFrameWarp3x3, spec);
  assert.deepEqual([...first], [...second]);
  assert.notDeepEqual([...first], [...project]);
});

test('composed law rejects a topology warp whose output geometry is not the canonical Project geometry', () => {
  const project = new Uint8ClampedArray(3 * 3 * 4);
  const garmentSource = new Uint8ClampedArray(2 * 2 * 4);
  assert.throws(
    () => garmentTextureCompositeRgba8(
      project,
      3,
      3,
      garmentSource,
      2,
      2,
      { ...fullFrameWarp3x3, outputWidth: 2 },
      identitySpec,
    ),
    /warp output must match the canonical Project geometry/,
  );
});

test('F4b.5a fails closed on unsupported policies hostile transforms radii dimensions and bytes', () => {
  assert.throws(
    () => normalizeGarmentTextureTransform({ ...identityTransform, wrapMode: 'REPEAT' } as any),
    /wrapMode must be CLAMP/,
  );
  assert.throws(
    () => normalizeGarmentTextureTransform({ ...identityTransform, alphaPolicy: 'SAMPLE_TEXTURE_ALPHA' } as any),
    /alphaPolicy must be PRESERVE_BASE_ALPHA/,
  );
  assert.throws(() => normalizeGarmentTextureTransform({ ...identityTransform, scaleXQ16: 0 }), /scaleXQ16/);
  assert.throws(() => normalizeGarmentTextureTransform({ ...identityTransform, offsetXQ16: 16 * ONE + 1 }), /offsetXQ16/);
  assert.throws(
    () => normalizeGarmentTextureCompositeSpec({ ...identitySpec, featherRadius: GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS + 1 }),
    /feather radius/,
  );
  assert.throws(
    () => normalizeGarmentTextureCompositeSpec({ ...identitySpec, colorSpacePolicy: 'LINEAR_SRGB' } as any),
    /colorSpacePolicy/,
  );
  assert.equal(4096 * 2048, GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS);
  assert.throws(() => garmentTextureMapRgba8(new Uint8ClampedArray(4), 4096, 4096, identityTransform), new RegExp(String(GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS)));
  assert.throws(() => garmentTextureMapRgba8(new DataView(new ArrayBuffer(4)) as any, 1, 1, identityTransform), /Uint8 RGBA bytes/);
  assert.throws(() => garmentEdgeFeatherRgba8(new Uint8ClampedArray(15), 2, 2, 1), /RGBA length/);
  assert.throws(() => compositeSourceOverSrgbRgba8(new Uint8ClampedArray(16), new Uint8ClampedArray(12), 2, 2), /RGBA length/);
});
