import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MASKED_WHITE_BALANCE_CAPABILITY,
  MASKED_WHITE_BALANCE_MAX_TEMPERATURE_Q8,
  MASKED_WHITE_BALANCE_MAX_TINT_Q8,
  MASKED_WHITE_BALANCE_MIN_TEMPERATURE_Q8,
  MASKED_WHITE_BALANCE_MIN_TINT_Q8,
  MASKED_WHITE_BALANCE_TOOL_ID,
  MASKED_WHITE_BALANCE_TOOL_VERSION,
  maskedWhiteBalanceRgba8,
  normalizeMaskedWhiteBalanceParameters,
} from '../src/platform/creative/deterministic/MaskedWhiteBalance.ts';
import {
  DETERMINISTIC_TOOL_REGISTRY,
  MASKED_WHITE_BALANCE_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  requireDeterministicToolByExecutor,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

test('Masked White Balance v1 blends exact White Balance bytes by ALPHA8 mask and preserves source alpha', () => {
  const source = new Uint8ClampedArray([
    100,100,100,0,
    100,100,100,17,
    100,100,100,255,
  ]);
  const mask = new Uint8Array([0,128,255]);
  assert.deepEqual([...maskedWhiteBalanceRgba8(source, mask, 3, 1, 64, 0)], [
    100,100,100,0,
    113,100,87,17,
    125,100,75,255,
  ]);
  assert.deepEqual([...maskedWhiteBalanceRgba8(new Uint8ClampedArray([100,100,100,7]), new Uint8Array([255]), 1, 1, 0, 64)], [113,75,113,7]);
  assert.deepEqual([...maskedWhiteBalanceRgba8(source, new Uint8Array([255,255,255]), 3, 1, 0, 0)], [...source]);
});

test('Masked White Balance v1 rejects hostile parameters, geometry and MASK mismatches without mutating inputs', () => {
  const source = new Uint8ClampedArray([1,2,3,4, 5,6,7,8]);
  const mask = new Uint8Array([0,255]);
  const beforeSource = [...source];
  const beforeMask = [...mask];
  for (const invalid of [NaN, 1.5, MASKED_WHITE_BALANCE_MIN_TEMPERATURE_Q8 - 1, MASKED_WHITE_BALANCE_MAX_TEMPERATURE_Q8 + 1]) {
    assert.throws(() => normalizeMaskedWhiteBalanceParameters(invalid, 0), /temperatureQ8/);
  }
  for (const invalid of [NaN, 1.5, MASKED_WHITE_BALANCE_MIN_TINT_Q8 - 1, MASKED_WHITE_BALANCE_MAX_TINT_Q8 + 1]) {
    assert.throws(() => normalizeMaskedWhiteBalanceParameters(0, invalid), /tintQ8/);
  }
  assert.throws(() => maskedWhiteBalanceRgba8(source, mask, 0, 2, 0, 0), /dimensions/);
  assert.throws(() => maskedWhiteBalanceRgba8(source.subarray(0, 7), mask, 2, 1, 0, 0), /RGBA length/);
  assert.throws(() => maskedWhiteBalanceRgba8(source, mask.subarray(0, 1), 2, 1, 0, 0), /MASK alpha length/);
  assert.deepEqual([...source], beforeSource);
  assert.deepEqual([...mask], beforeMask);
});

test('Masked White Balance registry contract is immutable reviewed data and remains production fail closed', () => {
  assert.equal(requireDeterministicToolByCapability(MASKED_WHITE_BALANCE_CAPABILITY), MASKED_WHITE_BALANCE_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor({ kind: 'DETERMINISTIC_TOOL', toolId: MASKED_WHITE_BALANCE_TOOL_ID, version: MASKED_WHITE_BALANCE_TOOL_VERSION }), MASKED_WHITE_BALANCE_TOOL_DEFINITION);
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.operation, { id: 'masked-white-balance', type: 'MASKED_WHITE_BALANCE', version: '1' });
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.executor, { kind: 'DETERMINISTIC_TOOL', toolId: 'masked-white-balance', version: '1' });
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.inputs, [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ]);
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.parameters.integerRanges, [
    { parameter: 'temperatureQ8', min: -128, max: 128 },
    { parameter: 'tintQ8', min: -64, max: 64 },
  ]);
  assert.equal(MASKED_WHITE_BALANCE_TOOL_DEFINITION.parameters.exact.parameterEncoding, 'SIGNED_Q8_RELATIVE_CHANNEL_BALANCE');
  assert.equal(MASKED_WHITE_BALANCE_TOOL_DEFINITION.parameters.exact.maskBlend, 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP');
  assert.deepEqual(MASKED_WHITE_BALANCE_TOOL_DEFINITION.lineage, { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: 'MASKED_WHITE_BALANCE' });
  assert.equal(isDeepFrozen(MASKED_WHITE_BALANCE_TOOL_DEFINITION), true);
  assert.equal(containsFunction(MASKED_WHITE_BALANCE_TOOL_DEFINITION), false);
  assert.equal(productionLocalExecutorsByCapability[MASKED_WHITE_BALANCE_CAPABILITY], undefined, 'reviewed Masked White Balance contract must not auto-admit production execution');
  assert.equal(DETERMINISTIC_TOOL_REGISTRY.includes(MASKED_WHITE_BALANCE_TOOL_DEFINITION), true);
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
