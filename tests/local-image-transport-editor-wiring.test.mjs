import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, transport, uiContract, e2e, workflow] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/lib/local-editor/localImageTransport.js', 'utf8'),
  readFile('tests/local-adjustments-editor-wiring.test.mjs', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
  readFile('.github/workflows/editor-ux-clarity.yml', 'utf8'),
]);

test('Core image source remains a canonical authenticated GET with a streamed hard byte cap', () => {
  assert.match(panel, /canonicalCoreResourcePath\(imageUrl\)/);
  assert.match(panel, /resolveCoreResourceUrl\(resourcePath, CONFIGURED_CORE_API_ROOT\)/);
  assert.match(panel, /credentials: 'include', cache: 'no-store', signal: controller\.signal/);
  assert.match(panel, /readBoundedLocalImageResponse\(response, mime, MAX_INPUT_BYTES\)/);
  assert.doesNotMatch(panel, /await response\.blob\(\)/);
  assert.match(panel, /await activateLocalImage\(blob, projectName \|\| 'project', generation\)/);
  assert.match(uiContract, /MAX_INPUT_BYTES = 32/);
});

test('network chunks and Content-Length are BOTH checked before allocating decoded pixels', () => {
  assert.match(transport, /response\.body\.getReader\(\)/);
  assert.match(transport, /total \+= value\.byteLength/);
  assert.match(transport, /if \(total > limit\)/);
  assert.match(transport, /new Blob\(chunks, \{ type: mime \}\)/);
  assert.match(transport, /await reader\.cancel\(\)/);
  assert.match(transport, /reader\.releaseLock\(\)/);
  assert.match(transport, /MAX_LOCAL_DOWNLOAD_BYTES = 32 \* 1024 \* 1024/);
  assert.doesNotMatch(transport, /fetch\(|navigator\.|localStorage|credentials:/);
});

test('native device files remain user-chosen, local and size-validated before bitmap decoding', () => {
  assert.match(panel, /event\.target\.files\?\.\[0\]/);
  assert.match(panel, /if \(!blob\.size \|\| blob\.size > MAX_INPUT_BYTES\)/);
  assert.match(panel, /width \* height > MAX_LOCAL_PIXELS/);
  assert.match(panel, /createImageBitmap\(blob\)/);
  assert.match(panel, /return \{ width, height, full, previewWidth, previewHeight, preview:/);
  assert.match(panel, /const generation = \+\+loadGeneration\.current/);
});

test('exact-head UX CI includes streamed image regression and all image authority tests', () => {
  assert.match(workflow, /tests\/local-image-transport\.test\.mjs/);
  assert.match(workflow, /tests\/local-image-transport-editor-wiring\.test\.mjs/);
  assert.match(workflow, /Verify exact candidate SHA/);
  assert.match(e2e, /full resolution local PNG must contain actual brightness-adjusted pixels/);
});
