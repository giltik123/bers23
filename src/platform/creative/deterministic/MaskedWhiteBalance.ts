import {
  WHITE_BALANCE_GAIN_FIXED_POINT_ONE,
  normalizeWhiteBalanceParameters,
  whiteBalanceGainsQ16,
} from './WhiteBalance.ts';
import {
  MASKED_WHITE_BALANCE_MAX_DIMENSION,
  MASKED_WHITE_BALANCE_MAX_PIXELS,
  MASKED_WHITE_BALANCE_MAX_WORK,
} from './MaskedWhiteBalanceIdentity.js';

export {
  MASKED_WHITE_BALANCE_CAPABILITY,
  MASKED_WHITE_BALANCE_OPERATION,
  MASKED_WHITE_BALANCE_STEP_ID,
  MASKED_WHITE_BALANCE_TOOL_ID,
  MASKED_WHITE_BALANCE_TOOL_VERSION,
  MASKED_WHITE_BALANCE_MIN_TEMPERATURE_Q8,
  MASKED_WHITE_BALANCE_MAX_TEMPERATURE_Q8,
  MASKED_WHITE_BALANCE_MIN_TINT_Q8,
  MASKED_WHITE_BALANCE_MAX_TINT_Q8,
  MASKED_WHITE_BALANCE_PARAMETER_FRACTION_BITS,
  MASKED_WHITE_BALANCE_GAIN_FIXED_POINT_BITS,
  MASKED_WHITE_BALANCE_MAX_DIMENSION,
  MASKED_WHITE_BALANCE_MAX_PIXELS,
  MASKED_WHITE_BALANCE_MAX_WORK,
} from './MaskedWhiteBalanceIdentity.js';

export function normalizeMaskedWhiteBalanceParameters(
  temperatureQ8: number,
  tintQ8: number,
): Readonly<{ temperatureQ8: number; tintQ8: number }> {
  return normalizeWhiteBalanceParameters(temperatureQ8, tintQ8);
}

/**
 * Masked White Balance v1 pixel law.
 *
 * - canonical orientation-1 RGBA8/sRGB IMAGE plus same-size ALPHA8 MASK;
 * - adjusted RGB reuses the accepted White Balance v1 signed Q8 -> Q16.16 gain law;
 * - adjusted = clamp(round-half-up(source * channelGainQ16 / 65536), 0, 255);
 * - mask blend = round-half-up((source * (255-mask) + adjusted * mask) / 255);
 * - source alpha is copied byte-exact;
 * - transparent RGB is blended exactly like visible RGB;
 * - dimensions are unchanged;
 * - no Canvas, floating-point color-temperature transform, ICC conversion, GPU or premultiplication participates.
 */
export function maskedWhiteBalanceRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  maskAlpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  temperatureQ8: number,
  tintQ8: number,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MASKED_WHITE_BALANCE_MAX_DIMENSION || height > MASKED_WHITE_BALANCE_MAX_DIMENSION) {
    throw new Error('Masked White Balance dimensions exceed deterministic bounds');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MASKED_WHITE_BALANCE_MAX_PIXELS) throw new Error('Masked White Balance pixel count exceeds deterministic bounds');
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Masked White Balance source RGBA length is invalid');
  if (maskAlpha.byteLength !== pixels) throw new Error('Masked White Balance MASK alpha length is invalid');
  const normalized = normalizeMaskedWhiteBalanceParameters(temperatureQ8, tintQ8);
  const gains = whiteBalanceGainsQ16(normalized.temperatureQ8, normalized.tintQ8);
  const channelGains = [gains.red, gains.green, gains.blue] as const;
  const work = pixels * 4;
  if (!Number.isSafeInteger(work) || work > MASKED_WHITE_BALANCE_MAX_WORK) throw new Error('Masked White Balance work exceeds deterministic bounds');

  const output = new Uint8ClampedArray(sourceRgba.byteLength);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const mask = maskAlpha[pixel];
    for (let channel = 0; channel < 3; channel += 1) {
      const source = sourceRgba[offset + channel];
      const adjusted = Math.min(255, Math.floor((source * channelGains[channel] + WHITE_BALANCE_GAIN_FIXED_POINT_ONE / 2) / WHITE_BALANCE_GAIN_FIXED_POINT_ONE));
      output[offset + channel] = Math.floor((source * (255 - mask) + adjusted * mask + 127) / 255);
    }
    output[offset + 3] = sourceRgba[offset + 3];
  }
  return output;
}
