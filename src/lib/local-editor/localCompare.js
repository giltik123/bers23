/**
 * Deterministic before/after split preview. View-only and browser/Node-pure.
 * Normalized position is a keyboard-accessible percentage (0..100).
 * LEFT of split = original, RIGHT = edited; export never calls this function.
 */
const MAX_PREVIEW_PIXELS = 12_000_000;

function assertPixels(source, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width * height > MAX_PREVIEW_PIXELS
      || !(source instanceof Uint8Array || source instanceof Uint8ClampedArray)
      || source.length !== width * height * 4) {
    throw new Error('Split comparison requires bounded RGBA8 image pixels');
  }
}

export function normalizeSplitPosition(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error('Split position must be an integer percentage (0–100)');
  }
  return value;
}

export function splitComparisonColumn(width, percent) {
  if (!Number.isSafeInteger(width) || width < 1 || width > MAX_PREVIEW_PIXELS) {
    throw new Error('Invalid split preview width');
  }
  return Math.min(width, Math.max(0, Math.round(width * normalizeSplitPosition(percent) / 100)));
}

export function composeLocalSplitPreview(original, edited, width, height, position = 50) {
  assertPixels(original, width, height);
  assertPixels(edited, width, height);
  const split = splitComparisonColumn(width, position);
  const result = new Uint8ClampedArray(edited);
  const rowLength = split * 4;
  for (let y = 0; y < height; y++) {
    const offset = y * width * 4;
    result.set(original.subarray(offset, offset + rowLength), offset);
  }
  // Source alpha (including transparent RGB) is copied byte-exactly from each
  // side. No change to the input image buffers or to saved editing recipes.
  return result;
}
