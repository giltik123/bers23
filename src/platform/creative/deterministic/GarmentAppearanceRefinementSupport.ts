import {
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
} from './GarmentTextureCompositeIdentity.js';
import {
  GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
  GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
  GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SCHEMA,
  GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE,
} from './GarmentAppearanceRefinementIdentity.js';

export {
  GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION,
  GARMENT_APPEARANCE_REFINEMENT_OPERATION,
  GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SCHEMA,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
  GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_PRODUCTION_ADMISSION,
} from './GarmentAppearanceRefinementIdentity.js';

export type GarmentAppearanceRefinementSupport = Readonly<{
  schema: typeof GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SCHEMA;
  profile: typeof GARMENT_APPEARANCE_REFINEMENT_PROFILE;
  supportSource: typeof GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE;
  dilationPolicy: typeof GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY;
  dilationRadiusPx: typeof GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX;
  maskPolicy: typeof GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY;
  outsideSupportPolicy: typeof GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY;
  width: number;
  height: number;
  mask: Uint8Array;
}>;

export type GarmentAppearanceRefinementCandidateVerification = Readonly<{
  width: number;
  height: number;
  changedPixels: number;
}>;

/**
 * Derive the only F5a.1-modifiable pixel region from accepted deterministic
 * garment-warp alpha. V1 applies a fixed 2px Chebyshev/square dilation clipped
 * to Project bounds. No model/provider/client mask participates in this law.
 */
export function deriveGarmentAppearanceRefinementSupport(
  warpRgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): GarmentAppearanceRefinementSupport {
  const pixels = assertGeometry(width, height);
  assertRgba(warpRgba, pixels, 'Garment warp RGBA');

  const base = new Uint8Array(pixels);
  let supportedPixels = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (warpRgba[pixel * 4 + 3] !== 0) {
      base[pixel] = 1;
      supportedPixels += 1;
    }
  }
  if (supportedPixels === 0) throw new Error('Garment appearance refinement requires non-empty deterministic warp alpha support');

  const radius = GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX;
  const horizontal = new Uint8Array(pixels);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let active = 0;
    for (let x = 0; x <= radius && x < width; x += 1) active += base[row + x];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = active > 0 ? 1 : 0;
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) active -= base[row + removeX];
      if (addX < width) active += base[row + addX];
    }
  }

  const mask = new Uint8Array(pixels);
  for (let x = 0; x < width; x += 1) {
    let active = 0;
    for (let y = 0; y <= radius && y < height; y += 1) active += horizontal[y * width + x];
    for (let y = 0; y < height; y += 1) {
      mask[y * width + x] = active > 0 ? 255 : 0;
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) active -= horizontal[removeY * width + x];
      if (addY < height) active += horizontal[addY * width + x];
    }
  }

  return Object.freeze({
    schema: GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SCHEMA,
    profile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    supportSource: GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE,
    dilationPolicy: GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
    dilationRadiusPx: GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
    maskPolicy: GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY,
    outsideSupportPolicy: GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
    width,
    height,
    mask,
  });
}

/**
 * Hard F5 preservation gate. Every RGBA byte outside deterministic support must
 * remain byte-identical to the deterministic parent. Passing this helper only
 * proves spatial preservation; it never grants execution or FINAL authority.
 */
export function verifyGarmentAppearanceRefinementCandidate(
  parentRgba: Uint8Array | Uint8ClampedArray,
  candidateRgba: Uint8Array | Uint8ClampedArray,
  supportMask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): GarmentAppearanceRefinementCandidateVerification {
  const pixels = assertGeometry(width, height);
  assertRgba(parentRgba, pixels, 'Deterministic parent RGBA');
  assertRgba(candidateRgba, pixels, 'Refinement candidate RGBA');
  if (supportMask.byteLength !== pixels) throw new Error('Garment appearance refinement support mask byte length does not match geometry');

  let changedPixels = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const allowed = supportMask[pixel];
    if (allowed !== 0 && allowed !== 255) throw new Error('Garment appearance refinement support mask must contain only 0 or 255');
    const offset = pixel * 4;
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      if (parentRgba[offset + channel] !== candidateRgba[offset + channel]) changed = true;
    }
    if (!changed) continue;
    if (allowed !== 255) throw new Error('Garment appearance refinement candidate changed protected pixels outside deterministic support');
    changedPixels += 1;
  }

  return Object.freeze({ width, height, changedPixels });
}

function assertGeometry(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('Garment appearance refinement geometry must use positive safe integer dimensions');
  }
  if (width > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION || height > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION) {
    throw new Error(`Garment appearance refinement dimensions exceed ${GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION}`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS) {
    throw new Error(`Garment appearance refinement pixel count exceeds ${GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS}`);
  }
  return pixels;
}

function assertRgba(value: Uint8Array | Uint8ClampedArray, pixels: number, label: string): void {
  if (!(value instanceof Uint8Array) && !(value instanceof Uint8ClampedArray)) throw new Error(`${label} must be RGBA8 bytes`);
  if (value.byteLength !== pixels * 4) throw new Error(`${label} byte length does not match geometry`);
}
