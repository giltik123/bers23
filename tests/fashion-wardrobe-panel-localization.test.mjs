import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GARMENT_CATEGORIES } from '../src/lib/fashion/garmentCategories.js';


const PANEL = 'src/components/editor/fashion/FashionPanel.jsx';

function extractObject(source, property) {
  const marker = source.indexOf(`${property}: {`);
  assert.notEqual(marker, -1, `locale must contain ${property}`);
  const start = source.indexOf('{', marker);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${property} locale object`);
}

function parseLocaleObject(source, property) {
  const objectSource = extractObject(source, property).replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(objectSource);
}

function leafPaths(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? leafPaths(child, path)
      : [path];
  }).sort();
}

test('canonical Wardrobe panel copy is driven by the selected RU/EN locale', async () => {
  const source = await readFile(PANEL, 'utf8');
  assert.doesNotMatch(source, /language\s*===\s*['"]ru['"]/);
  assert.match(source, /plural\('fashionUi\.views'/);
  assert.match(source, /fashionUi\.categories\.\$\{category\?\.id/);
  assert.match(source, /fashionUi\.seasons\.\$\{item\.season\}/);
  assert.match(source, /fashionUi\.voiceSearchSummary/);
  assert.match(source, /fashionUi\.voiceSearchNoMatches/);
  assert.match(source, /t\(error\.key\)/);
  for (const hardcoded of [
    'Canonical fashion wardrobe',
    'Loading canonical wardrobe…',
    'No managed garments yet.',
    'Голосовой поиск:',
    'Проверьте категорию или цвет.',
  ]) {
    assert.equal(source.includes(hardcoded), false, `Wardrobe panel must not hardcode ${hardcoded}`);
  }
});

test('RU and EN Wardrobe dictionaries have exact nested key parity and complete taxonomy coverage', async () => {
  const [enSource, ruSource] = await Promise.all([
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  const en = parseLocaleObject(enSource, 'fashionUi');
  const ru = parseLocaleObject(ruSource, 'fashionUi');
  assert.deepEqual(leafPaths(en), leafPaths(ru));
  assert.deepEqual(
    Object.keys(en.fashionUi.categories).sort(),
    GARMENT_CATEGORIES.map(category => category.id).sort(),
  );
  assert.deepEqual(
    Object.keys(en.fashionUi.seasons).sort(),
    ['all_season', 'autumn', 'spring', 'summer', 'winter'],
  );
  assert.deepEqual(Object.keys(en.fashionUi.views).sort(), ['few', 'many', 'one', 'other']);
  assert.deepEqual(Object.keys(ru.fashionUi.views).sort(), ['few', 'many', 'one', 'other']);
  for (const [key, value] of Object.entries(en.fashionUi.categories)) {
    assert.ok(value.trim(), `English category ${key} must not be empty`);
    assert.ok(ru.fashionUi.categories[key].trim(), `Russian category ${key} must not be empty`);
  }
});
