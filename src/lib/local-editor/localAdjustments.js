/**
 * Browser/Node-pure LOCAL photo adjustments. No AI, network, credentials,
 * Core project mutation, DOM, or GPU dependencies. Deliberately not a
 * canonical Core FINAL operation: export is local PNG only.
 */
export const MAX_LOCAL_PIXELS = 12_000_000;

export const LOCAL_CONTROLS = Object.freeze([
  { key: 'exposure', label: 'Exposure (EV)', min: -2, max: 2, step: .1, category: 'Light' },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, category: 'Light' },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, category: 'Light' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, category: 'Light' },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, category: 'Light' },
  { key: 'gamma', label: 'Gamma', min: .5, max: 2, step: .05, category: 'Light' },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, category: 'Color' },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, category: 'Color' },
  { key: 'warmth', label: 'Temperature', min: -100, max: 100, step: 1, category: 'Color' },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, category: 'Color' },
  { key: 'hue', label: 'Hue shift', min: -180, max: 180, step: 1, category: 'Color' },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100, step: 1, category: 'Effects' },
  { key: 'soften', label: 'Soften', min: 0, max: 100, step: 1, category: 'Effects' },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, step: 1, category: 'Effects' },
  { key: 'pixelate', label: 'Pixelate block (px)', min: 0, max: 24, step: 1, category: 'Effects' },
  { key: 'posterize', label: 'Posterize levels', min: 0, max: 16, step: 1, category: 'Effects' },
  { key: 'thresholdCutoff', label: 'Threshold cutoff', min: 1, max: 254, step: 1, category: 'Effects' },
]);

export const LOCAL_DEFAULTS = Object.freeze({
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, gamma: 1,
  saturation: 0, vibrance: 0, warmth: 0, tint: 0, hue: 0,
  vignette: 0, soften: 0, sharpen: 0, pixelate: 0, posterize: 0,
  thresholdCutoff: 128, effect: 'none',
});

export const LOCAL_EFFECTS = Object.freeze([
  { value: 'none', label: 'Natural' },
  { value: 'monochrome', label: 'Black & white' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'invert', label: 'Invert colors' },
  { value: 'threshold', label: 'Two-tone threshold' },
]);

export const LOCAL_PRESETS = Object.freeze([
  { id: 'original', label: 'Original', settings: {} },
  { id: 'punchy', label: 'Punchy', settings: { contrast: 20, saturation: 14, vibrance: 20 } },
  { id: 'portrait', label: 'Soft portrait', settings: { contrast: -9, highlights: -18, shadows: 13, soften: 20, warmth: 6 } },
  { id: 'warm', label: 'Warm light', settings: { warmth: 24, highlights: -16, vibrance: 10 } },
  { id: 'mono', label: 'Monochrome', settings: { effect: 'monochrome', contrast: 20 } },
  { id: 'film', label: 'Vintage film', settings: { effect: 'sepia', contrast: -9, vignette: 40 } },
]);

const definitions = new Map(LOCAL_CONTROLS.map(control => [control.key, control]));
const effects = new Set(LOCAL_EFFECTS.map(effect => effect.value));
const clamp = (value, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, value));
const byte = (value) => Math.round(clamp(value));

export function normalizeLocalSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Local adjustment settings must be an object');
  for (const key of Object.keys(input)) {
    if (key !== 'effect' && !definitions.has(key)) throw new Error('Unsupported local adjustment: ' + key);
  }
  const settings = { ...LOCAL_DEFAULTS, ...input };
  if (!effects.has(settings.effect)) throw new Error('Unsupported local color effect');
  for (const { key, min, max, step } of LOCAL_CONTROLS) {
    const value = settings[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || ((key === 'posterize' || key === 'pixelate') && value === 1)) throw new Error('Invalid local adjustment: ' + key);
    if (Math.abs((value - min) / step - Math.round((value - min) / step)) > 1e-6) throw new Error('Invalid local adjustment step: ' + key);
  }
  return Object.freeze(settings);
}

export function isNeutralLocalSettings(settings) {
  const normalized = normalizeLocalSettings(settings);
  return Object.keys(LOCAL_DEFAULTS).every(key => normalized[key] === LOCAL_DEFAULTS[key]);
}

export function presetLocalSettings(id) {
  const preset = LOCAL_PRESETS.find(value => value.id === id);
  if (!preset) throw new Error('Unknown local preset');
  return normalizeLocalSettings(preset.settings);
}

function assertRaster(source, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_LOCAL_PIXELS) {
    throw new Error('Local edit supports images of at most 12 megapixels');
  }
  if (!(source instanceof Uint8Array || source instanceof Uint8ClampedArray) || source.length !== width * height * 4) {
    throw new Error('Local edit requires exact RGBA8 source pixels');
  }
}

function hueRotate(red, green, blue, degrees) {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const chroma = max - min;
  if (!chroma) return [red, green, blue];
  const lightness = (max + min) / 2;
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  hue = ((hue * 60 + degrees) % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [rr, gg, bb] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [(rr + m) * 255, (gg + m) * 255, (bb + m) * 255];
}

function pixelateRgb(data, width, height, block) {
  if (block < 2) return;
  for (let top = 0; top < height; top += block) {
    for (let left = 0; left < width; left += block) {
      let red = 0, green = 0, blue = 0, total = 0;
      const bottom = Math.min(top + block, height), right = Math.min(left + block, width);
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const i = (y * width + x) * 4, weight = data[i + 3];
        red += data[i] * weight; green += data[i + 1] * weight; blue += data[i + 2] * weight; total += weight;
      }
      if (!total) continue;
      const r = byte(red / total), g = byte(green / total), b = byte(blue / total);
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const i = (y * width + x) * 4;
        if (!data[i + 3]) continue;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    }
  }
}

