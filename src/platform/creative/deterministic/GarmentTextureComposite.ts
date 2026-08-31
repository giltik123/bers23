import { garmentMeshWarpRgba8, type GarmentMeshWarpSpec } from './GarmentMeshWarp.js';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FEATHER_DISTANCE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_BITS,
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS,
  GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_OUTPUT_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_SAMPLE_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from './GarmentTextureCompositeIdentity.js';

export {
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_BITS,
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS,
  GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_SAMPLE_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FEATHER_DISTANCE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_OUTPUT_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_PRODUCTION_ADMISSION,
} from './GarmentTextureCompositeIdentity.js';

export const GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE = 1 << GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_BITS;
const FIXED_ONE = GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE;
const WEIGHT_SUM = FIXED_ONE * FIXED_ONE;

export type GarmentTextureTransformQ16 = Readonly<{
  scaleXQ16: number;
  scaleYQ16: number;
  offsetXQ16: number;
  offsetYQ16: number;
  wrapMode: typeof GARMENT_TEXTURE_COMPOSITE_WRAP_MODE;
  alphaPolicy: typeof GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY;
}>;

export type GarmentTextureCompositeSpec = Readonly<{
  textureTransform: GarmentTextureTransformQ16;
  featherRadius: number;
  colorSpacePolicy: typeof GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY;
}>;

type NormalizedTextureTransform = GarmentTextureTransformQ16;
type NormalizedCompositeSpec = GarmentTextureCompositeSpec;

export function normalizeGarmentTextureTransform(value: GarmentTextureTransformQ16): NormalizedTextureTransform {
  if (!value || typeof value !== 'object') throw new Error('Garment texture transform is required');
  assertScale(value.scaleXQ16, 'Garment texture scaleXQ16');
  assertScale(value.scaleYQ16, 'Garment texture scaleYQ16');
  assertOffset(value.offsetXQ16, 'Garment texture offsetXQ16');
  assertOffset(value.offsetYQ16, 'Garment texture offsetYQ16');
  if (value.wrapMode !== GARMENT_TEXTURE_COMPOSITE_WRAP_MODE) {
    throw new Error(`Garment texture wrapMode must be ${GARMENT_TEXTURE_COMPOSITE_WRAP_MODE}`);
  }
  if (value.alphaPolicy !== GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY) {
    throw new Error(`Garment texture alphaPolicy must be ${GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY}`);
  }
  return Object.freeze({
    scaleXQ16: value.scaleXQ16,
    scaleYQ16: value.scaleYQ16,
    offsetXQ16: value.offsetXQ16,
    offsetYQ16: value.offsetYQ16,
    wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
    alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  });
}

export function normalizeGarmentTextureCompositeSpec(value: GarmentTextureCompositeSpec): NormalizedCompositeSpec {
  if (!value || typeof value !== 'object') throw new Error('Garment texture composite spec is required');
  const textureTransform = normalizeGarmentTextureTransform(value.textureTransform);
  assertFeatherRadius(value.featherRadius);
  if (value.colorSpacePolicy !== GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY) {
    throw new Error(`Garment composite colorSpacePolicy must be ${GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY}`);
  }
  return Object.freeze({
    textureTransform,
    featherRadius: value.featherRadius,
    colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  });
}

/**
 * F4b.5a deterministic source-view texture-coordinate transform.
 *
 * V1 law:
 * - coordinates are normalized Q16 and anchored at source-view top-left;
 * - positive scale and signed offset are bounded and applied before CLAMP;
 * - no implicit repeat/wrap exists in v1;
 * - transformed RGB uses fixed-point bilinear sampling in premultiplied-alpha
 *   space, with straight hidden-RGB interpolation only when sampled alpha is
 *   exactly zero;
 * - the source-view alpha byte at the untransformed pixel is copied exactly so
 *   the admitted Garment silhouette/topology authority is not moved by a
 *   texture-only transform;
 * - if the transformed sample is fully transparent while the base pixel is
 *   visible, base RGB is preserved so hidden texture RGB cannot become visible.
 */
