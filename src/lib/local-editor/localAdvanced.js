/**
 * Advanced browser-only image operations: hand-set tone curves, eight hue
 * bands, and manual clone stamping. No AI, network, DOM or Core authority.
 * Every transform returns fresh RGBA and preserves exact source alpha bytes.
 */
export const LOCAL_HUE_BANDS = Object.freeze([
  { id: 'red', label: 'Reds', center: 0 },
  { id: 'orange', label: 'Oranges', center: 30 },
  { id: 'yellow', label: 'Yellows', center: 60 },
  { id: 'green', label: 'Greens', center: 120 },
  { id: 'aqua', label: 'Aquas', center: 180 },
  { id: 'blue', label: 'Blues', center: 240 },
  { id: 'purple', label: 'Purples', center: 285 },
  { id: 'magenta', label: 'Magentas', center: 330 },
]);
const HUE_BAND = new Map(LOCAL_HUE_BANDS.map(band => [band.id, band]));
const CURVE_KEYS = Object.freeze(['black', 'shadows', 'midtones', 'highlights', 'white']);
const CURVE_X = Object.freeze([0, 64, 128, 192, 255]);
export const LOCAL_CURVE_DEFAULT = Object.freeze({
  black: 0, shadows: 64, midtones: 128, highlights: 192, white: 255,
});
export const LOCAL_CURVE_CHANNELS = Object.freeze(['rgb', 'red', 'green', 'blue']);
export const LOCAL_CHANNEL_CURVE_DEFAULTS = Object.freeze({
  red: LOCAL_CURVE_DEFAULT,
  green: LOCAL_CURVE_DEFAULT,
  blue: LOCAL_CURVE_DEFAULT,
});
export const LOCAL_HSL_DEFAULT = Object.freeze({ hue: 0, saturation: 0, lightness: 0 });
export const LOCAL_GRADIENT_MODES = Object.freeze([
  { id: 'off', label: 'Off · entire image' },
  { id: 'left-right', label: 'Left to right' },
  { id: 'right-left', label: 'Right to left' },
  { id: 'top-bottom', label: 'Top to bottom' },
  { id: 'bottom-top', label: 'Bottom to top' },
  { id: 'radial', label: 'Radial · center' },
]);
export const LOCAL_GRADIENT_DEFAULT = Object.freeze({ mode: 'off', start: 0, end: 100 });
export const LOCAL_ADVANCED_DEFAULTS = Object.freeze({
  curve: LOCAL_CURVE_DEFAULT,
  channelCurves: LOCAL_CHANNEL_CURVE_DEFAULTS,
  hsl: Object.freeze(Object.fromEntries(LOCAL_HUE_BANDS.map(band => [band.id, LOCAL_HSL_DEFAULT]))),
  cloneStrokes: Object.freeze([]),
  gradient: LOCAL_GRADIENT_DEFAULT,
});
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const byte = x => Math.round(clamp(x, 0, 255));

function assertImage(src, width, height) {
  if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)
      || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width * height > 12_000_000
      || src.length !== width * height * 4) {
    throw new Error('Advanced local editing requires bounded original RGBA8 pixels');
  }
}
function checkedInt(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid ' + label);
  return value;
}
function point(value, label) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)
      || value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) {
    throw new Error('Invalid normalized clone ' + label);
  }
  return Object.freeze({ x: value.x, y: value.y });
}

