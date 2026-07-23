import { imageLoader } from '@/lib/pipeline/imageLoader';

// PreviewGenerator — lightweight previews at three quality levels. Fully async; never blocks the UI.
export const PREVIEW_LEVELS = {
  low: { maxDim: 256, quality: 0.6 },
  medium: { maxDim: 512, quality: 0.75 },
  high: { maxDim: 1024, quality: 0.85 },
};

class PreviewGenerator {
  async generate(bitmap, level = 'medium') {
    const { maxDim, quality } = PREVIEW_LEVELS[level] || PREVIEW_LEVELS.medium;
    // Yield to the event loop so heavy frames never stall interaction.
    await new Promise((r) => setTimeout(r, 0));

    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = imageLoader.toCanvas(bitmap, w, h);
    const blob = await imageLoader.canvasToBlob(canvas, 'image/jpeg', quality);
    return { blob, url: URL.createObjectURL(blob), width: w, height: h, level, size: blob.size };
  }
}

export const previewGenerator = new PreviewGenerator();