import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLocalAdjustments, localLuminanceHistogram, LOCAL_CONTROLS,
  LOCAL_DEFAULTS, LOCAL_EFFECTS, LOCAL_PRESETS, MAX_LOCAL_PIXELS,
  isNeutralLocalSettings, normalizeLocalSettings, presetLocalSettings,
} from '../src/lib/local-editor/localAdjustments.js';

const rgba = (...channels) => new Uint8ClampedArray(channels);
const one = (...channels) => rgba(...channels);
const run = (source, width = 1, height = 1, settings = {}) => applyLocalAdjustments(source, width, height, settings);

test('all controls are defined with finite ranges, and neutral defaults are byte-for-byte identity', () => {
  assert.ok(LOCAL_CONTROLS.length >= 15);
  assert.equal(Object.keys(LOCAL_DEFAULTS).length, LOCAL_CONTROLS.length + 1);
  for (const { key, min, max, step } of LOCAL_CONTROLS) {
    assert.ok(Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(step) && min < max && step > 0, key);
    assert.ok(LOCAL_DEFAULTS[key] >= min && LOCAL_DEFAULTS[key] <= max, key);
  }
  const source = rgba(0, 100, 255, 0, 100, 150, 200, 255, 5, 10, 15, 72, 255, 0, 10, 255);
  assert.deepEqual([...run(source, 2, 2)], [...source]);
  assert.equal(isNeutralLocalSettings(LOCAL_DEFAULTS), true);
  assert.notStrictEqual(run(source, 2, 2).buffer, source.buffer, 'no aliasing even for identity');
});

test('adjustments and presets do not mutate their input, are reproducible and preserve every alpha byte', () => {
  const source = rgba(40, 80, 120, 255, 120, 30, 5, 74, 255, 0, 170, 0, 9, 19, 29, 0);
  const original = [...source];
  for (const preset of LOCAL_PRESETS) {
    const settings = presetLocalSettings(preset.id);
    const a = run(source, 2, 2, settings), b = run(source, 2, 2, settings);
    assert.deepEqual(a, b, preset.id);
    for (let i = 3; i < a.length; i += 4) assert.equal(a[i], source[i], 'alpha ' + preset.id);
  }
  assert.deepEqual([...source], original);
});

test('brightness exposure and contrast make meaningful, controlled adjustments', () => {
  const mid = one(100, 100, 100, 251);
  assert.ok(run(mid, 1, 1, { brightness: 20 })[0] > 100);
  assert.ok(run(mid, 1, 1, { exposure: 1 })[0] > 100);
  assert.ok(run(mid, 1, 1, { exposure: -1 })[0] < 100);
  assert.ok(run(one(200, 200, 200, 255), 1, 1, { contrast: 20 })[0] > 200);
  assert.ok(run(one(30, 30, 30, 255), 1, 1, { contrast: 20 })[0] < 30);
  assert.ok(run(one(40, 40, 40, 255), 1, 1, { shadows: 80 })[0] > 40);
  assert.ok(run(one(220, 220, 220, 255), 1, 1, { highlights: -80 })[0] < 220);
  assert.ok(run(mid, 1, 1, { gamma: 1.5 })[0] > 100);
});

test('color sliders adjust temperature/tint/saturation/vibrance and hue without changing alpha', () => {
  const source = one(190, 80, 35, 43);
  const neutral = run(source);
  const warm = run(source, 1, 1, { warmth: 20 });
  assert.ok(warm[0] > neutral[0] && warm[2] < neutral[2]);
  const tint = run(source, 1, 1, { tint: 30 });
  assert.ok(tint[0] > neutral[0] && tint[1] < neutral[1]);
  const desat = run(source, 1, 1, { saturation: -100 });
  assert.ok(Math.abs(desat[0] - desat[1]) <= 1 && Math.abs(desat[1] - desat[2]) <= 1);
  assert.notDeepEqual(run(source, 1, 1, { vibrance: -50 }), source);
  assert.notDeepEqual(run(source, 1, 1, { hue: 120 }), source);
  for (const output of [warm, tint, desat]) assert.equal(output[3], 43);
});