export function normalizeAdvancedSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid advanced local settings');
  for (const key of Object.keys(input)) if (!['curve', 'channelCurves', 'hsl', 'cloneStrokes', 'gradient'].includes(key)) throw new Error('Unsupported advanced setting: ' + key);
  const curveInput = input.curve ?? LOCAL_CURVE_DEFAULT;
  if (!curveInput || typeof curveInput !== 'object' || Array.isArray(curveInput)
      || Object.keys(curveInput).some(key => !CURVE_KEYS.includes(key))) throw new Error('Invalid tone curve');
  const curve = Object.freeze(Object.fromEntries(CURVE_KEYS.map((key, index) => [
    key, checkedInt(curveInput[key], 0, 255, 'tone curve point ' + index),
  ])));
  const channelInput = input.channelCurves ?? LOCAL_CHANNEL_CURVE_DEFAULTS;
  if (!channelInput || typeof channelInput !== 'object' || Array.isArray(channelInput)
      || Object.keys(channelInput).some(key => !['red', 'green', 'blue'].includes(key))) {
    throw new Error('Invalid RGB channel curves');
  }
  const channelCurves = Object.freeze(Object.fromEntries(['red', 'green', 'blue'].map(channel => {
    const candidate = Object.prototype.hasOwnProperty.call(channelInput, channel)
      ? channelInput[channel] : LOCAL_CURVE_DEFAULT;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
        || Object.keys(candidate).some(key => !CURVE_KEYS.includes(key))) {
      throw new Error('Invalid RGB ' + channel + ' tone curve');
    }
    return [channel, Object.freeze(Object.fromEntries(CURVE_KEYS.map((key, index) =>
      [key, checkedInt(candidate[key], 0, 255, channel + ' tone curve point ' + index)]
    )))];
  })));
  const hslInput = input.hsl ?? LOCAL_ADVANCED_DEFAULTS.hsl;
  if (!hslInput || typeof hslInput !== 'object' || Array.isArray(hslInput)
      || Object.keys(hslInput).some(key => !HUE_BAND.has(key))) throw new Error('Invalid selective HSL bands');
  const hsl = Object.freeze(Object.fromEntries(LOCAL_HUE_BANDS.map(band => {
    const channels = hslInput[band.id] ?? LOCAL_HSL_DEFAULT;
    if (!channels || typeof channels !== 'object' || Array.isArray(channels)
        || Object.keys(channels).some(key => !['hue', 'saturation', 'lightness'].includes(key))) {
      throw new Error('Invalid selective HSL channels');
    }
    return [band.id, Object.freeze({
      hue: checkedInt(channels.hue, -60, 60, 'selective hue'),
      saturation: checkedInt(channels.saturation, -100, 100, 'selective saturation'),
      lightness: checkedInt(channels.lightness, -100, 100, 'selective lightness'),
    })];
  })));
  const strokesInput = input.cloneStrokes ?? [];
  if (!Array.isArray(strokesInput) || strokesInput.length > 32) throw new Error('Too many manual retouch strokes');
  const cloneStrokes = Object.freeze(strokesInput.map(stroke => {
    if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke)
        || Object.keys(stroke).some(key => !['source', 'points', 'radius', 'hardness', 'opacity', 'blendMode'].includes(key))
        || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > 512) {
      throw new Error('Invalid clone stamp stroke');
    }
    if (typeof stroke.radius !== 'number' || !Number.isFinite(stroke.radius) || stroke.radius <= 0 || stroke.radius > .1
        || typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) || stroke.hardness < 0 || stroke.hardness > 1
        || typeof stroke.opacity !== 'number' || !Number.isFinite(stroke.opacity) || stroke.opacity <= 0 || stroke.opacity > 1
        || !['clone', 'color-match'].includes(stroke.blendMode ?? 'clone')) {
      throw new Error('Invalid clone stamp brush settings');
    }
    return Object.freeze({
      source: point(stroke.source, 'source'),
      points: Object.freeze(stroke.points.map((p, i) => point(p, 'point ' + i))),
      radius: stroke.radius,
      hardness: stroke.hardness,
      opacity: stroke.opacity,
      blendMode: stroke.blendMode ?? 'clone',
    });
  }));
  const gradientInput = input.gradient ?? LOCAL_GRADIENT_DEFAULT;
  if (!gradientInput || typeof gradientInput !== 'object' || Array.isArray(gradientInput)
      || Object.keys(gradientInput).some(key => !['mode', 'start', 'end'].includes(key))
      || !LOCAL_GRADIENT_MODES.some(item => item.id === gradientInput.mode)) {
    throw new Error('Invalid local gradient mask');
  }
  const gradient = Object.freeze({
    mode: gradientInput.mode,
    start: checkedInt(gradientInput.start, 0, 99, 'gradient start'),
    end: checkedInt(gradientInput.end, 1, 100, 'gradient end'),
  });
  if (gradient.start >= gradient.end) throw new Error('Invalid gradient feather interval');
  return Object.freeze({ curve, channelCurves, hsl, cloneStrokes, gradient });
}

