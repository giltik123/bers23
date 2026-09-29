import {
  LEVELS_MAX_DIMENSION,
  LEVELS_MAX_INPUT_BLACK,
  LEVELS_MAX_INPUT_MIDPOINT,
  LEVELS_MAX_INPUT_WHITE,
  LEVELS_MAX_OUTPUT_BLACK,
  LEVELS_MAX_OUTPUT_PIXELS,
  LEVELS_MAX_OUTPUT_WHITE,
  LEVELS_MIN_INPUT_BLACK,
  LEVELS_MIN_INPUT_MIDPOINT,
  LEVELS_MIN_INPUT_WHITE,
  LEVELS_MIN_OUTPUT_BLACK,
  LEVELS_MIN_OUTPUT_WHITE,
} from './LevelsIdentity.js';

export {
  LEVELS_TOOL_ID,
  LEVELS_TOOL_VERSION,
  LEVELS_CAPABILITY,
  LEVELS_OPERATION,
  LEVELS_STEP_ID,
  LEVELS_MIN_INPUT_BLACK,
  LEVELS_MAX_INPUT_BLACK,
  LEVELS_MIN_INPUT_MIDPOINT,
  LEVELS_MAX_INPUT_MIDPOINT,
  LEVELS_MIN_INPUT_WHITE,
  LEVELS_MAX_INPUT_WHITE,
  LEVELS_MIN_OUTPUT_BLACK,
  LEVELS_MAX_OUTPUT_BLACK,
  LEVELS_MIN_OUTPUT_WHITE,
  LEVELS_MAX_OUTPUT_WHITE,
  LEVELS_MAX_DIMENSION,
  LEVELS_MAX_OUTPUT_PIXELS,
} from './LevelsIdentity.js';

export type LevelsParameters = Readonly<{
  inputBlack: number;
  inputMidpoint: number;
  inputWhite: number;
  outputBlack: number;
  outputWhite: number;
}>;

export function normalizeLevelsParameters(
  inputBlack: number,
  inputMidpoint: number,
  inputWhite: number,
  outputBlack: number,
  outputWhite: number,
): LevelsParameters {
  if (!Number.isSafeInteger(inputBlack) || inputBlack < LEVELS_MIN_INPUT_BLACK || inputBlack > LEVELS_MAX_INPUT_BLACK) {
    throw new Error(`Levels inputBlack must be an exact integer between ${LEVELS_MIN_INPUT_BLACK} and ${LEVELS_MAX_INPUT_BLACK}`);
  }
  if (!Number.isSafeInteger(inputMidpoint) || inputMidpoint < LEVELS_MIN_INPUT_MIDPOINT || inputMidpoint > LEVELS_MAX_INPUT_MIDPOINT) {
    throw new Error(`Levels inputMidpoint must be an exact integer between ${LEVELS_MIN_INPUT_MIDPOINT} and ${LEVELS_MAX_INPUT_MIDPOINT}`);
  }
  if (!Number.isSafeInteger(inputWhite) || inputWhite < LEVELS_MIN_INPUT_WHITE || inputWhite > LEVELS_MAX_INPUT_WHITE) {
    throw new Error(`Levels inputWhite must be an exact integer between ${LEVELS_MIN_INPUT_WHITE} and ${LEVELS_MAX_INPUT_WHITE}`);
  }
  if (!(inputBlack < inputMidpoint && inputMidpoint < inputWhite)) {
    throw new Error('Levels requires inputBlack < inputMidpoint < inputWhite');
  }
  if (!Number.isSafeInteger(outputBlack) || outputBlack < LEVELS_MIN_OUTPUT_BLACK || outputBlack > LEVELS_MAX_OUTPUT_BLACK) {
    throw new Error(`Levels outputBlack must be an exact integer between ${LEVELS_MIN_OUTPUT_BLACK} and ${LEVELS_MAX_OUTPUT_BLACK}`);
  }
  if (!Number.isSafeInteger(outputWhite) || outputWhite < LEVELS_MIN_OUTPUT_WHITE || outputWhite > LEVELS_MAX_OUTPUT_WHITE) {
    throw new Error(`Levels outputWhite must be an exact integer between ${LEVELS_MIN_OUTPUT_WHITE} and ${LEVELS_MAX_OUTPUT_WHITE}`);
  }
  if (!(outputBlack < outputWhite)) throw new Error('Levels requires outputBlack < outputWhite');
  return Object.freeze({ inputBlack, inputMidpoint, inputWhite, outputBlack, outputWhite });
}

