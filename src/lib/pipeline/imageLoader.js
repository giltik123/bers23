// ImageLoader — loads remote images into decoded, drawable form. Single entry point for pixel access.
class ImageLoader {
  async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob).catch(() => {
      throw new Error('Image is corrupted or in an unsupported format');
    });
    return { blob, bitmap, width: bitmap.width, height: bitmap.height, size: blob.size, mimeType: blob.type };
  }

  toCanvas(bitmap, width = bitmap.width, height = bitmap.height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    return canvas;
  }

  async canvasToBlob(canvas, mimeType = 'image/png', quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), mimeType, quality);
    });
  }
}

export const imageLoader = new ImageLoader();