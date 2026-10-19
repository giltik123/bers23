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
];

test('Russian locale covers auth, projects and navigation with English counterparts', async () => {
  const english = await readFile('src/lib/i18n/locales/en/index.js', 'utf8');
  for (const namespace of ['authUi', 'projectUi', 'navUi', 'assetUi']) {
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
    for (const match of source.matchAll(/\bt\(['"]((?:authUi|projectUi|navUi|assetUi)\.\w+)['"]/gu)) {
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
