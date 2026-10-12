import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdvancedLocalAdjustments, curveLut, normalizeAdvancedSettings,
  isNeutralAdvancedSettings, LOCAL_CURVE_DEFAULT, LOCAL_ADVANCED_DEFAULTS, LOCAL_HUE_BANDS,
} from '../src/lib/local-editor/localAdvanced.js';
import { applyLocalAdjustments } from '../src/lib/local-editor/localAdjustments.js';

const pixels = (...values) => new Uint8ClampedArray(values);
const clone = (source, points, options = {}) => ({
  source, points, radius: options.radius ?? .1, hardness: options.hardness ?? 1, opacity: options.opacity ?? 1,
});

test('default advanced settings preserve all pixels, including alpha and transparent RGB', () => {
  const input = pixels(50, 80, 100, 0, 50, 100, 200, 112, 200, 160, 120, 255);
  const output = applyAdvancedLocalAdjustments(input, 3, 1, LOCAL_ADVANCED_DEFAULTS);
  assert.deepEqual([...output], [...input]);
  assert.notStrictEqual(output.buffer, input.buffer);
  assert.equal(isNeutralAdvancedSettings(LOCAL_ADVANCED_DEFAULTS), true);
});

test('five-point tone curve gives exact stops, identity and invertible manual decisions', () => {
  const identity = curveLut();
  assert.equal(identity.length, 256);
  for (let i = 0; i < 256; i++) assert.equal(identity[i], i);
  const curve = { black: 25, shadows: 90, midtones: 170, highlights: 207, white: 230 };
  const lut = curveLut(curve);
  for (const [i, point] of [[0, 'black'], [64, 'shadows'], [128, 'midtones'], [192, 'highlights'], [255, 'white']]) {
    assert.equal(lut[i], curve[point]);
  }
  const output = applyAdvancedLocalAdjustments(pixels(0, 64, 128, 171), 1, 1, { curve });
  assert.deepEqual([...output], [25, 90, 170, 171]);
  const reversed = curveLut({ black: 255, shadows: 192, midtones: 128, highlights: 64, white: 0 });
  assert.equal(reversed[0], 255);
  assert.equal(reversed[255], 0);
});

test('tone curve never changes source alpha, original input or transparent RGB', () => {
  const source = pixels(0, 0, 0, 0, 128, 128, 128, 42, 255, 255, 255, 255);
  const output = applyAdvancedLocalAdjustments(source, 3, 1, { curve: { ...LOCAL_CURVE_DEFAULT, midtones: 200 } });
  assert.deepEqual([...output.slice(0, 4)], [0, 0, 0, 0]);
  assert.equal(output[4], 200);
  assert.equal(output[7], 42);
  assert.equal(output[11], 255);
  assert.deepEqual([...source], [0, 0, 0, 0, 128, 128, 128, 42, 255, 255, 255, 255]);
});

test('HSL edits only selected hue and does not color grayscale or unrelated blue', () => {
  const source = pixels(255, 20, 20, 255, 20, 20, 255, 255, 70, 70, 70, 255);
  const output = applyAdvancedLocalAdjustments(source, 3, 1, { hsl: { red: { hue: 30, saturation: 0, lightness: 0 } } });
  assert.ok(output[1] > source[1], 'red should rotate toward orange');
  assert.deepEqual([...output.slice(4, 12)], [...source.slice(4, 12)], 'blue and gray should not be modified');
});

