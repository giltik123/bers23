import {
  AFFINE_FIXED_POINT_BITS,
  AFFINE_FIXED_POINT_ONE,
  AFFINE_MAX_DIMENSION,
  AFFINE_MAX_LINEAR_COEFFICIENT_ABS,
  AFFINE_MAX_OUTPUT_PIXELS,
  AFFINE_MAX_TRANSLATION_ABS,
} from './AffineTransformIdentity.js';

export {
  AFFINE_TRANSFORM_TOOL_ID,
  AFFINE_TRANSFORM_TOOL_VERSION,
  AFFINE_TRANSFORM_CAPABILITY,
  AFFINE_TRANSFORM_OPERATION,
  AFFINE_TRANSFORM_STEP_ID,
  AFFINE_FIXED_POINT_BITS,
  AFFINE_FIXED_POINT_ONE,
  AFFINE_MAX_DIMENSION,
  AFFINE_MAX_OUTPUT_PIXELS,
  AFFINE_MAX_LINEAR_COEFFICIENT_ABS,
  AFFINE_MAX_TRANSLATION_ABS,
} from './AffineTransformIdentity.js';

export type AffineInverseMatrixQ16 = Readonly<{
  m00Q16: number;
  m01Q16: number;
  txQ16: number;
  m10Q16: number;
  m11Q16: number;
  tyQ16: number;
}>;

export const IDENTITY_AFFINE_INVERSE_Q16: AffineInverseMatrixQ16 = Object.freeze({
  m00Q16: AFFINE_FIXED_POINT_ONE,
  m01Q16: 0,
  txQ16: 0,
  m10Q16: 0,
  m11Q16: AFFINE_FIXED_POINT_ONE,
  tyQ16: 0,
});

const HALF = AFFINE_FIXED_POINT_ONE / 2;
const WEIGHT_SUM = AFFINE_FIXED_POINT_ONE * AFFINE_FIXED_POINT_ONE;

export function normalizeAffineInverseMatrixQ16(value: AffineInverseMatrixQ16): AffineInverseMatrixQ16 {
  if (!value || typeof value !== 'object') throw new Error('Affine inverse matrix is required');
  const linear = [value.m00Q16, value.m01Q16, value.m10Q16, value.m11Q16];
  const translations = [value.txQ16, value.tyQ16];
  for (const coefficient of linear) {
    if (!Number.isSafeInteger(coefficient) || Math.abs(coefficient) > AFFINE_MAX_LINEAR_COEFFICIENT_ABS) throw new Error('Affine linear coefficient exceeds deterministic bounds');
  }
  for (const translation of translations) {
    if (!Number.isSafeInteger(translation) || Math.abs(translation) > AFFINE_MAX_TRANSLATION_ABS) throw new Error('Affine translation exceeds deterministic bounds');
  }
  const determinant = value.m00Q16 * value.m11Q16 - value.m01Q16 * value.m10Q16;
  if (!Number.isSafeInteger(determinant) || determinant === 0) throw new Error('Affine inverse matrix must be invertible within deterministic bounds');
  return Object.freeze({
    m00Q16: value.m00Q16,
    m01Q16: value.m01Q16,
    txQ16: value.txQ16,
    m10Q16: value.m10Q16,
    m11Q16: value.m11Q16,
    tyQ16: value.tyQ16,
  });
}

/**
 * Deterministic same-canvas Affine Transform v1.
 *
 * The supplied matrix is an inverse affine map from output pixel centers to
 * canonical orientation-1 source pixel centers. Every coefficient is signed
 * Q16.16. Coordinates are quantized with signed floor division to Q16.16 before
 * sampling.
 *
 * Sampling law:
 * - RGBA8 / sRGB / orientation 1;
 * - bilinear Q16.16 weights;
 * - out-of-bounds taps are transparent black;
 * - alpha is weighted and rounded half up;
 * - RGB is weighted in premultiplied-alpha space and deterministically
 *   unpremultiplied with round-half-up;
 * - if weighted alpha is zero, RGB is exactly zero;
 * - output dimensions exactly match source dimensions.
 */
