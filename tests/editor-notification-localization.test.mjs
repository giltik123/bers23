import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('accepted edit notification uses the shared RU/EN translation catalog', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const english = await readFile('src/lib/i18n/locales/en/notifications.js', 'utf8');
  const russian = await readFile('src/lib/i18n/locales/ru/index.js', 'utf8');

  assert.match(editor, /notificationCenter\.push\(\{\s*title:\s*t\('notifications\.saved'\),\s*message:\s*t\('notifications\.savedMessage'\),\s*type:\s*'success'/s);
  assert.match(editor, /projectId:\s*project\.id/);
  assert.doesNotMatch(editor, /title:\s*'Edit saved'|message:\s*'Your accepted result has been added to project history\.'/);

  assert.match(english, /saved: 'Edit saved'/);
  assert.match(russian, /saved: 'Изменение сохранено'/);
  assert.match(english, /savedMessage:\s*'Your accepted result has been added to project history\.'/);
  assert.match(russian, /savedMessage:\s*'Принятый результат добавлен в историю проекта\.'/);
});

test('Project favorite tooltips reuse the shared RU/EN Project labels', async () => {
  const card = await readFile('src/components/projects/ProjectCard.jsx', 'utf8');
  const english = await readFile('src/lib/i18n/locales/en/index.js', 'utf8');
  const russian = await readFile('src/lib/i18n/locales/ru/index.js', 'utf8');

  assert.match(card, /title=\{project\.favorite \? t\('projectUi\.removeFavorite'\) : t\('projectUi\.addFavorite'\)\}/);
  assert.doesNotMatch(card, /title=\{project\.favorite \? "Remove from favorites"/);
  assert.match(english, /"removeFavorite": "Remove from favorites"/);
  assert.match(english, /"addFavorite": "Add to favorites"/);
  assert.match(russian, /"removeFavorite": "Убрать из избранного"/);
  assert.match(russian, /"addFavorite": "В избранное"/);
});