test('HSL supports independent eight bands with smooth boundaries and circular red wrap', () => {
  assert.deepEqual(LOCAL_HUE_BANDS.map(band => band.id), ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta']);
  const source = pixels(255, 30, 40, 255, 255, 150, 0, 255, 20, 230, 250, 255, 140, 70, 220, 255);
  const input = {
    hsl: {
      red: { hue: -20, saturation: 0, lightness: 0 },
      orange: { hue: 0, saturation: -40, lightness: 0 },
      aqua: { hue: 10, saturation: 0, lightness: -25 },
      purple: { hue: 10, saturation: 20, lightness: 0 },
    },
  };
  const out = applyAdvancedLocalAdjustments(source, 4, 1, input);
  for (let i = 0; i < out.length; i += 4) {
    assert.ok(out[i] >= 0 && out[i] <= 255);
    assert.equal(out[i + 3], source[i + 3]);
  }
  assert.notDeepEqual([...out], [...source]);
  assert.deepEqual(out, applyAdvancedLocalAdjustments(source, 4, 1, input));
});

test('HSL saturation and lightness sliders are effective with feathered ranges', () => {
  const bright = pixels(40, 210, 35, 255);
  const dull = applyAdvancedLocalAdjustments(bright, 1, 1, { hsl: { green: { hue: 0, saturation: -80, lightness: 0 } } });
  assert.ok(Math.max(dull[0], dull[1], dull[2]) - Math.min(dull[0], dull[1], dull[2]) < 170);
  const lighter = applyAdvancedLocalAdjustments(bright, 1, 1, { hsl: { green: { hue: 0, saturation: 0, lightness: 70 } } });
  assert.ok(lighter[1] > bright[1]);
  const darker = applyAdvancedLocalAdjustments(bright, 1, 1, { hsl: { green: { hue: 0, saturation: 0, lightness: -70 } } });
  assert.ok(darker[1] < bright[1]);
});

test('clone stamp copies a sampled source pixel into a user-painted destination', () => {
  const image = pixels(255, 0, 0, 255, 0, 0, 255, 255, 30, 60, 90, 255);
  const output = applyAdvancedLocalAdjustments(image, 3, 1, {
    cloneStrokes: [clone({ x: 0, y: 0 }, [{ x: .5, y: 0 }])],
  });
  assert.deepEqual([...output], [255, 0, 0, 255, 255, 0, 0, 255, 30, 60, 90, 255]);
  assert.deepEqual([...image], [255, 0, 0, 255, 0, 0, 255, 255, 30, 60, 90, 255]);
});

test('clone brush connects points into a continuous bounded stroke', () => {
  const image = pixels(...Array.from({ length: 9 * 3 }, (_, i) => [(i % 9) * 20, 120, 10, 255]).flat());
  const output = applyAdvancedLocalAdjustments(image, 9, 3, {
    cloneStrokes: [clone({ x: 0, y: .5 }, [{ x: 3 / 8, y: .5 }, { x: 6 / 8, y: .5 }])],
  });
  for (const x of [3, 4, 5, 6]) {
    assert.equal(output[(9 + x) * 4], image[(9 + x - 3) * 4], 'clone source offset on point ' + x);
  }
  assert.equal(output[(9 + 7) * 4], image[(9 + 7) * 4], 'outside stroke untouched');
});

test('clone opacity is applied once per stroke, with Undo modeled by removing stroke', () => {
  const image = pixels(200, 0, 0, 255, 0, 0, 200, 255);
  const stroke = clone({ x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }], { opacity: .5 });
  const one = applyAdvancedLocalAdjustments(image, 2, 1, { cloneStrokes: [stroke] });
  assert.equal(one[4], 100);
  assert.equal(one[6], 100);
  const undone = applyAdvancedLocalAdjustments(image, 2, 1, { cloneStrokes: [] });
  assert.deepEqual([...undone], [...image]);
  const two = applyAdvancedLocalAdjustments(image, 2, 1, { cloneStrokes: [stroke, stroke] });
  assert.equal(two[4], 150, 'separate strokes build up coverage');
});

test('clone brush feather has partial coverage on edges and maintains alpha', () => {
  const img = pixels(...Array.from({ length: 7 * 7 }, (_, i) => [i === 0 ? 255 : 0, 0, 255, 133]).flat());
  const output = applyAdvancedLocalAdjustments(img, 7, 7, {
    cloneStrokes: [clone({ x: 0, y: 0 }, [{ x: .5, y: .5 }], { radius: .1, hardness: 0, opacity: 1 })],
  });
  for (let i = 3; i < output.length; i += 4) assert.equal(output[i], 133);
  assert.deepEqual([...img.slice(0, 4)], [255, 0, 255, 133], 'input must remain unchanged');
});

