import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(file, 'utf8');

test('main editor exposes three primary modes and keeps advanced tools in More', async () => {
  const editor = await read('src/pages/Editor.jsx');
  const navigation = await read('src/components/adaptive/AdaptiveNavigation.jsx');
  assert.match(editor, /const EDITOR_TABS = \[/);
  const modes = editor.split('const EDITOR_TABS = [')[1].split('];')[0];
  assert.deepEqual([...modes.matchAll(/id: '([^']+)'/g)].map((match) => match[1]), ['ai', 'fashion', 'local']);
  assert.match(editor, /const EDITOR_EXTRA_TABS = \[/);
  assert.match(editor, /extraItems=\{EDITOR_EXTRA_TABS\}/);
  assert.match(editor, /editTab === 'fashion' \? \(/);
  assert.match(navigation, /aria-expanded=\{moreOpen\}/);
  assert.match(navigation, /onChange\(item\.id\)/);
});

test('wardrobe lives on its own protected route and is reachable from try-on', async () => {
  const [app, editor, wardrobe] = await Promise.all([
    read('src/App.jsx'), read('src/pages/Editor.jsx'), read('src/pages/Wardrobe.jsx'),
  ]);
  assert.match(app, /<Route path="\/wardrobe" element=\{<Wardrobe \/>\} \/>/);
  assert.match(editor, /\/wardrobe\?project=/);
  assert.match(editor, /onOpenWardrobe=\{\(\) => openWardrobe\(\)\}/);
  assert.match(wardrobe, /<FashionPanel voiceQuery=\{voiceQuery\} \/>/);
  assert.doesNotMatch(editor, /<FashionPanel/);
});

test('mode change remains blocked during canonical running operations', async () => {
  const editor = await read('src/pages/Editor.jsx');
  assert.match(editor, /if \(!tryOnActive && !agentActive\) setEditTab\(next\)/);
  assert.match(editor, /<CanonicalTryOnRunnerPanel/);
  assert.match(editor, /<AICommandStudio/);
  assert.match(editor, /<LocalAdjustmentsPanel/);
});
