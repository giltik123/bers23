import assert from 'node:assert/strict';
import test from 'node:test';
import { levelsRgba8 } from '../src/platform/creative/deterministic/Levels.ts';
import {
  MASKED_LEVELS_CAPABILITY,
  MASKED_LEVELS_MAX_INPUT_BLACK,
  MASKED_LEVELS_MAX_INPUT_MIDPOINT,
  MASKED_LEVELS_MAX_INPUT_WHITE,
  MASKED_LEVELS_MAX_OUTPUT_BLACK,
  MASKED_LEVELS_MAX_OUTPUT_WHITE,
  MASKED_LEVELS_MIN_INPUT_BLACK,
  MASKED_LEVELS_MIN_INPUT_MIDPOINT,
  MASKED_LEVELS_MIN_INPUT_WHITE,
  MASKED_LEVELS_MIN_OUTPUT_BLACK,
  MASKED_LEVELS_MIN_OUTPUT_WHITE,
  MASKED_LEVELS_TOOL_ID,
  MASKED_LEVELS_TOOL_VERSION,
  maskedLevelsRgba8,
  normalizeMaskedLevelsParameters,
} from '../src/platform/creative/deterministic/MaskedLevels.ts';
import {
  DETERMINISTIC_TOOL_REGISTRY,
  MASKED_LEVELS_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  requireDeterministicToolByExecutor,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

test('Masked Levels v1 blends exact Levels bytes by ALPHA8 mask and preserves source alpha', () => {
  const source = new Uint8ClampedArray([
    32,64,96,0,
    33,160,223,17,
    224,128,0,255,
  ]);
  const mask = new Uint8Array([0,128,255]);
  assert.deepEqual(
    [...maskedLevelsRgba8(source, mask, 3, 1, 32, 96, 224, 16, 240)],
    [
      32,64,96,0,
      25,172,231,17,
      240,156,16,255,
    ],
  );

  assert.deepEqual(
    [...maskedLevelsRgba8(source, new Uint8Array([0,0,0]), 3, 1, 32, 96, 224, 16, 240)],
    [...source],
  );
  assert.deepEqual(
    [...maskedLevelsRgba8(source, new Uint8Array([255,255,255]), 3, 1, 32, 96, 224, 16, 240)],
    [...levelsRgba8(source, 3, 1, 32, 96, 224, 16, 240)],
  );
});

test('Masked Levels v1 rejects hostile parameters, geometry and MASK mismatches without mutating inputs', () => {
  const source = new Uint8ClampedArray([1,2,3,4, 5,6,7,8]);
  const mask = new Uint8Array([0,255]);
  const beforeSource = [...source];
  const beforeMask = [...mask];
  const valid = [0,128,255,0,255] as const;

  for (const [index, invalids] of [
    [0, [NaN, 1.5, MASKED_LEVELS_MIN_INPUT_BLACK - 1, MASKED_LEVELS_MAX_INPUT_BLACK + 1]],
    [1, [NaN, 1.5, MASKED_LEVELS_MIN_INPUT_MIDPOINT - 1, MASKED_LEVELS_MAX_INPUT_MIDPOINT + 1]],
    [2, [NaN, 1.5, MASKED_LEVELS_MIN_INPUT_WHITE - 1, MASKED_LEVELS_MAX_INPUT_WHITE + 1]],
    [3, [NaN, 1.5, MASKED_LEVELS_MIN_OUTPUT_BLACK - 1, MASKED_LEVELS_MAX_OUTPUT_BLACK + 1]],
    [4, [NaN, 1.5, MASKED_LEVELS_MIN_OUTPUT_WHITE - 1, MASKED_LEVELS_MAX_OUTPUT_WHITE + 1]],
  ] as const) {
    for (const invalid of invalids) {
      const args = [...valid] as number[];
      args[index] = invalid;
      assert.throws(() => normalizeMaskedLevelsParameters(args[0], args[1], args[2], args[3], args[4]), /Levels/);
    }
  }
  assert.throws(() => normalizeMaskedLevelsParameters(10,10,200,0,255), /requires/);
  assert.throws(() => normalizeMaskedLevelsParameters(0,128,255,100,100), /requires/);
  assert.throws(() => maskedLevelsRgba8(source, mask, 0, 2, ...valid), /dimensions/);
  assert.throws(() => maskedLevelsRgba8(source.subarray(0, 7), mask, 2, 1, ...valid), /RGBA length/);
  assert.throws(() => maskedLevelsRgba8(source, mask.subarray(0, 1), 2, 1, ...valid), /MASK alpha length/);
  assert.deepEqual([...source], beforeSource);
  assert.deepEqual([...mask], beforeMask);
});

test('Masked Levels registry contract is immutable reviewed data and remains production fail closed', () => {
  assert.equal(requireDeterministicToolByCapability(MASKED_LEVELS_CAPABILITY), MASKED_LEVELS_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor({ kind: 'DETERMINISTIC_TOOL', toolId: MASKED_LEVELS_TOOL_ID, version: MASKED_LEVELS_TOOL_VERSION }), MASKED_LEVELS_TOOL_DEFINITION);
  assert.deepEqual(MASKED_LEVELS_TOOL_DEFINITION.operation, { id: 'masked-levels', type: 'MASKED_LEVELS', version: '1' });
  assert.deepEqual(MASKED_LEVELS_TOOL_DEFINITION.executor, { kind: 'DETERMINISTIC_TOOL', toolId: 'masked-levels', version: '1' });
  assert.deepEqual(MASKED_LEVELS_TOOL_DEFINITION.inputs, [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ]);
  assert.deepEqual(MASKED_LEVELS_TOOL_DEFINITION.parameters.integerRanges, [
    { parameter: 'inputBlack', min: 0, max: 253 },
    { parameter: 'inputMidpoint', min: 1, max: 254 },
    { parameter: 'inputWhite', min: 2, max: 255 },
    { parameter: 'outputBlack', min: 0, max: 254 },
    { parameter: 'outputWhite', min: 1, max: 255 },
  ]);
  assert.deepEqual(MASKED_LEVELS_TOOL_DEFINITION.parameters.relationships, ['INPUT_BLACK_LT_MIDPOINT_LT_INPUT_WHITE', 'OUTPUT_BLACK_LT_OUTPUT_WHITE']);
  assert.equal(MASKED_LEVELS_TOOL_DEFINITION.parameters.exact.toneLaw, 'PIECEWISE_LINEAR_INPUT_MIDPOINT_TO_OUTPUT_MIDPOINT');
  assert.equal(MASKED_LEVELS_TOOL_DEFINITION.parameters.exact.maskBlend, 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP');
  assert.equal(MASKED_LEVELS_TOOL_DEFINITION.pixelContract.rgb, 'SRGB_ENCODED_LEVELS_PIECEWISE_LINEAR_INTEGER_MASK_ALPHA8_BLEND');
  assert.deepEqual(MASKED_LEVELS_TOOL_DEFINITION.lineage, { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: 'MASKED_LEVELS' });
  assert.equal(isDeepFrozen(MASKED_LEVELS_TOOL_DEFINITION), true);
  assert.equal(containsFunction(MASKED_LEVELS_TOOL_DEFINITION), false);
  assert.equal(DETERMINISTIC_TOOL_REGISTRY.includes(MASKED_LEVELS_TOOL_DEFINITION), true);
  assert.deepEqual(productionLocalExecutorsByCapability[MASKED_LEVELS_CAPABILITY], [MASKED_LEVELS_TOOL_DEFINITION.executor], 'Masked Levels is executable only through explicit reviewed production admission');
});

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(containsFunction);
}

function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}
