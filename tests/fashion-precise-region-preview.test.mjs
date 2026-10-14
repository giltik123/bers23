import assert from 'node:assert/strict';
import test from 'node:test';
import { fashionPreciseRegionPreviewRgba8 } from '../src/platform/creative/deterministic/FashionPreciseRegionPreview.ts';

function baseline(mode = 'STRICT_VERIFY') {
  return {
    original: new Uint8ClampedArray([
      20, 30, 40, 255,  50, 60, 70, 255,
      80, 90, 100, 255, 110, 120, 130, 255,
    ]),
    candidate: new Uint8ClampedArray([
      20, 30, 40, 255,  200, 150, 100, 255,
      220, 100, 20, 255, 110, 120, 130, 255,
    ]),
    editCoverageR8: new Uint8Array([0, 255, 255, 0]),
    protectedR8: new Uint8Array([0, 0, 0, 0]),
    width: 2, height: 2, mode,
  };
}
const pixel = (buffer, index) => [...buffer.slice(index * 4, index * 4 + 4)];

test('strict mode preserves all unedited pixels byte-exactly and changes only ROI', () => {
  const input = baseline();
  const result = fashionPreciseRegionPreviewRgba8(input);
  assert.deepEqual([...result.rgba], [...input.candidate]);
  assert.deepEqual(result.stats, {
    sourcePixels: 4, editablePixels: 2,
    changedWithinEditPixels: 2, candidateDriftOutsidePixels: 0,
    candidateDriftProtectedPixels: 0, exactSourcePreservedPixels: 2,
  });
  assert.equal(result.authority, 'RESEARCH_ONLY');
  result.rgba[0] = 199;
  assert.equal(input.original[0], 20);
  assert.equal(input.candidate[0], 20);
});

test('strict mode fails closed when generated content drifts outside the ROI', () => {
  const input = baseline();
  input.candidate[0] = 99;
  assert.throws(() => fashionPreciseRegionPreviewRgba8(input), /changed pixels outside/);
});

test('copy-outside-ROI mode reports drift and restores exact original outside mask', () => {
  const input = baseline('COPY_OUTSIDE_ROI');
  input.candidate[0] = 99;
  const result = fashionPreciseRegionPreviewRgba8(input);
  assert.deepEqual(pixel(result.rgba, 0), pixel(input.original, 0));
  assert.deepEqual(pixel(result.rgba, 1), pixel(input.candidate, 1));
  assert.equal(result.stats.candidateDriftOutsidePixels, 1);
  assert.equal(result.stats.exactSourcePreservedPixels, 2);
});

test('protected hands/face take precedence even when edit mask covers them', () => {
  const input = baseline('COPY_OUTSIDE_ROI');
  input.protectedR8[1] = 255;
  const result = fashionPreciseRegionPreviewRgba8(input);
  assert.deepEqual(pixel(result.rgba, 1), pixel(input.original, 1));
  assert.deepEqual(pixel(result.rgba, 2), pixel(input.candidate, 2));
  assert.equal(result.stats.candidateDriftProtectedPixels, 1);
  assert.equal(result.stats.editablePixels, 1);
});

test('strict mode rejects drift into a protected area inside editable ROI', () => {
  const input = baseline();
  input.protectedR8[1] = 255;
  assert.throws(() => fashionPreciseRegionPreviewRgba8(input), /changed pixels outside/);
});

test('fractional edit coverage uses explicit half-up sRGB interpolation, no extra drift', () => {
  const input = baseline();
  input.editCoverageR8[1] = 128;
  const result = fashionPreciseRegionPreviewRgba8(input);
  assert.deepEqual(pixel(result.rgba, 1), [125, 105, 85, 255]);
  assert.deepEqual(pixel(result.rgba, 0), pixel(input.original, 0));
});

test('two sequential edits preserve untouched original photo pixels', () => {
  const input = baseline();
  input.editCoverageR8.set([0, 255, 0, 0]);
  input.candidate.set(input.original);
  input.candidate[4] = 170;
  const first = fashionPreciseRegionPreviewRgba8(input);
  const second = {
    original: first.rgba,
    candidate: new Uint8ClampedArray(first.rgba),
    editCoverageR8: new Uint8Array([0, 0, 255, 0]),
    protectedR8: new Uint8Array([0, 0, 0, 0]),
    width: 2, height: 2, mode: 'STRICT_VERIFY',
  };
  second.candidate[8] = 240;
  const final = fashionPreciseRegionPreviewRgba8(second);
  assert.equal(final.rgba[4], 170);
  assert.equal(final.rgba[8], 240);
  assert.deepEqual(pixel(final.rgba, 0), pixel(input.original, 0));
  assert.deepEqual(pixel(final.rgba, 3), pixel(input.original, 3));
});

test('missing, malformed and partially protected masks fail closed', () => {
  const x = baseline();
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, editCoverageR8: new Uint8Array(3)}), /exact-length/);
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, protectedR8: new Uint8Array(3)}), /exact-length/);
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, editCoverageR8: [0, 255, 255, 0]}), /uint8/);
  const protectedR8 = new Uint8Array([0, 128, 0, 0]);
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, protectedR8}), /strictly binary/);
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, mode: 'UNKNOWN'}), /explicit supported mode/);
});

test('no unprotected edit surface or transparent input fails closed', () => {
  const x = baseline();
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, editCoverageR8: new Uint8Array(4)}), /no unprotected editable/);
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, protectedR8: new Uint8Array([0, 255, 255, 0])}), /no unprotected editable/);
  const candidate = new Uint8ClampedArray(x.candidate);
  candidate[7] = 0;
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, candidate}), /opaque RGBA/);
});

test('rejects huge, non-integer, and physically inconsistent dimensions', () => {
  const x = baseline();
  for (const [width, height] of [[0,2], [2,0], [2.5,2], [4097,1], [2,4097], [9007199254740991,2]]) {
    assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, width, height}), /dimensions/);
  }
  assert.throws(() => fashionPreciseRegionPreviewRgba8({...x, width:3, height:2}), /exact-length/);
});

test('input byte arrays are immutable across both modes and outputs never alias them', () => {
  for (const mode of ['STRICT_VERIFY','COPY_OUTSIDE_ROI']) {
    const x = baseline(mode);
    const old = Object.fromEntries(['original','candidate','editCoverageR8','protectedR8'].map(k => [k, [...x[k]]]));
    const out = fashionPreciseRegionPreviewRgba8(x);
    for (const k of Object.keys(old)) assert.deepEqual([...x[k]], old[k], k);
    out.rgba[4] = 0;
    assert.equal(x.candidate[4], 200);
  }
});