export function garmentTextureMapRgba8(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  transform: GarmentTextureTransformQ16,
): Uint8ClampedArray {
  assertRgbaImage(source, width, height, 'Garment texture source');
  const normalized = normalizeGarmentTextureTransform(transform);
  if (
    normalized.scaleXQ16 === FIXED_ONE &&
    normalized.scaleYQ16 === FIXED_ONE &&
    normalized.offsetXQ16 === 0 &&
    normalized.offsetYQ16 === 0
  ) return new Uint8ClampedArray(source);

  const output = new Uint8ClampedArray(source.byteLength);
  for (let y = 0; y < height; y += 1) {
    const baseYQ16 = pixelIndexToNormalizedQ16(y, height);
    const sampleYQ16 = clampQ16(roundHalfUpDiv(baseYQ16 * normalized.scaleYQ16, FIXED_ONE) + normalized.offsetYQ16);
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const baseXQ16 = pixelIndexToNormalizedQ16(x, width);
      const sampleXQ16 = clampQ16(roundHalfUpDiv(baseXQ16 * normalized.scaleXQ16, FIXED_ONE) + normalized.offsetXQ16);
      const sampledAlphaNumerator = sampleNormalizedBilinearRgba8(source, width, height, sampleXQ16, sampleYQ16, output, offset);
      const baseAlpha = source[offset + 3];
      if (sampledAlphaNumerator === 0 && baseAlpha > 0) {
        output[offset] = source[offset];
        output[offset + 1] = source[offset + 1];
        output[offset + 2] = source[offset + 2];
      }
      output[offset + 3] = baseAlpha;
    }
  }
  return output;
}

/**
 * Deterministic bounded inward feather.
 *
 * Distance is exact 4-neighbour Manhattan distance from a non-zero-alpha pixel
 * center to the nearest zero-alpha pixel center or image exterior, capped at
 * radius+1. The exterior/zero-alpha boundary lies half a pixel from the first
 * visible center. For 1 <= distance <= radius, coverage is therefore
 * round-half-up(255 * (2*distance-1) / (2*radius)); distance > radius is full
 * coverage. Radius 0 is identity. RGB bytes are preserved exactly.
 *
 * The two-pass capped distance transform is O(pixel count), independent of the
 * radius, so a bounded image cannot amplify into radius-squared hostile work.
 */
export function garmentEdgeFeatherRgba8(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const pixels = assertRgbaImage(source, width, height, 'Garment feather source');
  assertFeatherRadius(radius);
  const output = new Uint8ClampedArray(source);
  if (radius === 0) return output;

  const maxDistance = radius + 1;
  const distances = new Uint16Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    distances[index] = source[index * 4 + 3] === 0 ? 0 : maxDistance;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distances[index] === 0) continue;
      let best = distances[index];
      if (x === 0 || y === 0) best = Math.min(best, 1);
      if (x > 0) best = Math.min(best, distances[index - 1] + 1);
      if (y > 0) best = Math.min(best, distances[index - width] + 1);
      distances[index] = Math.min(best, maxDistance);
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distances[index] === 0) continue;
      let best = distances[index];
      if (x === width - 1 || y === height - 1) best = Math.min(best, 1);
      if (x + 1 < width) best = Math.min(best, distances[index + 1] + 1);
      if (y + 1 < height) best = Math.min(best, distances[index + width] + 1);
      distances[index] = Math.min(best, maxDistance);
    }
  }

  for (let index = 0; index < pixels; index += 1) {
    const sourceAlpha = source[index * 4 + 3];
    if (sourceAlpha === 0) continue;
    const distance = distances[index];
    const multiplier = distance > radius
      ? 255
      : roundHalfUpDiv((2 * distance - 1) * 255, 2 * radius);
    output[index * 4 + 3] = roundHalfUpDiv(sourceAlpha * multiplier, 255);
  }
  return output;
}

/**
 * Deterministic Porter-Duff source-over in the declared gamma-encoded sRGB
 * RGBA8 byte domain. Alpha is linear coverage. No color conversion or browser
 * Canvas implementation is consulted.
 *
 * Inputs are straight RGBA8. Integer premultiplied terms are accumulated before
 * one deterministic round-half-up unpremultiply. If output alpha is zero, RGB
 * is explicitly zeroed because hidden RGB has no authority in a FINAL pixel.
 */
