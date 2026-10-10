/**
 * Research-only precise edit compositing inspired by a *behavior*, not copied
 * Ideogram code or weights. Does not change Core authority or offer inference.
 * Pixels outside a reviewed binary edit matte are source-byte-exact.
 */
export function composePreciseEditRgba8(
  source: Uint8Array | Uint8ClampedArray,
  candidate: Uint8Array | Uint8ClampedArray,
  matte: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 16_384 || height > 16_384 ||
      width * height > 24_000_000) {
    throw new Error('Invalid bounded image geometry');
  }
  const pixels = width * height;
  if (!(source instanceof Uint8Array || source instanceof Uint8ClampedArray) ||
      !(candidate instanceof Uint8Array || candidate instanceof Uint8ClampedArray) ||
      !(matte instanceof Uint8Array || matte instanceof Uint8ClampedArray) ||
      source.byteLength !== pixels * 4 || candidate.byteLength !== pixels * 4 ||
      matte.byteLength !== pixels) {
    throw new Error('Exact RGBA8 image and R8 matte byte lengths required');
  }
  // Validate the whole matte before writing to the result: no partial editing
  // or silently introducing alpha fringes from ambiguous soft masks.
  for (let i = 0; i < pixels; i += 1) {
    if (matte[i] !== 0 && matte[i] !== 255) {
      throw new Error('Precise edit requires a strictly binary reviewed matte');
    }
  }
  const output = new Uint8ClampedArray(source);
  for (let i = 0; i < pixels; i += 1) {
    if (matte[i] === 255) {
      const offset = i * 4;
      output.set(candidate.subarray(offset, offset + 4), offset);
    }
  }
  return output;
}
