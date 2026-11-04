import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { localizationValidator } from '../src/lib/i18n/LocalizationValidator.js';

const read = (file) => readFile(file, 'utf8');

function extractObjectLiteral(source, key) {
  const marker = new RegExp(`(?:^|\\n)\\s*${key}:\\s*\\{`, 'm');
  const match = marker.exec(source);
  assert.ok(match, `locale pack must define ${key}`);
  const start = source.indexOf('{', match.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(start, index + 1).replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(literal);
      }
    }
  }
  throw new Error(`unterminated locale object: ${key}`);
}

test('main editor exposes three primary modes and keeps advanced tools in More', async () => {
  const editor = await read('src/pages/Editor.jsx');
  const navigation = await read('src/components/adaptive/AdaptiveNavigation.jsx');
  assert.match(editor, /const EDITOR_TABS = \[/);
  const modes = editor.split('const EDITOR_TABS = [')[1].split('];')[0];
  assert.deepEqual([...modes.matchAll(/id: '([^']+)'/g)].map((match) => match[1]), ['ai', 'fashion', 'local']);
  assert.match(editor, /const EDITOR_EXTRA_TABS = \[/);
  assert.match(editor, /extraItems=\{EDITOR_EXTRA_TABS\}/);
  assert.match(editor, /editTab === 'fashion' \? \(/);
  assert.match(navigation, /aria-expanded=\{moreOpen\}/);
  assert.match(navigation, /onChange\(item\.id\)/);
});

test('wardrobe lives on its own protected route and is reachable from try-on', async () => {
  const [app, editor, wardrobe] = await Promise.all([
    read('src/App.jsx'), read('src/pages/Editor.jsx'), read('src/pages/Wardrobe.jsx'),
  ]);
  assert.match(app, /<Route path="\/wardrobe" element=\{<Wardrobe \/>\} \/>/);
  assert.match(editor, /\/wardrobe\?project=/);
  assert.match(editor, /onOpenWardrobe=\{\(\) => openWardrobe\(\)\}/);
  assert.match(wardrobe, /<FashionPanel voiceQuery=\{voiceQuery\} \/>/);
  assert.doesNotMatch(editor, /<FashionPanel/);
});

test('mode change remains blocked during canonical running operations', async () => {
  const editor = await read('src/pages/Editor.jsx');
  assert.match(editor, /if \(!tryOnActive && !agentActive\) setEditTab\(next\)/);
  assert.match(editor, /<CanonicalTryOnRunnerPanel/);
  assert.match(editor, /<AICommandStudio/);
  assert.match(editor, /<LocalAdjustmentsPanel/);
});


test('Editor navigation resolves every visible mode through the shared RU/EN locale pack', async () => {
  const [englishSource, russianSource, editor, navigation] = await Promise.all([
    read('src/lib/i18n/locales/en/index.js'),
    read('src/lib/i18n/locales/ru/index.js'),
    read('src/pages/Editor.jsx'),
    read('src/components/adaptive/AdaptiveNavigation.jsx'),
  ]);
  const english = extractObjectLiteral(englishSource, 'editorUi');
  const russian = extractObjectLiteral(russianSource, 'editorUi');
  const parity = localizationValidator.validate(english, russian);
  assert.deepEqual(parity.missing, []);
  assert.deepEqual(parity.brokenPlaceholders, []);

  const primaryIds = ['ai', 'fashion', 'local'];
  const secondaryIds = ['prompt', 'creative', 'recipes', 'agent'];
  for (const id of [...primaryIds, ...secondaryIds]) {
    for (const [locale, pack] of [['en', english], ['ru', russian]]) {
      assert.ok(pack.tabs?.[id]?.label?.trim(), `${locale} ${id} label is required`);
      assert.ok(pack.tabs?.[id]?.description?.trim(), `${locale} ${id} description is required`);
    }
  }

  const primary = editor.split('const EDITOR_TABS = [')[1].split('];')[0];
  const secondary = editor.split('const EDITOR_EXTRA_TABS = [')[1].split('];')[0];
  assert.deepEqual([...primary.matchAll(/id: '([^']+)'/g)].map((match) => match[1]), primaryIds);
  assert.deepEqual([...secondary.matchAll(/id: '([^']+)'/g)].map((match) => match[1]), secondaryIds);
  assert.doesNotMatch(primary + secondary, /label:|description:/);

  assert.match(navigation, /const tabLabel = \(item\) => t\(\`editorUi\.tabs\.\$\{item\.id\}\.label\`\)/);
  assert.match(navigation, /\{t\(\`editorUi\.tabs\.\$\{current\.id\}\.description\`\)\}/);
  for (const key of ['modes', 'methods', 'what', 'chooseMethod', 'moreTools']) {
    assert.ok(navigation.includes(`t('editorUi.${key}')`), `navigation must use editorUi.${key}`);
  }
  assert.doesNotMatch(navigation, /language === 'ru'/);
});
