import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [editor, local, engine, coreUrl, e2e] = await Promise.all([
  readFile('src/pages/Editor.jsx', 'utf8'),
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/lib/local-editor/localAdjustments.js', 'utf8'),
  readFile('src/api/coreResourceUrl.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
]);

test('local adjustment tab is reachable and descriptions do not claim server-side persistence', () => {
  assert.match(editor, /\{ id: 'local', label: 'Local tools', description: 'No AI, no credits:/);
  assert.match(editor, /const LocalAdjustmentsPanel = lazy\(\(\) => import\('@\/components\/editor\/local\/LocalAdjustmentsPanel'\)\)/);
  assert.match(editor, /editTab === 'local' \? \(/);
  assert.match(editor, /<LocalAdjustmentsPanel key=\{project\.current_image_artifact_id \|\| project\.id\} imageUrl=\{project\.current_image_url\} projectName=\{project\.name\} \/>/);
  assert.match(local, /Local edits do not mutate the BERS project or its Core history/);
  assert.doesNotMatch(local, /projectService\.update|coreClient\.projects\.acceptFinal|pushEdit\(|acceptResult\(|persistFinal\(|saveObjects\(/);
});

test('local source loader is authenticated, canonical-bound and fails closed', () => {
  assert.match(local, /canonicalCoreResourcePath\(imageUrl\)/);
  assert.match(local, /resolveCoreResourceUrl\(resourcePath, CONFIGURED_CORE_API_ROOT\)/);
  assert.match(local, /fetch\(resolveCoreResourceUrl\(resourcePath, CONFIGURED_CORE_API_ROOT\), \{ credentials: 'include', cache: 'no-store', signal: controller\.signal \}\)/);
  assert.match(coreUrl, /if \(value\.startsWith\(CANONICAL_DELIVERY_PREFIX\)\) return value/);
  assert.match(local, /new Set\(\['image\/png', 'image\/jpeg', 'image\/webp'\]\)/);
  assert.match(local, /const MAX_INPUT_BYTES = 32 \* 1024 \* 1024/);
  assert.match(local, /width \* height > MAX_LOCAL_PIXELS/);
  assert.match(local, /const generation = \+\+loadGeneration\.current/);
  assert.match(local, /if \(generation !== loadGeneration\.current\) return/);
  assert.match(local, /abortRef\.current\?\.abort\(\)/);
  assert.doesNotMatch(local, /FAL_KEY|\/ai\/|\/providers\/|sendToServer|uploadMask|new WebSocket/);
});

test('controls and presets modify pure adjustment state with bounded undo/redo', () => {
  assert.match(local, /useReducer\(historyReducer/);
  assert.match(local, /state\.entries\.slice\(0, state\.index \+ 1\)/);
  assert.match(local, /\.slice\(-40\)/);
  assert.match(local, /type: 'undo'/);
  assert.match(local, /type: 'redo'/);
  assert.match(local, /type: 'reset'/);
  assert.match(local, /type: 'preset'/);
  assert.match(local, /type: 'change', key, value/);
  assert.match(local, /<Adjustment key=\{definition\.key\} definition=\{definition\} value=\{settings\[definition\.key\]\} setValue=\{update\} \/>/);
  assert.match(local, /aria-label=\{'Local ' \+ definition\.label\} type="range"/);
  assert.match(local, /aria-label="Local color effect"/);
  assert.match(local, /settings\.effect === 'threshold'/);
  assert.match(engine, /LOCAL_PRESETS = Object\.freeze/);
  assert.match(engine, /LOCAL_CONTROLS = Object\.freeze/);
});

test('before/after and histogram are computed from transformed RGBA, not decorative controls', () => {
  assert.match(local, /applyLocalAdjustments\(source\.preview, source\.previewWidth, source\.previewHeight, settings\)/);
  assert.match(local, /context\.putImageData\(new ImageData\(pixels, canvas\.width, canvas\.height\), 0, 0\)/);
  assert.match(local, /setHistogram\(localLuminanceHistogram\(pixels, canvas\.width, canvas\.height\)\)/);
  assert.match(local, /aria-pressed=\{showOriginal\}/);
  assert.match(local, /aria-pressed=\{!showOriginal\}/);
  assert.match(local, /role="img"\s+aria-label=\{showOriginal \? 'Original local photo' : 'Locally edited photo preview'\}/);
  assert.match(engine, /export function localLuminanceHistogram/);
});

test('full-resolution PNG export is real, explicit and does not mutate Core Project', () => {
  assert.match(local, /applyLocalAdjustments\(source\.full, source\.width, source\.height, settings\)/);
  assert.match(local, /canvas\.toBlob\(output => output \? resolve\(output\)/);
  assert.match(local, /URL\.createObjectURL\(blob\)/);
  assert.match(local, /anchor\.download = safeFilename\(details\?\.name \|\| projectName\) \+ '-local-edit\.png'/);
  assert.match(local, /anchor\.click\(\)/);
  assert.match(local, /URL\.revokeObjectURL\(url\)/);
  assert.match(local, /Download edited PNG/);
  assert.match(engine, /alpha is NEVER changed/);
  assert.doesNotMatch(local, /fetch\(.+method: 'POST'|uploadFile|createFromFile|acceptFinal/);
});

test('real Chrome/Postgres E2E proves file input, real pixels, PNG output and unchanged Core authority', () => {
  assert.match(e2e, /getByRole\('button', \{ name: 'Local tools', exact: true \}\)\.click\(\)/);
  assert.match(e2e, /getByRole\('slider', \{ name: 'Local Brightness' \}\)/);
  assert.match(e2e, /getImageData\(6, 4, 1, 1\)\.data\[0\] > 44/);
  assert.match(e2e, /page\.waitForEvent\('download'/);
  assert.match(e2e, /assert\.deepEqual\(\[\.\.\.localPixels\.data\.subarray\(0, 4\)\], \[94, 146, 198, 255\]/);
  assert.match(e2e, /local PNG editing must never mutate canonical Core Project/);
  assert.match(e2e, /local image editing must never call AI providers/);
  assert.match(e2e, /local PNG editing must not manufacture Core execution tickets/);
});