export function isNeutralAdvancedSettings(input = {}) {
  const settings = normalizeAdvancedSettings(input);
  return CURVE_KEYS.every(key => settings.curve[key] === LOCAL_CURVE_DEFAULT[key])
    && ['red', 'green', 'blue'].every(channel =>
      CURVE_KEYS.every(key => settings.channelCurves[channel][key] === LOCAL_CURVE_DEFAULT[key]))
    && LOCAL_HUE_BANDS.every(band => ['hue', 'saturation', 'lightness'].every(key => settings.hsl[band.id][key] === 0))
    && settings.cloneStrokes.length === 0 && settings.gradient.mode === 'off';
}

export function curveLut(curveInput = LOCAL_CURVE_DEFAULT) {
  const { curve } = normalizeAdvancedSettings({ curve: curveInput });
  const y = CURVE_KEYS.map(key => curve[key]);
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const segment = Math.min(3, Math.floor(i / 64));
    const lowX = CURVE_X[segment], highX = CURVE_X[segment + 1];
    const t = (i - lowX) / (highX - lowX);
    // Monotone piecewise-linear interpolation: no spline overshoot or hidden
    // auto-correction, and exact point values at the five exposed stops.
    lut[i] = byte(y[segment] * (1 - t) + y[segment + 1] * t);
  }
  return lut;
}
const hueDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function rgbToHsl(r, g, b) {
  const red = r / 255, green = g / 255, blue = b / 255;
  const mx = Math.max(red, green, blue), mn = Math.min(red, green, blue);
  const difference = mx - mn, lightness = (mx + mn) / 2;
  if (difference < 1 / 255) return [0, 0, lightness];
  const saturation = difference / (1 - Math.abs(2 * lightness - 1));
  let hue = mx === red ? ((green - blue) / difference) % 6
    : mx === green ? (blue - red) / difference + 2
      : (red - green) / difference + 4;
  hue = ((hue * 60) % 360 + 360) % 360;
  return [hue, saturation, lightness];
}
function hslToRgb(hue, saturation, lightness) {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c]
      : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function transformHsl(output, width, height, hslSettings) {
  if (!LOCAL_HUE_BANDS.some(band => Object.values(hslSettings[band.id]).some(value => value !== 0))) return;
  for (let offset = 0; offset < width * height * 4; offset += 4) {
    if (!output[offset + 3]) continue;
    const old = [output[offset], output[offset + 1], output[offset + 2]];
    const [hue, saturation, lightness] = rgbToHsl(...old);
    if (saturation < .005) continue; // Gray pixels have no meaningful hue.
    let hueDelta = 0, satDelta = 0, lightDelta = 0, totalWeight = 0;
    for (const band of LOCAL_HUE_BANDS) {
      const controls = hslSettings[band.id];
      if (controls.hue === 0 && controls.saturation === 0 && controls.lightness === 0) continue;
      const distance = hueDistance(hue, band.center);
      // Feathered boundaries prevent harsh cyan/blue etc. transitions. For
      // safety, each band is bounded to +/-45° from its fixed center.
      const weight = clamp((45 - distance) / 20, 0, 1) * saturation;
      if (!weight) continue;
      hueDelta += controls.hue * weight;
      satDelta += controls.saturation * weight;
      lightDelta += controls.lightness * weight;
      totalWeight += weight;
    }
    if (!totalWeight) continue;
    // Weighted sum is normalized only when overlapping bands would exceed 1.
    const divisor = Math.max(1, totalWeight);
    const nextHue = ((hue + hueDelta / divisor) % 360 + 360) % 360;
    const nextSat = clamp(saturation * (1 + satDelta / divisor / 100), 0, 1);
    const nextLight = clamp(lightness + lightDelta / divisor / 200, 0, 1);
    const rgb = hslToRgb(nextHue, nextSat, nextLight);
    output[offset] = byte(rgb[0]); output[offset + 1] = byte(rgb[1]); output[offset + 2] = byte(rgb[2]);
  }
}

export const MAX_LOCAL_CLONE_PIXEL_VISITS = 25_000_000;

function segmentBounds(stroke, width, height, index) {
  const radius = stroke.radius * Math.min(width, height);
  const current = stroke.points[index];
  const previous = stroke.points[Math.max(0, index - 1)];
  const ax = previous.x * (width - 1), ay = previous.y * (height - 1);
  const bx = current.x * (width - 1), by = current.y * (height - 1);
  return {
    ax, ay, bx, by, radius,
    left: Math.max(0, Math.floor(Math.min(ax, bx) - radius)),
    right: Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius)),
    top: Math.max(0, Math.floor(Math.min(ay, by) - radius)),
    bottom: Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius)),
  };
}

