import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [panel, engine, chrome] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/lib/local-editor/localHistory.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
]);

test('all local slider and text edit changes share the actual grouped history reducer', () => {
  assert.match(panel, /import \{ commitGroupedLocalHistory \} from '@\/lib\/local-editor\/localHistory'/);
  assert.match(panel, /return commitGroupedLocalHistory\(state, action, next, entries\)/);
  assert.match(panel, /groupId: gestureRef\.current\?\.id/g);
  assert.match(panel, /const updateAdvanced = \(value\) => dispatch\(\{ type: 'advanced', value, groupId/);
  assert.match(panel, /const updateAnnotations = \(value\) => dispatch\(\{ type: 'annotations', value, groupId/);
  assert.match(panel, /const update = \(key, value\) => dispatch\(\{ type: 'change', key, value, groupId/);
  assert.match(engine, /const canReplace = group !== null/);
  assert.match(engine, /state\.index === state\.entries\.length - 1/);
  assert.match(engine, /state\.entries\.slice\(0, -1\)/);
});

test('pointer, keyboard and focused text gestures begin/end at real input events', () => {
  assert.match(panel, /onPointerDownCapture=\{beginHistoryGesture\}/);
  assert.match(panel, /onPointerUpCapture=\{endPointerHistoryGesture\}/);
  assert.match(panel, /onPointerCancelCapture=\{endPointerHistoryGesture\}/);
  assert.match(panel, /onKeyDownCapture=\{handleLocalHistoryKeyDown\}/);
  assert.match(panel, /onKeyUpCapture=\{endKeyboardHistoryGesture\}/);
  assert.match(panel, /onFocusCapture=\{beginTextHistoryGesture\}/);
  assert.match(panel, /onBlurCapture=\{endHistoryGesture\}/);
  assert.match(panel, /element\.type !== 'range'/);
  assert.match(panel, /element\.type !== 'text'/);
  assert.match(panel, /gestureRef\.current\?\.element === event\.target/);
  assert.match(panel, /'gesture-' \+ \(\+\+gestureSequenceRef\.current\)/);
});

test('Ctrl/Cmd+Z and redo work on editing surface but preserve native typing', () => {
  assert.match(panel, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(panel, /target instanceof HTMLTextAreaElement \|\| target\?\.isContentEditable/);
  assert.match(panel, /target\.type !== 'range'/);
  assert.match(panel, /const undo = key === 'z' && !event\.shiftKey/);
  assert.match(panel, /const redo = \(key === 'z' && event\.shiftKey\) \|\| key === 'y'/);
  assert.match(panel, /dispatch\(\{ type: undo \? 'undo' : 'redo' \}\)/);
  assert.match(panel, /aria-label="Local undo history position"/);
  assert.match(panel, /One slider drag or continuous text edit = one Undo step/);
});

test('Undo/Redo, Reset and imported recipes never reuse stale gesture groups', () => {
  assert.match(panel, /if \(action\.type === 'undo'\) return \{ \.\.\.state, index: Math\.max\(0, state\.index - 1\), activeGroup: null \}/);
  assert.match(panel, /if \(action\.type === 'redo'\) return \{ \.\.\.state, index: Math\.min\(state\.entries\.length - 1, state\.index \+ 1\), activeGroup: null \}/);
  assert.match(panel, /if \(action\.type === 'reset'\) return \{ entries: \[LOCAL_DEFAULTS\], index: 0 \}/);
  assert.match(panel, /action\.type === 'restore-recipe'/);
  assert.match(engine, /return \{ entries: appended, index: appended\.length - 1, activeGroup: group \}/);
});

test('real Chrome acceptance drags a slider and checks undo position plus keyboard shortcut', () => {
  assert.match(chrome, /const sliderRect = await brightness\.boundingBox\(\)/);
  assert.match(chrome, /await page\.mouse\.down\(\)/);
  assert.match(chrome, /for \(const fraction of \[\.57, \.64, \.71, \.78, \.85\]\)/);
  assert.match(chrome, /await page\.mouse\.up\(\)/);
  assert.match(chrome, /getByLabel\('Local undo history position'\)/);
  assert.match(chrome, /page\.keyboard\.press\('Control\+z'\)/);
  assert.match(chrome, /page\.keyboard\.press\('Control\+Shift\+z'\)/);
  assert.match(chrome, /one Ctrl\+Z must restore pre-drag brightness after many pointer samples/);
});