function localDetail(data, width, height, soften, sharpen) {
  if (!soften && !sharpen) return;
  const original = new Uint8ClampedArray(data);
  const soft = soften / 100, sharp = sharpen / 100;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!original[i + 3]) continue;
    let rr = 0, gg = 0, bb = 0, weights = 0;
    // Alpha-weighted 3x3 local blur; preserve source alpha and prevent transparent
    // neighbors from bleeding arbitrary RGB into visible pixels.
    for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
        const j = (yy * width + xx) * 4, weight = original[j + 3];
        rr += original[j] * weight; gg += original[j + 1] * weight; bb += original[j + 2] * weight; weights += weight;
      }
    }
    if (!weights) continue;
    for (const [channel, average] of [[0, rr / weights], [1, gg / weights], [2, bb / weights]]) {
      const v = original[i + channel];
      data[i + channel] = byte(v + (average - v) * soft + (v - average) * sharp);
    }
  }
}

/**
 * Deterministic CPU-only RGB editing. The original bytes are NEVER mutated,
 * alpha is NEVER changed and no hidden project/server state is created.
 */
export function applyLocalAdjustments(source, width, height, input = {}) {
  assertRaster(source, width, height);
  const s = normalizeLocalSettings(input);
  const output = new Uint8ClampedArray(source);
  if (isNeutralLocalSettings(s)) return output;

  pixelateRgb(output, width, height, s.pixelate);
  const exposureFactor = 2 ** s.exposure;
  const contrast = (100 + s.contrast) / 100;
  const gammaInv = 1 / s.gamma;
  const sat = 1 + s.saturation / 100;
  const vibrance = s.vibrance / 100;
  const brightness = s.brightness * 1.25;
  const temp = s.warmth * .55;
  const tint = s.tint * .4;
  const cx = Math.max(1, width - 1) / 2, cy = Math.max(1, height - 1) / 2;

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (source[i + 3] === 0) continue;
    let r = output[i], g = output[i + 1], b = output[i + 2];
    r *= exposureFactor; g *= exposureFactor; b *= exposureFactor;
    r = (r - 127.5) * contrast + 127.5 + brightness;
    g = (g - 127.5) * contrast + 127.5 + brightness;
    b = (b - 127.5) * contrast + 127.5 + brightness;
    if (s.highlights || s.shadows) {
      const luminance = clamp((.2126 * r + .7152 * g + .0722 * b) / 255, 0, 1);
      const delta = 70 * (s.shadows / 100) * (1 - luminance) ** 2 + 70 * (s.highlights / 100) * luminance ** 2;
      r += delta; g += delta; b += delta;
    }
    if (s.gamma !== 1) {
      r = 255 * (clamp(r) / 255) ** gammaInv;
      g = 255 * (clamp(g) / 255) ** gammaInv;
      b = 255 * (clamp(b) / 255) ** gammaInv;
    }
    r += temp + tint * .5; g -= tint; b -= temp - tint * .5;
    if (sat !== 1 || vibrance) {
      const luma = .2126 * r + .7152 * g + .0722 * b;
      const chroma = clamp((Math.max(r, g, b) - Math.min(r, g, b)) / 255, 0, 1);
      const adjustment = sat * (1 + vibrance * (1 - chroma));
      r = luma + (r - luma) * adjustment;
      g = luma + (g - luma) * adjustment;
      b = luma + (b - luma) * adjustment;
    }
    if (s.hue) [r, g, b] = hueRotate(clamp(r), clamp(g), clamp(b), s.hue);
    if (s.effect === 'monochrome' || s.effect === 'threshold') {
      const luma = .2126 * r + .7152 * g + .0722 * b;
      const value = s.effect === 'threshold' ? (luma >= s.thresholdCutoff ? 255 : 0) : luma;
      r = value; g = value; b = value;
    } else if (s.effect === 'sepia') {
      const rr = .393 * r + .769 * g + .189 * b;
      const gg = .349 * r + .686 * g + .168 * b;
      const bb = .272 * r + .534 * g + .131 * b;
      r = rr; g = gg; b = bb;
    } else if (s.effect === 'invert') {
      r = 255 - r; g = 255 - g; b = 255 - b;
    }
    if (s.posterize > 1) {
      const steps = s.posterize - 1;
      r = Math.round(clamp(r) / 255 * steps) * 255 / steps;
      g = Math.round(clamp(g) / 255 * steps) * 255 / steps;
      b = Math.round(clamp(b) / 255 * steps) * 255 / steps;
    }
    if (s.vignette) {
      const distance = Math.hypot((x - cx) / cx, (y - cy) / cy) / Math.SQRT2;
      const darken = 1 - s.vignette / 100 * Math.max(0, (distance - .2) / .8) ** 1.7;
      r *= darken; g *= darken; b *= darken;
    }
    output[i] = byte(r); output[i + 1] = byte(g); output[i + 2] = byte(b);
  }

  localDetail(output, width, height, s.soften, s.sharpen);
  return output;
}

export function localLuminanceHistogram(source, width, height) {
  assertRaster(source, width, height);
  const result = new Uint32Array(256);
  for (let i = 0; i < source.length; i += 4) {
    if (!source[i + 3]) continue;
    result[byte(.2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2])]++;
  }
  return result;
}
