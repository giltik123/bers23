import {
  levelsChannel,
  normalizeLevelsParameters,
  type LevelsParameters,
} from './Levels.ts';
import {
  MASKED_LEVELS_MAX_DIMENSION,
  MASKED_LEVELS_MAX_PIXELS,
  MASKED_LEVELS_MAX_WORK,
} from './MaskedLevelsIdentity.js';

export {
  MASKED_LEVELS_TOOL_ID,
  MASKED_LEVELS_TOOL_VERSION,
  MASKED_LEVELS_CAPABILITY,
  MASKED_LEVELS_OPERATION,
  MASKED_LEVELS_STEP_ID,
  MASKED_LEVELS_MIN_INPUT_BLACK,
  MASKED_LEVELS_MAX_INPUT_BLACK,
  MASKED_LEVELS_MIN_INPUT_MIDPOINT,
  MASKED_LEVELS_MAX_INPUT_MIDPOINT,
  MASKED_LEVELS_MIN_INPUT_WHITE,
  MASKED_LEVELS_MAX_INPUT_WHITE,
  MASKED_LEVELS_MIN_OUTPUT_BLACK,
  MASKED_LEVELS_MAX_OUTPUT_BLACK,
  MASKED_LEVELS_MIN_OUTPUT_WHITE,
  MASKED_LEVELS_MAX_OUTPUT_WHITE,
  MASKED_LEVELS_MAX_DIMENSION,
  MASKED_LEVELS_MAX_PIXELS,
  MASKED_LEVELS_MAX_WORK,
} from './MaskedLevelsIdentity.js';

export function normalizeMaskedLevelsParameters(
  inputBlack: number,
  inputMidpoint: number,
  inputWhite: number,
  outputBlack: number,
  outputWhite: number,
): LevelsParameters {
  return normalizeLevelsParameters(inputBlack, inputMidpoint, inputWhite, outputBlack, outputWhite);
}

/**
 * Masked Levels v1 pixel law.
 *
 * - canonical orientation-1 RGBA8/sRGB IMAGE plus same-size ALPHA8 MASK;
 * - adjusted RGB reuses the accepted Levels v1 piecewise-linear integer law;
 * - mask blend = round-half-up((source * (255-mask) + adjusted * mask) / 255);
 * - source alpha is copied byte-exact;
 * - transparent RGB is blended exactly like visible RGB;
 * - dimensions are unchanged;
 * - no Canvas, floating-point gamma/power curve, ICC conversion, GPU or
 *   premultiplication participates.
 */
export function maskedLevelsRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  maskAlpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  inputBlack: number,
  inputMidpoint: number,
  inputWhite: number,
  outputBlack: number,
  outputWhite: number,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MASKED_LEVELS_MAX_DIMENSION || height > MASKED_LEVELS_MAX_DIMENSION) {
    throw new Error('Masked Levels dimensions exceed deterministic bounds');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MASKED_LEVELS_MAX_PIXELS) throw new Error('Masked Levels pixel count exceeds deterministic bounds');
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Masked Levels source RGBA length is invalid');
  if (maskAlpha.byteLength !== pixels) throw new Error('Masked Levels MASK alpha length is invalid');
  const parameters = normalizeMaskedLevelsParameters(inputBlack, inputMidpoint, inputWhite, outputBlack, outputWhite);
  const work = pixels * 4;
  if (!Number.isSafeInteger(work) || work > MASKED_LEVELS_MAX_WORK) throw new Error('Masked Levels work exceeds deterministic bounds');

  const output = new Uint8ClampedArray(sourceRgba.byteLength);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const mask = maskAlpha[pixel];
    for (let channel = 0; channel < 3; channel += 1) {
      const source = sourceRgba[offset + channel];
      const adjusted = levelsChannel(source, parameters);
      output[offset + channel] = Math.floor((source * (255 - mask) + adjusted * mask + 127) / 255);
    }
    output[offset + 3] = sourceRgba[offset + 3];
  }
  return output;
}
