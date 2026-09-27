import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Scene Memory cannot borrow Creative execution or Project metadata authority', async () => {
  const memory = await readFile('src/lib/scene/sceneMemory.js', 'utf8');

  for (const forbidden of [
    "from '@/api/coreClient'",
    "from '@/lib/projectService'",
    'InvokeLLM',
    'projectService.update',
    'metadata:',
    'async persist(',
  ]) assert.equal(memory.includes(forbidden), false, forbidden);

  assert.match(memory, /SCENE_MEMORY_ANALYSIS_NOT_WIRED/);
  assert.match(memory, /Server-owned Scene Memory analysis is not enabled\./);
  assert.match(memory, /authority: 'BROWSER_ADVISORY'/);
});

test('Scene Memory panel is truthful while server profile authority is unavailable', async () => {
  const [panel, editor] = await Promise.all([
    readFile('src/components/editor/scene/SceneMemoryPanel.jsx', 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
  ]);

  assert.match(panel, /Scene analysis is unavailable until the server-owned Scene Profile authority is enabled\./);
  assert.doesNotMatch(panel, /sceneMemory\.refresh\(|sceneMemory\.reset\(|Refresh analysis|Reset memory/);
  assert.match(editor, /Server-owned scene analysis is not enabled, so opening a Project never initiates analysis\./);
});
