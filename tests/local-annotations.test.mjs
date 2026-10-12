import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_ANNOTATION_TOOLS, LOCAL_ANNOTATION_COLORS, MAX_LOCAL_ANNOTATIONS,
  MAX_LOCAL_ANNOTATION_TEXT, normalizeLocalAnnotations,
  renderLocalAnnotations, centeredLocalAnnotation,
} from '../src/lib/local-editor/localAnnotations.js';

const options = { color: '#ef4444', thickness: 1, opacity: 1, fontSize: 7, text: 'Edited photo' };
const shape = (type, from = { x: .1, y: .2 }, to = { x: .9, y: .7 }, custom = {}) => ({
  type, from, to, color: '#ef4444', thickness: 1, opacity: 1, ...custom,
});
function fakeCanvas() {
  const events = [];
  const ctx = { events };
  for (const name of ['save', 'restore', 'beginPath', 'rect', 'ellipse', 'moveTo', 'lineTo', 'stroke', 'strokeText', 'fillText']) {
    ctx[name] = (...args) => events.push({ name, args });
  }
  return ctx;
}
const events = (ctx, name) => ctx.events.filter(entry => entry.name === name);

test('all shape and text tools have explicit labels and safe color choices', () => {
  assert.deepEqual(LOCAL_ANNOTATION_TOOLS.map(tool => tool.id), ['off', 'arrow', 'rectangle', 'ellipse', 'text']);
  assert.ok(LOCAL_ANNOTATION_COLORS.length >= 5);
  assert.equal(MAX_LOCAL_ANNOTATIONS, 50);
  assert.equal(MAX_LOCAL_ANNOTATION_TEXT, 120);
});

test('annotations remain immutable, normalized and separate from original pixels', () => {
  const annotation = shape('rectangle');
  const result = normalizeLocalAnnotations([annotation]);
  assert.equal(result.length, 1);
  assert.notStrictEqual(result[0], annotation);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result[0]));
  assert.ok(Object.isFrozen(result[0].from));
  assert.deepEqual(result[0].from, { x: .1, y: .2 });
  assert.deepEqual(result[0].to, { x: .9, y: .7 });
  assert.equal(normalizeLocalAnnotations().length, 0);
});

test('rectangles respect user drag in either direction and restore canvas state', () => {
  const ctx = fakeCanvas();
  const result = renderLocalAnnotations(ctx, 200, 100, [shape('rectangle', { x: .8, y: .7 }, { x: .2, y: .1 })]);
  assert.equal(result, 1);
  assert.deepEqual(events(ctx, 'rect')[0].args, [40, 10, 120, 60]);
  assert.equal(events(ctx, 'stroke').length, 1);
  assert.equal(events(ctx, 'save').length, 1);
  assert.equal(events(ctx, 'restore').length, 1);
});

test('ellipses are centered at midpoint with normalized bounding box radii', () => {
  const ctx = fakeCanvas();
  renderLocalAnnotations(ctx, 200, 100, [shape('ellipse', { x: .1, y: .2 }, { x: .9, y: .8 })]);
  const [cx, cy, rx, ry, rotation, start, end] = events(ctx, 'ellipse')[0].args;
  assert.equal(cx, 100);
  assert.equal(cy, 50);
  assert.equal(rx, 80);
  assert.ok(Math.abs(ry - 30) < 1e-9);
  assert.equal(rotation, 0);
  assert.equal(start, 0);
  assert.equal(end, 2 * Math.PI);
});

test('arrows have a real end-point arrowhead and capped pen settings', () => {
  const ctx = fakeCanvas();
  renderLocalAnnotations(ctx, 200, 100, [shape('arrow', { x: .1, y: .5 }, { x: .9, y: .5 }, { opacity: .6, thickness: 2 })]);
  assert.equal(events(ctx, 'moveTo').length, 3);
  assert.equal(events(ctx, 'lineTo').length, 3);
  assert.deepEqual(events(ctx, 'lineTo')[0].args, [180, 50]);
  assert.equal(ctx.globalAlpha, .6);
  assert.equal(ctx.lineCap, 'round');
  assert.equal(ctx.lineWidth, 2);
  assert.equal(events(ctx, 'stroke').length, 2);
  assert.equal(events(ctx, 'save').length, 1);
  assert.equal(events(ctx, 'restore').length, 1);
});

