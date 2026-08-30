import {
  GARMENT_MESH_WARP_FIXED_POINT_BITS,
  GARMENT_MESH_WARP_MAX_DIMENSION,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
  GARMENT_MESH_WARP_MAX_POINTS,
  GARMENT_MESH_WARP_MAX_RASTER_WORK,
  GARMENT_MESH_WARP_MAX_TRIANGLES,
} from './GarmentMeshWarpIdentity.js';

export {
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_SCHEMA,
  GARMENT_MESH_WARP_FIXED_POINT_BITS,
  GARMENT_MESH_WARP_MAX_DIMENSION,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
  GARMENT_MESH_WARP_MAX_RASTER_WORK,
  GARMENT_MESH_WARP_MAX_POINTS,
  GARMENT_MESH_WARP_MAX_TRIANGLES,
  GARMENT_MESH_WARP_PRODUCTION_ADMISSION,
} from './GarmentMeshWarpIdentity.js';

export type GarmentMeshPointQ16 = readonly [number, number];
export type GarmentMeshTriangle = readonly [number, number, number];
export type GarmentMeshWarpSpec = Readonly<{
  sourcePointsQ16: readonly GarmentMeshPointQ16[];
  destinationPointsQ16: readonly GarmentMeshPointQ16[];
  triangles: readonly GarmentMeshTriangle[];
  outputWidth: number;
  outputHeight: number;
}>;

export const GARMENT_MESH_WARP_FIXED_POINT_ONE = 1 << GARMENT_MESH_WARP_FIXED_POINT_BITS;
const FIXED_ONE = GARMENT_MESH_WARP_FIXED_POINT_ONE;
const WEIGHT_SUM = FIXED_ONE * FIXED_ONE;

type NormalizedWarp = Readonly<{
  sourcePointsQ16: readonly GarmentMeshPointQ16[];
  destinationPointsQ16: readonly GarmentMeshPointQ16[];
  triangles: readonly GarmentMeshTriangle[];
  outputWidth: number;
  outputHeight: number;
}>;

/**
 * Convert F4a PARAMETRIC normalized [0,1] topology points to the exact Q16
 * coordinate domain used by the deterministic mesh warp kernel.
 */
export function quantizeNormalizedGarmentMeshPoints(value: readonly unknown[]): readonly GarmentMeshPointQ16[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > GARMENT_MESH_WARP_MAX_POINTS) {
    throw new Error(`Garment mesh points must contain 3 to ${GARMENT_MESH_WARP_MAX_POINTS} normalized points`);
  }
  const points = value.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length !== 2 || !candidate.every(Number.isFinite)) {
      throw new Error(`Garment mesh normalized point ${index} is invalid`);
    }
    const x = Number(candidate[0]);
    const y = Number(candidate[1]);
    if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error(`Garment mesh normalized point ${index} escapes [0,1]`);
    return Object.freeze([
      Math.floor(x * FIXED_ONE + 0.5),
      Math.floor(y * FIXED_ONE + 0.5),
    ] as const);
  });
  return Object.freeze(points);
}

export function normalizeGarmentMeshWarpSpec(value: GarmentMeshWarpSpec): NormalizedWarp {
  if (!value || typeof value !== 'object') throw new Error('Garment mesh warp spec is required');
  assertDimension(value.outputWidth, 'Garment mesh warp output width');
  assertDimension(value.outputHeight, 'Garment mesh warp output height');
  const outputPixels = value.outputWidth * value.outputHeight;
  if (!Number.isSafeInteger(outputPixels) || outputPixels > GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS) {
    throw new Error(`Garment mesh warp output exceeds ${GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS} pixels`);
  }

  const sourcePointsQ16 = normalizeQ16Points(value.sourcePointsQ16, 'source');
  const destinationPointsQ16 = normalizeQ16Points(value.destinationPointsQ16, 'destination');
  if (sourcePointsQ16.length !== destinationPointsQ16.length) throw new Error('Garment mesh warp source/destination point counts must match');
  const triangles = normalizeTriangles(value.triangles, sourcePointsQ16.length);

  for (const [index, triangle] of triangles.entries()) {
    const sourceArea = orient(sourcePointsQ16[triangle[0]], sourcePointsQ16[triangle[1]], sourcePointsQ16[triangle[2]]);
    const destinationArea = orient(destinationPointsQ16[triangle[0]], destinationPointsQ16[triangle[1]], destinationPointsQ16[triangle[2]]);
    if (sourceArea === 0) throw new Error(`Garment mesh source triangle ${index} is degenerate`);
    if (destinationArea === 0) throw new Error(`Garment mesh destination triangle ${index} is degenerate`);
  }

  return Object.freeze({ sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: value.outputWidth, outputHeight: value.outputHeight });
}

