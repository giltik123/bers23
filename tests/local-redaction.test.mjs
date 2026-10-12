import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_ANNOTATION_TOOLS, LOCAL_REDACTION_COLOR,
  normalizeLocalAnnotations, centeredLocalAnnotation, renderLocalAnnotations,
  applyLocalOpaqueCovers, moveLocalAnnotation, editLocalAnnotation,
} from '../src/lib/local-editor/localAnnotations.js';

const redaction = (from = { x: .2, y: .25 }, to = { x: .75, y: .75 }) => ({
  type: 'redact', from, to, color: LOCAL_REDACTION_COLOR, opacity: 1, thickness: 1,
});
const rectangle = () => ({
  type: 'rectangle', from: { x: .3, y: .3 }, to: { x: .7, y: .7 },
  color: '#ef4444', opacity: 1, thickness: 1,
});
const rgba = (w, h, value = [181, 113, 46, 127]) => new Uint8ClampedArray(
  Array.from({ length: w * h }, () => value).flat(),
);

function drawingContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['save', 'restore', 'beginPath', 'rect', 'ellipse', 'moveTo',
    'lineTo', 'stroke', 'strokeText', 'fillText', 'fillRect']) {
    ctx[name] = (...args) => calls.push({ name, args,
      style: ctx.fillStyle, opacity: ctx.globalAlpha, composite: ctx.globalCompositeOperation });
  }
  return ctx;
}
test('the tool is conspicuously an opaque privacy cover, not a blur or AI button', () => {
  assert.ok(LOCAL_ANNOTATION_TOOLS.some(tool => tool.id === 'redact' && tool.label === 'Solid cover'));
  assert.equal(LOCAL_REDACTION_COLOR, '#000000');
  const item = centeredLocalAnnotation('redact', { color: '#ffffff', opacity: .1, thickness: 3 });
  assert.equal(item.color, '#000000');
  assert.equal(item.opacity, 1);
  assert.equal(item.thickness, 1);
});

test('opaque cover writes exact black RGBA at full resolution, including transparent source pixels', () => {
  const before = rgba(6, 4);
  before.set([35, 40, 45, 0], (1 * 6 + 2) * 4);
  const unchanged = [...before];
  const after = applyLocalOpaqueCovers(before, 6, 4, [redaction()]);
  // floor(.2*6)=1, floor(.25*4)=1, ceil(.75*6)=5, ceil(.75*4)=3
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
    const at = (y * 6 + x) * 4;
    const expected = x >= 1 && x < 5 && y >= 1 && y < 3
      ? [0, 0, 0, 255] : unchanged.slice(at, at + 4);
    assert.deepEqual([...after.slice(at, at + 4)], expected, x + ',' + y);
  }
  assert.deepEqual([...before], unchanged, 'no mutation of original pixels');
  assert.notStrictEqual(after.buffer, before.buffer);
});

test('slanted/reverse drag coordinates cover outward-rounded integer pixel bounds', () => {
  const before = rgba(8, 8, [255, 255, 255, 255]);
  const after = applyLocalOpaqueCovers(before, 8, 8, [
    redaction({ x: .89, y: .84 }, { x: .11, y: .13 }),
  ]);
  assert.deepEqual([...after.slice((1 * 8 + 0) * 4, (1 * 8 + 0) * 4 + 4)], [0, 0, 0, 255]);
  assert.deepEqual([...after.slice((6 * 8 + 7) * 4, (6 * 8 + 7) * 4 + 4)], [0, 0, 0, 255]);
  assert.deepEqual([...after.slice((7 * 8 + 7) * 4, (7 * 8 + 7) * 4 + 4)], [255, 255, 255, 255]);
});

test('overlapping opaque covers cannot reveal covered pixel information', () => {
  const original = rgba(5, 5);
  const after = applyLocalOpaqueCovers(original, 5, 5, [
    redaction({ x: .1, y: .1 }, { x: .6, y: .6 }),
    redaction({ x: .4, y: .4 }, { x: .9, y: .9 }),
  ]);
  assert.deepEqual([...after.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)], [0, 0, 0, 255]);
  assert.deepEqual([...after.slice((4 * 5 + 4) * 4, (4 * 5 + 4) * 4 + 4)], [0, 0, 0, 255]);
  assert.deepEqual([...after.slice(0, 4)], [181, 113, 46, 127]);
});

test('render always draws opaque covers LAST regardless of annotation insertion order', () => {
  const ctx = drawingContext();
  renderLocalAnnotations(ctx, 40, 20, [redaction(), rectangle()]);
  const operations = ctx.calls.filter(call => ['stroke', 'fillRect'].includes(call.name));
  assert.deepEqual(operations.map(c => c.name), ['stroke', 'fillRect']);
  assert.deepEqual(operations.at(-1), {
    name: 'fillRect',
    args: [8, 5, 22, 10],
    style: '#000000', opacity: 1, composite: 'source-over',
  });
  assert.equal(ctx.calls.filter(call => call.name === 'save').length, 2);
  assert.equal(ctx.calls.filter(call => call.name === 'restore').length, 2);
});

test('only solid black at 100% opacity is permitted; no translucent or colorful redactions', () => {
  for (const changes of [
    { color: '#ffffff' }, { color: '#111827' }, { opacity: .99 },
    { opacity: 0 }, { thickness: 2 }, { opacity: NaN },
    { to: { x: .2, y: .25 } }, { from: { x: -1, y: 0 } },
    { mystery: 'ignore' },
  ]) {
    assert.throws(() => normalizeLocalAnnotations([{ ...redaction(), ...changes }]), /Invalid|visible span|Unsupported/);
  }
  const normalized = normalizeLocalAnnotations([redaction()]);
  assert.ok(Object.isFrozen(normalized[0]) && Object.isFrozen(normalized[0].from));
});

test('moving a solid cover preserves opacity/color and style edits are blocked', () => {
  const original = redaction();
  const moved = moveLocalAnnotation(original, .1, .1);
  assert.deepEqual(moved.from, { x: .3, y: .35 });
  assert.equal(moved.opacity, 1);
  assert.equal(moved.color, LOCAL_REDACTION_COLOR);
  assert.equal(original.from.x, .2);
  for (const change of [{ color: '#ef4444' }, { opacity: .5 }, { thickness: 3 },
    { text: 'secret' }, { fontSize: 5 }]) {
    assert.throws(() => editLocalAnnotation(original, change), /locked|Text properties/);
  }
});

test('opaque cover normalization rejects invalid RGBA raster and budget violations', () => {
  const original = rgba(2, 2);
  assert.throws(() => applyLocalOpaqueCovers(original, 12_000_001, 1, []), /raster size/);
  assert.throws(() => applyLocalOpaqueCovers(original, 0, 2, []), /raster size/);
  assert.throws(() => applyLocalOpaqueCovers(new Uint8Array(12), 2, 2, []), /RGBA8/);
  assert.deepEqual([...applyLocalOpaqueCovers(original, 2, 2, [])], [...original]);
  assert.throws(() => applyLocalOpaqueCovers(original, 2, 2, [redaction(), {}]), /Invalid/);
});

test('cover rendering does not depend on sampled image pixels and restores context on failure', () => {
  const ctx = drawingContext();
  ctx.fillRect = () => { throw new Error('blocked canvas'); };
  assert.throws(() => renderLocalAnnotations(ctx, 20, 20, [redaction()]), /blocked canvas/);
  assert.equal(ctx.calls.filter(call => call.name === 'restore').length, 1);
});
