import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const skipLinkClass = /sr-only focus:not-sr-only focus:fixed/;

test('authenticated and authentication layouts provide a localized skip link to a focusable main landmark', async () => {
  const [app, auth, english, russian] = await Promise.all([
    read('src/components/AppLayout.jsx'),
    read('src/components/AuthLayout.jsx'),
    read('src/lib/i18n/locales/en/index.js'),
    read('src/lib/i18n/locales/ru/index.js'),
  ]);

  for (const [name, layout] of [['authenticated', app], ['authentication', auth]]) {
    assert.match(layout, /<a href="#main-content"/i, name + ' layout must expose the skip link');
    assert.match(layout, /t\('navUi\.skipToMain'\)/, name + ' layout must use the shared locale key');
    assert.match(layout, /<main id="main-content" tabIndex=\{-1\}/, name + ' main landmark must accept fragment focus');
    assert.match(layout, skipLinkClass, name + ' skip link must be visually hidden until focused');
  }

  assert.match(english, /"skipToMain":\s*"Skip to main content"/);
  assert.match(russian, /"skipToMain":\s*"Перейти к основному содержимому"/);
});
