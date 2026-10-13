/**
 * BERS Fashion precise-region composition — R&D ONLY, NOT PRODUCTION ADMITTED.
 *
 * Pure pixel operation inspired by publicly described precise-edit principles,
 * independently implemented; no Ideogram code/weights/API are used.
 *
 * This function DOES NOT authenticate, obtain or validate trusted masks,
 * verify Project/Garment identity, assess garment geometry, produce FINAL,
 * or authorize any Core execution. Those are independent Core-owned gates.
 */
import {
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
} from './GarmentTextureCompositeIdentity.js';

export type FashionPreciseRegionMode = 'STRICT_VERIFY' | 'COPY_OUTSIDE_ROI';

export type FashionPreciseRegionInput = Readonly<{
  original: Uint8Array | Uint8ClampedArray;
  candidate: Uint8Array | Uint8ClampedArray;
  editCoverageR8: Uint8Array | Uint8ClampedArray;
  protectedR8: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  mode: FashionPreciseRegionMode;
}>;

export type FashionPreciseRegionResult = Readonly<{
  rgba: Uint8ClampedArray;
  stats: Readonly<{
    sourcePixels: number;
    editablePixels: number;
    changedWithinEditPixels: number;
    candidateDriftOutsidePixels: number;
    candidateDriftProtectedPixels: number;
    exactSourcePreservedPixels: number;
  }>;
  authority: 'RESEARCH_ONLY';
}>;

const isBytes = (value: unknown): value is Uint8Array | Uint8ClampedArray =>
  value instanceof Uint8Array || value instanceof Uint8ClampedArray;

function checkPixels(value: unknown, length: number, label: string): asserts value is Uint8Array | Uint8ClampedArray {
  if (!isBytes(value) || value.byteLength !== length) throw new Error(`${label} must be an exact-length uint8 pixel buffer`);
}

function samePixel(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray, offset: number): boolean {
  return a[offset] === b[offset] && a[offset + 1] === b[offset + 1] &&
    a[offset + 2] === b[offset + 2] && a[offset + 3] === b[offset + 3];
}

/**
 * STRICT_VERIFY: rejects any generated drift outside editable or in protected
 * regions. COPY_OUTSIDE_ROI: preserves original bytes outside the editable
 * unprotected region and reports model drift, but this mode is NOT quality
 * acceptance. Even if coverage is feathered, coverage=0 is byte-exact.
 *
 * Photo-only v1: both inputs must have alpha=255; this prevents unsupported
 * partially transparent color interpolation/hidden-RGB ambiguities.
 */
export function fashionPreciseRegionPreviewRgba8(input: FashionPreciseRegionInput): FashionPreciseRegionResult {
  if (!input || typeof input !== 'object') throw new Error('Fashion precise edit input is required');
  const { original, candidate, editCoverageR8, protectedR8, width, height, mode } = input;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 ||
      width > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION ||
      height > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION ||
      width * height > GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS) {
    throw new Error('Fashion precise edit dimensions exceed supported bounds');
  }
  if (mode !== 'STRICT_VERIFY' && mode !== 'COPY_OUTSIDE_ROI') {
    throw new Error('Fashion precise edit requires an explicit supported mode');
  }
  const pixels = width * height;
  checkPixels(original, pixels * 4, 'Original image');
  checkPixels(candidate, pixels * 4, 'Candidate image');
  checkPixels(editCoverageR8, pixels, 'Edit coverage mask');
  checkPixels(protectedR8, pixels, 'Protected-area mask');

  const output = new Uint8ClampedArray(original);
  let editablePixels = 0;
  let changedWithinEditPixels = 0;
  let candidateDriftOutsidePixels = 0;
  let candidateDriftProtectedPixels = 0;
  let exactSourcePreservedPixels = 0;

  for (let p = 0; p < pixels; p += 1) {
    const i = p * 4;
    if (original[i + 3] !== 255 || candidate[i + 3] !== 255) {
      throw new Error('Fashion precise edit requires opaque RGBA source and candidate photos');
    }
    const protection = protectedR8[p];
    if (protection !== 0 && protection !== 255) {
      throw new Error('Fashion protected mask must be strictly binary R8');
    }
    const coverage = editCoverageR8[p];
    const drift = !samePixel(original, candidate, i);
    if (protection === 255) {
      if (drift) candidateDriftProtectedPixels += 1;
      exactSourcePreservedPixels += 1;
      continue;
    }
    if (coverage === 0) {
      if (drift) candidateDriftOutsidePixels += 1;
      exactSourcePreservedPixels += 1;
      continue;
    }
    editablePixels += 1;
    if (coverage === 255) {
      output[i] = candidate[i];
      output[i + 1] = candidate[i + 1];
      output[i + 2] = candidate[i + 2];
    } else {
      // Explicit sRGB gamma-domain preview blending (not linear-light model evidence).
      for (let channel = 0; channel < 3; channel += 1) {
        output[i + channel] = Math.floor(
          (original[i + channel] * (255 - coverage) + candidate[i + channel] * coverage + 127) / 255,
        );
      }
    }
    if (!samePixel(original, output, i)) changedWithinEditPixels += 1;
  }

  if (editablePixels === 0) throw new Error('Fashion precise edit has no unprotected editable pixels');
  if (mode === 'STRICT_VERIFY' && (candidateDriftOutsidePixels > 0 || candidateDriftProtectedPixels > 0)) {
    throw new Error('Fashion precise edit candidate changed pixels outside admitted edit scope');
  }

  return Object.freeze({
    rgba: output,
    stats: Object.freeze({
      sourcePixels: pixels,
      editablePixels,
      changedWithinEditPixels,
      candidateDriftOutsidePixels,
      candidateDriftProtectedPixels,
      exactSourcePreservedPixels,
    }),
    authority: 'RESEARCH_ONLY' as const,
  });
}
