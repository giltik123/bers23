import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEVELS_CAPABILITY,
  LEVELS_MAX_INPUT_BLACK,
  LEVELS_MAX_INPUT_MIDPOINT,
  LEVELS_MAX_INPUT_WHITE,
  LEVELS_MAX_OUTPUT_BLACK,
  LEVELS_MAX_OUTPUT_WHITE,
  LEVELS_MIN_INPUT_BLACK,
  LEVELS_MIN_INPUT_MIDPOINT,
  LEVELS_MIN_INPUT_WHITE,
  LEVELS_MIN_OUTPUT_BLACK,
  LEVELS_MIN_OUTPUT_WHITE,
  LEVELS_TOOL_ID,
  LEVELS_TOOL_VERSION,
  levelsChannel,
  levelsRgba8,
  normalizeLevelsParameters,
} from '../src/platform/creative/deterministic/Levels.ts';
import {
  DETERMINISTIC_TOOL_REGISTRY,
  LEVELS_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  requireDeterministicToolByExecutor,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

test('Levels v1 maps exact three-point input/output levels with integer round-half-up', () => {
  const parameters = normalizeLevelsParameters(32, 96, 224, 16, 240);
  assert.deepEqual(parameters, { inputBlack: 32, inputMidpoint: 96, inputWhite: 224, outputBlack: 16, outputWhite: 240 });
  assert.deepEqual(
    [0,32,33,64,95,96,97,128,160,223,224,255].map(value => levelsChannel(value, parameters)),
    [16,16,18,72,126,128,129,156,184,239,240,240],
  );
  assert.deepEqual(
    [...levelsRgba8(new Uint8ClampedArray([
      0,32,96,0,
      33,64,95,17,
      97,160,223,255,
      224,255,128,9,
    ]), 4, 1, 32, 96, 224, 16, 240)],
    [
      16,16,128,0,
      18,72,126,17,
      129,184,239,255,
      240,240,156,9,
    ],
  );
});

test('Levels v1 identity parameters preserve every RGBA byte exactly', () => {
  const source = new Uint8ClampedArray(Array.from({ length: 256 * 4 }, (_, index) => index % 256));
  const output = levelsRgba8(source, 256, 1, 0, 128, 255, 0, 255);
  assert.deepEqual([...output], [...source]);
  assert.notEqual(output, source);
});

test('Levels v1 rejects hostile controls and geometry without mutating source', () => {
  const source = new Uint8ClampedArray([1,2,3,4, 5,6,7,8]);
  const before = [...source];
  const valid = [0,128,255,0,255] as const;

  for (const [index, invalids] of [
    [0, [NaN, 1.5, LEVELS_MIN_INPUT_BLACK - 1, LEVELS_MAX_INPUT_BLACK + 1]],
    [1, [NaN, 1.5, LEVELS_MIN_INPUT_MIDPOINT - 1, LEVELS_MAX_INPUT_MIDPOINT + 1]],
    [2, [NaN, 1.5, LEVELS_MIN_INPUT_WHITE - 1, LEVELS_MAX_INPUT_WHITE + 1]],
    [3, [NaN, 1.5, LEVELS_MIN_OUTPUT_BLACK - 1, LEVELS_MAX_OUTPUT_BLACK + 1]],
    [4, [NaN, 1.5, LEVELS_MIN_OUTPUT_WHITE - 1, LEVELS_MAX_OUTPUT_WHITE + 1]],
  ] as const) {
    for (const invalid of invalids) {
      const args = [...valid] as number[];
      args[index] = invalid;
      assert.throws(() => normalizeLevelsParameters(args[0], args[1], args[2], args[3], args[4]), /Levels/);
    }
  }

  for (const parameters of [
    [10,10,200,0,255],
    [10,9,200,0,255],
    [10,201,200,0,255],
    [0,128,255,100,100],
    [0,128,255,101,100],
  ] as const) {
    assert.throws(() => normalizeLevelsParameters(...parameters), /requires/);
  }

  assert.throws(() => levelsRgba8(source, 0, 2, ...valid), /dimensions/);
  assert.throws(() => levelsRgba8(source, 2, 0, ...valid), /dimensions/);
  assert.throws(() => levelsRgba8(source.subarray(0, 7), 2, 1, ...valid), /RGBA length/);
  assert.deepEqual([...source], before);
});

test('Levels registry contract is immutable reviewed data and remains production fail closed', () => {
  assert.equal(requireDeterministicToolByCapability(LEVELS_CAPABILITY), LEVELS_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor({ kind: 'DETERMINISTIC_TOOL', toolId: LEVELS_TOOL_ID, version: LEVELS_TOOL_VERSION }), LEVELS_TOOL_DEFINITION);
  assert.deepEqual(LEVELS_TOOL_DEFINITION.operation, { id: 'levels', type: 'LEVELS', version: '1' });
  assert.deepEqual(LEVELS_TOOL_DEFINITION.executor, { kind: 'DETERMINISTIC_TOOL', toolId: 'levels', version: '1' });
  assert.deepEqual(LEVELS_TOOL_DEFINITION.inputs, [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
  ]);
  assert.deepEqual(LEVELS_TOOL_DEFINITION.parameters.integerRanges, [
    { parameter: 'inputBlack', min: 0, max: 253 },
    { parameter: 'inputMidpoint', min: 1, max: 254 },
    { parameter: 'inputWhite', min: 2, max: 255 },
    { parameter: 'outputBlack', min: 0, max: 254 },
    { parameter: 'outputWhite', min: 1, max: 255 },
  ]);
  assert.deepEqual(LEVELS_TOOL_DEFINITION.parameters.relationships, ['INPUT_BLACK_LT_MIDPOINT_LT_INPUT_WHITE', 'OUTPUT_BLACK_LT_OUTPUT_WHITE']);
  assert.equal(LEVELS_TOOL_DEFINITION.parameters.exact.toneLaw, 'PIECEWISE_LINEAR_INPUT_MIDPOINT_TO_OUTPUT_MIDPOINT');
  assert.equal(LEVELS_TOOL_DEFINITION.parameters.exact.outputMidpointLaw, 'ROUND_HALF_UP_AVERAGE_OUTPUT_BOUNDS');
  assert.equal(LEVELS_TOOL_DEFINITION.pixelContract.rgb, 'SRGB_ENCODED_LEVELS_PIECEWISE_LINEAR_INTEGER');
  assert.deepEqual(LEVELS_TOOL_DEFINITION.lineage, { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: 'LEVELS' });
  assert.equal(isDeepFrozen(LEVELS_TOOL_DEFINITION), true);
  assert.equal(containsFunction(LEVELS_TOOL_DEFINITION), false);
  assert.equal(DETERMINISTIC_TOOL_REGISTRY.includes(LEVELS_TOOL_DEFINITION), true);
  assert.equal(productionLocalExecutorsByCapability[LEVELS_CAPABILITY], undefined, 'registry presence alone must not make Levels executable');
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
