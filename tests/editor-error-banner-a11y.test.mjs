import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('Editor error banner announces failures and uses localized explicit retry', async () => {
  const [banner, english, russian] = await Promise.all([
    read('src/components/editor/ErrorBanner.jsx'),
    read('src/lib/i18n/locales/en/common.js'),
    read('src/lib/i18n/locales/ru/index.js'),
  ]);

  assert.match(banner, /role="alert"/);
  assert.match(banner, /const \{ t \} = useTranslation\(\);/);
  assert.match(banner, /t\('common\.retry'\)/);
  assert.match(banner, /<Button type="button"/);
  assert.equal((banner.match(/aria-hidden="true"/g) || []).length, 2, 'decorative icons must be hidden from assistive technology');
  assert.match(english, /retry:/);
  assert.match(russian, /retry:/);
  assert.doesNotMatch(banner, /coreClient|fetch\(|localStorage|sessionStorage|credit/i);
});
