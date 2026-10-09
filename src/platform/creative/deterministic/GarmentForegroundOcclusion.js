import {
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
} from './GarmentTextureCompositeIdentity.js';

/**
 * Preview-only, non-admitted F5 foreground-occlusion experiment.
 * This is a pixel operation, NOT a foreground-mask authority or source of model
 * confidence. Callers must establish a trusted, correctly aligned person/arm
 * foreground mask through an independent review/authority boundary.
 */
export const GARMENT_FOREGROUND_OCCLUSION_PRODUCTION_ADMISSION = 'NOT_ADMITTED';

/**
 * Put original Project pixels in front of the deterministic garment composite
 * wherever the verified foreground mask is 255. All unmasked RGBA bytes stay
 * byte-identical to the accepted deterministic composite, and masked RGBA bytes
 * stay byte-identical to the original Project. No generated pixels, alpha
 * heuristic, inferred pose, network request or implicit segmentation is used.
 *
 * @param {Uint8Array|Uint8ClampedArray} originalProjectRgba
 * @param {Uint8Array|Uint8ClampedArray} compositeRgba
 * @param {Uint8Array|Uint8ClampedArray} foregroundMaskR8 Strict binary 0/255 R8.
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray}
 */
export function restoreGarmentForegroundOcclusionRgba8(
  originalProjectRgba,
  compositeRgba,
  foregroundMaskR8,
  width,
  height,
) {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1
    || width > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION
    || height > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION
  ) throw new Error('Foreground occlusion requires bounded positive integer geometry');

  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS) {
    throw new Error('Foreground occlusion pixel count exceeds the deterministic raster budget');
  }

  for (const [value, label] of [
    [originalProjectRgba, 'Original Project RGBA'],
    [compositeRgba, 'Deterministic garment composite RGBA'],
  ]) {
    if (!(value instanceof Uint8Array) && !(value instanceof Uint8ClampedArray)) {
      throw new Error(`${label} must be RGBA8 bytes`);
    }
    if (value.byteLength !== pixels * 4) {
      throw new Error(`${label} byte length does not match Project geometry`);
    }
  }
  if (!(foregroundMaskR8 instanceof Uint8Array) && !(foregroundMaskR8 instanceof Uint8ClampedArray)) {
    throw new Error('Foreground mask must be binary R8 bytes');
  }
  if (foregroundMaskR8.byteLength !== pixels) {
    throw new Error('Foreground mask R8 byte length does not match Project geometry');
  }

  // Validate the entire mask BEFORE writing any output, so malformed /
  // ambiguous mask values can never partially produce a misleading preview.
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const alpha = foregroundMaskR8[pixel];
    if (alpha !== 0 && alpha !== 255) {
      throw new Error('Foreground mask must contain only 0 or 255 (no implicit thresholding)');
    }
  }

  const output = new Uint8ClampedArray(compositeRgba);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (foregroundMaskR8[pixel] !== 255) continue;
    const offset = pixel * 4;
    output[offset] = originalProjectRgba[offset];
    output[offset + 1] = originalProjectRgba[offset + 1];
    output[offset + 2] = originalProjectRgba[offset + 2];
    output[offset + 3] = originalProjectRgba[offset + 3];
  }
  return output;
}
