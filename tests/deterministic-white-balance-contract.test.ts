import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHITE_BALANCE_CAPABILITY,
  WHITE_BALANCE_GAIN_FIXED_POINT_ONE,
  WHITE_BALANCE_MAX_TEMPERATURE_Q8,
  WHITE_BALANCE_MAX_TINT_Q8,
  WHITE_BALANCE_MIN_TEMPERATURE_Q8,
  WHITE_BALANCE_MIN_TINT_Q8,
  WHITE_BALANCE_TOOL_ID,
  WHITE_BALANCE_TOOL_VERSION,
  normalizeWhiteBalanceParameters,
  whiteBalanceGainsQ16,
  whiteBalanceRgba8,
} from '../src/platform/creative/deterministic/WhiteBalance.ts';
import {
  DETERMINISTIC_TOOL_REGISTRY,
  WHITE_BALANCE_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  requireDeterministicToolByExecutor,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

test('White Balance v1 derives exact Q16 gains from bounded signed Q8 controls', () => {
  assert.deepEqual(whiteBalanceGainsQ16(0, 0), { red: 65536, green: 65536, blue: 65536 });
  assert.deepEqual(whiteBalanceGainsQ16(64, 0), { red: 81920, green: 65536, blue: 49152 });
  assert.deepEqual(whiteBalanceGainsQ16(0, 64), { red: 73728, green: 49152, blue: 73728 });
  assert.deepEqual(whiteBalanceGainsQ16(64, 32), { red: 86016, green: 57344, blue: 53248 });
  for (const [temperatureQ8, tintQ8] of [[-128, -64], [-128, 64], [128, -64], [128, 64]] as const) {
    const gains = whiteBalanceGainsQ16(temperatureQ8, tintQ8);
    assert.equal(gains.red + gains.green + gains.blue, WHITE_BALANCE_GAIN_FIXED_POINT_ONE * 3);
    assert.ok(Object.values(gains).every(gain => Number.isSafeInteger(gain) && gain > 0));
  }
});

test('White Balance v1 transforms sRGB bytes exactly and preserves source alpha', () => {
  const source = new Uint8ClampedArray([
    100,100,100,0,
    16,64,200,17,
    255,128,1,255,
  ]);
  assert.deepEqual([...whiteBalanceRgba8(source, 3, 1, 64, 0)], [
    125,100,75,0,
    20,64,150,17,
    255,128,1,255,
  ]);
  assert.deepEqual([...whiteBalanceRgba8(new Uint8ClampedArray([100,100,100,7]), 1, 1, 0, 64)], [113,75,113,7]);
  assert.deepEqual([...whiteBalanceRgba8(new Uint8ClampedArray([100,100,100,9]), 1, 1, 64, 32)], [131,88,81,9]);
  assert.deepEqual([...whiteBalanceRgba8(source, 3, 1, 0, 0)], [...source]);
});

test('White Balance v1 rejects hostile controls and geometry without mutating source', () => {
  const source = new Uint8ClampedArray([1,2,3,4, 5,6,7,8]);
  const before = [...source];
  for (const invalid of [NaN, 1.5, WHITE_BALANCE_MIN_TEMPERATURE_Q8 - 1, WHITE_BALANCE_MAX_TEMPERATURE_Q8 + 1]) {
    assert.throws(() => normalizeWhiteBalanceParameters(invalid, 0), /temperatureQ8/);
  }
  for (const invalid of [NaN, 1.5, WHITE_BALANCE_MIN_TINT_Q8 - 1, WHITE_BALANCE_MAX_TINT_Q8 + 1]) {
    assert.throws(() => normalizeWhiteBalanceParameters(0, invalid), /tintQ8/);
  }
  assert.throws(() => whiteBalanceRgba8(source, 0, 2, 0, 0), /dimensions/);
  assert.throws(() => whiteBalanceRgba8(source, 2, 0, 0, 0), /dimensions/);
  assert.throws(() => whiteBalanceRgba8(source.subarray(0, 7), 2, 1, 0, 0), /RGBA length/);
  assert.deepEqual([...source], before);
});

test('White Balance registry contract is immutable reviewed data and remains production fail closed', () => {
  assert.equal(requireDeterministicToolByCapability(WHITE_BALANCE_CAPABILITY), WHITE_BALANCE_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor({ kind: 'DETERMINISTIC_TOOL', toolId: WHITE_BALANCE_TOOL_ID, version: WHITE_BALANCE_TOOL_VERSION }), WHITE_BALANCE_TOOL_DEFINITION);
  assert.deepEqual(WHITE_BALANCE_TOOL_DEFINITION.operation, { id: 'white-balance', type: 'WHITE_BALANCE', version: '1' });
  assert.deepEqual(WHITE_BALANCE_TOOL_DEFINITION.executor, { kind: 'DETERMINISTIC_TOOL', toolId: 'white-balance', version: '1' });
  assert.deepEqual(WHITE_BALANCE_TOOL_DEFINITION.inputs, [{ name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' }]);
  assert.deepEqual(WHITE_BALANCE_TOOL_DEFINITION.output, { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' });
  assert.equal(WHITE_BALANCE_TOOL_DEFINITION.parameters.exact.transferDomain, 'SRGB_ENCODED_BYTE_DOMAIN');
  assert.equal(WHITE_BALANCE_TOOL_DEFINITION.parameters.exact.parameterEncoding, 'SIGNED_Q8_RELATIVE_CHANNEL_BALANCE');
  assert.equal(WHITE_BALANCE_TOOL_DEFINITION.parameters.exact.temperatureLaw, 'RED_PLUS_BLUE_MINUS_EQUAL_Q8');
  assert.equal(WHITE_BALANCE_TOOL_DEFINITION.parameters.exact.tintLaw, 'MAGENTA_PLUS_HALF_GREEN_MINUS_FULL_Q8');
  assert.deepEqual(WHITE_BALANCE_TOOL_DEFINITION.parameters.integerRanges, [
    { parameter: 'temperatureQ8', min: -128, max: 128 },
    { parameter: 'tintQ8', min: -64, max: 64 },
  ]);
  assert.deepEqual(WHITE_BALANCE_TOOL_DEFINITION.pixelContract, {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'SRGB_ENCODED_WHITE_BALANCE_Q8_TO_Q16',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'ROUND_HALF_UP',
  });
  assert.deepEqual(WHITE_BALANCE_TOOL_DEFINITION.lineage, { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: 'WHITE_BALANCE' });
  assert.equal(isDeepFrozen(WHITE_BALANCE_TOOL_DEFINITION), true);
  assert.equal(containsFunction(WHITE_BALANCE_TOOL_DEFINITION), false);
  assert.equal(productionLocalExecutorsByCapability[WHITE_BALANCE_CAPABILITY], undefined, 'reviewed White Balance contract must not auto-admit production execution');
  assert.equal(DETERMINISTIC_TOOL_REGISTRY.includes(WHITE_BALANCE_TOOL_DEFINITION), true);
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