export function compositeSourceOverSrgbRgba8(
  destination: Uint8Array | Uint8ClampedArray,
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const pixels = assertRgbaImage(destination, width, height, 'Garment composite destination');
  assertRgbaImage(source, width, height, 'Garment composite source');
  const output = new Uint8ClampedArray(destination.byteLength);

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const sourceAlpha = source[offset + 3];
    const destinationAlpha = destination[offset + 3];
    const inverseSourceAlpha = 255 - sourceAlpha;
    const alphaNumerator = sourceAlpha * 255 + destinationAlpha * inverseSourceAlpha;
    if (!Number.isSafeInteger(alphaNumerator)) throw new Error('Garment composite alpha accumulator exceeded safe integer range');
    output[offset + 3] = roundHalfUpDiv(alphaNumerator, 255);
    if (alphaNumerator === 0) {
      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
      continue;
    }
    for (let channel = 0; channel < 3; channel += 1) {
      const premultipliedNumerator =
        source[offset + channel] * sourceAlpha * 255 +
        destination[offset + channel] * destinationAlpha * inverseSourceAlpha;
      if (!Number.isSafeInteger(premultipliedNumerator)) throw new Error('Garment composite accumulator exceeded safe integer range');
      output[offset + channel] = roundHalfUpDiv(premultipliedNumerator, alphaNumerator);
    }
  }
  return output;
}

/**
 * Pure composed F4b.5a preview/Core pixel law; this function grants no authority.
 *
 * Crucially, texture mapping happens on the exact managed Garment source view
 * before the already-proven F4b.1 topology warp. This keeps the texture contract
 * tied to exact source bytes and admitted topology instead of remapping arbitrary
 * full-frame F4b.4 pixels in Project coordinate space.
 */
export function garmentTextureCompositeRgba8(
  projectRgba: Uint8Array | Uint8ClampedArray,
  projectWidth: number,
  projectHeight: number,
  garmentSourceRgba: Uint8Array | Uint8ClampedArray,
  garmentSourceWidth: number,
  garmentSourceHeight: number,
  warpSpec: GarmentMeshWarpSpec,
  spec: GarmentTextureCompositeSpec,
): Uint8ClampedArray {
  assertRgbaImage(projectRgba, projectWidth, projectHeight, 'Garment composite Project source');
  assertRgbaImage(garmentSourceRgba, garmentSourceWidth, garmentSourceHeight, 'Garment composite source view');
  const normalized = normalizeGarmentTextureCompositeSpec(spec);
  if (warpSpec.outputWidth !== projectWidth || warpSpec.outputHeight !== projectHeight) {
    throw new Error('Garment texture composite warp output must match the canonical Project geometry');
  }
  const texturedSource = garmentTextureMapRgba8(
    garmentSourceRgba,
    garmentSourceWidth,
    garmentSourceHeight,
    normalized.textureTransform,
  );
  const warped = garmentMeshWarpRgba8(
    texturedSource,
    garmentSourceWidth,
    garmentSourceHeight,
    warpSpec,
  );
  const feathered = garmentEdgeFeatherRgba8(warped, projectWidth, projectHeight, normalized.featherRadius);
  return compositeSourceOverSrgbRgba8(projectRgba, feathered, projectWidth, projectHeight);
}

function assertRgbaImage(source: Uint8Array | Uint8ClampedArray, width: number, height: number, label: string): number {
  if (!(source instanceof Uint8Array) && !(source instanceof Uint8ClampedArray)) throw new Error(`${label} must be Uint8 RGBA bytes`);
  assertDimension(width, `${label} width`);
  assertDimension(height, `${label} height`);
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS) {
    throw new Error(`${label} exceeds ${GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS} pixels`);
  }
  if (source.byteLength !== pixels * 4) throw new Error(`${label} RGBA length is invalid`);
  return pixels;
}

function assertDimension(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION) {
    throw new Error(`${label} must be an exact integer between 1 and ${GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION}`);
  }
}

