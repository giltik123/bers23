/**
 * Experimental Fashion Try-On foreground-occlusion pixel kernel.
 *
 * Re-composites an explicitly supplied, trusted binary foreground mask from the
 * original Project on top of a garment-composited frame. This does NOT segment a
 * person, infer garment drape, or change the admitted v1 Try-On path.
 *
 * A missing/uncertain mask must never be guessed: the caller must hold a
 * separately reviewed, geometry-bound person-foreground mask.
 */
export function restoreTryOnForegroundRgba8({
  originalProjectRgba,
  garmentCompositeRgba,
  personForegroundMask,
  width,
  height,
}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 8192 || height > 8192 ||
      width * height > 16_777_216) {
    throw new RangeError('Try-On foreground geometry is out of bounds');
  }
  const pixels = width * height;
  for (const [name, value] of [
    ['originalProjectRgba', originalProjectRgba],
    ['garmentCompositeRgba', garmentCompositeRgba],
  ]) {
    if (!(value instanceof Uint8Array || value instanceof Uint8ClampedArray) ||
        value.byteLength !== pixels * 4) {
      throw new TypeError(`Try-On ${name} must be a full-frame RGBA8 image`);
    }
  }
  if (!(personForegroundMask instanceof Uint8Array ||
        personForegroundMask instanceof Uint8ClampedArray) ||
      personForegroundMask.byteLength !== pixels) {
    throw new TypeError('Try-On foreground mask must be a geometry-bound single-channel image');
  }

  // An intentionally conservative binary contract: alpha uncertainty is not
  // silently promoted to "person in front", and every input is checked before
  // modifying any pixel of the result.
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const mask = personForegroundMask[pixel];
    if (mask !== 0 && mask !== 255) {
      throw new RangeError('Try-On foreground mask must be binary 0/255');
    }
  }

  const output = new Uint8ClampedArray(garmentCompositeRgba);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (personForegroundMask[pixel] !== 255) continue;
    const offset = pixel * 4;
    output[offset] = originalProjectRgba[offset];
    output[offset + 1] = originalProjectRgba[offset + 1];
    output[offset + 2] = originalProjectRgba[offset + 2];
    output[offset + 3] = originalProjectRgba[offset + 3];
  }
  return output;
}
