import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('committed canonical Outfit changes invalidate the sibling Try-On chooser', async () => {
  const [editor, builder] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/outfits/OutfitPanel.jsx', 'utf8'),
  ]);
  assert.match(editor, /const \[outfitRevision, setOutfitRevision\] = useState\(0\)/);
  assert.match(editor, /setOutfitRevision\(\(current\) => current \+ 1\)/);
  assert.match(editor, /outfitRevision=\{outfitRevision\}/);
  assert.match(editor, /<OutfitPanel onCanonicalChange=\{notifyOutfitChange\} \/>/);
  assert.match(builder, /export default function OutfitPanel\(\{ onCanonicalChange \}\)/);
  assert.ok((builder.match(/onCanonicalChange\?\.\(\)/g) || []).length >= 4,
    'reload, reconciliation, creation and committed mutation must invalidate sibling view');
  assert.match(builder, /const created = await model\.create\(/);
  assert.match(builder, /const next = await action\(selected\)/);
  assert.doesNotMatch(builder, /prepareTryOn|continueTryOn|tryonEngine/);
});

test('Try-On chooser refreshes read-only after changing Outfit revision or host unlock', async () => {
  const runner = await readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8');
  assert.match(runner, /outfitRevision = 0/);
  assert.match(runner, /const load = useCallback\(async \(\) => \{/);
  assert.match(runner, /if \(hostActive \|\| busy\) return/);
  assert.match(runner, /const request = \+\+loadRequestRef\.current/);
  assert.match(runner, /if \(request !== loadRequestRef\.current\) return/);
  assert.match(runner, /return \(\) => \{ loadRequestRef\.current \+= 1; \}/);
  assert.match(runner, /\}, \[load, outfitRevision\]\)/);
  assert.match(runner, /snapshot\.outfits\.filter\(\(outfit\) => outfit\.status === 'ACTIVE' && outfit\.entries\.length > 0\)/);
  assert.match(runner, /selectable\.some\(\(outfit\) => outfit\.id === current\)/);
  assert.match(runner, /disabled=\{disabled \|\| loading\}/);
  assert.doesNotMatch(runner.slice(runner.indexOf('useEffect(() => {'), runner.indexOf('}, [load, outfitRevision]);')), /onAction|prepareTryOn|continueTryOn|retry/);
});

test('failed canonical chooser reload invalidates stale entries but keeps explicit Reload available', async () => {
  const runner = await readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8');
  const load = runner.slice(
    runner.indexOf('const load = useCallback(async () => {'),
    runner.indexOf('}, [busy, hostActive, model]);'),
  );
  const failure = load.slice(load.indexOf('} catch (cause) {'), load.indexOf('} finally {'));
  assert.match(failure, /if \(request === loadRequestRef\.current\)/,
    'only the latest failed request may invalidate selection');
  for (const invalidation of [
    'setOutfits([]);', 'setGarments([]);',
    "setSelectedOutfitId('');", "setSelectedEntryId('');",
  ]) {
    assert.ok(failure.includes(invalidation),
      `a failed canonical snapshot must clear previous selection: ${invalidation}`);
  }
  assert.match(failure, /setError\(/);
  assert.match(runner, /onClick=\{load\} disabled=\{selectionLocked \|\| disabled\}/,
    'explicit Retry/Reload remains available after loading finishes');
  assert.doesNotMatch(failure, /onAction|prepareTryOn|continueTryOn|retry\(/,
    'failed read must never trigger execution or retry automatically');
});
