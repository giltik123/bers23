import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EDITOR = 'src/pages/Editor.jsx';
const FASHION = 'src/components/editor/fashion/FashionPanel.jsx';
const OUTFITS = 'src/components/editor/outfits/OutfitPanel.jsx';
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

  assert.match(modes, /<AdaptiveNavigation items=\{EDITOR_TABS\} active=\{editTab\} onChange=\{setEditTab\} \/>/);
  assert.doesNotMatch(modes, /objects\.length === 0 \? \([\s\S]*<AdaptiveNavigation/,
    'zero-object projects must not be routed around the main navigation');
  assert.match(modes, /editTab === 'fashion'[\s\S]*<FashionPanel \/>/);
  assert.match(modes, /editTab === 'outfits'[\s\S]*<OutfitPanel/);
});

test('zero-object Prompt remains a canonical whole-image edit without inventing Object or MASK identity', async () => {
  const editor = await readFile(EDITOR, 'utf8');
  const modes = editorModeBlock(editor);

  assert.match(modes, /allowWholeImage=\{objects\.length === 0\}/);
  assert.match(modes, /applying=\{editorBusy \|\| detecting \|\| committing\}/);
  assert.match(editor, /Object detection is optional\. You can edit the whole image now or detect\/select an object first\./);
  assert.doesNotMatch(modes, /objects\.length === 0[\s\S]{0,300}(randomUUID|mask_artifact_id|selected:\s*true)/);
});

test('zero-object navigation does not enable gated Agent or Virtual Try-On execution', async () => {
  const [fashion, outfits, agent, tryOn] = await Promise.all([
    readFile(FASHION, 'utf8'),
    readFile(OUTFITS, 'utf8'),
    readFile(AGENT, 'utf8'),
    readFile(TRY_ON, 'utf8'),
  ]);

  assert.match(fashion, /wardrobe management only\. No AI editing, no provider calls\./);
  assert.match(outfits, /builds and validates outfits only\. No AI editing here/);
  assert.match(agent, /Canonical Agent execution is not enabled yet\./);
  assert.match(tryOn, /Canonical Try-On execution is not enabled yet\./);
  assert.match(tryOn, /legacy browser FASHN execution path is disabled/);
});

test('Detect remains an optional separate action and does not own Fashion or Outfit reachability', async () => {
  const editor = await readFile(EDITOR, 'utf8');

  const detectIndex = editor.indexOf("objects.length === 0 && !pendingResult");
  const navigationIndex = editor.indexOf('<AdaptiveNavigation items={EDITOR_TABS}');
  assert.ok(detectIndex >= 0 && navigationIndex > detectIndex, 'optional Detect CTA should coexist with navigation');
  assert.match(editor, /\{objects\.length === 0 && !pendingResult && !cropInteractionActive && !resizeInteractionActive && \(/);
  assert.doesNotMatch(editor, /objects\.length > 0[\s\S]{0,250}<AdaptiveNavigation/);
});
