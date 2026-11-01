import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function geometryCopy(source) {
  const marker = '  editorGeometry: ';
  const start = source.indexOf(marker);
  const end = source.indexOf('\n  authUi: {', start);
  assert.ok(start >= 0 && end > start, 'geometry copy must be in the canonical locale pack');
  return JSON.parse(source.slice(start + marker.length, end).trim().replace(/,$/, ''));
}

test('Crop and Resize share complete English/Russian translation keys and placeholders', async () => {
  const [en, ru] = await Promise.all(['en', 'ru'].map(lang => readFile('src/lib/i18n/locales/' + lang + '/index.js', 'utf8')));
  const [english, russian] = [geometryCopy(en), geometryCopy(ru)];
  assert.deepEqual(Object.keys(english).sort(), Object.keys(russian).sort());
  for (const key of Object.keys(english)) {
    assert.ok(typeof english[key] === 'string' && english[key].trim(), key);
    assert.ok(typeof russian[key] === 'string' && russian[key].trim(), key);
    const placeholders = copy => [...copy.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(english[key]), placeholders(russian[key]), key);
  }
  assert.equal(english.startCrop, 'Start crop');
  assert.equal(english.applyResize, 'Apply resize');
  assert.equal(russian.startCrop, 'Начать кадрирование');
  assert.equal(russian.applyResize, 'Применить размер');
});

test('Rotate and Flip use the same locale authority while preserving exact mode identities', async () => {
  const source = await readFile('src/components/editor/OrthogonalTransformToolbar.jsx', 'utf8');
  const modes = ['FLIP_HORIZONTAL', 'FLIP_VERTICAL', 'ROTATE_90_CW', 'ROTATE_180', 'ROTATE_270_CW'];
  assert.match(source, /useTranslation\(\)/);
  for (const mode of modes) assert.ok(source.includes(mode + ':'), mode);
  assert.match(source, /editorGeometry\.rotateFlipControls/);
  assert.match(source, /editorGeometry\.transformApplying/);
  assert.match(source, /data-transform-mode=\{mode\}/);
  assert.match(source, /disabled=\{unavailable\}/);
});

test('Geometry controls retain canonical Preview/Accept boundaries and localized accessibility', async () => {
  const [crop, resize] = await Promise.all(['Crop', 'Resize'].map(name => readFile('src/components/editor/' + name + 'Toolbar.jsx', 'utf8')));
  for (const [source, name] of [[crop, 'crop'], [resize, 'resize']]) {
    assert.match(source, /useTranslation\(\)/);
    const title = name[0].toUpperCase() + name.slice(1);
    for (const key of [name, name + 'Controls', 'start' + title, 'cancel' + title, 'apply' + title, name + 'Field']) {
      assert.ok(source.includes('editorGeometry.' + key), key);
    }
    assert.match(source, /disabled=\{busy \|\| !valid\}/);
    assert.match(source, /onClick=\{onApply\}/);
    assert.match(source, /onClick=\{onCancel\}/);
    assert.match(source, /aria-invalid=\{!valid\}/);
    assert.doesNotMatch(source, /coreClient|fetch\(|provider|creditsWallet/);
  }
  assert.match(resize, /Intl.NumberFormat\(language\)/);
  assert.match(resize, /RESIZE_MAX_OUTPUT_PIXELS/);
  assert.match(resize, /onAspectLockedChange\(event.target.checked\)/);
  assert.match(crop, /onChange\(\{ \.\.\.draft, \[key\]: value \}\)/);
});
