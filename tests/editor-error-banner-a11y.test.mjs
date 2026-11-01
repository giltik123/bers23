import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Editor error messages are announced and Retry follows the shared language', async () => {
  const [banner, en, ru] = await Promise.all([
    readFile('src/components/editor/ErrorBanner.jsx', 'utf8'),
    readFile('src/lib/i18n/locales/en/common.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  assert.match(banner, /role="alert"/u);
  assert.match(banner, /useTranslation\(\)/u);
  assert.match(banner, /\{t\('common\.retry'\)\}/u);
  assert.match(en, /retry:\s*'Retry'/u);
  assert.match(ru, /retry:\s*'Повторить'/u);
  assert.match(banner, /if \(!message\) return null;/u);
  assert.match(banner, /\{onRetry && \(/u);
  assert.match(banner, /<Button type="button" variant="outline" size="sm" onClick=\{onRetry\}/u);
  assert.doesNotMatch(banner, /> Retry/u);
  for (const forbidden of ['coreClient', 'fetch(', 'localStorage', 'chargeCredits']) {
    assert.equal(banner.includes(forbidden), false, 'Error display must not acquire authority: ' + forbidden);
  }
});
