import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPOSURE_CAPABILITY,
  EXPOSURE_GAIN_FIXED_POINT_ONE,
  EXPOSURE_MAX_EIGHTH_STOPS,
  EXPOSURE_MIN_EIGHTH_STOPS,
  EXPOSURE_TOOL_ID,
  EXPOSURE_TOOL_VERSION,
  exposureGainQ16,
  exposureRgba8,
  normalizeExposureEighthStops,
} from '../src/platform/creative/deterministic/Exposure.ts';
import {
  DETERMINISTIC_TOOL_REGISTRY,
  EXPOSURE_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  requireDeterministicToolByExecutor,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const source = new Uint8ClampedArray([
  0,1,64,0,
  127,128,200,17,
  255,3,5,255,
  10,20,30,128,
]);

test('Exposure v1 applies exact display-referred Q16 gain and preserves alpha bytes', () => {
  assert.equal(exposureGainQ16(0), EXPOSURE_GAIN_FIXED_POINT_ONE);
  assert.equal(exposureGainQ16(8), 131072);
  assert.equal(exposureGainQ16(-8), 32768);
  assert.equal(exposureGainQ16(1), 71468);

  assert.deepEqual([...exposureRgba8(source, 2, 2, 8)], [
    0,2,128,0,
    254,255,255,17,
    255,6,10,255,
    20,40,60,128,
  ]);
  assert.deepEqual([...exposureRgba8(source, 2, 2, -8)], [
    0,1,32,0,
    64,64,100,17,
    128,2,3,255,
    5,10,15,128,
  ]);
});

test('Exposure eighth-stop table is exact monotonic bounded data with deterministic clamp', () => {
  let previous = 0;
  for (let stop = EXPOSURE_MIN_EIGHTH_STOPS; stop <= EXPOSURE_MAX_EIGHTH_STOPS; stop += 1) {
    const gain = exposureGainQ16(stop);
    assert.equal(Number.isSafeInteger(gain), true);
    assert.ok(gain > previous);
    previous = gain;
  }
  const fractional = exposureRgba8(new Uint8ClampedArray([16,64,200,7, 254,255,1,0]), 2, 1, 1);
  assert.deepEqual([...fractional], [17,70,218,7, 255,255,1,0]);
});

test('Exposure v1 rejects hostile parameters and geometry without mutating source', () => {
  const before = [...source];
  for (const invalid of [NaN, 1.5, EXPOSURE_MIN_EIGHTH_STOPS - 1, EXPOSURE_MAX_EIGHTH_STOPS + 1]) {
    assert.throws(() => normalizeExposureEighthStops(invalid), /eighth-stops/);
  }
  assert.throws(() => exposureRgba8(source, 0, 2, 0), /dimensions/);
  assert.throws(() => exposureRgba8(source, 2, 0, 0), /dimensions/);
  assert.throws(() => exposureRgba8(source.subarray(0, source.length - 1), 2, 2, 0), /RGBA length/);
  assert.deepEqual([...source], before);
});

test('Exposure registry contract is immutable reviewed data and remains production fail closed', () => {
  assert.equal(requireDeterministicToolByCapability(EXPOSURE_CAPABILITY), EXPOSURE_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor({ kind: 'DETERMINISTIC_TOOL', toolId: EXPOSURE_TOOL_ID, version: EXPOSURE_TOOL_VERSION }), EXPOSURE_TOOL_DEFINITION);
  assert.deepEqual(EXPOSURE_TOOL_DEFINITION.operation, { id: 'exposure', type: 'EXPOSURE', version: '1' });
  assert.deepEqual(EXPOSURE_TOOL_DEFINITION.executor, { kind: 'DETERMINISTIC_TOOL', toolId: 'exposure', version: '1' });
  assert.deepEqual(EXPOSURE_TOOL_DEFINITION.inputs, [{ name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' }]);
  assert.deepEqual(EXPOSURE_TOOL_DEFINITION.output, { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' });
  assert.equal(EXPOSURE_TOOL_DEFINITION.parameters.exact.transferDomain, 'SRGB_ENCODED_BYTE_DOMAIN');
  assert.equal(EXPOSURE_TOOL_DEFINITION.parameters.exact.gainEncoding, 'Q16_16_COMMITTED_EIGHTH_STOP_TABLE');
  assert.equal(EXPOSURE_TOOL_DEFINITION.parameters.exact.stopDenominator, 8);
  assert.deepEqual(EXPOSURE_TOOL_DEFINITION.parameters.integerRanges, [{ parameter: 'eighthStops', min: -32, max: 32 }]);
  assert.deepEqual(EXPOSURE_TOOL_DEFINITION.pixelContract, {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'SRGB_ENCODED_EXPOSURE_GAIN_Q16',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'ROUND_HALF_UP',
  });
  assert.deepEqual(EXPOSURE_TOOL_DEFINITION.lineage, { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: 'EXPOSURE' });
  assert.equal(isDeepFrozen(EXPOSURE_TOOL_DEFINITION), true);
  assert.equal(containsFunction(EXPOSURE_TOOL_DEFINITION), false);
  assert.equal(productionLocalExecutorsByCapability[EXPOSURE_CAPABILITY], undefined, 'reviewed Exposure contract must not auto-admit production execution');
  assert.equal(DETERMINISTIC_TOOL_REGISTRY.includes(EXPOSURE_TOOL_DEFINITION), true);
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