test('effects invert/sepia/monochrome/threshold/posterize are real pixel transforms', () => {
  const pixel = one(100, 150, 200, 111);
  assert.deepEqual([...run(pixel, 1, 1, { effect: 'invert' })], [155, 105, 55, 111]);
  const mono = run(pixel, 1, 1, { effect: 'monochrome' });
  assert.equal(mono[0], mono[1]); assert.equal(mono[1], mono[2]);
  const sepia = run(pixel, 1, 1, { effect: 'sepia' });
  assert.ok(sepia[0] > sepia[1] && sepia[1] > sepia[2]);
  assert.deepEqual([...run(one(160, 160, 160, 255), 1, 1, { effect: 'threshold', thresholdCutoff: 128 })], [255, 255, 255, 255]);
  assert.deepEqual([...run(one(60, 60, 60, 255), 1, 1, { effect: 'threshold', thresholdCutoff: 128 })], [0, 0, 0, 255]);
  const poster = run(pixel, 1, 1, { posterize: 2 });
  assert.ok([0, 255].includes(poster[0]) && [0, 255].includes(poster[1]) && [0, 255].includes(poster[2]));
});

test('vignette darkens corners but leaves center of image unchanged', () => {
  const width = 5, height = 5;
  const source = rgba(...Array.from({ length: width * height }, () => [160, 160, 160, 255]).flat());
  const result = run(source, width, height, { vignette: 100 });
  assert.ok(result[0] < 160);
  assert.equal(result[(2 * width + 2) * 4], 160);
  assert.equal(result[3], 255);
});

test('pixelation averages colors in blocks while preserving local per-pixel alpha', () => {
  const source = rgba(255, 0, 0, 255, 0, 0, 255, 255, 10, 10, 10, 0, 100, 100, 100, 0);
  const result = run(source, 2, 2, { pixelate: 2 });
  assert.deepEqual([...result.slice(0, 3)], [128, 0, 128]);
  assert.deepEqual([...result.slice(4, 7)], [128, 0, 128]);
  assert.equal(result[11], 0); assert.equal(result[15], 0);
});

test('soften blends neighbors and sharpen accentuates differences without leaking into transparency', () => {
  const width = 3, height = 3;
  const source = rgba(...Array.from({ length: 9 }, (_, i) => i === 4 ? [200, 200, 200, 255] : [80, 80, 80, 255]).flat());
  const softened = run(source, width, height, { soften: 60 });
  const sharpened = run(source, width, height, { sharpen: 60 });
  assert.ok(softened[4 * 4] < 200);
  assert.ok(sharpened[4 * 4] > 200);
  const transparent = rgba(255, 0, 0, 0, 20, 20, 20, 255);
  const softenedTransparent = run(transparent, 2, 1, { soften: 100 });
  assert.deepEqual([...softenedTransparent.slice(4, 7)], [20, 20, 20]);
  assert.equal(softenedTransparent[3], 0);
});

test('rejects unsupported settings, NaN, Infinity, fractional invalid steps and broken geometry', () => {
  const source = one(100, 150, 200, 255);
  for (const input of [
    { unknown: 3 }, { effect: 'script' }, { exposure: 3 },
    { brightness: NaN }, { saturation: Infinity }, { gamma: 0 },
    { warmth: -999 }, { exposure: .125 }, { posterize: 1.2 }, { posterize: 1 }, { pixelate: 1 }, null,
  ]) assert.throws(() => run(source, 1, 1, input), /Unsupported|Invalid|must be an object/);
  for (const [w, h] of [[0, 1], [1, 0], [2, 2], [MAX_LOCAL_PIXELS + 1, 1], [Infinity, 1]]) {
    assert.throws(() => run(source, w, h), /RGBA8|12 megapixels/);
  }
  assert.throws(() => normalizeLocalSettings({ thresholdCutoff: 300 }), /Invalid/);
  assert.throws(() => presetLocalSettings('missing'), /Unknown/);
  assert.deepEqual(LOCAL_EFFECTS.map(effect => effect.value), ['none', 'monochrome', 'sepia', 'invert', 'threshold', 'solarize']);
});

test('luminance histogram counts only visible source pixels', () => {
  const hist = localLuminanceHistogram(rgba(0, 0, 0, 255, 255, 255, 255, 255, 100, 100, 100, 0), 3, 1);
  assert.equal(hist[0], 1); assert.equal(hist[255], 1);
  assert.equal(hist.reduce((sum, v) => sum + v, 0), 2);
});


test('advanced RGB channel controls are independent, bounded, deterministic and alpha-safe', () => {
  const source = rgba(80, 90, 100, 120, 10, 30, 50, 0);
  const red = run(source, 2, 1, { red: 40 });
  const green = run(source, 2, 1, { green: -20 });
  const blue = run(source, 2, 1, { blue: 25 });
  assert.deepEqual([...red.slice(0, 4)], [130, 90, 100, 120]);
  assert.deepEqual([...green.slice(0, 4)], [80, 65, 100, 120]);
  assert.deepEqual([...blue.slice(0, 4)], [80, 90, 131, 120]);
  assert.deepEqual([...source], [80, 90, 100, 120, 10, 30, 50, 0], 'never mutate input');
  for (const processed of [red, green, blue]) assert.deepEqual([...processed.slice(4)], [...source.slice(4)], 'transparent source bytes must be unchanged');
  for (const setting of [{ red: 101 }, { green: -101 }, { blue: NaN }, { red: Infinity }]) {
    assert.throws(() => run(source, 2, 1, setting), /Invalid local adjustment/);
  }
});

