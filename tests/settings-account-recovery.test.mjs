import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Settings uses only canonical Auth context and exposes recoverable failures', async () => {
  const ui = await readFile('src/pages/Settings.jsx', 'utf8');
  assert.match(ui, /await coreClient\.auth\.me\(\)/);
  assert.match(ui, /request !== requestId\.current/);
  assert.match(ui, /request === requestId\.current/);
  assert.match(ui, /return \(\) => \{ requestId\.current\+\+; \}/);
  assert.match(ui, /account\.status === 'error'/);
  assert.match(ui, /role="alert"/);
  assert.match(ui, /onClick=\{loadAccount\}/);
  assert.match(ui, /setAccount\(\{ status: 'loading', email: '' \}\)/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|\.entities\.|\/data\/|setUser\(/);
});

test('Settings never assumes sign-out succeeded before Core confirms it', async () => {
  const ui = await readFile('src/pages/Settings.jsx', 'utf8');
  assert.match(ui, /await coreClient\.auth\.logout\('\/'\)/);
  assert.match(ui, /catch \{\s*setSignOutFailed\(true\);/);
  assert.match(ui, /disabled=\{signingOut\}/);
  assert.match(ui, /settings\.signOutFailed/);
  assert.doesNotMatch(ui, /window\.location\.(?:assign|replace)|localStorage\.clear/);
});

test('Settings recovery messages are translated in English and Russian', async () => {
  const [en, ru] = await Promise.all([
    readFile('src/lib/i18n/locales/en/settings.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  for (const key of ['accountLoadFailed', 'signingOut', 'signOutFailed']) {
    assert.match(en, new RegExp(key + ':'));
    assert.match(ru, new RegExp(key + ':'));
  }
});
