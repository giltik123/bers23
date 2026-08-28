import { ORTHOGONAL_TRANSFORM_MODES } from './OrthogonalTransformIdentity.js';

export {
  ORTHOGONAL_TRANSFORM_TOOL_ID,
  ORTHOGONAL_TRANSFORM_TOOL_VERSION,
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_OPERATION,
  ORTHOGONAL_TRANSFORM_STEP_ID,
  ORTHOGONAL_TRANSFORM_MODES,
} from './OrthogonalTransformIdentity.js';

export type OrthogonalTransformMode = 'FLIP_HORIZONTAL' | 'FLIP_VERTICAL' | 'ROTATE_90_CW' | 'ROTATE_180' | 'ROTATE_270_CW';
export type OrthogonalTransformGeometry = Readonly<{ width: number; height: number }>;

export function normalizeOrthogonalTransformMode(value: unknown): OrthogonalTransformMode {
  if (typeof value !== 'string' || !(ORTHOGONAL_TRANSFORM_MODES as readonly string[]).includes(value)) throw new Error('Orthogonal transform mode is unsupported');
  return value as OrthogonalTransformMode;
}

export function orthogonalTransformOutputGeometry(sourceWidth: number, sourceHeight: number, mode: OrthogonalTransformMode): OrthogonalTransformGeometry {
  assertSourceGeometry(sourceWidth, sourceHeight);
  const normalized = normalizeOrthogonalTransformMode(mode);
  if (normalized === 'ROTATE_90_CW' || normalized === 'ROTATE_270_CW') return Object.freeze({ width: sourceHeight, height: sourceWidth });
  return Object.freeze({ width: sourceWidth, height: sourceHeight });
}

/**
 * Exact RGBA8 orthogonal transform v1.
 *
 * Every output pixel copies one complete RGBA tuple from the canonical orientation-1
 * source. No interpolation, color conversion, alpha premultiplication, rounding,
 * border fill, or hidden-RGB modification occurs.
 */
export function orthogonalTransformRgba8(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  mode: OrthogonalTransformMode,
): Uint8ClampedArray {
  assertSourceGeometry(sourceWidth, sourceHeight);
  const pixels = sourceWidth * sourceHeight;
  if (!Number.isSafeInteger(pixels) || sourceRgba.byteLength !== pixels * 4) throw new Error('Orthogonal transform source RGBA length is invalid');
  const normalized = normalizeOrthogonalTransformMode(mode);
  const outputGeometry = orthogonalTransformOutputGeometry(sourceWidth, sourceHeight, normalized);
  const output = new Uint8ClampedArray(sourceRgba.byteLength);

  for (let y = 0; y < outputGeometry.height; y += 1) {
    for (let x = 0; x < outputGeometry.width; x += 1) {
      const sourcePoint = inverseSourcePoint(x, y, sourceWidth, sourceHeight, normalized);
      const sourceOffset = (sourcePoint.y * sourceWidth + sourcePoint.x) * 4;
      const outputOffset = (y * outputGeometry.width + x) * 4;
      output[outputOffset] = sourceRgba[sourceOffset];
      output[outputOffset + 1] = sourceRgba[sourceOffset + 1];
      output[outputOffset + 2] = sourceRgba[sourceOffset + 2];
      output[outputOffset + 3] = sourceRgba[sourceOffset + 3];
    }
  }
  return output;
}

function inverseSourcePoint(
  x: number,
  y: number,
  sourceWidth: number,
  sourceHeight: number,
  mode: OrthogonalTransformMode,
): Readonly<{ x: number; y: number }> {
  switch (mode) {
    case 'FLIP_HORIZONTAL': return Object.freeze({ x: sourceWidth - 1 - x, y });
    case 'FLIP_VERTICAL': return Object.freeze({ x, y: sourceHeight - 1 - y });
    case 'ROTATE_90_CW': return Object.freeze({ x: y, y: sourceHeight - 1 - x });
    case 'ROTATE_180': return Object.freeze({ x: sourceWidth - 1 - x, y: sourceHeight - 1 - y });
    case 'ROTATE_270_CW': return Object.freeze({ x: sourceWidth - 1 - y, y: x });
  }
}

function assertSourceGeometry(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('Orthogonal transform source dimensions are invalid');
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels < 1) throw new Error('Orthogonal transform source pixel count is invalid');
}