test('clone preserves transparent pixels and rejects out-of-bounds source sampling', () => {
  const img = pixels(250, 10, 5, 0, 0, 0, 255, 255, 0, 255, 0, 0);
  const out = applyAdvancedLocalAdjustments(img, 3, 1, {
    cloneStrokes: [clone({ x: 0, y: 0 }, [{ x: 1 / 2, y: 0 }])],
  });
  assert.deepEqual([...out.slice(4, 8)], [0, 0, 255, 255], 'transparent source must not paint');
  assert.deepEqual([...out.slice(8, 12)], [0, 255, 0, 0], 'transparent destination must remain byte-exact');
  const outside = applyAdvancedLocalAdjustments(img, 3, 1, { cloneStrokes: [clone({ x: 1, y: 0 }, [{ x: 0, y: 0 }])] });
  assert.equal(outside[0], 250);
});

test('advanced edits compose after base adjustments without changing alpha', () => {
  const input = pixels(50, 80, 120, 255);
  const base = applyLocalAdjustments(input, 1, 1, { brightness: 40 });
  const output = applyAdvancedLocalAdjustments(base, 1, 1, { curve: { ...LOCAL_CURVE_DEFAULT, midtones: 200 } });
  assert.notDeepEqual([...output], [...base]);
  assert.deepEqual([...input], [50, 80, 120, 255]);
  assert.equal(output[3], 255);
});

test('invalid curve, HSL and clone input fails before any source mutation', () => {
  const img = pixels(12, 34, 56, 255);
  const bad = [
    { curve: { ...LOCAL_CURVE_DEFAULT, midtones: NaN } },
    { curve: { ...LOCAL_CURVE_DEFAULT, white: 256 } },
    { curve: { ...LOCAL_CURVE_DEFAULT, black: .5 } },
    { curve: { ...LOCAL_CURVE_DEFAULT, extra: 9 } },
    { hsl: { red: { hue: Infinity, saturation: 0, lightness: 0 } } },
    { hsl: { red: { hue: 61, saturation: 0, lightness: 0 } } },
    { hsl: { red: { hue: 0, saturation: 0, lightness: -101 } } },
    { hsl: { unknown: { hue: 0, saturation: 0, lightness: 0 } } },
    { cloneStrokes: [clone({ x: -1, y: 0 }, [{ x: 0, y: 0 }])] },
    { cloneStrokes: [clone({ x: 0, y: 0 }, [{ x: 2, y: 0 }])] },
    { cloneStrokes: [clone({ x: 0, y: 0 }, [{ x: 0, y: 0 }], { opacity: NaN })] },
    { cloneStrokes: [clone({ x: 0, y: 0 }, [{ x: 0, y: 0 }], { radius: .11 })] },
    { cloneStrokes: new Array(33).fill(clone({ x: 0, y: 0 }, [{ x: 0, y: 0 }])) },
    { cloneStrokes: [clone({ x: 0, y: 0 }, new Array(513).fill({ x: 0, y: 0 }))] },
    { unsupported: true },
  ];
  for (const config of bad) assert.throws(() => applyAdvancedLocalAdjustments(img, 1, 1, config), /Invalid|Unsupported|Too many/);
  assert.deepEqual([...img], [12, 34, 56, 255]);
});

test('rejects invalid raster geometry, buffer aliasing and excessive pixel budgets', () => {
  assert.throws(() => applyAdvancedLocalAdjustments(pixels(10, 20, 30, 255), 0, 1), /bounded original RGBA/);
  assert.throws(() => applyAdvancedLocalAdjustments(pixels(10, 20, 30, 255), 2, 1), /bounded original RGBA/);
  assert.throws(() => applyAdvancedLocalAdjustments(pixels(10, 20, 30, 255), 12_000_001, 1), /bounded original RGBA/);
  assert.throws(() => applyAdvancedLocalAdjustments(pixels(10, 20, 30, 255), Infinity, 1), /bounded original RGBA/);
});


test('expensive repeated clone paths fail closed before consuming huge CPU budgets', () => {
  const blank = new Uint8ClampedArray(512 * 512 * 4);
  const dense = clone({ x: .1, y: .1 }, new Array(512).fill({ x: .5, y: .5 }), { radius: .1 });
  const expensive = { cloneStrokes: [dense, dense, dense, dense, dense] };
  assert.throws(
    () => applyAdvancedLocalAdjustments(blank, 512, 512, expensive),
    /25-million-pixel work budget/,
  );
  assert.ok(blank.every(byte => byte === 0), 'refusing expensive work must never modify the original');
});


