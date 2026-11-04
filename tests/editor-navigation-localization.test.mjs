import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import english from '../src/lib/i18n/locales/en/index.js';
import russian from '../src/lib/i18n/locales/ru/index.js';

const MODE_IDS = Object.freeze(['ai', 'fashion', 'local', 'prompt', 'creative', 'recipes', 'agent']);
const SHARED_LABEL_KEYS = Object.freeze(['modes', 'methods', 'what', 'chooseMethod', 'more', 'additionalTools']);

test('Editor navigation has complete non-empty RU and EN labels and descriptions', () => {
  for (const [localeName, locale] of Object.entries({ english, russian })) {
    for (const id of MODE_IDS) {
      const entry = locale.editorUi?.tabs?.[id];
      assert.ok(entry, `${localeName} editorUi.tabs.${id} must exist`);
      assert.equal(typeof entry.label, 'string', `${localeName} ${id} label must be text`);
      assert.ok(entry.label.trim(), `${localeName} ${id} label must not be empty`);
      assert.equal(typeof entry.description, 'string', `${localeName} ${id} description must be text`);
      assert.ok(entry.description.trim(), `${localeName} ${id} description must not be empty`);
    }

    for (const key of SHARED_LABEL_KEYS) {
      assert.equal(typeof locale.editorUi?.[key], 'string', `${localeName} editorUi.${key} must be text`);
      assert.ok(locale.editorUi[key].trim(), `${localeName} editorUi.${key} must not be empty`);
    }
  }
});

test('AdaptiveNavigation resolves labels, descriptions and accessible headings through the same locale keys', async () => {
  const source = await readFile('src/components/adaptive/AdaptiveNavigation.jsx', 'utf8');

  assert.match(source, /const tabLabel = \(item\) => t\(`editorUi\.tabs\.\$\{item\.id\}\.label`\);/);
  assert.match(source, /\{t\('editorUi\.modes'\)\}/);
  assert.match(source, /\{t\('editorUi\.methods'\)\}/);
  assert.match(source, /\{t\('editorUi\.what'\)\}/);
  assert.match(source, /aria-label=\{t\('editorUi\.chooseMethod'\)\}/);
  assert.match(source, /\{t\('editorUi\.more'\)\}/);
  assert.match(source, /aria-label=\{t\('editorUi\.additionalTools'\)\}/);
  assert.doesNotMatch(source, /language === 'ru' \? 'Ещё' : 'More'/);
  assert.doesNotMatch(source, /Дополнительные инструменты|Additional tools/);
  assert.match(source, /\{t\(`editorUi\.tabs\.\$\{current\.id\}\.description`\)\}/);
  assert.doesNotMatch(source, /language === 'ru' \? t\(`editorUi\.tabs\./);
});
