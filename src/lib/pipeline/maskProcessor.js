import { imageLoader } from '@/lib/pipeline/imageLoader';

// MaskProcessor — sole owner of mask transformations. Accepts Segmentation Layer masks;
// the Editor must never modify masks directly.
class MaskProcessor {
  async process(maskUrl, { width, height, expand = 0, feather = 0, dilate = 0, erode = 0, smooth = true } = {}) {
    const loaded = await imageLoader.load(maskUrl);
    let canvas = imageLoader.toCanvas(loaded.bitmap, width || loaded.width, height || loaded.height);

    if (expand > 0 || dilate > 0) canvas = this._morph(canvas, (expand || 0) + (dilate || 0), true);
    if (erode > 0) canvas = this._morph(canvas, erode, false);
    if (feather > 0) canvas = this._blur(canvas, feather, false);
    if (smooth && feather === 0) canvas = this._blur(canvas, 1.5, true); // edge smoothing + anti-aliasing

    const blob = await imageLoader.canvasToBlob(canvas, 'image/png');
    return { blob, width: canvas.width, height: canvas.height, size: blob.size, bounds: this._bounds(canvas) };
  }

  // Dilate/erode via blur + threshold (fast, no per-pixel kernel loops).
  _morph(canvas, radius, grow) {
    const blurred = this._blur(canvas, radius, false);
    const ctx = blurred.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, blurred.width, blurred.height);
    const cut = grow ? 16 : 240;
    for (let i = 0; i < img.data.length; i += 4) {
      const v = img.data[i] >= cut ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return blurred;
  }

  _blur(canvas, radius, subtle) {
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.filter = `blur(${subtle ? radius / 2 : radius}px)`;
    ctx.drawImage(canvas, 0, 0);
    return out;
  }

  _bounds(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        if (data[(y * canvas.width + x) * 4] > 32) {
          found = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    return { x: minX / canvas.width, y: minY / canvas.height, w: (maxX - minX) / canvas.width, h: (maxY - minY) / canvas.height };
  }
}

export const maskProcessor = new MaskProcessor();