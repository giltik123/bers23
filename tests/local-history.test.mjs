import test from 'node:test';
import assert from 'node:assert/strict';
import { commitGroupedLocalHistory } from '../src/lib/local-editor/localHistory.js';

const initial = () => ({ entries: [{ brightness: 0 }], index: 0, activeGroup: null });
const change = (state, value, groupId = null) => {
  const next = Object.freeze({ brightness: value });
  const appended = [...state.entries.slice(0, state.index + 1), next].slice(-40);
  return commitGroupedLocalHistory(state, { type: 'change', key: 'brightness', groupId }, next, appended);
};

test('100 pointer samples within one slider drag form a single meaningful Undo step', () => {
  let state = initial();
  for (let i = 1; i <= 100; i++) state = change(state, i, 'gesture-1');
  assert.equal(state.entries.length, 2);
  assert.equal(state.index, 1);
  assert.equal(state.entries[0].brightness, 0);
  assert.equal(state.entries[1].brightness, 100);
  assert.equal(state.activeGroup, 'gesture-1');
});

test('new pointer gesture, even on the same control, starts a new Undo step', () => {
  let state = change(initial(), 10, 'gesture-1');
  state = change(state, 20, 'gesture-1');
  state = change(state, 30, 'gesture-2');
  state = change(state, 40, 'gesture-2');
  assert.deepEqual(state.entries.map(entry => entry.brightness), [0, 20, 40]);
});

test('keyboard autorepeat and continuous typing are coalesced, unrelated changes are not', () => {
  let state = initial();
  for (let i = 1; i <= 25; i++) state = change(state, i, 'keyboard-held-arrow');
  assert.equal(state.entries.length, 2);
  state = change(state, 30, null);
  state = change(state, 31, null);
  assert.deepEqual(state.entries.map(entry => entry.brightness), [0, 25, 30, 31]);
});

test('dragging back to original value discards the otherwise empty Undo step', () => {
  let state = change(initial(), 25, 'pointer-1');
  state = change(state, 0, 'pointer-1');
  assert.deepEqual(state.entries, [{ brightness: 0 }]);
  assert.equal(state.index, 0);
  assert.equal(state.activeGroup, null);
  state = change(state, 50, 'pointer-1');
  assert.deepEqual(state.entries.map(entry => entry.brightness), [0, 50]);
});

test('Undo plus a new gesture trims Redo and never overwrites a historical state', () => {
  let state = initial();
  state = change(state, 10, 'first');
  state = change(state, 20, 'second');
  state = { ...state, index: 1, activeGroup: null }; // user presses Undo
  state = change(state, 33, 'third');
  assert.deepEqual(state.entries.map(entry => entry.brightness), [0, 10, 33]);
  assert.equal(state.index, 2);
});

test('history is capped at 40 immutable snapshots even across many distinct gestures', () => {
  let state = initial();
  for (let i = 1; i <= 100; i++) state = change(state, i, 'gesture-' + i);
  assert.equal(state.entries.length, 40);
  assert.equal(state.index, 39);
  assert.equal(state.entries.at(-1).brightness, 100);
  assert.equal(state.entries[0].brightness, 61);
});

test('malformed history and unsafe group identifiers fail closed', () => {
  assert.throws(() => commitGroupedLocalHistory({ entries: [], index: 0 }, {}, {}, [{}]), /Invalid local history state/);
  assert.throws(() => commitGroupedLocalHistory({ entries: [{}], index: 5 }, {}, {}, [{}]), /Invalid local history state/);
  const state = change(initial(), 10, 'g');
  const next = change(state, 11, 'x'.repeat(81));
  assert.equal(next.entries.length, 3, 'oversized group must not silently coalesce unrelated changes');
  assert.equal(next.activeGroup, null);
});

test('one import with no gesture is still one atomic, undoable operation', () => {
  const state = { entries: [{ brightness: 0 }], index: 0, activeGroup: null };
  const next = { brightness: 18, annotations: [{ type: 'text', text: 'Note' }] };
  const out = commitGroupedLocalHistory(state, { type: 'restore-recipe' }, next, [...state.entries, next]);
  assert.equal(out.index, 1);
  assert.equal(out.entries.length, 2);
  assert.deepEqual(out.entries[0], state.entries[0]);
});
