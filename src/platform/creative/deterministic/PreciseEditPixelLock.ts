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


/**
 * High-resolution, source-registered local edit preview. The candidate is
 * cropped to the specified exact integer ROI; the original frame is never
 * resampled, even if the candidate was produced by a separate local model.
 *
 * R&D only: caller-provided rectangles/mattes convey NO Core/Project authority.
 * Callers must independently bind both to a current Project image SHA and
 * verify tenant ownership before this could be considered for production.
 */
export type PreciseEditPatchRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export function composePreciseEditPatchRgba8(
  source: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  candidatePatch: Uint8Array | Uint8ClampedArray,
  mattePatch: Uint8Array | Uint8ClampedArray,
  rect: PreciseEditPatchRect,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) ||
      sourceWidth < 1 || sourceHeight < 1 ||
      sourceWidth > 16_384 || sourceHeight > 16_384 ||
      sourceWidth * sourceHeight > 24_000_000) {
    throw new Error('Precise edit source geometry is invalid');
  }
  if (!(source instanceof Uint8Array || source instanceof Uint8ClampedArray) ||
      source.byteLength !== sourceWidth * sourceHeight * 4) {
    throw new Error('Precise edit source RGBA byte length is invalid');
  }
  if (!rect || typeof rect !== 'object' ||
      !Number.isSafeInteger(rect.left) || !Number.isSafeInteger(rect.top) ||
      !Number.isSafeInteger(rect.width) || !Number.isSafeInteger(rect.height) ||
      rect.left < 0 || rect.top < 0 || rect.width < 1 || rect.height < 1 ||
      rect.left + rect.width > sourceWidth || rect.top + rect.height > sourceHeight ||
      rect.width * rect.height > 4_194_304) {
    throw new Error('Precise edit patch geometry must be a bounded in-frame rectangle');
  }
  const patchPixels = rect.width * rect.height;
  if (!(candidatePatch instanceof Uint8Array || candidatePatch instanceof Uint8ClampedArray) ||
      !(mattePatch instanceof Uint8Array || mattePatch instanceof Uint8ClampedArray) ||
      candidatePatch.byteLength !== patchPixels * 4 ||
      mattePatch.byteLength !== patchPixels) {
    throw new Error('Precise edit patch requires exact RGBA8 pixels and R8 matte lengths');
  }
  // Fail before allocating/copying the output on any invalid matte byte.
  for (let index = 0; index < patchPixels; index += 1) {
    if (mattePatch[index] !== 0 && mattePatch[index] !== 255) {
      throw new Error('Precise edit patch matte must be strictly binary');
    }
  }

  const result = new Uint8ClampedArray(source);
  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const patchIndex = row * rect.width + column;
      if (mattePatch[patchIndex] === 0) continue;
      const patchOffset = patchIndex * 4;
      const destinationOffset = ((rect.top + row) * sourceWidth + rect.left + column) * 4;
      result.set(candidatePatch.subarray(patchOffset, patchOffset + 4), destinationOffset);
    }
  }
  return result;
}
