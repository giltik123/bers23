import test from 'node:test';
import assert from 'node:assert/strict';
import { moveLocalAnnotation, editLocalAnnotation, normalizeLocalAnnotations } from '../src/lib/local-editor/localAnnotations.js';

const rectangle = Object.freeze({
  type: 'rectangle', from: { x: .20, y: .30 }, to: { x: .50, y: .65 },
  color: '#ef4444', opacity: 1, thickness: 1,
});
const label = Object.freeze({
  type: 'text', from: { x: .45, y: .25 }, to: { x: .45, y: .25 },
  color: '#ef4444', opacity: 1, thickness: 1, text: 'Before', fontSize: 7,
});

test('nudge translates complete rectangle while retaining width, height and source immutability', () => {
  const moved = moveLocalAnnotation(rectangle, .01, -.01);
  assert.deepEqual(moved.from, { x: .21, y: .29 });
  assert.deepEqual(moved.to, { x: .51, y: .64 });
  assert.ok(Math.abs((moved.to.x - moved.from.x) - (rectangle.to.x - rectangle.from.x)) < 1e-8);
  assert.ok(Math.abs((moved.to.y - moved.from.y) - (rectangle.to.y - rectangle.from.y)) < 1e-8);
  assert.deepEqual(rectangle.from, { x: .2, y: .3 });
  assert.equal(Object.isFrozen(moved), true);
});

test('movement clamps entire annotation at boundary without shrinking or distorting it', () => {
  const rightEdge = moveLocalAnnotation(rectangle, 1, 1);
  assert.deepEqual(rightEdge.from, { x: .70, y: .65 });
  assert.deepEqual(rightEdge.to, { x: 1, y: 1 });
  const leftEdge = moveLocalAnnotation(rectangle, -1, -1);
  assert.deepEqual(leftEdge.from, { x: 0, y: 0 });
  assert.deepEqual(leftEdge.to, { x: .3, y: .35 });
  assert.deepEqual(moveLocalAnnotation(rightEdge, .1, .1), rightEdge);
});

test('reversed arrow endpoints retain direction, shape and bounds through movement', () => {
  const arrow = { ...rectangle, type: 'arrow', from: { x: .8, y: .9 }, to: { x: .3, y: .2 } };
  const updated = moveLocalAnnotation(arrow, .5, .5);
  assert.ok(updated.from.x > updated.to.x);
  assert.ok(updated.from.y > updated.to.y);
  assert.ok(Math.abs((updated.from.x - updated.to.x) - (arrow.from.x - arrow.to.x)) < 1e-8);
  assert.ok(Math.abs((updated.from.y - updated.to.y) - (arrow.from.y - arrow.to.y)) < 1e-8);
  assert.ok(updated.from.x <= 1 && updated.from.y <= 1);
});

test('text and shape properties update without changing unrelated fields or geometry', () => {
  const next = editLocalAnnotation(label, { text: 'After', fontSize: 12, color: '#0f766e', opacity: .5 });
  assert.equal(next.text, 'After');
  assert.equal(next.fontSize, 12);
  assert.equal(next.color, '#0f766e');
  assert.equal(next.opacity, .5);
  assert.deepEqual(next.from, label.from);
  assert.equal(label.text, 'Before');
  const resized = editLocalAnnotation(rectangle, { thickness: 2.5, color: '#ffffff' });
  assert.equal(resized.thickness, 2.5);
  assert.deepEqual(resized.to, rectangle.to);
});

test('rejects malicious edits and non-finite or out-of-range movements before changing data', () => {
  for (const offset of [NaN, Infinity, -Infinity, 1.1, -1.1, '0.1']) {
    assert.throws(() => moveLocalAnnotation(rectangle, offset, 0), /Invalid local annotation movement/);
  }
  for (const edit of [{ from: { x: 0, y: 0 } }, { text: 'unavailable' }, { fontSize: 11 }, { opacity: 2 }, { color: 'javascript:alert(1)' }, { thickness: 0 }, null, []]) {
    assert.throws(() => editLocalAnnotation(rectangle, edit), /Invalid|Text/);
  }
  assert.throws(() => editLocalAnnotation(label, { text: '<'.repeat(121) }), /Invalid/);
  assert.deepEqual(normalizeLocalAnnotations([rectangle])[0].from, rectangle.from);
});