// Lightweight, non-AI tonal adaptation. Sample an 8-point ring outside the
// actual stamp radius at both source and destination. Clamp per-channel
// correction to prevent uncontrolled shifts. This is NOT the Poisson/PDE
// healing algorithm used by specialist editors, and should not be labeled so.
function localToneOffset(snapshot, width, height, stroke) {
  if (stroke.blendMode !== 'color-match') return [0, 0, 0];
  const radius = Math.max(1.5, stroke.radius * Math.min(width, height) * 1.7);
  const centers = [
    [stroke.source.x * (width - 1), stroke.source.y * (height - 1)],
    [stroke.points[0].x * (width - 1), stroke.points[0].y * (height - 1)],
  ];
  const shifts = [0, 0, 0];
  let samples = 0;
  for (let sample = 0; sample < 16; sample++) {
    const angle = sample * Math.PI / 8;
    const positions = centers.map(([cx, cy]) => [
      Math.round(cx + Math.cos(angle) * radius),
      Math.round(cy + Math.sin(angle) * radius),
    ]);
    if (positions.some(([x, y]) => x < 0 || y < 0 || x >= width || y >= height)) continue;
    const from = (positions[0][1] * width + positions[0][0]) * 4;
    const dest = (positions[1][1] * width + positions[1][0]) * 4;
    if (snapshot[from + 3] < 240 || snapshot[dest + 3] < 240) continue;
    for (let channel = 0; channel < 3; channel++) {
      shifts[channel] += snapshot[dest + channel] - snapshot[from + channel];
    }
    samples++;
  }
  if (samples < 3) return [0, 0, 0];
  return shifts.map(value => clamp(Math.round(value / samples), -96, 96));
}

function transformClone(output, width, height, strokes) {
  if (!strokes.length) return;

  // Bound raster work before editing a single byte. In particular, pointer
  // paths with 512 identical samples and a large brush cannot hang a device.
  let visits = 0;
  const strokeRegions = [];
  for (const stroke of strokes) {
    const region = { left: width - 1, right: 0, top: height - 1, bottom: 0 };
    for (let index = 0; index < stroke.points.length; index++) {
      const box = segmentBounds(stroke, width, height, index);
      region.left = Math.min(region.left, box.left);
      region.right = Math.max(region.right, box.right);
      region.top = Math.min(region.top, box.top);
      region.bottom = Math.max(region.bottom, box.bottom);
      visits += (box.right - box.left + 1) * (box.bottom - box.top + 1);
      if (visits > MAX_LOCAL_CLONE_PIXEL_VISITS) {
        throw new Error('Manual clone stamp exceeds the local 25-million-pixel work budget. Use a smaller brush or fewer strokes.');
      }
    }
    // Final application scans only the stroke's bounded region, not the entire
    // potentially 12MP output raster once per tiny stamp.
    visits += (region.right - region.left + 1) * (region.bottom - region.top + 1);
    if (visits > MAX_LOCAL_CLONE_PIXEL_VISITS) {
      throw new Error('Manual clone stamp exceeds the local 25-million-pixel work budget. Use a smaller brush or fewer strokes.');
    }
    strokeRegions.push(region);
  }

  for (const [strokeIndex, stroke] of strokes.entries()) {
    // A frozen source per stroke avoids source-to-destination feedback. The
    // next stroke may intentionally sample the previous stroke's result.
    const source = new Uint8ClampedArray(output);
    const toneShift = localToneOffset(source, width, height, stroke);
    const envelope = new Uint8Array(width * height);
    const first = stroke.points[0];
    const baseX = stroke.source.x * (width - 1) - first.x * (width - 1);
    const baseY = stroke.source.y * (height - 1) - first.y * (height - 1);

    for (let index = 0; index < stroke.points.length; index++) {
      const box = segmentBounds(stroke, width, height, index);
      const dx = box.bx - box.ax, dy = box.by - box.ay;
      const segmentLengthSq = dx * dx + dy * dy;

      // Closest point on the continuous stroke segment, not repeated stamped
      // dots. This avoids gaps and unnecessary oversampling at any image size.
      for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) {
        const t = segmentLengthSq > 0
          ? clamp(((x - box.ax) * dx + (y - box.ay) * dy) / segmentLengthSq, 0, 1)
          : 0;
        const distance = Math.hypot(x - (box.ax + t * dx), y - (box.ay + t * dy));
        if (distance > box.radius) continue;
        const coverage = distance <= box.radius * stroke.hardness ? 255
          : Math.round(255 * (box.radius - distance) / Math.max(.001, box.radius * (1 - stroke.hardness)));
        const pixel = y * width + x;
        if (coverage > envelope[pixel]) envelope[pixel] = coverage;
      }
    }

    const region = strokeRegions[strokeIndex];
    for (let y = region.top; y <= region.bottom; y++) for (let x = region.left; x <= region.right; x++) {
      const pixel = y * width + x;
      const coverage = envelope[pixel];
      if (!coverage) continue;
      const target = pixel * 4;
      if (!output[target + 3]) continue;
      const sx = Math.round(x + baseX), sy = Math.round(y + baseY);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const from = (sy * width + sx) * 4;
      const strength = coverage / 255 * stroke.opacity * source[from + 3] / 255;
      if (!strength) continue;
      for (let channel = 0; channel < 3; channel++) {
        const sampled = byte(source[from + channel] + toneShift[channel]);
        output[target + channel] = byte(output[target + channel] * (1 - strength) + sampled * strength);
      }
      // Deliberately never replace alpha or unmask transparent target pixels.
    }
  }
}


