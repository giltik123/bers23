import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('zero-object projects expose canonical whole-image Prompt while detection stays optional and race-locked', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const bar = await readFile('src/components/editor/InstructionBar.jsx', 'utf8');
  const resolver = await readFile('src/lib/planner/objectResolver.js', 'utf8');

  assert.match(editor, /\{objects\.length === 0 && !pendingResult && !cropInteractionActive && !resizeInteractionActive && \(/);
  assert.match(editor, /Object detection is optional\. You can edit the whole image now or detect\/select an object first\./);
  assert.match(editor, /<Button onClick=\{detect\} disabled=\{detecting \|\| editorBusy \|\| committing\}/);
  assert.match(editor, /\) : objects\.length === 0 \? \([\s\S]*?<InstructionBar[\s\S]*?allowWholeImage[\s\S]*?applying=\{editorBusy \|\| detecting \|\| committing\}/);
  assert.match(editor, /selectedObjectIds: objects\.filter\(\(object\) => object\.selected\)\.map\(\(object\) => object\.id\)/);
  assert.match(editor, /maskArtifactIds: objects\.filter\(\(object\) => object\.selected && object\.mask_artifact_id\)\.map\(\(object\) => object\.mask_artifact_id\)/);

  assert.match(bar, /allowWholeImage = false/);
  assert.match(bar, /const canEdit = Boolean\(selectedObject \|\| allowWholeImage\)/);
  assert.match(bar, /const wholeImage = !selectedObject && allowWholeImage/);
  assert.match(bar, /disabled=\{!canEdit \|\| applying\}/);
  assert.match(bar, /disabled=\{!canEdit \|\| !instruction\.trim\(\) \|\| applying\}/);
  assert.match(bar, /e\.key === 'Enter' && canEdit && !applying && instruction\.trim\(\) && onApply\(\)/);
  assert.match(bar, /Editing the whole image/);

  assert.match(resolver, /if \(intent\?\.scope === 'whole_image'\)/);
  assert.match(resolver, /strategy: 'whole_image', needsClarification: false/);
});
