export const BACKGROUND_ISOLATION_TOOL_ID = 'background-isolation' as const;
export const BACKGROUND_ISOLATION_TOOL_VERSION = '1' as const;
export const BACKGROUND_ISOLATION_CAPABILITY = 'local:tool:background-isolation:v1' as const;

/**
 * Pure pixel contract for preserving the source RGB while multiplying source
 * alpha by canonical MASK alpha. No DOM, codec, model, provider or persistence
 * authority is available in this function.
 */
export function isolateBackgroundRgba(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  maskAlpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Background isolation dimensions are invalid');
  const pixels = width * height;
  if (sourceRgba.byteLength !== pixels * 4) throw new Error('Background isolation source RGBA length is invalid');
  if (maskAlpha.byteLength !== pixels) throw new Error('Background isolation MASK alpha length is invalid');
  const output = new Uint8ClampedArray(sourceRgba.byteLength);
  for (let index = 0; index < pixels; index += 1) {
    const sourceOffset = index * 4;
    output[sourceOffset] = sourceRgba[sourceOffset];
    output[sourceOffset + 1] = sourceRgba[sourceOffset + 1];
    output[sourceOffset + 2] = sourceRgba[sourceOffset + 2];
    output[sourceOffset + 3] = Math.floor((sourceRgba[sourceOffset + 3] * maskAlpha[index] + 127) / 255);
  }
  return output;
}
