import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, controls, storage, recipe, chromeE2e, workflow] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/components/editor/local/LocalRecipeControls.jsx', 'utf8'),
  readFile('src/lib/local-editor/localDraftStorage.js', 'utf8'),
  readFile('src/lib/local-editor/localRecipe.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
  readFile('.github/workflows/editor-ux-clarity.yml', 'utf8'),
]);

test('on-device persistence is hidden in a disclosure until the user requests it', () => {
  assert.match(controls, /<details className=/);
  assert.match(controls, /Save on this device/);
  assert.match(controls, /onClick=\{onSaveDevice\}/);
  assert.match(controls, /onClick=\{onRestoreDevice\}/);
  assert.match(controls, /onClick=\{onClearDevice\}/);
  assert.match(controls, /Save browser draft/);
  assert.match(controls, /Restore browser draft/);
  assert.match(controls, /Delete browser draft/);
  assert.match(controls, /unenc rypted|unencrypted/);
  assert.match(controls, /edits are NOT automatically saved/);
  assert.match(controls, /saving replaces any previously saved browser draft/i);
});

test('browser storage is opt-in, never triggered by slider or history effects', () => {
  assert.match(panel, /const saveDeviceDraft = async \(\) => \{/);
  assert.match(panel, /const restoreDeviceDraft = async \(\) => \{/);
  assert.match(panel, /const deleteDeviceDraft = \(\) => \{/);
  assert.match(panel, /onSaveDevice=\{saveDeviceDraft\}/);
  assert.match(panel, /onRestoreDevice=\{restoreDeviceDraft\}/);
  assert.match(panel, /onClearDevice=\{deleteDeviceDraft\}/);
  assert.match(panel, /saveLocalDeviceDraft\(window\.localStorage, recipe\)/);
  assert.match(panel, /restoreLocalDeviceDraft\(window\.localStorage, original\)/);
  assert.match(panel, /clearLocalDeviceDraft\(window\.localStorage\)/);
  assert.doesNotMatch(panel, /useEffect\([\s\S]{0,100}?localStorage\.setItem/);
  assert.match(storage, /export const LOCAL_DEVICE_DRAFT_KEY/);
  assert.doesNotMatch(storage, /fetch\(|XMLHttpRequest|FormData\(|coreClient|navigator\.sendBeacon/);
});

test('draft restoration is bound to the exact original image, preserving one undoable history entry', () => {
  assert.match(panel, /const originalIdentity = async \(source, generation\) => \{/);
  assert.match(panel, /source\.sha256 \|\| await fingerprintOriginalRgba\(source\.full, source\.width, source\.height\)/);
  assert.match(panel, /generation !== loadGeneration\.current \|\| image\.current !== source/);
  assert.match(panel, /dispatch\(\{ type: 'restore-recipe', value: validated\.edits \}\)/);
  assert.match(panel, /setSelectedAnnotationIndex\(null\)/);
  assert.match(panel, /setCloneMode\('off'\)/);
  assert.match(panel, /setShowOriginal\(false\)/);
  assert.match(recipe, /image\.sha256 !== expected\.sha256/);
  assert.match(panel, /state\.entries\.slice\(0, state\.index \+ 1\)/);
  assert.match(panel, /slice\(-40\)/);
  assert.match(panel, /Browser draft restored for this exact original/);
});

test('only the image-bound JSON editing recipe is persisted, never photo pixels or credentials', () => {
  assert.match(storage, /parseLocalRecipe\(JSON\.stringify\(recipe\), recipe\.source\)/);
  assert.match(storage, /JSON\.stringify\(normalized\)/);
  assert.match(storage, /MAX_LOCAL_RECIPE_BYTES/);
  assert.match(storage, /storage\.setItem\(LOCAL_DEVICE_DRAFT_KEY, json\)/);
  assert.match(storage, /storage\.removeItem\(LOCAL_DEVICE_DRAFT_KEY\)/);
  assert.match(storage, /storage\.getItem\(LOCAL_DEVICE_DRAFT_KEY\)/);
  assert.match(recipe, /No pixels, URLs, session tokens, Core mutation/);
  assert.doesNotMatch(storage, /source\.full|source\.preview|image\.current|localStorage\.clear\(\)/);
  assert.doesNotMatch(panel, /coreClient\.projects\.acceptFinal|pushEdit\(/);
});

test('real browser release test proves saved edits survive reload and deletion leaves Core intact', () => {
  assert.match(chromeE2e, /Save on this device', \{ exact: true \}/);
  assert.match(chromeE2e, /getByRole\('button', \{ name: 'Save browser draft' \}\)\.click\(\)/);
  assert.match(chromeE2e, /page\.reload\(\{ waitUntil: 'domcontentloaded' \}\)/);
  assert.match(chromeE2e, /getByRole\('button', \{ name: 'Restore browser draft' \}\)\.click\(\)/);
  assert.match(chromeE2e, /Undo must revert restored browser draft/);
  assert.match(chromeE2e, /Redo must reapply restored browser draft/);
  assert.match(chromeE2e, /getByRole\('button', \{ name: 'Delete browser draft' \}\)\.click\(\)/);
  assert.match(chromeE2e, /saved browser drafts must not mutate canonical Core Project/);
  assert.match(chromeE2e, /browser draft save\/reload\/restore must never invoke an AI provider/);
});

test('exact-head CI includes both pure storage and UI wiring tests', () => {
  assert.match(workflow, /tests\/local-device-draft\.test\.mjs/);
  assert.match(workflow, /tests\/local-device-draft-editor-wiring\.test\.mjs/);
  assert.match(workflow, /Verify exact candidate SHA/);
});