/**
 * Deterministic display-referred Levels v1.
 *
 * Pixel law:
 * - orientation-1 RGBA8 / sRGB byte domain;
 * - inputBlack < inputMidpoint < inputWhite;
 * - outputBlack < outputWhite;
 * - outputMidpoint = round-half-up((outputBlack + outputWhite) / 2);
 * - each RGB channel is clamped at the input black/white bounds and linearly
 *   mapped in two exact integer segments:
 *     inputBlack -> outputBlack
 *     inputMidpoint -> outputMidpoint
 *     inputWhite -> outputWhite
 * - segment division uses integer round-half-up;
 * - source alpha is copied byte-for-byte;
 * - transparent RGB bytes are transformed exactly like visible RGB bytes;
 * - dimensions are unchanged;
 * - no Canvas, ICC, GPU, browser filter or floating-point gamma/power function
 *   participates in canonical bytes.
 *
 * This intentionally defines a piecewise-linear Levels contract rather than a
 * Photoshop-style gamma midpoint. A gamma/power curve requires a distinct tool
 * version with its own exact lookup-table or fixed-point law.
 */
export function levelsRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  inputBlack: number,
  inputMidpoint: number,
  inputWhite: number,
  outputBlack: number,
  outputWhite: number,
): Uint8ClampedArray {
  assertGeometry(width, height);
  const pixels = width * height;
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Levels source RGBA length is invalid');
  const parameters = normalizeLevelsParameters(inputBlack, inputMidpoint, inputWhite, outputBlack, outputWhite);
  const output = new Uint8ClampedArray(sourceRgba.byteLength);
  for (let offset = 0; offset < sourceRgba.byteLength; offset += 4) {
    output[offset] = levelsChannel(sourceRgba[offset], parameters);
    output[offset + 1] = levelsChannel(sourceRgba[offset + 1], parameters);
    output[offset + 2] = levelsChannel(sourceRgba[offset + 2], parameters);
    output[offset + 3] = sourceRgba[offset + 3];
  }
  return output;
}

export function levelsChannel(channel: number, parameters: LevelsParameters): number {
  if (!Number.isSafeInteger(channel) || channel < 0 || channel > 255) throw new Error('Levels channel must be an exact RGBA8 byte');
  const { inputBlack, inputMidpoint, inputWhite, outputBlack, outputWhite } = parameters;
  const outputMidpoint = Math.floor((outputBlack + outputWhite + 1) / 2);
  if (channel <= inputBlack) return outputBlack;
  if (channel >= inputWhite) return outputWhite;
  if (channel <= inputMidpoint) {
    return outputBlack + roundHalfUpRatio(
      (channel - inputBlack) * (outputMidpoint - outputBlack),
      inputMidpoint - inputBlack,
    );
  }
  return outputMidpoint + roundHalfUpRatio(
    (channel - inputMidpoint) * (outputWhite - outputMidpoint),
    inputWhite - inputMidpoint,
  );
}

function roundHalfUpRatio(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator < 1) {
    throw new Error('Levels interpolation accumulator is invalid');
  }
  const doubled = numerator * 2 + denominator;
  if (!Number.isSafeInteger(doubled)) throw new Error('Levels interpolation accumulator exceeded deterministic bounds');
  return Math.floor(doubled / (denominator * 2));
}

function assertGeometry(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > LEVELS_MAX_DIMENSION || height > LEVELS_MAX_DIMENSION) {
    throw new Error(`Levels source dimensions must be exact integers between 1 and ${LEVELS_MAX_DIMENSION}`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > LEVELS_MAX_OUTPUT_PIXELS) throw new Error('Levels source exceeds deterministic output pixel limit');
}