export function affineTransformRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  inverse: AffineInverseMatrixQ16,
): Uint8ClampedArray {
  assertGeometry(sourceWidth, sourceHeight);
  const pixels = sourceWidth * sourceHeight;
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Affine source RGBA length is invalid');
  const matrix = normalizeAffineInverseMatrixQ16(inverse);
  const output = new Uint8ClampedArray(sourceRgba.byteLength);

  for (let y = 0; y < sourceHeight; y += 1) {
    const oy = y * AFFINE_FIXED_POINT_ONE + HALF;
    for (let x = 0; x < sourceWidth; x += 1) {
      const ox = x * AFFINE_FIXED_POINT_ONE + HALF;
      const sourceCenterX = mappedCoordinateQ16(matrix.m00Q16, ox, matrix.m01Q16, oy, matrix.txQ16);
      const sourceCenterY = mappedCoordinateQ16(matrix.m10Q16, ox, matrix.m11Q16, oy, matrix.tyQ16);
      const sx = axisSample(sourceCenterX - HALF);
      const sy = axisSample(sourceCenterY - HALF);
      const wx0 = AFFINE_FIXED_POINT_ONE - sx.fraction;
      const wx1 = sx.fraction;
      const wy0 = AFFINE_FIXED_POINT_ONE - sy.fraction;
      const wy1 = sy.fraction;
      const weights = [wx0 * wy0, wx1 * wy0, wx0 * wy1, wx1 * wy1] as const;
      const points = [
        [sx.low, sy.low],
        [sx.high, sy.low],
        [sx.low, sy.high],
        [sx.high, sy.high],
      ] as const;
      const targetOffset = (y * sourceWidth + x) * 4;

      let alphaNumerator = 0;
      for (let index = 0; index < 4; index += 1) {
        const sample = sampleOffset(points[index][0], points[index][1], sourceWidth, sourceHeight);
        if (sample >= 0) alphaNumerator += sourceRgba[sample + 3] * weights[index];
      }
      assertSafe(alphaNumerator, 'Affine alpha accumulator');
      output[targetOffset + 3] = roundHalfUpDiv(alphaNumerator, WEIGHT_SUM);

      if (alphaNumerator === 0) {
        output[targetOffset] = 0;
        output[targetOffset + 1] = 0;
        output[targetOffset + 2] = 0;
        continue;
      }

      for (let channel = 0; channel < 3; channel += 1) {
        let premultiplied = 0;
        for (let index = 0; index < 4; index += 1) {
          const sample = sampleOffset(points[index][0], points[index][1], sourceWidth, sourceHeight);
          if (sample >= 0) premultiplied += sourceRgba[sample + channel] * sourceRgba[sample + 3] * weights[index];
        }
        assertSafe(premultiplied, 'Affine premultiplied accumulator');
        output[targetOffset + channel] = roundHalfUpDiv(premultiplied, alphaNumerator);
      }
    }
  }
  return output;
}

type AxisSample = Readonly<{ low: number; high: number; fraction: number }>;

function mappedCoordinateQ16(a: number, x: number, b: number, y: number, translation: number): number {
  const numerator = a * x + b * y + translation * AFFINE_FIXED_POINT_ONE;
  assertSafe(numerator, 'Affine coordinate accumulator');
  return floorDiv(numerator, AFFINE_FIXED_POINT_ONE);
}

function axisSample(indexFixed: number): AxisSample {
  const low = floorDiv(indexFixed, AFFINE_FIXED_POINT_ONE);
  const fraction = indexFixed - low * AFFINE_FIXED_POINT_ONE;
  if (!Number.isSafeInteger(fraction) || fraction < 0 || fraction >= AFFINE_FIXED_POINT_ONE) throw new Error('Affine interpolation fraction is invalid');
  return Object.freeze({ low, high: low + 1, fraction });
}

function sampleOffset(x: number, y: number, width: number, height: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return -1;
  return (y * width + x) * 4;
}

function floorDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1) throw new Error('Affine division operands are invalid');
  return Math.floor(numerator / denominator);
}

function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator < 1) throw new Error('Affine rounding operands are invalid');
  const doubled = numerator * 2;
  const divisor = denominator * 2;
  assertSafe(doubled, 'Affine rounding numerator');
  assertSafe(divisor, 'Affine rounding denominator');
  return Math.floor((doubled + denominator) / divisor);
}

function assertGeometry(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > AFFINE_MAX_DIMENSION || height > AFFINE_MAX_DIMENSION) throw new Error(`Affine source dimensions must be exact integers between 1 and ${AFFINE_MAX_DIMENSION}`);
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > AFFINE_MAX_OUTPUT_PIXELS) throw new Error('Affine source exceeds deterministic output pixel limit');
}

function assertSafe(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeded safe integer range`);
}
