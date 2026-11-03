import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { localizationValidator } from '../src/lib/i18n/LocalizationValidator.js';

const COVERED_MODULES = Object.freeze([
  'common',
  'editor',
  'notifications',
  'assets',
  'notFoundUi',
  'authUi',
  'projectUi',
  'navUi',
  'editorUi',
  'editControls',
  'fashionUi',
  'assetUi',
]);

async function loadLocaleModules(entryPoint) {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
  });
  const source = result.outputFiles[0]?.text;
  assert.equal(typeof source, 'string', `could not bundle locale entry: ${entryPoint}`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const loaded = await import(url);
  assert.ok(loaded.modules && typeof loaded.modules === 'object', `locale has no named modules export: ${entryPoint}`);
  return loaded.modules;
}

const [english, russian] = await Promise.all([
  loadLocaleModules('src/lib/i18n/locales/en/index.js'),
  loadLocaleModules('src/lib/i18n/locales/ru/index.js'),
]);

function selectCoveredModules(pack) {
  return Object.fromEntries(COVERED_MODULES.map((name) => {
    assert.ok(pack[name] && typeof pack[name] === 'object', `locale is missing covered module ${name}`);
    return [name, pack[name]];
  }));
}

test('core RU/EN creative journey keeps reference keys and interpolation placeholders aligned', () => {
  for (const [locale, pack] of [['English', english], ['Russian', russian]]) {
    assert.equal(typeof pack.common.loading, 'string', `${locale} common.loading must exist`);
    assert.ok(pack.common.loading.trim().length > 0, `${locale} common.loading must not be empty`);
  }

  const report = localizationValidator.validate(
    selectCoveredModules(english),
    selectCoveredModules(russian),
  );

  assert.deepEqual(report.missing, [], 'Russian pack must define every covered English reference key');
  assert.deepEqual(report.brokenPlaceholders, [], 'Russian copy must preserve every interpolation placeholder');

  const russianLeaves = localizationValidator.flatten(selectCoveredModules(russian));
  for (const [key, value] of Object.entries(russianLeaves)) {
    assert.equal(typeof value, 'string', `Russian ${key} must be a string`);
    assert.ok(value.trim().length > 0, `Russian ${key} must not be empty`);
  }
});
