import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [editor, controls, recipe, releaseE2e, workflow] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/components/editor/local/LocalRecipeControls.jsx', 'utf8'),
  readFile('src/lib/local-editor/localRecipe.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
  readFile('.github/workflows/editor-ux-clarity.yml', 'utf8'),
]);

test('save/restore buttons are labeled, keyboard-accessible, and refuse a missing original photo', () => {
  assert.match(controls, /aria-label="Save and restore local editing session"/);
  assert.match(controls, /onClick=\{onSave\}/);
  assert.match(controls, /'Save edit recipe'/);
  assert.match(controls, /fileInputRef\.current\?\.click\(\)/);
  assert.match(controls, /'Restore edit recipe'/);
  assert.match(controls, /ref=\{fileInputRef\} onChange=\{onChooseFile\}/);
  assert.match(controls, /aria-label="Choose BERS local recipe JSON"/);
  assert.match(controls, /accept="\.json,application\/json"/);
  assert.match(editor, /if \(!source \|\| loading \|\| exporting \|\| savingRecipe \|\| restoringRecipe\)/);
  assert.match(controls, /exact original photo/);
});

test('portable recipe is bound to immutable full-resolution original pixels, not preview or project URL', () => {
  assert.match(editor, /fingerprintOriginalRgba\(source\.full, source\.width, source\.height\)/);
  assert.doesNotMatch(editor, /fingerprintOriginalRgba\(source\.preview/);
  assert.match(recipe, /subtle\.digest\('SHA-256', pixels\)/);
  assert.match(recipe, /image\.sha256 !== expected\.sha256/);
  assert.match(recipe, /This recipe belongs to a different original image/);
  assert.match(recipe, /MAX_LOCAL_RECIPE_BYTES = 2 \* 1024 \* 1024/);
  assert.match(editor, /generation !== loadGeneration\.current \|\| image\.current !== source/);
});

test('recipe serializes real corrected tone, channel masks, clone stamps and independent vector objects', () => {
  assert.match(recipe, /normalizeLocalSettings\(settings\)/);
  assert.match(recipe, /normalizeAdvancedSettings\(advanced\)/);
  assert.match(recipe, /normalizeLocalAnnotations\(annotations\)/);
  assert.match(editor, /const original = await originalIdentity\(source, generation\)/);
  assert.match(editor, /createLocalRecipe\(original, settings, advanced, annotations\)/);
  assert.match(editor, /parseLocalRecipe\(raw, original\)/);
  assert.match(editor, /dispatch\(\{ type: 'restore-recipe', value: validated\.edits \}\)/);
});

test('restoring a recipe produces one undoable atomic history entry, never a Core mutation', () => {
  assert.match(editor, /action\.type === 'restore-recipe'/);
  assert.match(editor, /__advanced: normalizeAdvancedSettings\(action\.value\.advanced\)/);
  assert.match(editor, /__annotations: normalizeLocalAnnotations\(action\.value\.annotations\)/);
  assert.match(editor, /state\.entries\.slice\(0, state\.index \+ 1\)/);
  assert.match(editor, /\.slice\(-40\)/);
  assert.match(editor, /setShowOriginal\(false\)/);
  assert.doesNotMatch(recipe, /\bfetch\(|localStorage|sessionStorage|coreClient|cookie|providerEndpoint|postMessage/);
  assert.doesNotMatch(editor, /coreClient\.projects\.acceptFinal|pushEdit\(|fetch\([^)]*method: 'POST'/);
});

test('recipe export/download uses explicit user click and never includes image bytes or a cloud URL', () => {
  assert.match(editor, /anchor\.download = safeFilename\(details\?\.name \|\| projectName\) \+ '\.bers-edit\.json'/);
  assert.match(editor, /new Blob\(\[json\], \{ type: 'application\/json' \}\)/);
  assert.match(editor, /blob\.size > MAX_LOCAL_RECIPE_BYTES/);
  assert.match(editor, /URL\.createObjectURL\(blob\)/);
  assert.match(editor, /URL\.revokeObjectURL\(url\)/);
  assert.match(recipe, /'source', 'edits'/);
  assert.doesNotMatch(recipe, /FormData\(|fetch\(|XMLHttpRequest|authToken|imageDataUrl|accessKey/);
});

test('the real Chrome browser contract checks file bytes, source SHA, exact restore, Undo and mismatched rejection', () => {
  assert.match(releaseE2e, /getByRole\('button', \{ name: 'Save edit recipe' \}\)\.click\(\)/);
  assert.match(releaseE2e, /recipeDownload\.suggestedFilename\(\)/);
  assert.match(releaseE2e, /recipeRecord\.source\.sha256/);
  assert.match(releaseE2e, /getByRole\('slider', \{ name: 'Local Brightness' \}\)/);
  assert.match(releaseE2e, /Choose BERS local recipe JSON/);
  assert.match(releaseE2e, /Undo must reverse entire recipe import/);
  assert.match(releaseE2e, /Redo must restore imported recipe state/);
  assert.match(releaseE2e, /different original image/);
  assert.match(releaseE2e, /portable edit recipe must not mutate canonical Core Project/);
  assert.match(releaseE2e, /portable edit recipe must never call an AI provider/);
});

test('exact-head UX workflow gates JSON recipe unit and source wiring contracts', () => {
  assert.match(workflow, /tests\/local-recipe\.test\.mjs/);
  assert.match(workflow, /tests\/local-recipe-editor-wiring\.test\.mjs/);
  assert.match(workflow, /Verify exact candidate SHA/);
});