function assertScale(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16 || value > GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16) {
    throw new Error(`${label} must be an exact Q16 integer between ${GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16} and ${GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16}`);
  }
}

function assertOffset(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || Math.abs(value) > GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16) {
    throw new Error(`${label} must be an exact Q16 integer within +/-${GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16}`);
  }
}

function assertFeatherRadius(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS) {
    throw new Error(`Garment feather radius must be an exact integer between 0 and ${GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS}`);
  }
}

function pixelIndexToNormalizedQ16(index: number, size: number): number {
  if (size === 1) return 0;
  return roundHalfUpDiv(index * FIXED_ONE, size - 1);
}

function clampQ16(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Garment texture coordinate exceeded safe integer range');
  return Math.max(0, Math.min(FIXED_ONE, value));
}

function sampleNormalizedBilinearRgba8(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  xQ16: number,
  yQ16: number,
  output: Uint8ClampedArray,
  outputOffset: number,
): number {
  if (!Number.isSafeInteger(xQ16) || !Number.isSafeInteger(yQ16) || xQ16 < 0 || xQ16 > FIXED_ONE || yQ16 < 0 || yQ16 > FIXED_ONE) {
    throw new Error('Garment texture sample escaped normalized Q16 bounds');
  }
  const xFixed = xQ16 * (width - 1);
  const yFixed = yQ16 * (height - 1);
  if (!Number.isSafeInteger(xFixed) || !Number.isSafeInteger(yFixed)) throw new Error('Garment texture source coordinate exceeded safe integer range');
  const x0 = Math.floor(xFixed / FIXED_ONE); const y0 = Math.floor(yFixed / FIXED_ONE);
  const x1 = Math.min(width - 1, x0 + 1); const y1 = Math.min(height - 1, y0 + 1);
  const fx = xFixed - x0 * FIXED_ONE; const fy = yFixed - y0 * FIXED_ONE;
  const weights = [
    (FIXED_ONE - fx) * (FIXED_ONE - fy),
    fx * (FIXED_ONE - fy),
    (FIXED_ONE - fx) * fy,
    fx * fy,
  ] as const;
  const offsets = [
    (y0 * width + x0) * 4,
    (y0 * width + x1) * 4,
    (y1 * width + x0) * 4,
    (y1 * width + x1) * 4,
  ] as const;
  const alphaNumerator = weightedChannel(source, offsets, weights, 3);
  output[outputOffset + 3] = roundHalfUpDiv(alphaNumerator, WEIGHT_SUM);
  for (let channel = 0; channel < 3; channel += 1) {
    if (alphaNumerator === 0) {
      output[outputOffset + channel] = roundHalfUpDiv(weightedChannel(source, offsets, weights, channel), WEIGHT_SUM);
      continue;
    }
    let premultiplied = 0;
    for (let index = 0; index < 4; index += 1) {
      const alpha = source[offsets[index] + 3];
      premultiplied += source[offsets[index] + channel] * alpha * weights[index];
    }
    if (!Number.isSafeInteger(premultiplied)) throw new Error('Garment texture premultiplied accumulator exceeded safe integer range');
    output[outputOffset + channel] = roundHalfUpDiv(premultiplied, alphaNumerator);
  }
  return alphaNumerator;
}

function weightedChannel(
  source: Uint8Array | Uint8ClampedArray,
  offsets: readonly [number, number, number, number],
  weights: readonly [number, number, number, number],
  channel: number,
): number {
  let numerator = 0;
  for (let index = 0; index < 4; index += 1) numerator += source[offsets[index] + channel] * weights[index];
  if (!Number.isSafeInteger(numerator)) throw new Error('Garment texture weighted accumulator exceeded safe integer range');
  return numerator;
}

function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator < 1) {
    throw new Error('Garment texture/composite rounding operands are invalid');
  }
  const doubled = numerator * 2;
  const divisor = denominator * 2;
  if (!Number.isSafeInteger(doubled) || !Number.isSafeInteger(divisor)) {
    throw new Error('Garment texture/composite rounding exceeded safe integer range');
  }
  return Math.floor((doubled + denominator) / divisor);
}