/**
 * Deterministic F4b.1 garment mesh warp.
 *
 * Law:
 * - source/destination mesh coordinates are normalized Q16 values in [0,1];
 * - destination triangles rasterize in declared order; the first triangle owns
 *   a shared/overlapping output pixel, making edge ownership explicit;
 * - aggregate triangle bounding-box raster work is preflight-bounded before
 *   allocating output bytes, preventing hostile overlapping topology from
 *   multiplying a bounded image into unbounded CPU work;
 * - triangle inclusion and barycentric interpolation use safe-integer edge math;
 * - source sampling uses Q16 bilinear interpolation in premultiplied-alpha space;
 * - if weighted alpha is zero, hidden RGB is straight-alpha bilinear instead;
 * - pixels not owned by any destination triangle remain transparent RGBA(0,0,0,0).
 *
 * This function has no persistence/provider/Billing/Project authority. It is shared
 * pixel math for later browser preview and Core recomputation admission.
 */
export function garmentMeshWarpRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  spec: GarmentMeshWarpSpec,
): Uint8ClampedArray {
  assertDimension(sourceWidth, 'Garment mesh warp source width');
  assertDimension(sourceHeight, 'Garment mesh warp source height');
  const sourcePixels = sourceWidth * sourceHeight;
  if (!Number.isSafeInteger(sourcePixels) || sourceRgba.byteLength !== sourcePixels * 4) throw new Error('Garment mesh warp source RGBA length is invalid');
  const normalized = normalizeGarmentMeshWarpSpec(spec);

  if (
    normalized.outputWidth === sourceWidth &&
    normalized.outputHeight === sourceHeight &&
    isFullFrameIdentityMesh(normalized)
  ) return new Uint8ClampedArray(sourceRgba);

  assertRasterWorkWithinLimit(normalized);
  const outputPixels = normalized.outputWidth * normalized.outputHeight;
  const output = new Uint8ClampedArray(outputPixels * 4);
  const claimed = new Uint8Array(outputPixels);

  for (const triangle of normalized.triangles) {
    const i0 = triangle[0]; const i1 = triangle[1]; const i2 = triangle[2];
    let d0 = normalized.destinationPointsQ16[i0];
    let d1 = normalized.destinationPointsQ16[i1];
    let d2 = normalized.destinationPointsQ16[i2];
    let s0 = normalized.sourcePointsQ16[i0];
    let s1 = normalized.sourcePointsQ16[i1];
    let s2 = normalized.sourcePointsQ16[i2];
    let area = orient(d0, d1, d2);
    if (area < 0) {
      [d1, d2] = [d2, d1];
      [s1, s2] = [s2, s1];
      area = -area;
    }

    const bounds = trianglePixelBounds(d0, d1, d2, normalized.outputWidth, normalized.outputHeight);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const py = pixelIndexToNormalizedQ16(y, normalized.outputHeight);
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const outputIndex = y * normalized.outputWidth + x;
        if (claimed[outputIndex]) continue;
        const p = [pixelIndexToNormalizedQ16(x, normalized.outputWidth), py] as const;
        const w0 = orient(d1, d2, p);
        const w1 = orient(d2, d0, p);
        const w2 = orient(d0, d1, p);
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        if (w0 + w1 + w2 !== area) throw new Error('Garment mesh warp barycentric edge invariant failed');

        const sourceXQ16 = roundHalfUpDiv(s0[0] * w0 + s1[0] * w1 + s2[0] * w2, area);
        const sourceYQ16 = roundHalfUpDiv(s0[1] * w0 + s1[1] * w1 + s2[1] * w2, area);
        sampleNormalizedBilinearRgba8(sourceRgba, sourceWidth, sourceHeight, sourceXQ16, sourceYQ16, output, outputIndex * 4);
        claimed[outputIndex] = 1;
      }
    }
  }
  return output;
}

