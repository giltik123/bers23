/**
 * BERS photographic alpha/feather compositing candidate (R&D, NOT a Core v1
 * operation). This intentionally does not modify accepted pixel-law kernels.
 *
 * Treat mask alpha as a spatial interpolation weight, and interpolate source
 * and generated patch as premultiplied LINEAR-light RGB and straight alpha.
 * All mask-zero source RGBA bytes remain identical, including hidden RGB.
 * Uses nearest-neighbour patch coordinate mapping compatible with the existing
 * ControlledLocalEdit ROI geometry; higher quality patch resizing is separate.
 */
const LINEAR = Float64Array.from({ length: 256 }, (_, byte) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const toSrgbByte = value => {
  const c = Math.max(0, Math.min(1, value));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
  return Math.min(255, Math.max(0, Math.round(s * 255)));
};

function validImage(image) {
  return image && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height)
    && image.width > 0 && image.height > 0
    && image.width * image.height <= 100_000_000
    && image.data instanceof Uint8ClampedArray
    && image.data.byteLength === image.width * image.height * 4
    && (image.orientation === undefined || image.orientation === 1);
}

export function compositeMaskedLinearLightRND(original, patch, mask, transform) {
  if (!validImage(original) || !validImage(patch))
    throw new Error('Professional composite requires oriented RGBA8 source and patch');
  if (!mask || mask.coordinateSpace !== 'ORIGINAL'
    || mask.width !== original.width || mask.height !== original.height
    || !(mask.alpha instanceof Uint8Array)
    || mask.alpha.byteLength !== original.width * original.height)
    throw new Error('Professional composite needs exact original-space MASK alpha');
  const b = transform?.originalBounds;
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isSafeInteger)
    || b.x < 0 || b.y < 0 || b.width < 1 || b.height < 1
    || b.x + b.width > original.width || b.y + b.height > original.height
    || patch.width !== transform.providerWidth || patch.height !== transform.providerHeight
    || !Number.isFinite(transform.scaleX) || !Number.isFinite(transform.scaleY)
    || Math.abs(transform.scaleX - patch.width / b.width) > 1e-9
    || Math.abs(transform.scaleY - patch.height / b.height) > 1e-9)
    throw new Error('Professional composite ROI transform is inconsistent');
  const output = new Uint8ClampedArray(original.data);
  for (let y = 0; y < b.height; y++) {
    const sourceY = Math.min(patch.height - 1, Math.floor(y * transform.scaleY));
    for (let x = 0; x < b.width; x++) {
      const xx = b.x + x, yy = b.y + y;
      const maskByte = mask.alpha[yy * original.width + xx];
      if (maskByte === 0) continue;
      const target = (yy * original.width + xx) * 4;
      const sourceX = Math.min(patch.width - 1, Math.floor(x * transform.scaleX));
      const from = (sourceY * patch.width + sourceX) * 4;
      if (maskByte === 255) {
        output.set(patch.data.subarray(from, from + 4), target);
        continue;
      }
      const t = maskByte / 255;
      const originalAlpha = original.data[target + 3] / 255;
      const patchAlpha = patch.data[from + 3] / 255;
      const w0 = (1 - t) * originalAlpha;
      const w1 = t * patchAlpha;
      const alpha = w0 + w1;
      if (alpha === 0) {
        // Keep hidden original RGB rather than allowing fully transparent
        // generated patch values to introduce fringe metadata.
        output[target + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c++) {
        const linear = (
          LINEAR[original.data[target + c]] * w0
          + LINEAR[patch.data[from + c]] * w1
        ) / alpha;
        output[target + c] = toSrgbByte(linear);
      }
      output[target + 3] = Math.round(alpha * 255);
    }
  }
  return Object.freeze({
    ...original, orientation: 1, data: output,
  });
}
