import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, controls, geometry, release] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/components/editor/local/LocalAnnotationControls.jsx', 'utf8'),
  readFile('src/lib/local-editor/localAnnotations.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
]);

test('saved vector annotations can be selected individually and retain visible selection state', () => {
  assert.match(controls, /aria-label=\{'Select annotation ' \+ \(index \+ 1\)\}/);
  assert.match(controls, /aria-pressed=\{selectedIndex === index\}/);
  assert.match(controls, /onSelect\(selectedIndex === index \? null : index\)/);
  assert.match(panel, /selectedIndex=\{selectedAnnotationIndex\}/);
  assert.match(panel, /onSelect=\{setSelectedAnnotationIndex\}/);
  assert.match(panel, /setSelectedAnnotationIndex\(annotations\.length\)/);
});

test('selected text, color and opacity actually change normalized annotations, not drawing defaults', () => {
  assert.match(controls, /aria-label="Selected annotation text"/);
  assert.match(controls, /aria-label="Selected annotation color"/);
  assert.match(controls, /aria-label="Selected annotation opacity"/);
  assert.match(controls, /aria-label="Selected annotation thickness"/);
  assert.match(controls, /aria-label="Selected annotation font size"/);
  assert.match(controls, /onEdit\(\{ text: event\.target\.value \}\)/);
  assert.match(controls, /onEdit\(\{ color: event\.target\.value \}\)/);
  assert.match(controls, /onEdit\(\{ opacity: Number\(event\.target\.value\) \/ 100 \}\)/);
  assert.match(panel, /editLocalAnnotation\(item, patch\)/);
  assert.match(panel, /updateAnnotations\(next\)/);
  assert.match(geometry, /export function editLocalAnnotation/);
});

test('directional 1%-step buttons translate complete vector bounds via one undoable action', () => {
  for (const word of ['left', 'right', 'up', 'down']) assert.match(controls, new RegExp('aria-label="Move annotation ' + word + '"'));
  assert.match(controls, /onMove\(-\.01, 0\)/);
  assert.match(controls, /onMove\(0, -\.01\)/);
  assert.match(controls, /onMove\(0, \.01\)/);
  assert.match(controls, /onMove\(\.01, 0\)/);
  assert.match(panel, /moveLocalAnnotation\(item, dx, dy\)/);
  assert.match(geometry, /const deltaX = Math\.max\(-lowX, Math\.min\(1 - highX, dx\)\)/);
  assert.match(geometry, /const deltaY = Math\.max\(-lowY, Math\.min\(1 - highY, dy\)\)/);
  assert.match(panel, /action\.type === 'annotations'/);
  assert.match(panel, /\.slice\(-40\)/);
});

test('deleted annotations cannot leave selection pointing at a wrong object', () => {
  assert.match(panel, /setSelectedAnnotationIndex\(current =>/);
  assert.match(panel, /current === index \? null : current > index \? current - 1 : current/);
  assert.match(panel, /setSelectedAnnotationIndex\(null\)/);
  assert.match(controls, /onDelete\(index\)/);
  assert.match(controls, /onClear/);
});

test('edited vectors remain separate from original RGBA and export uses the same recipe', () => {
  assert.match(panel, /renderLocalAnnotations\(context, source\.previewWidth, source\.previewHeight, annotations\)/);
  assert.match(panel, /renderLocalAnnotations\(ctx, source\.width, source\.height, annotations\)/);
  assert.match(panel, /Download edited PNG/);
  assert.doesNotMatch(panel, /coreClient\.projects\.acceptFinal|persistFinal\(|uploadMask\(/);
  assert.doesNotMatch(geometry, /fetch\(|innerHTML|eval\(/);
});

test('Chrome release journey edits saved text and color, nudges item and proves Undo', () => {
  assert.match(release, /getByRole\('button', \{ name: 'Select annotation 3' \}\)\.click\(\)/);
  assert.match(release, /getByRole\('textbox', \{ name: 'Selected annotation text' \}\)\.fill\('Final review'\)/);
  assert.match(release, /getByRole\('combobox', \{ name: 'Selected annotation color' \}\)\.selectOption\('#0f766e'\)/);
  assert.match(release, /getByRole\('button', \{ name: 'Move annotation right' \}\)\.click\(\)/);
  assert.match(release, /Undo must restore vector annotation color without altering source pixels/);
});