test('local left-to-right gradient masks global brightness using ORIGINAL pixel values', () => {
  const original = pixels(20, 20, 20, 255, 20, 20, 20, 255, 20, 20, 20, 255);
  const globallyBright = applyLocalAdjustments(original, 3, 1, { brightness: 40 });
  const masked = applyAdvancedLocalAdjustments(globallyBright, 3, 1, {
    gradient: { mode: 'left-right', start: 0, end: 100 },
  }, original);
  assert.deepEqual([...masked], [20, 20, 20, 255, 45, 45, 45, 255, 70, 70, 70, 255]);
  assert.deepEqual([...original], [20, 20, 20, 255, 20, 20, 20, 255, 20, 20, 20, 255]);
  assert.deepEqual([...globallyBright], [70, 70, 70, 255, 70, 70, 70, 255, 70, 70, 70, 255]);
});

test('top-bottom and radial gradients affect only intended pixels and preserve alpha', () => {
  const source = pixels(...Array.from({ length: 9 }, () => [100, 80, 60, 96]).flat());
  const bright = applyLocalAdjustments(source, 3, 3, { brightness: 40 });
  const vertical = applyAdvancedLocalAdjustments(bright, 3, 3, {
    gradient: { mode: 'top-bottom', start: 0, end: 100 },
  }, source);
  assert.equal(vertical[0], 100);
  assert.equal(vertical[(2 * 3 + 0) * 4], 150);
  const radial = applyAdvancedLocalAdjustments(bright, 3, 3, {
    gradient: { mode: 'radial', start: 0, end: 100 },
  }, source);
  assert.equal(radial[0], 100, 'corner is original');
  assert.equal(radial[4 * 4], 150, 'center is fully corrected');
  for (let i = 3; i < radial.length; i += 4) assert.equal(radial[i], 96);
});

test('gradient feather start/end can create a sharp but bounded transition', () => {
  const source = pixels(...Array.from({ length: 5 }, () => [30, 30, 30, 255]).flat());
  const edited = applyLocalAdjustments(source, 5, 1, { brightness: 40 });
  const result = applyAdvancedLocalAdjustments(edited, 5, 1, {
    gradient: { mode: 'left-right', start: 45, end: 55 },
  }, source);
  assert.equal(result[0], 30);
  assert.equal(result[4], 30);
  assert.equal(result[8], 55);
  assert.equal(result[12], 80);
  assert.equal(result[16], 80);
});

test('gradient off is identity and invalid positions/directions fail closed', () => {
  assert.equal(isNeutralAdvancedSettings({ gradient: { mode: 'off', start: 0, end: 100 } }), true);
  assert.equal(isNeutralAdvancedSettings({ gradient: { mode: 'radial', start: 0, end: 100 } }), false);
  const source = pixels(20, 30, 40, 255);
  for (const gradient of [
    { mode: 'diagonal', start: 0, end: 100 },
    { mode: 'left-right', start: -1, end: 100 },
    { mode: 'left-right', start: 10, end: 10 },
    { mode: 'left-right', start: 50, end: 40 },
    { mode: 'left-right', start: .5, end: 70 },
    { mode: 'left-right', start: 0, end: 101 },
  ]) assert.throws(() => applyAdvancedLocalAdjustments(source, 1, 1, { gradient }), /Invalid/);
  assert.deepEqual([...source], [20, 30, 40, 255]);
});

test('manual clone remains intentionally independent from the gradient adjustment mask', () => {
  const original = pixels(255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255);
  const bright = applyLocalAdjustments(original, 3, 1, { brightness: 20 });
  const result = applyAdvancedLocalAdjustments(bright, 3, 1, {
    gradient: { mode: 'right-left', start: 0, end: 100 },
    cloneStrokes: [clone({ x: 0, y: 0 }, [{ x: 1, y: 0 }])],
  }, original);
  assert.deepEqual([...result.slice(8, 12)], [255, 0, 0, 255], 'clone stroke applies even where gradient correction weight is zero');
});
