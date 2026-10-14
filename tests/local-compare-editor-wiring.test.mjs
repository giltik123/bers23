import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [editor, split, releaseE2e] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/lib/local-editor/localCompare.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
]);

test('before/after/split are three real mutually-exclusive editing view controls', () => {
  assert.match(editor, /aria-label="Compare local image"/);
  assert.match(editor, /const \[showOriginal, setShowOriginal\] = useState\(false\)/);
  assert.match(editor, /const \[splitCompare, setSplitCompare\] = useState\(false\)/);
  assert.match(editor, /const \[splitPosition, setSplitPosition\] = useState\(50\)/);
  assert.match(editor, /onClick=\{\(\) => \{ setSplitCompare\(false\); setShowOriginal\(true\); \}\}>Before/);
  assert.match(editor, /onClick=\{\(\) => \{ setSplitCompare\(false\); setShowOriginal\(false\); \}\}>After/);
  assert.match(editor, /aria-pressed=\{splitCompare\}/);
  assert.match(editor, /setSplitCompare\(true\)/);
  assert.match(editor, /setCloneMode\('off'\)/);
  assert.match(editor, /setAnnotationMode\('off'\)/);
});

test('accessible live divider controls REAL RGBA result and preview-only split line', () => {
  assert.match(editor, /aria-label="Before and after split position"/);
  assert.match(editor, /type="range" min="0" max="100" step="1"/);
  assert.match(editor, /onChange=\{event => setSplitPosition\(Number\(event\.target\.value\)\)\}/);
  assert.match(editor, /composeLocalSplitPreview\(source\.preview, after, source\.previewWidth, source\.previewHeight, splitPosition\)/);
  assert.match(editor, /data-local-split-divider="true"/);
  assert.match(editor, /aria-label="Drag comparison divider"/);
  assert.match(editor, /aria-valuenow=\{splitPosition\}/);
  assert.match(editor, /aria-orientation="horizontal"/);
  assert.match(editor, /onPointerMove=\{event => \{/);
  assert.match(editor, /event\.currentTarget\.hasPointerCapture\(event\.pointerId\)/);
  assert.match(editor, /event\.currentTarget\.parentElement\.getBoundingClientRect\(\)/);
  assert.match(editor, /onKeyDown=\{event => \{/);
  assert.match(editor, /event\.key === 'Home' \|\| event\.key === 'End'/);
  assert.match(editor, /left: splitPosition \+ '%'/);
  assert.match(editor, /Original on the left, edits on the right/);
  assert.match(editor, /the original may be visible in this preview/);
  assert.match(split, /result\.set\(original\.subarray\(offset, offset \+ rowLength\), offset\)/);
  assert.match(split, /new Uint8ClampedArray\(edited\)/);
});

test('expensive photo effects are cached during divider movement without copying source images into state', () => {
  assert.match(editor, /const processedPreviewCache = useRef\(null\)/);
  assert.match(editor, /cache\.source !== source \|\| cache\.settings !== settings \|\| cache\.advanced !== advanced/);
  assert.match(editor, /processedPreviewCache\.current = \{/);
  assert.match(editor, /processedPreviewCache\.current = null/);
  assert.match(editor, /\[details, settings, advanced, showOriginal, splitCompare, splitPosition\]/);
  assert.match(editor, /React\.useMemo\(\(\) => \{/);
  assert.doesNotMatch(split, /localStorage|fetch\(|XMLHttpRequest|coreClient|upload/);
});

test('split comparison cannot alter export data, annotation editing authority or Core project history', () => {
  assert.match(editor, /applyLocalAdjustments\(source\.full, source\.width, source\.height, settings\)/);
  assert.match(editor, /source\.width, source\.height, advanced, source\.full/);
  assert.match(editor, /renderLocalAnnotations\(ctx, source\.width, source\.height, annotations\)/);
  const download = editor.slice(editor.indexOf('const download = async () =>'), editor.indexOf('const update = ', editor.indexOf('const download = async () =>')));
  assert.doesNotMatch(download, /composeLocalSplitPreview|splitPosition|splitCompare/);
  assert.match(editor, /if \(mode !== 'off'\) \{\s*setSplitCompare\(false\);\s*setShowOriginal\(false\)/);
  assert.match(editor, /style=\{splitCompare \? \{ clipPath: 'inset\(0 0 0 ' \+ splitPosition \+ '%\)' \} : undefined\}/);
  assert.match(editor, /!showOriginal && !splitCompare && selectedCanvasBounds/);
  assert.match(editor, /Local edits do not mutate the BERS project or its Core history/);
});

test('real browser verifies before/after split endpoints and full-resolution export', () => {
  assert.match(releaseE2e, /getByRole\('button', \{ name: 'Split view' \}\)\.click\(\)/);
  assert.match(releaseE2e, /getByRole\('slider', \{ name: 'Before and after split position' \}\)/);
  assert.match(releaseE2e, /ctx\.getImageData\(0, 4, 1, 1\)\.data\[0\] === 44/);
  assert.match(releaseE2e, /ctx\.getImageData\(11, 4, 1, 1\)\.data\[0\] === 94/);
  assert.match(releaseE2e, /await comparePosition\.fill\('100'\)/);
  assert.match(releaseE2e, /await comparePosition\.fill\('0'\)/);
  assert.match(releaseE2e, /full resolution local PNG must contain actual brightness-adjusted pixels/);
  assert.match(releaseE2e, /comparison divider must disappear when returning to editing/);
});
