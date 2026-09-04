import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EDITOR = 'src/pages/Editor.jsx';
const FASHION = 'src/components/editor/fashion/FashionPanel.jsx';
const OUTFITS = 'src/components/editor/outfits/OutfitPanel.jsx';
const CREATIVE = 'src/components/editor/creative/CreativeStudioPanel.jsx';
const AGENT = 'src/components/editor/agent/AgentPanel.jsx';
const TRY_ON = 'src/components/editor/outfits/TryOnPanel.jsx';

function editorModeBlock(editor) {
  const start = editor.indexOf('{pendingResult ? (');
  const end = editor.indexOf('\n    </AdaptiveLayout>', start);
  assert.ok(start >= 0 && end > start, 'Editor mode block must exist');
  return editor.slice(start, end);
}

test('Editor navigation is capability-based rather than gated by detected objects', async () => {
  const editor = await readFile(EDITOR, 'utf8');
  const modes = editorModeBlock(editor);

  assert.match(modes, /<AdaptiveNavigation[\s\S]*items=\{EDITOR_TABS\}[\s\S]*active=\{editTab\}[\s\S]*onChange=\{\(next\) => \{ if \(!tryOnLocked\) setEditTab\(next\); \}\}/);
  assert.doesNotMatch(modes, /objects\.length === 0 \? \([\s\S]*<AdaptiveNavigation/,
    'zero-object projects must not be routed around the main navigation');
  assert.match(modes, /editTab === 'fashion'[\s\S]*<FashionPanel \/>/);
  assert.match(modes, /editTab === 'outfits'[\s\S]*<OutfitPanel[\s\S]*onTryOnAction=\{performTryOnAction\}/);
  assert.match(modes, /editTab === 'creative'[\s\S]*<CreativeStudioPanel/);
});

test('zero-object Prompt remains a canonical whole-image edit without inventing Object or MASK identity', async () => {
  const editor = await readFile(EDITOR, 'utf8');
  const modes = editorModeBlock(editor);

  assert.match(modes, /allowWholeImage=\{objects\.length === 0\}/);
  assert.match(modes, /applying=\{editorBusy \|\| detecting \|\| committing\}/);
  assert.match(editor, /Object detection is optional\. You can edit the whole image now or detect\/select an object first\./);
  assert.doesNotMatch(modes, /objects\.length === 0[\s\S]{0,300}(randomUUID|mask_artifact_id|selected:\s*true)/);
});

test('reachable Fashion and Outfit surfaces use narrow canonical authorities while legacy Try-On remains fail-closed', async () => {
  const [editor, fashion, outfits, creative, agent, tryOn] = await Promise.all([
    readFile(EDITOR, 'utf8'),
    readFile(FASHION, 'utf8'),
    readFile(OUTFITS, 'utf8'),
    readFile(CREATIVE, 'utf8'),
    readFile(AGENT, 'utf8'),
    readFile(TRY_ON, 'utf8'),
  ]);

  assert.match(fashion, /createCanonicalWardrobeViewModel/);
  assert.match(fashion, /coreClient\.fashion\.garments/);
  assert.match(fashion, /coreClient\.fashion\.wardrobe/);
  assert.match(fashion, /AddGarmentDialog/);
  for (const forbidden of ['wardrobeManager', 'garmentManager', 'garmentCollections', 'coreClient.entities', 'Core.UploadFile', '/assets']) {
    assert.equal(fashion.includes(forbidden), false, `Fashion must not mount legacy authority ${forbidden}`);
  }

  assert.match(outfits, /createCanonicalOutfitViewModel/);
  assert.match(outfits, /coreClient\.fashion\.outfits/);
  assert.match(outfits, /coreClient\.fashion\.wardrobe/);
  assert.match(outfits, /server-owned/);
  assert.match(outfits, /never retried automatically/);
  assert.match(outfits, /onTryOnAction/);
  for (const forbidden of ['outfitManager', 'coreClient.entities', 'FASHN', 'onCommit', 'onRollback']) {
    assert.equal(outfits.includes(forbidden), false, `Outfits must not mount legacy or execution authority ${forbidden}`);
  }

  assert.match(creative, /Canonical Outfit authority is available, but Creative Studio integration is not wired yet\./);
  for (const forbidden of ['coreClient', 'outfitManager']) {
    assert.equal(creative.includes(forbidden), false, `Creative Studio must not mount ${forbidden}`);
  }
  assert.match(creative, /outfits: \[\]/, 'Creative Studio must explicitly remain disconnected from canonical Outfit data');

  assert.doesNotMatch(editor, /<OutfitPanel[\s\S]{0,500}onCommit=/);
  assert.doesNotMatch(editor, /<AgentPanel[\s\S]{0,500}(onCommit|onRollback)=/);
  assert.match(agent, /Canonical Agent execution is not enabled yet\./);
  assert.match(tryOn, /Canonical Try-On execution is not enabled yet\./);
  assert.match(tryOn, /legacy browser FASHN execution path is disabled/);
});

test('Detect remains an optional separate action and does not own Fashion or Outfit reachability', async () => {
  const editor = await readFile(EDITOR, 'utf8');

  const detectIndex = editor.indexOf("objects.length === 0 && !pendingResult");
  const navigationIndex = editor.indexOf('<AdaptiveNavigation');
  assert.ok(detectIndex >= 0 && navigationIndex > detectIndex, 'optional Detect CTA should coexist with navigation');
  assert.match(editor, /\{objects\.length === 0 && !pendingResult && !cropInteractionActive && !resizeInteractionActive && \(/);
  assert.doesNotMatch(editor, /objects\.length > 0[\s\S]{0,250}<AdaptiveNavigation/);
});