test('black and white tonal controls adjust different regions with limited spill into opposite end', () => {
  const source = rgba(30, 30, 30, 255, 128, 128, 128, 255, 225, 225, 225, 255);
  const shadows = run(source, 3, 1, { blacks: 60 });
  const lights = run(source, 3, 1, { whites: -60 });
  assert.ok(shadows[0] > 30 && shadows[0] - 30 > shadows[8] - 225, 'blacks primarily lift dark pixels');
  assert.ok(lights[8] < 225 && 225 - lights[8] > 30 - lights[0], 'whites primarily lower highlights');
  assert.equal(shadows[3], 255); assert.equal(lights[11], 255);
  assert.deepEqual([...run(source, 3, 1, { blacks: 0, whites: 0 })], [...source]);
});

test('matte and cinematic presets are real channel- and range-bound transformations', () => {
  const source = rgba(72, 105, 140, 255);
  for (const id of ['matte', 'cinematic']) {
    const parameters = presetLocalSettings(id);
    assert.notDeepEqual([...run(source, 1, 1, parameters)], [...source], id);
    assert.equal(run(source, 1, 1, parameters)[3], 255, 'preserve alpha');
  }
  assert.ok(LOCAL_CONTROLS.some(c => c.key === 'red' && c.category === 'Color'));
  assert.ok(LOCAL_CONTROLS.some(c => c.key === 'whites' && c.category === 'Light'));
});


test('solarize is a real per-channel pixel transform with preserved alpha', () => {
  const source = rgba(50, 160, 220, 137);
  assert.deepEqual([...run(source, 1, 1, { effect: 'solarize' })], [50, 95, 35, 137]);
  assert.deepEqual([...source], [50, 160, 220, 137]);
});

test('film grain is deterministic across frames, varies by coordinate and does not touch source or alpha', () => {
  const source = rgba(...Array.from({ length: 16 }, () => [128, 128, 128, 170]).flat());
  const original = [...source];
  const a = run(source, 4, 4, { grain: 60 });
  const b = run(source, 4, 4, { grain: 60 });
  assert.deepEqual(a, b, 'grain must never flicker or depend on randomness');
  assert.notDeepEqual([...a], original, 'grain must actually modify pixels');
  assert.ok(new Set(Array.from({ length: 16 }, (_, i) => a[i * 4])).size > 2, 'different pixels must receive different grain');
  for (let i = 0; i < a.length; i += 4) {
    assert.equal(a[i + 3], 170);
    assert.equal(a[i], a[i + 1]);
    assert.equal(a[i + 1], a[i + 2]);
  }
  assert.deepEqual([...source], original);
  assert.deepEqual([...run(source, 4, 4, { grain: 0 })], original);
  assert.throws(() => run(source, 4, 4, { grain: 101 }), /Invalid local adjustment/);
  assert.notDeepEqual([...run(source, 4, 4, presetLocalSettings('analog'))], original);
});


test('all 23 numeric local controls produce a visible pixel change on a real fixture', () => {
  const source = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) {
    source[4 * i] = (i * 37 + 20) % 256;
    source[4 * i + 1] = (i * 73 + 30) % 256;
    source[4 * i + 2] = (i * 109 + 40) % 256;
    source[4 * i + 3] = 255;
  }
  const identity = run(source, 8, 8);
  for (const control of LOCAL_CONTROLS) {
    const value = control.key === 'thresholdCutoff' ? 185
      : control.key === 'gamma' ? 1.5
        : control.key === 'posterize' ? 4
          : control.key === 'pixelate' ? 3
            : control.key === 'exposure' ? 1
              : control.key === 'hue' ? 90 : Math.min(control.max, Math.max(control.min, 20));
    const options = control.key === 'thresholdCutoff' ? { effect: 'threshold', thresholdCutoff: value } : { [control.key]: value };
    const output = run(source, 8, 8, options);
    assert.ok(output.some((pixel, index) => index % 4 !== 3 && pixel !== identity[index]), control.key + ' must change visible pixels, not just a slider');
    for (let i = 3; i < output.length; i += 4) assert.equal(output[i], source[i], 'alpha must be unchanged by ' + control.key);
  }
});
