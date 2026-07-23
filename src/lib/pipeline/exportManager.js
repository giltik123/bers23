import { base44 } from '@/api/base44Client';
import { imageLoader } from '@/lib/pipeline/imageLoader';
import { previewGenerator } from '@/lib/pipeline/previewGenerator';

// ExportManager — encodes results as JPEG/PNG/WEBP at original or preview resolution and uploads them.
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

class ExportManager {
  // source: image URL. format: 'jpeg' | 'png' | 'webp'. resolution: 'original' | 'preview'.
  async exportImage(sourceUrl, { format = 'png', resolution = 'original', quality = 0.92, filename = 'export' } = {}) {
    const loaded = await imageLoader.load(sourceUrl);
    let bitmap = loaded.bitmap;

    if (resolution === 'preview') {
      const preview = await previewGenerator.generate(bitmap, 'high');
      bitmap = await createImageBitmap(preview.blob);
    }

    const canvas = imageLoader.toCanvas(bitmap);
    const blob = await imageLoader.canvasToBlob(canvas, MIME[format] || MIME.png, quality);
    const file = new File([blob], `${filename}.${format}`, { type: blob.type });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return { file_url, width: canvas.width, height: canvas.height, format, size: blob.size };
  }
}

export const exportManager = new ExportManager();