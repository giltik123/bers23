import {
  EXPOSURE_MAX_DIMENSION,
  EXPOSURE_MAX_EIGHTH_STOPS,
  EXPOSURE_MAX_OUTPUT_PIXELS,
  EXPOSURE_MIN_EIGHTH_STOPS,
  exposureGainQ16,
  normalizeExposureEighthStops,
} from './Exposure.ts';

export {
  MASKED_EXPOSURE_CAPABILITY,
  MASKED_EXPOSURE_OPERATION,
  MASKED_EXPOSURE_STEP_ID,
  MASKED_EXPOSURE_TOOL_ID,
  MASKED_EXPOSURE_TOOL_VERSION,
} from './MaskedExposureIdentity.js';

export const MASKED_EXPOSURE_MIN_EIGHTH_STOPS = EXPOSURE_MIN_EIGHTH_STOPS;
export const MASKED_EXPOSURE_MAX_EIGHTH_STOPS = EXPOSURE_MAX_EIGHTH_STOPS;
export const MASKED_EXPOSURE_MAX_DIMENSION = EXPOSURE_MAX_DIMENSION;
export const MASKED_EXPOSURE_MAX_PIXELS = EXPOSURE_MAX_OUTPUT_PIXELS;
export const MASKED_EXPOSURE_MAX_WORK = EXPOSURE_MAX_OUTPUT_PIXELS * 4;

export function normalizeMaskedExposureEighthStops(value: number): number {
  return normalizeExposureEighthStops(value);
}

/**
 * Masked Exposure v1 pixel law.
 *
 * - canonical orientation-1 RGBA8/sRGB IMAGE plus same-size ALPHA8 MASK;
 * - adjusted RGB reuses the accepted Exposure v1 Q16.16 eighth-stop gain law;
 * - adjusted = clamp(round-half-up(source * gainQ16 / 65536), 0, 255);
 * - mask blend = round-half-up((source * (255-mask) + adjusted * mask) / 255);
 * - source alpha is copied byte-exact;
 * - transparent RGB is blended exactly like visible RGB;
 * - no Canvas, floating-point transcendental math, ICC conversion, GPU or premultiplication participates.
 */
export function maskedExposureRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  maskAlpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  eighthStops: number,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MASKED_EXPOSURE_MAX_DIMENSION || height > MASKED_EXPOSURE_MAX_DIMENSION) {
    throw new Error('Masked Exposure dimensions exceed deterministic bounds');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MASKED_EXPOSURE_MAX_PIXELS) throw new Error('Masked Exposure pixel count exceeds deterministic bounds');
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Masked Exposure source RGBA length is invalid');
  if (maskAlpha.byteLength !== pixels) throw new Error('Masked Exposure MASK alpha length is invalid');
  const gainQ16 = exposureGainQ16(normalizeMaskedExposureEighthStops(eighthStops));
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
