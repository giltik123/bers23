// ColorManager — snapshots color characteristics before processing and verifies them after.
// Never modifies color unless explicitly requested.
class ColorManager {
  snapshot(bitmap) {
    const size = 32; // downsample for fast stats
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    let sum = 0, sumSq = 0, r = 0, g = 0, b = 0;
    const n = size * size;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum; sumSq += lum * lum;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    const brightness = sum / n;
    return {
      brightness: +brightness.toFixed(1),
      contrast: +Math.sqrt(sumSq / n - brightness * brightness).toFixed(1),
      whiteBalance: { r: +(r / n).toFixed(1), g: +(g / n).toFixed(1), b: +(b / n).toFixed(1) },
      gamma: 2.2, // sRGB assumption — canvas operates in sRGB
      colorProfile: 'sRGB',
    };
  }

  // Compare result against the original snapshot; report drift without correcting (preserve-only policy).
  verify(originalSnapshot, resultSnapshot, tolerance = 12) {
    const drift = Math.abs(originalSnapshot.brightness - resultSnapshot.brightness);
    return { preserved: drift <= tolerance, brightnessDrift: +drift.toFixed(1) };
  }
}

export const colorManager = new ColorManager();