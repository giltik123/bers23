import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_BITS,
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS,
  GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16,
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
 * F4b.5a deterministic texture-coordinate transform.
 *
 * V1 law:
 * - coordinates are normalized Q16;
 * - scale is positive and bounded; offsets are bounded signed Q16;
 * - transformed coordinates are CLAMPed to [0,1] (no implicit repeat/wrap);
 * - RGB uses fixed-point bilinear sampling in premultiplied-alpha space with
 *   straight hidden-RGB interpolation when weighted sampled alpha is zero;
 * - garment geometry is preserved by copying the original pixel alpha exactly.
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
      sampleNormalizedBilinearRgba8(source, width, height, sampleXQ16, sampleYQ16, output, offset);
      output[offset + 3] = source[offset + 3];
    }
  }
  return output;
}

/**
 * Deterministic bounded inward feather.
 *
 * V1 law uses Manhattan distance from every non-zero-alpha pixel to the nearest
 * zero-alpha pixel or image exterior. Radius 0 is identity. For radius R > 0,
 * alpha is multiplied by round-half-up(255 * min(distance, R+1)/(R+1)); RGB is
 * unchanged. A two-pass capped distance transform keeps work O(pixel count).
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
    const multiplier = distance >= maxDistance ? 255 : roundHalfUpDiv(255 * distance, maxDistance);
    output[index * 4 + 3] = roundHalfUpDiv(sourceAlpha * multiplier, 255);
  }
  return output;
}

/**
 * Deterministic source-over composite in gamma-encoded sRGB RGBA8.
 *
 * The policy intentionally does not claim linear-light compositing. Both inputs
 * are interpreted as straight RGBA8 in the named gamma-encoded sRGB policy;
 * source-over arithmetic is performed through exact integer premultiplied terms,
 * then unpremultiplied with round-half-up. Fully transparent output has RGB=0.
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

/** Pure composed F4b.5a preview/Core pixel law; this function grants no authority. */
export function garmentTextureCompositeRgba8(
  projectRgba: Uint8Array | Uint8ClampedArray,
  garmentLayerRgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  spec: GarmentTextureCompositeSpec,
): Uint8ClampedArray {
  assertRgbaImage(projectRgba, width, height, 'Garment composite Project source');
  assertRgbaImage(garmentLayerRgba, width, height, 'Garment composite layer');
  const normalized = normalizeGarmentTextureCompositeSpec(spec);
  const textured = garmentTextureMapRgba8(garmentLayerRgba, width, height, normalized.textureTransform);
  const feathered = garmentEdgeFeatherRgba8(textured, width, height, normalized.featherRadius);
  return compositeSourceOverSrgbRgba8(projectRgba, feathered, width, height);
}

function assertRgbaImage(source: Uint8Array | Uint8ClampedArray, width: number, height: number, label: string): number {
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
): void {
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
      premultiplied += source[offsets[index] + channel] * source[offsets[index] + 3] * weights[index];
    }
    if (!Number.isSafeInteger(premultiplied)) throw new Error('Garment texture premultiplied accumulator exceeded safe integer range');
    output[outputOffset + channel] = roundHalfUpDiv(premultiplied, alphaNumerator);
  }
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
  if (!Number.isSafeInteger(doubled) || !Number.isSafeInteger(divisor) || !Number.isSafeInteger(doubled + denominator)) {
    throw new Error('Garment texture/composite rounding exceeded safe integer range');
  }
  return Math.floor((doubled + denominator) / divisor);
}
