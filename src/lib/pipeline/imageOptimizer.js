import { imageLoader } from '@/lib/pipeline/imageLoader';

// ImageOptimizer — compresses oversized images and strips metadata via re-encode. Quality is reduced only when necessary.
const TARGET_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 4096;

class ImageOptimizer {
  async optimize(loaded) {
    const { bitmap, size, width, height, mimeType } = loaded;
    const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;
    const needsCompress = size > TARGET_BYTES;
    if (!needsResize && !needsCompress) {
      return { ...loaded, optimized: false, compressionRatio: 1 };
    }

    const scale = needsResize ? Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height) : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = imageLoader.toCanvas(bitmap, w, h);

    // Start lossless-leaning; step quality down only while over budget.
    const type = mimeType === 'image/png' && !needsCompress ? 'image/png' : 'image/jpeg';
    let quality = 0.95;
    let blob = await imageLoader.canvasToBlob(canvas, type, quality);
    while (blob.size > TARGET_BYTES && quality > 0.6) {
      quality -= 0.1;
      blob = await imageLoader.canvasToBlob(canvas, 'image/jpeg', quality);
    }

    const newBitmap = await createImageBitmap(blob);
    return {
      blob, bitmap: newBitmap, width: w, height: h, size: blob.size, mimeType: blob.type,
      optimized: true, compressionRatio: +(size / blob.size).toFixed(2),
    };
  }
}

export const imageOptimizer = new ImageOptimizer();