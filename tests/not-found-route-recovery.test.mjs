import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('unknown routes render a public, accessible recovery without a second Auth authority', async () => {
  const [app, page] = await Promise.all([
    read('src/App.jsx'),
    read('src/lib/PageNotFound.jsx'),
  ]);
  assert.match(app, /<Route path="\*" element=\{<PageNotFound \/>\} \/>/);
  assert.match(page, /<main className=/);
  assert.match(page, /aria-labelledby="not-found-title"/);
  assert.match(page, /<h1 id="not-found-title"/);
  assert.match(page, /<Link\s+to="\/"/);
  assert.doesNotMatch(page, /coreClient|useQuery|auth\.me|isAuthenticated|role === ['"]admin['"]/);
  assert.doesNotMatch(page, /window\.location|AI hasn't implemented|Ask it to implement/);
  assert.doesNotMatch(page, /location\.pathname|pageName/);
});

test('404 content is localized for English and Russian with the same keys', async () => {
  const [page, en, ru] = await Promise.all([
    read('src/lib/PageNotFound.jsx'),
    read('src/lib/i18n/locales/en/index.js'),
    read('src/lib/i18n/locales/ru/index.js'),
  ]);
  for (const key of ['title', 'hint', 'backToProjects']) {
    assert.match(page, new RegExp("t\\('notFoundUi\\." + key + "'\\)"));
    assert.match(en, new RegExp('notFoundUi:[^\\n]*\\b' + key + ':'));
    assert.match(ru, new RegExp('notFoundUi:[^\\n]*\\b' + key + ':'));
  }
  assert.match(en, /Page not found/);
  assert.match(ru, /Страница не найдена/);
  assert.match(en, /Your projects and edits have not been changed/);
  assert.match(ru, /Ваши проекты и правки не изменились/);
});
