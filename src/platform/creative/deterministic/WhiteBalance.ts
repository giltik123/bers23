import {
  WHITE_BALANCE_GAIN_FIXED_POINT_ONE,
  WHITE_BALANCE_MAX_DIMENSION,
  WHITE_BALANCE_MAX_OUTPUT_PIXELS,
  WHITE_BALANCE_MAX_TEMPERATURE_Q8,
  WHITE_BALANCE_MAX_TINT_Q8,
  WHITE_BALANCE_MIN_TEMPERATURE_Q8,
  WHITE_BALANCE_MIN_TINT_Q8,
} from './WhiteBalanceIdentity.js';

export {
  WHITE_BALANCE_TOOL_ID,
  WHITE_BALANCE_TOOL_VERSION,
  WHITE_BALANCE_CAPABILITY,
  WHITE_BALANCE_OPERATION,
  WHITE_BALANCE_STEP_ID,
  WHITE_BALANCE_MIN_TEMPERATURE_Q8,
  WHITE_BALANCE_MAX_TEMPERATURE_Q8,
  WHITE_BALANCE_MIN_TINT_Q8,
  WHITE_BALANCE_MAX_TINT_Q8,
  WHITE_BALANCE_PARAMETER_FRACTION_BITS,
  WHITE_BALANCE_GAIN_FIXED_POINT_BITS,
  WHITE_BALANCE_GAIN_FIXED_POINT_ONE,
  WHITE_BALANCE_MAX_DIMENSION,
  WHITE_BALANCE_MAX_OUTPUT_PIXELS,
} from './WhiteBalanceIdentity.js';

export type WhiteBalanceGainsQ16 = Readonly<{ red: number; green: number; blue: number }>;

export function normalizeWhiteBalanceParameters(temperatureQ8: number, tintQ8: number): Readonly<{ temperatureQ8: number; tintQ8: number }> {
  if (!Number.isSafeInteger(temperatureQ8) || temperatureQ8 < WHITE_BALANCE_MIN_TEMPERATURE_Q8 || temperatureQ8 > WHITE_BALANCE_MAX_TEMPERATURE_Q8) {
    throw new Error(`White Balance temperatureQ8 must be an exact integer between ${WHITE_BALANCE_MIN_TEMPERATURE_Q8} and ${WHITE_BALANCE_MAX_TEMPERATURE_Q8}`);
  }
  if (!Number.isSafeInteger(tintQ8) || tintQ8 < WHITE_BALANCE_MIN_TINT_Q8 || tintQ8 > WHITE_BALANCE_MAX_TINT_Q8) {
    throw new Error(`White Balance tintQ8 must be an exact integer between ${WHITE_BALANCE_MIN_TINT_Q8} and ${WHITE_BALANCE_MAX_TINT_Q8}`);
  }
  return Object.freeze({ temperatureQ8, tintQ8 });
}

/**
 * Derives exact Q16.16 channel gains from signed Q8 controls.
 *
 * temperatureQ8:
 *   +1 raises red gain by 1/256 and lowers blue by 1/256.
 * tintQ8:
 *   +1 is a magenta shift: red/blue each gain +1/512 while green loses 1/256.
 *
 * The nominal three-channel gain sum remains exactly 3.0 for every admitted
 * parameter pair. This is a deterministic relative color-balance law, not a
 * physical Kelvin/CIE white-point transform.
 */
export function whiteBalanceGainsQ16(temperatureQ8: number, tintQ8: number): WhiteBalanceGainsQ16 {
  const normalized = normalizeWhiteBalanceParameters(temperatureQ8, tintQ8);
  const temperatureDeltaQ16 = normalized.temperatureQ8 * 256;
  const tintDeltaQ16 = normalized.tintQ8 * 256;
  const tintHalfDeltaQ16 = tintDeltaQ16 / 2;
  const gains = Object.freeze({
    red: WHITE_BALANCE_GAIN_FIXED_POINT_ONE + temperatureDeltaQ16 + tintHalfDeltaQ16,
    green: WHITE_BALANCE_GAIN_FIXED_POINT_ONE - tintDeltaQ16,
    blue: WHITE_BALANCE_GAIN_FIXED_POINT_ONE - temperatureDeltaQ16 + tintHalfDeltaQ16,
  });
  for (const gain of Object.values(gains)) if (!Number.isSafeInteger(gain) || gain <= 0) throw new Error('White Balance derived gain is outside deterministic bounds');
  return gains;
}

/**
 * Deterministic display-referred White Balance v1.
 *
 * - orientation-1 RGBA8 / sRGB byte domain;
 * - temperatureQ8/tintQ8 use the exact relative Q8 gain law above;
 * - each RGB byte is multiplied by its Q16.16 channel gain, rounded half up,
 *   then clamped to 255;
 * - source alpha is copied byte-for-byte;
 * - transparent RGB bytes are transformed exactly like visible RGB bytes;
 * - dimensions are unchanged;
 * - no Canvas, ColorSync, ICC, GPU, browser image filter or floating-point
 *   transcendental/color-temperature conversion participates in canonical bytes.
 */
export function whiteBalanceRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  temperatureQ8: number,
  tintQ8: number,
): Uint8ClampedArray {
  assertGeometry(width, height);
  const pixels = width * height;
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('White Balance source RGBA length is invalid');
  const gains = whiteBalanceGainsQ16(temperatureQ8, tintQ8);
  const output = new Uint8ClampedArray(sourceRgba.byteLength);
  for (let offset = 0; offset < sourceRgba.byteLength; offset += 4) {
    output[offset] = applyGain(sourceRgba[offset], gains.red);
    output[offset + 1] = applyGain(sourceRgba[offset + 1], gains.green);
    output[offset + 2] = applyGain(sourceRgba[offset + 2], gains.blue);
    output[offset + 3] = sourceRgba[offset + 3];
  }
  return output;
}

function applyGain(channel: number, gainQ16: number): number {
  const numerator = channel * gainQ16;
  if (!Number.isSafeInteger(numerator) || numerator < 0) throw new Error('White Balance gain accumulator exceeded deterministic bounds');
  const rounded = Math.floor((numerator + WHITE_BALANCE_GAIN_FIXED_POINT_ONE / 2) / WHITE_BALANCE_GAIN_FIXED_POINT_ONE);
  return rounded > 255 ? 255 : rounded;
}

function assertGeometry(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > WHITE_BALANCE_MAX_DIMENSION || height > WHITE_BALANCE_MAX_DIMENSION) {
    throw new Error(`White Balance source dimensions must be exact integers between 1 and ${WHITE_BALANCE_MAX_DIMENSION}`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > WHITE_BALANCE_MAX_OUTPUT_PIXELS) throw new Error('White Balance source exceeds deterministic output pixel limit');
}
