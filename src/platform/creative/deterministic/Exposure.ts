import {
  EXPOSURE_GAIN_FIXED_POINT_BITS,
  EXPOSURE_GAIN_FIXED_POINT_ONE,
  EXPOSURE_MAX_DIMENSION,
  EXPOSURE_MAX_EIGHTH_STOPS,
  EXPOSURE_MAX_OUTPUT_PIXELS,
  EXPOSURE_MIN_EIGHTH_STOPS,
  EXPOSURE_STOP_DENOMINATOR,
} from './ExposureIdentity.js';

export {
  EXPOSURE_TOOL_ID,
  EXPOSURE_TOOL_VERSION,
  EXPOSURE_CAPABILITY,
  EXPOSURE_OPERATION,
  EXPOSURE_STEP_ID,
  EXPOSURE_STOP_DENOMINATOR,
  EXPOSURE_MIN_EIGHTH_STOPS,
  EXPOSURE_MAX_EIGHTH_STOPS,
  EXPOSURE_GAIN_FIXED_POINT_BITS,
  EXPOSURE_GAIN_FIXED_POINT_ONE,
  EXPOSURE_MAX_DIMENSION,
  EXPOSURE_MAX_OUTPUT_PIXELS,
} from './ExposureIdentity.js';

/**
 * Q16.16 gains for 2^(n/8), n in [-32, 32], rounded half up once and then frozen.
 * Runtime pixel math contains no floating-point exponentiation or platform color API.
 */
export const EXPOSURE_GAIN_Q16_BY_EIGHTH_STOP: readonly number[] = Object.freeze([
  4096, 4467, 4871, 5312, 5793, 6317, 6889, 7512,
  8192, 8933, 9742, 10624, 11585, 12634, 13777, 15024,
  16384, 17867, 19484, 21247, 23170, 25268, 27554, 30048,
  32768, 35734, 38968, 42495, 46341, 50535, 55109, 60097,
  65536, 71468, 77936, 84990, 92682, 101070, 110218, 120194,
  131072, 142935, 155872, 169979, 185364, 202141, 220436, 240387,
  262144, 285870, 311744, 339959, 370728, 404281, 440872, 480774,
  524288, 571740, 623487, 679917, 741455, 808563, 881744, 961548,
  1048576,
]);

export function normalizeExposureEighthStops(value: number): number {
  if (!Number.isSafeInteger(value) || value < EXPOSURE_MIN_EIGHTH_STOPS || value > EXPOSURE_MAX_EIGHTH_STOPS) {
    throw new Error(`Exposure eighth-stops must be an exact integer between ${EXPOSURE_MIN_EIGHTH_STOPS} and ${EXPOSURE_MAX_EIGHTH_STOPS}`);
  }
  return value;
}

export function exposureGainQ16(eighthStops: number): number {
  const normalized = normalizeExposureEighthStops(eighthStops);
  const index = normalized - EXPOSURE_MIN_EIGHTH_STOPS;
  const gain = EXPOSURE_GAIN_Q16_BY_EIGHTH_STOP[index];
  if (!Number.isSafeInteger(gain) || gain < 1) throw new Error('Exposure gain table is invalid');
  return gain;
}

/**
 * Deterministic display-referred Exposure v1.
 *
 * Pixel law:
 * - RGBA8 / sRGB byte domain / orientation 1;
 * - exposure is signed eighth-stops in [-32, 32] => [-4, +4] EV;
 * - gain is the committed Q16.16 table value for 2^(eighthStops/8);
 * - each RGB byte is multiplied by that gain, rounded half up, then clamped to 255;
 * - alpha is copied byte-for-byte;
 * - transparent RGB bytes are transformed exactly like visible RGB bytes;
 * - dimensions are unchanged;
 * - no Canvas, ColorSync, ICC, GPU, browser image filter or floating-point exponentiation participates in canonical bytes.
 *
 * This intentionally defines a display-referred sRGB-byte gain, not a scene-linear
 * radiometric exposure model. A future linear-light tool requires a distinct version.
 */
export function exposureRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  eighthStops: number,
): Uint8ClampedArray {
  assertGeometry(width, height);
  const pixels = width * height;
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Exposure source RGBA length is invalid');
  const gainQ16 = exposureGainQ16(eighthStops);
  const output = new Uint8ClampedArray(sourceRgba.byteLength);

  for (let offset = 0; offset < sourceRgba.byteLength; offset += 4) {
    output[offset] = applyGain(sourceRgba[offset], gainQ16);
    output[offset + 1] = applyGain(sourceRgba[offset + 1], gainQ16);
    output[offset + 2] = applyGain(sourceRgba[offset + 2], gainQ16);
    output[offset + 3] = sourceRgba[offset + 3];
  }
  return output;
}

function applyGain(channel: number, gainQ16: number): number {
  const numerator = channel * gainQ16;
  if (!Number.isSafeInteger(numerator) || numerator < 0) throw new Error('Exposure gain accumulator exceeded deterministic bounds');
  const rounded = Math.floor((numerator + EXPOSURE_GAIN_FIXED_POINT_ONE / 2) / EXPOSURE_GAIN_FIXED_POINT_ONE);
  return rounded > 255 ? 255 : rounded;
}

function assertGeometry(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > EXPOSURE_MAX_DIMENSION || height > EXPOSURE_MAX_DIMENSION) {
    throw new Error(`Exposure source dimensions must be exact integers between 1 and ${EXPOSURE_MAX_DIMENSION}`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > EXPOSURE_MAX_OUTPUT_PIXELS) throw new Error('Exposure source exceeds deterministic output pixel limit');
}

if (EXPOSURE_GAIN_Q16_BY_EIGHTH_STOP.length !== EXPOSURE_MAX_EIGHTH_STOPS - EXPOSURE_MIN_EIGHTH_STOPS + 1) {
  throw new Error('Exposure gain table length does not match the declared stop range');
}
if (EXPOSURE_GAIN_Q16_BY_EIGHTH_STOP[-EXPOSURE_MIN_EIGHTH_STOPS] !== EXPOSURE_GAIN_FIXED_POINT_ONE) {
  throw new Error('Exposure zero-stop gain must equal Q16.16 one');
}
if (EXPOSURE_STOP_DENOMINATOR !== 8 || EXPOSURE_GAIN_FIXED_POINT_BITS !== 16) {
  throw new Error('Exposure v1 fixed semantic constants changed unexpectedly');
}