test('text uses safe canvas glyph APIs, scales with raster and limits to image width', () => {
  const ctx = fakeCanvas();
  const item = shape('text', { x: .25, y: .2 }, { x: .25, y: .2 }, { text: 'Review this area', fontSize: 8 });
  renderLocalAnnotations(ctx, 800, 500, [item]);
  assert.equal(events(ctx, 'strokeText').length, 1);
  assert.equal(events(ctx, 'fillText').length, 1);
  assert.deepEqual(events(ctx, 'fillText')[0].args, ['Review this area', 200, 100, 600]);
  assert.match(ctx.font, /600 40px sans-serif/);
  assert.equal(ctx.textBaseline, 'top');
});

test('HTML-like characters remain text data, never executable markup', () => {
  const text = '<img src=x onerror=alert(1)>';
  const ctx = fakeCanvas();
  renderLocalAnnotations(ctx, 100, 100, [shape('text', { x: .1, y: .1 }, { x: .1, y: .1 }, { text, fontSize: 5 })]);
  assert.equal(events(ctx, 'fillText')[0].args[0], text);
  assert.equal(typeof ctx.innerHTML, 'undefined');
});

test('centered annotations offer keyboard-equivalent geometry and validated text', () => {
  for (const type of ['arrow', 'rectangle', 'ellipse', 'text']) {
    const item = centeredLocalAnnotation(type, options);
    assert.equal(item.type, type);
    assert.equal(item.color, options.color);
    assert.equal(item.opacity, options.opacity);
    if (type === 'text') assert.equal(item.text, 'Edited photo');
    else assert.notDeepEqual(item.from, item.to);
  }
  assert.throws(() => centeredLocalAnnotation('off', options), /Invalid/);
  assert.throws(() => centeredLocalAnnotation('text', { ...options, text: '' }), /Invalid/);
});

test('one validated set of instructions renders identically at different resolutions', () => {
  const annot = [shape('rectangle', { x: .1, y: .2 }, { x: .4, y: .5 })];
  const a = fakeCanvas(), b = fakeCanvas();
  renderLocalAnnotations(a, 100, 100, annot);
  renderLocalAnnotations(b, 200, 200, annot);
  const ra = events(a, 'rect')[0].args, rb = events(b, 'rect')[0].args;
  assert.deepEqual(rb, ra.map(value => value * 2));
});

test('invalid values, geometry, fake tools and execution-size abuse all fail closed', () => {
  const bad = [
    null, {}, { ...shape('arrow'), type: 'script' },
    shape('off'), shape('rectangle', { x: 0, y: 0 }, { x: 0, y: 0 }),
    shape('arrow', { x: NaN, y: .2 }), shape('arrow', { x: -1, y: .2 }),
    shape('rectangle', { x: .1, y: .1, unknown: true }),
    shape('rectangle', undefined, undefined, { opacity: Infinity }),
    shape('rectangle', undefined, undefined, { opacity: 0 }),
    shape('rectangle', undefined, undefined, { thickness: 10 }),
    shape('rectangle', undefined, undefined, { color: 'url(evil)' }),
    shape('rectangle', undefined, undefined, { extra: true }),
    shape('rectangle', undefined, undefined, { fontSize: 7 }),
    shape('text', { x: .1, y: .1 }, { x: .1, y: .1 }, { text: '', fontSize: 7 }),
    shape('text', { x: .1, y: .1 }, { x: .1, y: .1 }, { text: '\u0000', fontSize: 7 }),
    shape('text', { x: .1, y: .1 }, { x: .1, y: .1 }, { text: 'a'.repeat(121), fontSize: 7 }),
    shape('text', { x: .1, y: .1 }, { x: .1, y: .1 }, { text: 'A', fontSize: .01 }),
  ];
  for (const entry of bad) assert.throws(() => normalizeLocalAnnotations([entry]), /Invalid|Unsupported|visible span|Text options/);
  assert.throws(() => normalizeLocalAnnotations(Array.from({ length: 51 }, () => shape('ellipse'))), /Too many/);
  assert.throws(() => renderLocalAnnotations(fakeCanvas(), 12_000_001, 1, []), /Invalid/);
  assert.throws(() => renderLocalAnnotations(fakeCanvas(), 0, 1, []), /Invalid/);
  assert.throws(() => renderLocalAnnotations(fakeCanvas(), 1, Infinity, []), /Invalid/);
  assert.throws(() => renderLocalAnnotations({}, 100, 100, []), /context/);
});

test('restores canvas state even if a draw method throws', () => {
  const ctx = fakeCanvas();
  ctx.stroke = () => { throw new Error('Fake canvas failure'); };
  assert.throws(() => renderLocalAnnotations(ctx, 100, 100, [shape('rectangle')]), /Fake canvas failure/);
  assert.equal(events(ctx, 'restore').length, 1);
});
