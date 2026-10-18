import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Projects UI does not expose a fake Duplicate action', async () => {
  const [projects, card, menu] = await Promise.all([
    readFile('src/pages/Projects.jsx', 'utf8'),
    readFile('src/components/projects/ProjectCard.jsx', 'utf8'),
    readFile('src/components/projects/ProjectActionsMenu.jsx', 'utf8'),
  ]);

  for (const source of [projects, card, menu]) {
    assert.doesNotMatch(source, /handleDuplicate|onDuplicate|Duplicate will be available with server-authoritative project history/);
  }
  assert.doesNotMatch(menu, />\s*Duplicate\s*</);
  assert.doesNotMatch(menu, /\bCopy\b/);
});

test('Project upload retry copy matches the in-memory queue lifetime', async () => {
  const [projects, queue, english, russian] = await Promise.all([
    readFile('src/pages/Projects.jsx', 'utf8'),
    readFile('src/lib/performance/offlineQueue.js', 'utf8'),
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);

  assert.match(queue, /constructor\(\) \{ this\.items = \[\]/);
  assert.doesNotMatch(queue, /indexedDB|localStorage|sessionStorage/i);

  assert.match(projects, /projectUi\.retryQueued/);
  assert.match(english, /Queued to retry while this tab remains open\./);
  assert.match(russian, /пока открыта вкладка/);
  assert.match(english, /If you reload or close it, choose the file again\./);
  assert.doesNotMatch(projects, /This upload will retry when your connection returns\./);
});
