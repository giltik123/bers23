import {
  RESIZE_FIXED_POINT_BITS,
  RESIZE_MAX_DIMENSION,
  RESIZE_MAX_OUTPUT_PIXELS,
} from './ResizeIdentity.js';

export {
  RESIZE_TOOL_ID,
  RESIZE_TOOL_VERSION,
  RESIZE_CAPABILITY,
  RESIZE_OPERATION,
  RESIZE_STEP_ID,
  RESIZE_FIXED_POINT_BITS,
  RESIZE_MAX_DIMENSION,
  RESIZE_MAX_OUTPUT_PIXELS,
} from './ResizeIdentity.js';

export type ResizeDimensions = Readonly<{ width: number; height: number }>;

export const RESIZE_FIXED_POINT_ONE = 1 << RESIZE_FIXED_POINT_BITS;

const FIXED_HALF = RESIZE_FIXED_POINT_ONE / 2;
const WEIGHT_SUM = RESIZE_FIXED_POINT_ONE * RESIZE_FIXED_POINT_ONE;

type AxisSample = Readonly<{ low: number; high: number; fraction: number }>;

/**
 * Exact deterministic Resize v1 law.
 *
 * - canonical orientation-1 RGBA8/sRGB input;
 * - pixel-center coordinate mapping quantized to signed 16.16 fixed point;
 * - edge replication (clamp-to-edge), no border synthesis;
 * - bilinear weights are exact integer 16.16 fractions;
 * - alpha is bilinearly interpolated and rounded half up;
 * - RGB is bilinearly interpolated in premultiplied-alpha space then
 *   deterministically unpremultiplied with round-half-up;
 * - when all four weighted alpha contributions are zero, hidden RGB is
 *   bilinearly interpolated in straight-alpha space instead of being erased.
 *
 * The configured production image dimension ceiling is itself capped at 16384,
 * keeping all coordinate and weighted accumulators below Number.MAX_SAFE_INTEGER.
 */
export function normalizeResizeDimensions(
  value: ResizeDimensions,
  sourceWidth: number,
  sourceHeight: number,
): ResizeDimensions {
  assertDimension(sourceWidth, 'Resize source width');
  assertDimension(sourceHeight, 'Resize source height');
  const width = value?.width; const height = value?.height;
  assertDimension(width, 'Resize target width');
  assertDimension(height, 'Resize target height');
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > RESIZE_MAX_OUTPUT_PIXELS) throw new Error('Resize target exceeds the v1 output pixel limit');
  return Object.freeze({ width, height });
}

/** Byte-exact fixed-point bilinear RGBA8 resize. */
export function resizeRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  target: ResizeDimensions,
): Uint8ClampedArray {
  const sourcePixels = sourceWidth * sourceHeight;
  if (!Number.isSafeInteger(sourcePixels) || sourceRgba.byteLength !== sourcePixels * 4) throw new Error('Resize source RGBA length is invalid');
  const normalized = normalizeResizeDimensions(target, sourceWidth, sourceHeight);
  if (normalized.width === sourceWidth && normalized.height === sourceHeight) return new Uint8ClampedArray(sourceRgba);

  const output = new Uint8ClampedArray(normalized.width * normalized.height * 4);
  const xSamples = Array.from({ length: normalized.width }, (_, x) => axisSample(x, sourceWidth, normalized.width));

  for (let y = 0; y < normalized.height; y += 1) {
    const sy = axisSample(y, sourceHeight, normalized.height);
    const wy0 = RESIZE_FIXED_POINT_ONE - sy.fraction;
    const wy1 = sy.fraction;
    for (let x = 0; x < normalized.width; x += 1) {
      const sx = xSamples[x];
      const wx0 = RESIZE_FIXED_POINT_ONE - sx.fraction;
      const wx1 = sx.fraction;
      const weights = [wx0 * wy0, wx1 * wy0, wx0 * wy1, wx1 * wy1] as const;
      const offsets = [
        (sy.low * sourceWidth + sx.low) * 4,
        (sy.low * sourceWidth + sx.high) * 4,
        (sy.high * sourceWidth + sx.low) * 4,
        (sy.high * sourceWidth + sx.high) * 4,
      ] as const;
      const targetOffset = (y * normalized.width + x) * 4;

      const alphaNumerator = weightedChannel(sourceRgba, offsets, weights, 3);
      output[targetOffset + 3] = roundHalfUpDiv(alphaNumerator, WEIGHT_SUM);

      for (let channel = 0; channel < 3; channel += 1) {
        if (alphaNumerator === 0) {
          output[targetOffset + channel] = roundHalfUpDiv(weightedChannel(sourceRgba, offsets, weights, channel), WEIGHT_SUM);
        } else {
          let premultiplied = 0;
          for (let index = 0; index < 4; index += 1) {
            premultiplied += sourceRgba[offsets[index] + channel] * sourceRgba[offsets[index] + 3] * weights[index];
          }
          if (!Number.isSafeInteger(premultiplied)) throw new Error('Resize premultiplied accumulator exceeded safe integer range');
          output[targetOffset + channel] = roundHalfUpDiv(premultiplied, alphaNumerator);
        }
      }
    }
  }
  return output;
}

function axisSample(index: number, sourceSize: number, targetSize: number): AxisSample {
  const numerator = (2 * index + 1) * sourceSize * RESIZE_FIXED_POINT_ONE;
  const denominator = 2 * targetSize;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) throw new Error('Resize coordinate mapping exceeded safe integer range');
  const fixed = Math.floor(numerator / denominator) - FIXED_HALF;
  if (fixed <= 0) return Object.freeze({ low: 0, high: 0, fraction: 0 });
  const maximum = (sourceSize - 1) * RESIZE_FIXED_POINT_ONE;
  if (fixed >= maximum) return Object.freeze({ low: sourceSize - 1, high: sourceSize - 1, fraction: 0 });
  const low = Math.floor(fixed / RESIZE_FIXED_POINT_ONE);
  const fraction = fixed - low * RESIZE_FIXED_POINT_ONE;
  return Object.freeze({ low, high: low + 1, fraction });
}

function weightedChannel(
  source: Uint8Array | Uint8ClampedArray,
  offsets: readonly [number, number, number, number],
  weights: readonly [number, number, number, number],
  channel: number,
): number {
  let numerator = 0;
  for (let index = 0; index < 4; index += 1) numerator += source[offsets[index] + channel] * weights[index];
  if (!Number.isSafeInteger(numerator)) throw new Error('Resize weighted accumulator exceeded safe integer range');
  return numerator;
}

function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator < 1) throw new Error('Resize rounding operands are invalid');
  const doubled = numerator * 2;
  const divisor = denominator * 2;
  if (!Number.isSafeInteger(doubled) || !Number.isSafeInteger(divisor)) throw new Error('Resize rounding exceeded safe integer range');
  return Math.floor((doubled + denominator) / divisor);
}

function assertDimension(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > RESIZE_MAX_DIMENSION) throw new Error(`${label} must be an exact integer between 1 and ${RESIZE_MAX_DIMENSION}`);
}
