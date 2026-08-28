export {
  CROP_TOOL_ID,
  CROP_TOOL_VERSION,
  CROP_CAPABILITY,
  CROP_OPERATION,
  CROP_STEP_ID,
} from './CropIdentity.js';

export type CropRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/**
 * Exact deterministic Crop v1 geometry law.
 *
 * Coordinates are integer pixel indices in canonical orientation-1 source space.
 * The rectangle is half-open: [x, x + width) x [y, y + height).
 * No interpolation, resampling, premultiplication, color conversion or border fill occurs.
 */
export function normalizeCropRect(value: CropRect, sourceWidth: number, sourceHeight: number): CropRect {
  if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) throw new Error('Crop source dimensions are invalid');
  const x = value?.x; const y = value?.y; const width = value?.width; const height = value?.height;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw new Error('Crop rectangle must use exact integers');
  if (x < 0 || y < 0 || width < 1 || height < 1) throw new Error('Crop rectangle is empty or negative');
  const right = x + width; const bottom = y + height;
  if (!Number.isSafeInteger(right) || !Number.isSafeInteger(bottom) || right > sourceWidth || bottom > sourceHeight) throw new Error('Crop rectangle exceeds canonical source bounds');
  return Object.freeze({ x, y, width, height });
}

/** Byte-exact row-major RGBA8 sub-rectangle copy. */
export function cropRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  rect: CropRect,
): Uint8ClampedArray {
  const pixels = sourceWidth * sourceHeight;
  if (!Number.isSafeInteger(pixels) || sourceRgba.byteLength !== pixels * 4) throw new Error('Crop source RGBA length is invalid');
  const normalized = normalizeCropRect(rect, sourceWidth, sourceHeight);
  const outputPixels = normalized.width * normalized.height;
  if (!Number.isSafeInteger(outputPixels)) throw new Error('Crop output pixel count is invalid');
  const output = new Uint8ClampedArray(outputPixels * 4);
  const rowBytes = normalized.width * 4;
  for (let row = 0; row < normalized.height; row += 1) {
    const sourceOffset = ((normalized.y + row) * sourceWidth + normalized.x) * 4;
    const outputOffset = row * rowBytes;
    output.set(sourceRgba.subarray(sourceOffset, sourceOffset + rowBytes), outputOffset);
  }
  return output;
}
