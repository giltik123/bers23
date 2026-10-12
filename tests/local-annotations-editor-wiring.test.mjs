import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [parent, controls, geometry, releaseE2e] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/components/editor/local/LocalAnnotationControls.jsx', 'utf8'),
  readFile('src/lib/local-editor/localAnnotations.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
]);

test('text, arrows, rectangles and ellipses expose descriptive, actionable controls', () => {
  assert.match(controls, /aria-label="Local photo annotations"/);
  assert.match(controls, /LOCAL_ANNOTATION_TOOLS\.map/);
  assert.match(controls, /onClick=\{\(\) => onMode\(tool\.id\)\}/);
  assert.match(controls, /aria-pressed=\{mode === tool\.id\}/);
  assert.match(controls, /aria-label="Annotation color"/);
  assert.match(controls, /aria-label="Annotation thickness"/);
  assert.match(controls, /aria-label="Annotation opacity"/);
  assert.match(controls, /aria-label="Annotation font size"/);
  assert.match(controls, /maxLength=\{MAX_LOCAL_ANNOTATION_TEXT\}/);
  assert.match(controls, /onClick=\{onAddCentered\}/);
  assert.match(controls, /onClick=\{\(\) => onDelete\(index\)\}/);
  assert.match(controls, /onClick=\{onClear\}/);
});

test('annotation state stays separate from actual Core-bound pixel transforms but shares Undo/Redo', () => {
  assert.match(parent, /__annotations: lastAnnotations = \[\]/);
  assert.match(parent, /action\.type === 'annotations'/);
  assert.match(parent, /normalizeLocalAnnotations\(action\.value\)/);
  assert.match(parent, /__advanced: lastAdvanced, __annotations: lastAnnotations/);
  assert.match(parent, /JSON\.stringify\(next\.__annotations\) === JSON\.stringify\(lastAnnotations\)/);
  assert.match(parent, /entries: \[LOCAL_DEFAULTS\], index: 0/);
  assert.match(parent, /\.slice\(-40\)/);
  assert.match(parent, /const annotations = currentEntry\.__annotations \|\| \[\]/);
  assert.match(parent, /const \{ __advanced, __annotations, \.\.\.base \} = currentEntry/);
});

test('annotations render on transparent overlay canvas and the SAME recipe flattens only in PNG export', () => {
  assert.match(parent, /ref=\{annotationCanvasRef\}/);
  assert.match(parent, /data-local-annotation-surface="true"/);
  assert.match(parent, /canvas\.width = source\.previewWidth/);
  assert.match(parent, /renderLocalAnnotations\(context, source\.previewWidth, source\.previewHeight, annotations\)/);
  assert.match(parent, /renderLocalAnnotations\(ctx, source\.width, source\.height, annotations\)/);
  assert.match(parent, /ctx\.putImageData\(new ImageData\(pixels, source\.width, source\.height\), 0, 0\)/);
  assert.match(parent, /canvas\.toBlob\(output => output \? resolve\(output\)/);
  assert.match(parent, /if \(showOriginal\) return/);
  assert.match(geometry, /ctx\.fillText\(item\.text, x1, y1, width - x1\)/);
  assert.match(geometry, /ctx\.save\(\)/);
  assert.match(geometry, /ctx\.restore\(\)/);
  assert.doesNotMatch(geometry, /fetch\(|upload\(|innerHTML|eval\(/);
});

test('mouse/touch annotation placement commits bounded normalized objects, not placeholder buttons', () => {
  assert.match(parent, /const annotationPoint = event => \{/);
  assert.match(parent, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(parent, /onPointerDown=\{annotationDown\}/);
  assert.match(parent, /onPointerMove=\{annotationMove\}/);
  assert.match(parent, /onPointerUp=\{annotationUp\}/);
  assert.match(parent, /onPointerCancel=\{annotationUp\}/);
  assert.match(parent, /annotationDrawing\.current = \{ pointerId: event\.pointerId, from: position \}/);
  assert.match(parent, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(parent, /updateAnnotations\(\[\.\.\.annotations, annotation\]\)/);
  assert.match(parent, /annotations\.length >= MAX_LOCAL_ANNOTATIONS/);
  assert.match(parent, /centeredLocalAnnotation\(annotationMode, annotationOptions\)/);
  assert.match(parent, /onKeyDown=\{event => \{/);
  assert.match(parent, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(parent, /addCenteredAnnotation\(\)/);
});

test('annotation and clone stamp pointer tools are mutually exclusive', () => {
  assert.match(parent, /const setDrawingMode = mode => \{/);
  assert.match(parent, /setCloneMode\('off'\)/);
  assert.match(parent, /const setStampMode = mode => \{/);
  assert.match(parent, /setAnnotationMode\('off'\)/);
  assert.match(parent, /onCloneMode=\{setStampMode\}/);
  assert.match(parent, /onMode=\{setDrawingMode\}/);
  assert.match(parent, /annotationMode !== 'off' \? 'touch-none cursor-crosshair' : 'pointer-events-none'/);
  assert.match(parent, /mx-auto w-fit max-w-full/);
});

test('individual delete and clear actions are Core-independent, and the PNG is explicitly flattened', () => {
  assert.match(parent, /onDelete=\{index => updateAnnotations\(annotations\.filter\(\(_, i\) => i !== index\)\)\}/);
  assert.match(parent, /onClear=\{\(\) => updateAnnotations\(\[\]\)\}/);
  assert.match(parent, /Local edits do not mutate the BERS project or its Core history/);
  assert.match(controls, /flattened/);
  assert.match(parent, /anchor\.download = safeFilename/);
  assert.doesNotMatch(parent, /coreClient\.projects\.acceptFinal|pushEdit\(|\/providers\/|FAL_KEY|new WebSocket/);
});

test('real browser E2E verifies colored annotation RGBA, PNG bytes, delete/undo and text', () => {
  assert.match(releaseE2e, /getByRole\('button', \{ name: 'Add centered rectangle' \}\)/);
  assert.match(releaseE2e, /canvas\[data-local-annotation-surface="true"\]/);
  assert.match(releaseE2e, /modifiedAnnotationPixels > 0/);
  assert.match(releaseE2e, /annotation must preserve original fully opaque RGBA alpha/);
  assert.match(releaseE2e, /getByRole\('button', \{ name: 'Delete annotation 1' \}\)\.click\(\)/);
  assert.match(releaseE2e, /getByRole\('button', \{ name: 'Undo', exact: true \}\)\.click\(\)/);
  assert.match(releaseE2e, /getByRole\('textbox', \{ name: 'Annotation text' \}\)\.fill\('Retouch this area'\)/);
  assert.match(releaseE2e, /local annotations must never mutate canonical Core Project/);
});
