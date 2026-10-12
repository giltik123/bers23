import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, controls, vectors, release, workflow, recipes] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/components/editor/local/LocalAnnotationControls.jsx', 'utf8'),
  readFile('src/lib/local-editor/localAnnotations.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
  readFile('.github/workflows/editor-ux-clarity.yml', 'utf8'),
  readFile('src/lib/local-editor/localRecipe.js', 'utf8'),
]);

test('solid cover is discoverable with a plain-language warning and no deceptive opacity slider', () => {
  assert.match(vectors, /\{ id: 'redact', label: 'Solid cover' \}/);
  assert.match(controls, /redact: ShieldAlert/);
  assert.match(controls, /mode === 'redact'/);
  assert.match(controls, /role="note"/);
  assert.match(controls, /Solid black covers replace the covered pixels in the exported PNG/);
  assert.match(controls, /Color and opacity are locked at black and 100%/);
  assert.match(controls, /mode !== 'off' && mode !== 'redact'/);
  assert.match(controls, /selected\.type === 'redact'/);
  assert.match(controls, /Solid black styling cannot be made transparent/);
});

test('user can draw and move a cover, but cannot spoof its opacity or black RGBA', () => {
  assert.match(panel, /const newAnnotation = \(type, from, to = from\)/);
  assert.match(panel, /color: type === 'redact' \? LOCAL_REDACTION_COLOR : annotationOptions\.color/);
  assert.match(panel, /thickness: type === 'redact' \? 1 : annotationOptions\.thickness/);
  assert.match(panel, /opacity: type === 'redact' \? 1 : annotationOptions\.opacity/);
  assert.match(panel, /centeredLocalAnnotation\(annotationMode,/);
  assert.match(panel, /onPointerDown=\{annotationDown\}/);
  assert.match(panel, /onPointerMove=\{annotationMove\}/);
  assert.match(panel, /onPointerUp=\{annotationUp\}/);
  assert.match(panel, /onMove=\{moveSelectedAnnotation\}/);
  assert.match(vectors, /if \(item\.type === 'redact' && \(color !== LOCAL_REDACTION_COLOR \|\| opacity !== 1 \|\| thickness !== 1\)\)/);
  assert.match(vectors, /Solid cover styles are locked/);
  assert.match(vectors, /moveLocalAnnotation\(item, dx, dy\)/);
});

test('redaction is last in both preview and exported PNG and uses exact source pixel overwrite', () => {
  assert.match(vectors, /for \(const item of items\) if \(item\.type !== 'redact'\) renderOne/);
  assert.match(vectors, /for \(const item of items\) if \(item\.type === 'redact'\) renderOne/);
  assert.match(vectors, /ctx\.globalAlpha = 1/);
  assert.match(vectors, /ctx\.globalCompositeOperation = 'source-over'/);
  assert.match(vectors, /ctx\.fillStyle = LOCAL_REDACTION_COLOR/);
  assert.match(vectors, /ctx\.fillRect\(left, top, right - left, bottom - top\)/);
  assert.match(vectors, /output\[i\] = 0/);
  assert.match(vectors, /output\[i \+ 1\] = 0/);
  assert.match(vectors, /output\[i \+ 2\] = 0/);
  assert.match(vectors, /output\[i \+ 3\] = 255/);
  assert.match(panel, /renderLocalAnnotations\(context, source\.previewWidth, source\.previewHeight, annotations\)/);
  assert.match(panel, /const exportPixels = annotations\.some\(item => item\.type === 'redact'\)/);
  assert.match(panel, /ctx\.putImageData\(new ImageData\(exportPixels, source\.width, source\.height\), 0, 0\)/);
  assert.match(panel, /renderLocalAnnotations\(ctx, source\.width, source\.height, annotations\)/);
  assert.doesNotMatch(vectors, /fetch\(|coreClient|XMLHttpRequest|unsafeHTML/);
  assert.match(recipes, /normalizeLocalAnnotations\(annotations\)/);
});

test('real Chrome acceptance checks opaque PNG RGBA, preserved outside pixels, and protected Core authority', () => {
  assert.match(release, /getByRole\('button', \{ name: 'Solid cover', exact: true \}\)\.click\(\)/);
  assert.match(release, /getByRole\('button', \{ name: 'Add centered solid cover' \}\)\.click\(\)/);
  assert.match(release, /getImageData\(6, 4, 1, 1\)\.data/);
  assert.match(release, /export must overwrite ALL RGB and alpha bytes beneath private-area cover/);
  assert.match(release, /pixels outside private-area cover must remain unchanged/);
  assert.match(release, /solid black covers must not alter the original Core Project/);
  assert.match(release, /privacy covers must never call an AI provider/);
});

test('exact head verification always covers the opaque redaction tests', () => {
  assert.match(workflow, /tests\/local-redaction\.test\.mjs/);
  assert.match(workflow, /tests\/local-redaction-editor-wiring\.test\.mjs/);
  assert.match(workflow, /Verify exact candidate SHA/);
});
