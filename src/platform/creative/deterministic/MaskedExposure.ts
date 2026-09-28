export {
  MASKED_EXPOSURE_CAPABILITY,
  MASKED_EXPOSURE_OPERATION,
  MASKED_EXPOSURE_STEP_ID,
  MASKED_EXPOSURE_TOOL_ID,
  MASKED_EXPOSURE_TOOL_VERSION,
} from './MaskedExposureIdentity.js';

export const MASKED_EXPOSURE_MIN_QUARTER_STOPS = -8;
export const MASKED_EXPOSURE_MAX_QUARTER_STOPS = 8;
export const MASKED_EXPOSURE_MAX_DIMENSION = 8192;
export const MASKED_EXPOSURE_MAX_PIXELS = 16_777_216;
export const MASKED_EXPOSURE_MAX_WORK = 67_108_864;

/**
 * Exact Q16 gain table for quarter-stop values -2EV..+2EV.
 * Each value is round-half-up(2^(quarterStops / 4) * 65536).
 * Runtime execution never evaluates pow/exp/log.
 */
export const MASKED_EXPOSURE_GAIN_Q16: Readonly<Record<number, number>> = Object.freeze({
  [-8]: 16384,
  [-7]: 19484,
  [-6]: 23170,
  [-5]: 27554,
  [-4]: 32768,
  [-3]: 38968,
  [-2]: 46341,
  [-1]: 55109,
  [0]: 65536,
  [1]: 77936,
  [2]: 92682,
  [3]: 110218,
  [4]: 131072,
  [5]: 155872,
  [6]: 185364,
  [7]: 220436,
  [8]: 262144,
});

export function normalizeMaskedExposureQuarterStops(value: number): number {
  if (!Number.isSafeInteger(value) || value < MASKED_EXPOSURE_MIN_QUARTER_STOPS || value > MASKED_EXPOSURE_MAX_QUARTER_STOPS) {
    throw new Error('Masked Exposure quarterStops must be an integer from -8 through 8');
  }
  return value;
}

/**
 * Masked Exposure v1 pixel law.
 *
 * - RGBA8 canonical orientation-1 source and same-size ALPHA_8 MASK.
 * - RGB gain occurs in encoded sRGB byte-value space using the immutable Q16 table.
 * - adjusted = clamp(round-half-up(source * gainQ16 / 65536), 0, 255).
 * - mask blend = round-half-up((source * (255-mask) + adjusted * mask) / 255).
 * - source alpha is copied byte-exact.
 * - no Canvas, floating-point transcendental math, ICC conversion or premultiplication.
 */
export function maskedExposureRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  maskAlpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  quarterStops: number,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MASKED_EXPOSURE_MAX_DIMENSION || height > MASKED_EXPOSURE_MAX_DIMENSION) {
    throw new Error('Masked Exposure dimensions exceed deterministic bounds');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MASKED_EXPOSURE_MAX_PIXELS) throw new Error('Masked Exposure pixel count exceeds deterministic bounds');
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Masked Exposure source RGBA length is invalid');
  if (maskAlpha.byteLength !== pixels) throw new Error('Masked Exposure MASK alpha length is invalid');
  const normalizedQuarterStops = normalizeMaskedExposureQuarterStops(quarterStops);
  const gainQ16 = MASKED_EXPOSURE_GAIN_Q16[normalizedQuarterStops];
  const work = pixels * 4;
  if (!Number.isSafeInteger(work) || work > MASKED_EXPOSURE_MAX_WORK) throw new Error('Masked Exposure work exceeds deterministic bounds');

  const output = new Uint8ClampedArray(sourceRgba.byteLength);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const mask = maskAlpha[pixel];
    for (let channel = 0; channel < 3; channel += 1) {
      const source = sourceRgba[offset + channel];
      const adjusted = Math.min(255, Math.floor((source * gainQ16 + 32768) / 65536));
      output[offset + channel] = Math.floor((source * (255 - mask) + adjusted * mask + 127) / 255);
    }
    output[offset + 3] = sourceRgba[offset + 3];
  }
  return output;
}
