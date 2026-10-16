/**
 * Offline Fashion real-photo research diagnostic. This measures only RGBA pixel
 * changes inside a manually specified torso rectangle; it cannot infer clothing
 * fit, occlusion quality or release eligibility. Never use it as an authority gate.
 */
export function maskAndCheckTorso(source, baseline, width, height, bounds) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width * height > 24_000_000) {
    throw new Error('Overlay diagnostic image geometry is invalid');
  }
  const expectedBytes = width * height * 4;
  if (!(source instanceof Uint8Array) || !(baseline instanceof Uint8Array) ||
      source.byteLength !== expectedBytes || baseline.byteLength !== expectedBytes) {
    throw new Error('Overlay diagnostic requires matching RGBA8 image bytes');
  }
  if (!bounds || !['left', 'top', 'right', 'bottom'].every(key => Number.isSafeInteger(bounds[key])) ||
      bounds.left < 0 || bounds.top < 0 || bounds.right >= width || bounds.bottom >= height ||
      bounds.left > bounds.right || bounds.top > bounds.bottom) {
    throw new Error('Overlay diagnostic requires a bounded torso rectangle');
  }
  const mask = new Uint8Array(width * height);
  let baselineChanged = 0;
  let outsideTorso = 0;
  let changedTorsoPixels = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const changed = source[offset] !== baseline[offset] ||
        source[offset + 1] !== baseline[offset + 1] ||
        source[offset + 2] !== baseline[offset + 2] ||
        source[offset + 3] !== baseline[offset + 3];
      if (!changed) continue;
      baselineChanged += 1;
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
        outsideTorso += 1;
      } else {
        mask[pixel] = 255;
        changedTorsoPixels += 1;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  const torsoWidth = bounds.right - bounds.left + 1;
  const torsoHeight = bounds.bottom - bounds.top + 1;
  const torsoPixels = torsoWidth * torsoHeight;
  return {
    mask, baselineChanged, outsideTorso,
    overlayFootprint: Object.freeze({
      torsoPixels,
      changedTorsoPixels,
      changedTorsoFraction: changedTorsoPixels / torsoPixels,
      changedExtent: changedTorsoPixels ? Object.freeze({ left, top, right, bottom }) : null,
      changedExtentWidthFraction: changedTorsoPixels ? (right - left + 1) / torsoWidth : 0,
      changedExtentHeightFraction: changedTorsoPixels ? (bottom - top + 1) / torsoHeight : 0,
    }),
  };
}
