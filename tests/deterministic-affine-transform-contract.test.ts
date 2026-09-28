import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AFFINE_FIXED_POINT_ONE,
  AFFINE_MAX_DIMENSION,
  AFFINE_MAX_LINEAR_COEFFICIENT_ABS,
  AFFINE_MAX_TRANSLATION_ABS,
  AFFINE_TRANSFORM_CAPABILITY,
  IDENTITY_AFFINE_INVERSE_Q16,
  affineTransformRgba8,
  normalizeAffineInverseMatrixQ16,
} from '../src/platform/creative/deterministic/AffineTransform.ts';
import {
  AFFINE_TRANSFORM_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  requireDeterministicToolByExecutor,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const source2x2 = new Uint8ClampedArray([
  255,0,0,255,   0,255,0,255,
  0,0,255,255,   255,255,255,255,
]);

test('Affine v1 identity is byte exact and same-canvas', () => {
  const output = affineTransformRgba8(source2x2, 2, 2, IDENTITY_AFFINE_INVERSE_Q16);
  assert.deepEqual([...output], [...source2x2]);
  assert.notEqual(output, source2x2);
});

test('Affine v1 integer translation uses transparent-black border', () => {
  const output = affineTransformRgba8(source2x2, 2, 2, {
    ...IDENTITY_AFFINE_INVERSE_Q16,
    txQ16: AFFINE_FIXED_POINT_ONE,
  });
  assert.deepEqual([...output], [
    0,255,0,255,  0,0,0,0,
    255,255,255,255, 0,0,0,0,
  ]);
});

test('Affine v1 half-pixel sample uses Q16 bilinear premultiplied alpha and one final round-half-up', () => {
  const source = new Uint8ClampedArray([
    255,0,0,255,
    0,255,0,255,
  ]);
  const output = affineTransformRgba8(source, 2, 1, {
    ...IDENTITY_AFFINE_INVERSE_Q16,
    txQ16: AFFINE_FIXED_POINT_ONE / 2,
  });
  assert.deepEqual([...output], [
    128,128,0,255,
    0,255,0,128,
  ]);
});

test('Affine v1 zero weighted alpha forces RGB to transparent black', () => {
  const source = new Uint8ClampedArray([201,77,33,0]);
  assert.deepEqual([...affineTransformRgba8(source, 1, 1, IDENTITY_AFFINE_INVERSE_Q16)], [0,0,0,0]);
});

test('Affine v1 rejects non-invertible, fractional, oversized and hostile matrices before execution', () => {
  assert.throws(() => normalizeAffineInverseMatrixQ16({
    ...IDENTITY_AFFINE_INVERSE_Q16,
    m00Q16: 0,
    m11Q16: 0,
  }), /invertible/);
  assert.throws(() => normalizeAffineInverseMatrixQ16({
    ...IDENTITY_AFFINE_INVERSE_Q16,
    m00Q16: .5,
  }), /linear coefficient/);
  assert.throws(() => normalizeAffineInverseMatrixQ16({
    ...IDENTITY_AFFINE_INVERSE_Q16,
    m00Q16: AFFINE_MAX_LINEAR_COEFFICIENT_ABS + 1,
  }), /linear coefficient/);
  assert.throws(() => normalizeAffineInverseMatrixQ16({
    ...IDENTITY_AFFINE_INVERSE_Q16,
    txQ16: AFFINE_MAX_TRANSLATION_ABS + 1,
  }), /translation/);
  assert.throws(() => affineTransformRgba8(new Uint8Array(4), AFFINE_MAX_DIMENSION + 1, 1, IDENTITY_AFFINE_INVERSE_Q16), /dimensions/);
  assert.throws(() => affineTransformRgba8(new Uint8Array(3), 1, 1, IDENTITY_AFFINE_INVERSE_Q16), /RGBA length/);
});

test('Affine registry contract is immutable candidate data and remains production-unadmitted', () => {
  assert.equal(requireDeterministicToolByCapability(AFFINE_TRANSFORM_CAPABILITY), AFFINE_TRANSFORM_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor(AFFINE_TRANSFORM_TOOL_DEFINITION.executor), AFFINE_TRANSFORM_TOOL_DEFINITION);
  assert.deepEqual(AFFINE_TRANSFORM_TOOL_DEFINITION.output, {
    kind: 'image',
    role: 'COMPOSITE',
    count: 1,
    mimeTypes: ['image/png'],
    geometry: 'MATCH_SOURCE',
  });
  assert.equal(AFFINE_TRANSFORM_TOOL_DEFINITION.parameters.exact.matrix, 'INVERSE_AFFINE_Q16_16');
  assert.equal(AFFINE_TRANSFORM_TOOL_DEFINITION.parameters.exact.borderPolicy, 'TRANSPARENT_BLACK');
  assert.equal(AFFINE_TRANSFORM_TOOL_DEFINITION.pixelContract.interpolation, 'BILINEAR_FIXED_16_16_AFFINE_PIXEL_CENTER');
  assert.equal(AFFINE_TRANSFORM_TOOL_DEFINITION.pixelContract.transparentRgb, 'ZERO_WHEN_WEIGHTED_ALPHA_ZERO');
  assert.equal(Object.isFrozen(AFFINE_TRANSFORM_TOOL_DEFINITION), true);
  assert.equal(productionLocalExecutorsByCapability[AFFINE_TRANSFORM_CAPABILITY], undefined, 'registry candidate must not become production executable without explicit Core admission');
});
