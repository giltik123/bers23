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

  assert.match(english, /savedMessage:\s*'Your accepted result has been added to project history\.'/);
  assert.match(russian, /savedMessage:\s*'Принятый результат добавлен в историю проекта\.'/);
});
