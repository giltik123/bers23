import { imageLoader } from '@/lib/pipeline/imageLoader';

// QualityValidator — gates every generation before it can be composed or shown.
class QualityValidator {
  // (resultUrl, prepared) → { valid, errors[], loaded }
  async validate(resultUrl, prepared) {
    const errors = [];
    if (!resultUrl) return { valid: false, errors: ['Generation did not complete'] };

    let loaded;
    try {
      loaded = await imageLoader.load(resultUrl); // throws on corrupted output
    } catch {
      return { valid: false, errors: ['Generated image is corrupted'] };
    }

    // Dimensions must be sane and roughly match the processing aspect ratio.
    if (!loaded.width || !loaded.height) errors.push('Generated image has no dimensions');
    const expected = prepared?.processingResolution;
    if (expected?.width && loaded.width) {
      const expAspect = expected.width / expected.height;
      const gotAspect = loaded.width / loaded.height;
      if (Math.abs(expAspect - gotAspect) / expAspect > 0.05) errors.push('Generated image aspect ratio does not match');
    }

    // Empty / blank output check via pixel variance.
    if (loaded.bitmap && this._isBlank(loaded.bitmap)) errors.push('Generated image is empty');

    // Mask boundaries must fit within the generated frame.
    for (const m of prepared?.masks || []) {
      if (m.bounds && (m.bounds.x < 0 || m.bounds.y < 0 || m.bounds.x + m.bounds.w > 1.001 || m.bounds.y + m.bounds.h > 1.001)) {
        errors.push('Mask boundaries fall outside the image');
        break;
      }
    }

    return { valid: errors.length === 0, errors, loaded };
  }

  _isBlank(bitmap) {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    return max - min < 4; // effectively a flat color
  }
}

export const qualityValidator = new QualityValidator();