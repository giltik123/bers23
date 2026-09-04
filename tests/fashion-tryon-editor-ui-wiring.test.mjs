import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const editor = await readFile('src/pages/Editor.jsx', 'utf8');
const panel = await readFile('src/components/editor/outfits/OutfitPanel.jsx', 'utf8');
const owner = await readFile('src/application/fashion/createCanonicalTryOnEditorUiOwner.js', 'utf8');
const tombstone = await readFile('src/lib/tryon/tryonEngine.js', 'utf8');

test('Editor owns canonical Try-On in a ref rather than pending state or panel-local lifecycle', () => {
  assert.match(editor, /createCanonicalTryOnEditorUiOwner/);
  assert.match(editor, /const tryOnOwnerRef = useRef\(null\)/);
  assert.match(editor, /tryOnOwnerRef\.current = createCanonicalTryOnEditorUiOwner\(/);
  assert.match(editor, /const tryOnState = tryOnOwnerRef\.current\.state\(\)/);
  assert.match(editor, /const tryOnLocked = tryOnState\.busy \|\| tryOnState\.hasInFlight/);
  assert.doesNotMatch(editor, /useState\([^\n]*createCanonicalTryOnEditorUiOwner/);
  assert.doesNotMatch(editor, /setPendingResult\([^\n]*(controller|session|runtime)/i);
});

test('Editor invalidates Try-On on canonical source change and permanent unmount', () => {
  assert.match(editor, /tryOnOwnerRef\.current\?\.dispose\(\)/);
  assert.match(editor, /tryOnOwnerRef\.current\?\.reset\(\)/);
  assert.match(editor, /\[project\?\.id, project\?\.current_image_artifact_id\]/);
  assert.match(owner, /if \(!disposed\) onStateChange\(snapshot\(\)\)/);
});

test('Editor freezes competing mutations/navigation while a Try-On request is owned', () => {
  assert.match(editor, /editorBusy = [^;]+\|\| tryOnLocked/);
  assert.match(editor, /onChange=\{\(next\) => \{ if \(!tryOnLocked\) setEditTab\(next\); \}\}/);
  assert.match(editor, /canIsolateBackground=\{[^}]+!tryOnLocked/s);
  assert.match(editor, /CreditsBar estimate=\{!pendingResult && !tryOnLocked/);
});

test('ResultCompare Retry, Accept, conflict recovery and Discard preserve explicit Try-On lifecycle', () => {
  assert.match(editor, /pending\?\.kind === 'FASHION_TRYON'/);
  assert.match(editor, /void performTryOnAction\('retry'\)\.catch\(\(\) => \{\}\)/);
  const resetUses = editor.match(/pending\?\.kind === 'FASHION_TRYON'\) resetTryOnOwner\(\)/g) || [];
  assert.ok(resetUses.length >= 3, 'Accept/conflict/discard must release the owner');
  assert.match(editor, /busy=\{[^}]+tryOnState\.busy/);
});

test('OutfitPanel receives only safe state and a closed command callback', () => {
  assert.match(editor, /<OutfitPanel\s+disabled=\{tryOnPanelDisabled\}\s+tryOnState=\{tryOnState\}\s+onTryOnAction=\{performTryOnAction\}/s);
  assert.match(panel, /tryOnState = null/);
  assert.match(panel, /onTryOnAction/);
  assert.match(panel, /mutationBlocked = Boolean\(busy\) \|\| disabled \|\| tryOnState\?\.hasInFlight === true/);
  for (const action of ['inspect', 'run', 'resume', 'recover', 'retry', 'abandon']) {
    assert.equal(panel.includes(`invokeTryOn('${action}'`), true, action);
  }
});

test('OutfitPanel has no raw Try-On execution/composition authority', () => {
  for (const forbidden of [
    'createCanonicalTryOnEditorController',
    'createCanonicalTryOnProductRuntime',
    'createTryOnEditorFinalHandoff',
    'createFashionTryOnClientRequestId',
    'prepareTryOn',
    'continueTryOn',
    'getTryOnResult',
    'getTryOnPreview',
    'tryonEngine',
    'clientRequestId',
    'FASHN',
    'Billing',
  ]) assert.equal(panel.includes(forbidden), false, forbidden);
});

test('UI owner uses collision-free revision-bound selection identity and minimizes lower-layer readiness', () => {
  assert.match(owner, /Number\.isSafeInteger\(outfit\.revision\)/);
  assert.match(owner, /const key = JSON\.stringify\(\[/);
  assert.match(owner, /normalizeCanonicalTryOnReadinessSummary/);
  assert.match(owner, /Canonical Try-On UI readiness does not match the active selection/);
  assert.match(owner, /controller !== target \|\| epoch !== actionEpoch/);
  assert.match(owner, /disposePendingPreview\(result\.pendingResult\)/);
});

test('legacy generic Try-On engine stays globally locked despite canonical UI wiring', () => {
  assert.match(tombstone, /TRYON_EXECUTION_NOT_WIRED/);
  assert.doesNotMatch(editor, /from ['"]@\/lib\/tryon\/tryonEngine/);
  assert.doesNotMatch(panel, /from ['"]@\/lib\/tryon\/tryonEngine/);
});