function normalizeQ16Points(value: readonly GarmentMeshPointQ16[], label: string): readonly GarmentMeshPointQ16[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > GARMENT_MESH_WARP_MAX_POINTS) {
    throw new Error(`Garment mesh ${label} points must contain 3 to ${GARMENT_MESH_WARP_MAX_POINTS} points`);
  }
  return Object.freeze(value.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length !== 2 || !candidate.every(Number.isSafeInteger)) throw new Error(`Garment mesh ${label} Q16 point ${index} is invalid`);
    const x = Number(candidate[0]); const y = Number(candidate[1]);
    if (x < 0 || x > FIXED_ONE || y < 0 || y > FIXED_ONE) throw new Error(`Garment mesh ${label} Q16 point ${index} escapes normalized bounds`);
    return Object.freeze([x, y] as const);
  }));
}

function normalizeTriangles(value: readonly GarmentMeshTriangle[], pointCount: number): readonly GarmentMeshTriangle[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > GARMENT_MESH_WARP_MAX_TRIANGLES) {
    throw new Error(`Garment mesh triangles must contain 1 to ${GARMENT_MESH_WARP_MAX_TRIANGLES} triangles`);
  }
  return Object.freeze(value.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length !== 3 || !candidate.every(Number.isSafeInteger)) throw new Error(`Garment mesh triangle ${index} is invalid`);
    const [a, b, c] = candidate.map(Number);
    if (a < 0 || b < 0 || c < 0 || a >= pointCount || b >= pointCount || c >= pointCount || a === b || b === c || a === c) {
      throw new Error(`Garment mesh triangle ${index} has invalid point references`);
    }
    return Object.freeze([a, b, c] as const);
  }));
}

function orient(a: GarmentMeshPointQ16, b: GarmentMeshPointQ16, p: GarmentMeshPointQ16): number {
  const value = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (!Number.isSafeInteger(value)) throw new Error('Garment mesh edge math exceeded safe integer range');
  return value;
}

function pixelIndexToNormalizedQ16(index: number, size: number): number {
  if (size === 1) return 0;
  return roundHalfUpDiv(index * FIXED_ONE, size - 1);
}

function trianglePixelBounds(
  a: GarmentMeshPointQ16,
  b: GarmentMeshPointQ16,
  c: GarmentMeshPointQ16,
  width: number,
  height: number,
): Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> {
  const minXQ = Math.min(a[0], b[0], c[0]); const maxXQ = Math.max(a[0], b[0], c[0]);
  const minYQ = Math.min(a[1], b[1], c[1]); const maxYQ = Math.max(a[1], b[1], c[1]);
  return Object.freeze({
    minX: Math.max(0, floorNormalizedQ16ToPixel(minXQ, width) - 1),
    maxX: Math.min(width - 1, ceilNormalizedQ16ToPixel(maxXQ, width) + 1),
    minY: Math.max(0, floorNormalizedQ16ToPixel(minYQ, height) - 1),
    maxY: Math.min(height - 1, ceilNormalizedQ16ToPixel(maxYQ, height) + 1),
  });
}

function assertRasterWorkWithinLimit(spec: NormalizedWarp): void {
  let work = 0;
  for (const triangle of spec.triangles) {
    const bounds = trianglePixelBounds(
      spec.destinationPointsQ16[triangle[0]],
      spec.destinationPointsQ16[triangle[1]],
      spec.destinationPointsQ16[triangle[2]],
      spec.outputWidth,
      spec.outputHeight,
    );
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const triangleWork = width * height;
    if (!Number.isSafeInteger(triangleWork) || triangleWork < 1) throw new Error('Garment mesh warp raster work estimate is invalid');
    work += triangleWork;
    if (!Number.isSafeInteger(work) || work > GARMENT_MESH_WARP_MAX_RASTER_WORK) {
      throw new Error(`Garment mesh warp raster work exceeds ${GARMENT_MESH_WARP_MAX_RASTER_WORK} pixel-triangle checks`);
    }
  }
}