function gradientCoverage(x, y, width, height, gradient) {
  const u = width > 1 ? x / (width - 1) : .5;
  const v = height > 1 ? y / (height - 1) : .5;
  let position;
  switch (gradient.mode) {
    case 'left-right': position = u; break;
    case 'right-left': position = 1 - u; break;
    case 'top-bottom': position = v; break;
    case 'bottom-top': position = 1 - v; break;
    case 'radial': position = 1 - Math.hypot(u - .5, v - .5) / Math.SQRT1_2; break;
    default: return 1;
  }
  return clamp((position * 100 - gradient.start) / (gradient.end - gradient.start), 0, 1);
}

function blendGradient(source, output, width, height, gradient) {
  if (gradient.mode === 'off') return;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (!source[offset + 3]) continue;
    const weight = gradientCoverage(x, y, width, height, gradient);
    if (weight === 1) continue;
    for (let channel = 0; channel < 3; channel++) {
      output[offset + channel] = byte(source[offset + channel] * (1 - weight) + output[offset + channel] * weight);
    }
  }
}

export function applyAdvancedLocalAdjustments(source, width, height, input = {}, original = source) {
  assertImage(source, width, height);
  assertImage(original, width, height);
  const advanced = normalizeAdvancedSettings(input);
  const output = new Uint8ClampedArray(source);
  if (isNeutralAdvancedSettings(advanced)) return output;
  const lut = curveLut(advanced.curve);
  const channelLuts = ['red', 'green', 'blue'].map(channel =>
    CURVE_KEYS.some(key => advanced.channelCurves[channel][key] !== LOCAL_CURVE_DEFAULT[key])
      ? curveLut(advanced.channelCurves[channel])
      : null
  );
  const hasMaster = CURVE_KEYS.some(key => advanced.curve[key] !== LOCAL_CURVE_DEFAULT[key]);
  if (hasMaster || channelLuts.some(Boolean)) {
    for (let i = 0; i < output.length; i += 4) {
      if (!output[i + 3]) continue;
      for (let channel = 0; channel < 3; channel++) {
        const masterValue = hasMaster ? lut[output[i + channel]] : output[i + channel];
        output[i + channel] = channelLuts[channel] ? channelLuts[channel][masterValue] : masterValue;
      }
    }
  }
  transformHsl(output, width, height, advanced.hsl);
  // Feather a user-controlled local gradient over ALL tonal/color adjustments,
  // including the existing base light sliders (original is passed by the UI).
  // Sampled clone strokes run afterward and intentionally are not gradient-masked.
  blendGradient(original, output, width, height, advanced.gradient);
  transformClone(output, width, height, advanced.cloneStrokes);
  return output;
}
