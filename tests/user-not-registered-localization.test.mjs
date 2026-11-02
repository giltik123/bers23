import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('unregistered access state is localized in Russian and English without gaining auth authority', async () => {
  const [component, english, russian] = await Promise.all([
    readFile('src/components/UserNotRegisteredError.jsx', 'utf8'),
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  const englishAuth = english.slice(english.indexOf('authUi:'));
  const russianAuth = russian.slice(russian.indexOf('authUi:'));

  const keys = [
    'accessRestricted',
    'accessRestrictedMessage',
    'accessRestrictedHint',
    'verifyAccount',
    'contactAdministrator',
    'signOutAndBackIn',
  ];
  for (const key of keys) {
    assert.ok(component.includes('authUi.' + key), 'component key missing: ' + key);
    assert.ok(englishAuth.includes('"' + key + '"'), 'English authUi key missing: ' + key);
    assert.ok(russianAuth.includes('"' + key + '"'), 'Russian authUi key missing: ' + key);
  }

  assert.match(component, /useTranslation/);
  assert.doesNotMatch(component, /coreClient|localStorage|fetch\(/);
});
