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

test('Scene Memory panel is truthful and localized while server profile authority is unavailable', async () => {
  const [panel, editor, english, russian] = await Promise.all([
    readFile('src/components/editor/scene/SceneMemoryPanel.jsx', 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);

  assert.match(panel, /t\('sceneUi\.unavailable'\)/);
  assert.match(panel, /role="note"/);
  assert.match(english, /"unavailable": "Scene analysis is unavailable until the server-owned Scene Profile authority is enabled\."/);
  assert.match(russian, /"unavailable": "Анализ сцены недоступен, пока не подключён серверный источник профиля сцены\."/);
  assert.doesNotMatch(panel, /sceneMemory\.refresh\(|sceneMemory\.reset\(|Refresh analysis|Reset memory/);
  assert.match(editor, /Server-owned scene analysis is not enabled, so opening a Project never initiates analysis\./);
});