function floorNormalizedQ16ToPixel(value: number, size: number): number {
  if (size === 1) return 0;
  return Math.floor((value * (size - 1)) / FIXED_ONE);
}

function ceilNormalizedQ16ToPixel(value: number, size: number): number {
  if (size === 1) return 0;
  const numerator = value * (size - 1);
  return Math.floor((numerator + FIXED_ONE - 1) / FIXED_ONE);
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
  if (!Number.isSafeInteger(xQ16) || !Number.isSafeInteger(yQ16) || xQ16 < 0 || xQ16 > FIXED_ONE || yQ16 < 0 || yQ16 > FIXED_ONE) {
    throw new Error('Garment mesh warp source sample escaped normalized Q16 bounds');
  }
  const xFixed = xQ16 * (width - 1);
  const yFixed = yQ16 * (height - 1);
  if (!Number.isSafeInteger(xFixed) || !Number.isSafeInteger(yFixed)) throw new Error('Garment mesh warp source coordinate exceeded safe integer range');
  const x0 = Math.floor(xFixed / FIXED_ONE); const y0 = Math.floor(yFixed / FIXED_ONE);
  const x1 = Math.min(width - 1, x0 + 1); const y1 = Math.min(height - 1, y0 + 1);
  const fx = xFixed - x0 * FIXED_ONE; const fy = yFixed - y0 * FIXED_ONE;
  const wx0 = FIXED_ONE - fx; const wx1 = fx; const wy0 = FIXED_ONE - fy; const wy1 = fy;
  const weights = [wx0 * wy0, wx1 * wy0, wx0 * wy1, wx1 * wy1] as const;
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
    for (let index = 0; index < 4; index += 1) premultiplied += source[offsets[index] + channel] * source[offsets[index] + 3] * weights[index];
    if (!Number.isSafeInteger(premultiplied)) throw new Error('Garment mesh warp premultiplied accumulator exceeded safe integer range');
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
  if (!Number.isSafeInteger(numerator)) throw new Error('Garment mesh warp weighted accumulator exceeded safe integer range');
  return numerator;
}

function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator < 1) throw new Error('Garment mesh warp rounding operands are invalid');
  const doubled = numerator * 2;
  const divisor = denominator * 2;
  if (!Number.isSafeInteger(doubled) || !Number.isSafeInteger(divisor) || !Number.isSafeInteger(doubled + denominator)) throw new Error('Garment mesh warp rounding exceeded safe integer range');
  return Math.floor((doubled + denominator) / divisor);
}

function isFullFrameIdentityMesh(spec: NormalizedWarp): boolean {
  if (spec.sourcePointsQ16.length !== 4 || spec.destinationPointsQ16.length !== 4 || spec.triangles.length !== 2) return false;
  const corners = [
    [0, 0], [FIXED_ONE, 0], [FIXED_ONE, FIXED_ONE], [0, FIXED_ONE],
  ] as const;
  for (let index = 0; index < 4; index += 1) {
    const source = spec.sourcePointsQ16[index]; const destination = spec.destinationPointsQ16[index]; const expected = corners[index];
    if (source[0] !== expected[0] || source[1] !== expected[1] || destination[0] !== expected[0] || destination[1] !== expected[1]) return false;
  }
  const triangles = spec.triangles.map(triangle => triangle.join(',')).sort();
  return triangles.length === 2 && triangles[0] === '0,1,2' && triangles[1] === '0,2,3';
}

function assertDimension(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > GARMENT_MESH_WARP_MAX_DIMENSION) {
    throw new Error(`${label} must be an exact integer between 1 and ${GARMENT_MESH_WARP_MAX_DIMENSION}`);
  }
}
