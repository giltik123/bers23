import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import russian from '../src/lib/i18n/locales/ru/index.js';

const critical = [
  'src/components/AuthLayout.jsx',
  'src/pages/Login.jsx',
  'src/pages/Register.jsx',
  'src/pages/ForgotPassword.jsx',
  'src/pages/ResetPassword.jsx',
  'src/components/AppLayout.jsx',
  'src/pages/Projects.jsx',
  'src/components/projects/ProjectToolbar.jsx',
  'src/components/projects/ProjectCard.jsx',
  'src/components/projects/ProjectActionsMenu.jsx',
  'src/pages/AssetLibrary.jsx',
  'src/components/editor/scene/SceneMemoryPanel.jsx',
  'src/components/editor/scene/ConsistencyWarning.jsx',
];

test('Russian locale covers auth, projects and navigation with English counterparts', async () => {
  const english = await readFile('src/lib/i18n/locales/en/index.js', 'utf8');
  for (const namespace of ['authUi', 'projectUi', 'navUi', 'assetUi', 'sceneUi']) {
    const values = russian[namespace];
    assert.ok(values && Object.keys(values).length >= 10, namespace + ' must be translated');
    assert.ok(english.includes(namespace + ': {'), namespace + ' needs an English module');
    for (const [key, text] of Object.entries(values)) {
      assert.equal(typeof text, 'string', namespace + '.' + key + ' must be plain text');
      assert.ok(text.trim().length > 0, namespace + '.' + key + ' must not be empty');
      assert.ok(english.includes('"' + key + '":'), namespace + '.' + key + ' needs English text');
    }
  }
  assert.match(russian.projectUi.newProject, /Новый проект/);
  assert.match(russian.authUi.login, /Войти/);
  assert.match(russian.navUi.projects, /Проекты/);
});

test('key user journeys use live translation without bypassing canonical Project API', async () => {
  for (const path of critical) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /useTranslation/, path + ' must use the locale context');
    for (const match of source.matchAll(/\bt\(['"]((?:authUi|projectUi|navUi|assetUi|sceneUi)\.\w+)['"]/gu)) {
      const [namespace, key] = match[1].split('.');
      assert.ok(russian[namespace]?.[key], path + ' references missing Russian key ' + match[1]);
    }
  }
  const auth = await readFile('src/components/AuthLayout.jsx', 'utf8');
  assert.ok(auth.includes('<LanguageSwitcher />'), 'locale selection must work before login');
  const projects = await readFile('src/pages/Projects.jsx', 'utf8');
  assert.ok(projects.includes('projectService.createFromFile(file)'), 'canonical project creation is preserved');
  assert.match(projects, /navigate\(/, 'successful upload must navigate to Editor');
});

test('language selection never changes user images or AI prompts', async () => {
  const manager = await readFile('src/lib/i18n/LocalizationManager.js', 'utf8');
  assert.ok(manager.includes('languageStorage.set(code)'));
  assert.ok(manager.includes('rtlManager.apply(code)'));
  assert.doesNotMatch(manager, /coreClient|projectService|\/auth\/password\/login/);
});


test('Russian editor, preview and Try-On keep explicit review and controlled actions', async () => {
  for (const namespace of ['editorUi', 'editControls', 'fashionUi']) {
    assert.ok(russian[namespace] && Object.keys(russian[namespace]).length >= 10, namespace + ' translations missing');
  }
  assert.equal(russian.editorUi.tabs.outfits.label, 'Образы и примерка');
  assert.equal(russian.editControls.accept, 'Принять');
  assert.equal(russian.editControls.discard, 'Отклонить');
  const [editor, navigation, history, compare, wardrobe, runner] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/adaptive/AdaptiveNavigation.jsx', 'utf8'),
    readFile('src/components/editor/HistoryControls.jsx', 'utf8'),
    readFile('src/components/editor/ResultCompare.jsx', 'utf8'),
    readFile('src/components/editor/fashion/FashionPanel.jsx', 'utf8'),
    readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8'),
  ]);
  assert.match(navigation, /editorUi\.tabs\./);
  assert.match(editor, /<AdaptiveNavigation items=\{EDITOR_TABS\}/);
  assert.match(history, /window\.confirm\(t\('editControls\.restoreConfirm'\)\)/);
  assert.match(compare, /onClick=\{onAccept\} disabled=\{busy \|\| reviewBlocked\}/);
  assert.match(compare, /editControls\.accept/);
  assert.match(compare, /editControls\.discard/);
  assert.match(wardrobe, /fashionUi\.addGarment/);
  assert.match(runner, /fashionUi\.refreshError/);
  assert.match(runner, /setSelectedEntryId\(''\)/, 'failed or changed outfit must invalidate a stale item');
  assert.doesNotMatch(navigation, /coreClient\./, 'translation must never start creative execution');
});

test('Scene Memory and consistency warnings are localized without claiming canonical scene authority', async () => {
  const [scene, warning, memory, styleLock, english] = await Promise.all([
    readFile('src/components/editor/scene/SceneMemoryPanel.jsx', 'utf8'),
    readFile('src/components/editor/scene/ConsistencyWarning.jsx', 'utf8'),
    readFile('src/lib/scene/sceneMemory.js', 'utf8'),
    readFile('src/lib/scene/styleLock.js', 'utf8'),
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
  ]);
  const englishBlock = english.match(/sceneUi: \{([\s\S]*?)\n  \},/u)?.[1];
  assert.ok(englishBlock, 'English sceneUi catalog must exist');
  assert.ok(russian.sceneUi && Object.keys(russian.sceneUi).length >= 20);
  for (const [key, value] of Object.entries(russian.sceneUi)) {
    assert.equal(typeof value, 'string', 'sceneUi.' + key + ' must be plain text');
    assert.ok(value.trim(), 'sceneUi.' + key + ' must not be empty');
    assert.match(englishBlock, new RegExp('"' + key + '"\\s*:'));
  }
  const referenced = new Set();
  for (const source of [scene, warning]) {
    for (const match of source.matchAll(/'sceneUi\.([A-Za-z0-9]+)'/g)) referenced.add(match[1]);
  }
  for (const key of referenced) assert.ok(russian.sceneUi[key], 'sceneUi.' + key + ' must be translated');
  assert.match(scene, /aria-expanded=\{open\}/);
  assert.match(scene, /aria-controls=\{panelId\}/);
  assert.match(scene, /setLocked\(styleLock\.isEnabled\(project\.id\)\), \[project\.id\]\)/);
  assert.match(scene, /sceneUi\.advisoryNotice/);
  assert.match(memory, /authority: 'BROWSER_ADVISORY'/);
  assert.match(memory, /SCENE_MEMORY_ANALYSIS_NOT_WIRED/);
  assert.match(styleLock, /localStorage/);
  assert.match(warning, /WARNING_LABEL_KEYS\[warning\.category\]/);
  assert.doesNotMatch(warning, /warning\.message/);
  assert.match(warning, /role="alert"/);
  assert.doesNotMatch(scene, /Scene Memory|Style Lock|Drift risk|Consistent|Scene fingerprint/);
  assert.doesNotMatch(warning, /Scene consistency warning|Auto-correct|Continue anyway/);
});
