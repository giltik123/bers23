import { coreClient } from '@/api/coreClient';
import { imageLoader } from '@/lib/pipeline/imageLoader';

// Composer — merges generated content back into the original image.
// Only masked pixels change; background, identity, camera and lighting of untouched
// areas are preserved bit-for-bit. Supports single object, multiple objects, whole image.
class Composer {
  // ({ originalUrl, generatedUrl, masks }) → { image_url, width, height, mode }
  async compose({ originalUrl, generatedUrl, masks = [] }) {
    // Whole-image edit: no masks — the generation IS the result.
    if (!masks.length) {
      const gen = await imageLoader.load(generatedUrl);
      return { image_url: generatedUrl, width: gen.width, height: gen.height, mode: 'whole_image' };
    }

    const [orig, gen] = await Promise.all([imageLoader.load(originalUrl), imageLoader.load(generatedUrl)]);
    const w = orig.width, h = orig.height;

    // Union of all object masks, converted from luminance to alpha.
    const alphaMask = await this._unionAlphaMask(masks, w, h);

    // Generated layer clipped to the mask.
    const layer = imageLoader.toCanvas(gen.bitmap, w, h);
    const lctx = layer.getContext('2d');
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(alphaMask, 0, 0, w, h);

    // Untouched original underneath, masked generation on top.
    const out = imageLoader.toCanvas(orig.bitmap, w, h);
    out.getContext('2d').drawImage(layer, 0, 0);

    const blob = await imageLoader.canvasToBlob(out, 'image/png');
    const file = new File([blob], 'composed.png', { type: 'image/png' });
    const { file_url } = await coreClient.integrations.Core.UploadFile({ file });
    return { image_url: file_url, width: w, height: h, mode: masks.length > 1 ? 'multi_object' : 'single_object' };
  }

  async _unionAlphaMask(masks, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.globalCompositeOperation = 'lighten';
    for (const m of masks) {
      const bitmap = await createImageBitmap(m.blob);
      ctx.drawImage(bitmap, 0, 0, w, h);
    }
    // Luminance → alpha so feathered mask edges blend smoothly.
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = img.data[i];
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

export const composer = new Composer();