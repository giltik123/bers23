import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('version restoration requires explicit confirmation and respects in-flight Project mutations', async () => {
  const panel = await readFile('src/components/editor/VersionsPanel.jsx', 'utf8');
  assert.match(panel, /const confirmVersionRestore = \(version\) => \{/u);
  assert.match(panel, /if \(disabled\) return;/u);
  assert.match(panel, /if \(window\.confirm\(message\)\) onRestore\(version\);/u);
  assert.match(panel, /disabled=\{disabled\} onClick=\{\(\) => confirmVersionRestore\(v\)\}/u);
  assert.doesNotMatch(panel, /onClick=\{\(\) => onRestore\(v\)\}/u);
  assert.match(panel, /Текущий результат проекта изменится/u);
  assert.match(panel, /The current Project result will change/u);
});

test('create/restore actions stay unavailable if an already-open menu becomes disabled', async () => {
  const panel = await readFile('src/components/editor/VersionsPanel.jsx', 'utf8');
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  assert.match(panel, /const createVersion = \(\) => \{\s*if \(!disabled\) onCreate\(\);/u);
  assert.match(panel, /<DropdownMenuItem disabled=\{disabled\} onClick=\{createVersion\}>/u);
  assert.match(panel, /<DropdownMenuItem key=\{v\.id\} disabled=\{disabled\}/u);
  assert.match(editor, /<VersionsPanel[\s\S]*onRestore=\{restoreVersion\}/u);
  assert.match(editor, /disabled=\{editorBusy \|\| cropInteractionActive \|\| resizeInteractionActive \|\| Boolean\(pendingResult\)\}/u);
  for (const forbidden of ['coreClient', 'fetch(', 'localStorage', 'chargeCredits', 'acceptFinal(']) {
    assert.equal(panel.includes(forbidden), false, 'VersionsPanel must not acquire Project authority: ' + forbidden);
  }
});
