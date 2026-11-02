import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('BERS navigation names every destination and shows the current section', async () => {
  const app = await read('src/components/AppLayout.jsx');
  for (const route of ["/", "/assets", "/automations", "/settings"]) {
    assert.ok(app.includes("path: '" + route + "'"), 'navigation route missing: ' + route);
  }
  assert.doesNotMatch(app, /path: '\/subscription'/);
  assert.match(app, /function NavLink\(\{ path, label, icon: Icon, active/);
  assert.match(app, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(app, /navUi\.main/);
  assert.match(app, /navUi\.closeMenu/);
  assert.match(app, /aria-expanded=\{menuOpen\}/);
  assert.match(app, /navUi\.mobile/);
  assert.match(app, /onNavigate=\{\(\) => setMenuOpen\(false\)\}/);
  assert.match(app, /<ThemeToggle showLabel \/>/);
  assert.match(app, /<NotificationCenter \/>/);
  assert.doesNotMatch(app, /aria-label=\{t\('billing.subscription'\)\}>\s*<CreditCard/);
});

test('top utility actions have visible labels, correct semantics and outside-click dismissal', async () => {
  const [notifications, theme] = await Promise.all([read('src/components/NotificationCenter.jsx'), read('src/components/ThemeToggle.jsx')]);
  assert.match(notifications, /notifications\.title/);
  assert.match(notifications, /aria-expanded=\{open\}/);
  assert.match(notifications, /document\.addEventListener\('keydown', closeOnEscape\)/);
  assert.match(notifications, /document\.addEventListener\('pointerdown', closeOnOutsideClick\)/);
  assert.match(notifications, /notificationCenter\.markRead\(item\.id\)/);
  assert.match(theme, /showLabel = false/);
  assert.match(theme, /navUi\.toLight/);
  assert.match(theme, /settings\.appearance/);
  assert.match(theme, /document\.documentElement\.classList\.toggle\('dark', dark\)/);
  assert.match(theme, /window\.addEventListener\('bers-theme-change', synchronize\)/);
  assert.match(theme, /window\.dispatchEvent\(new CustomEvent\('bers-theme-change'/);
});

test('Editor uses a spacious canvas-led workspace and explanatory editing modes', async () => {
  const [editor, navigation] = await Promise.all([read('src/pages/Editor.jsx'), read('src/components/adaptive/AdaptiveNavigation.jsx')]);
  assert.match(editor, /aria-label="Image canvas"/);
  assert.match(editor, /aria-label="Editing controls"/);
  assert.match(editor, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(19rem,23rem\)\]/);
  assert.ok(editor.indexOf('<ImageCanvas') < editor.indexOf('aria-label="Image tools"'));
  assert.match(editor, /<AdaptiveNavigation items=\{EDITOR_TABS\} active=\{editTab\}/);
  assert.match(editor, /description: 'Describe what you want to change/);
  assert.match(navigation, /What would you like to do\?/);
  assert.match(navigation, /aria-pressed=\{active === item\.id\}/);
  assert.match(navigation, /onClick=\{\(\) => onChange\(item\.id\)\}/);
  assert.match(navigation, /current\?\.description/);
  assert.match(editor, /aria-label="Rename project"/);
  assert.match(editor, /View full-size image in a new tab/);
  assert.doesNotMatch(editor, /aria-label="Download"/, 'opening an image in a tab must not claim a file download');
});

test('Editor undo/redo/versions are labeled actions with a confirmed restore', async () => {
  const [history, versions] = await Promise.all([read('src/components/editor/HistoryControls.jsx'), read('src/components/editor/VersionsPanel.jsx')]);
  assert.match(history, /editControls\.undo/);
  assert.match(history, /editControls\.redo/);
  assert.match(history, /window\.confirm\(t\('editControls\.restoreConfirm'\)\)/);
  assert.match(history, /onClick=\{confirmRestore\}/);
  assert.match(versions, /aria-label=\{t\('editControls\.versions'\)\}/);
  assert.match(versions, /editControls\.versions/);
  assert.match(versions, /onClick=\{onCreate\}/);
  assert.match(versions, /onClick=\{\(\) => onRestore\(v\)\}/);
});

test('the text tool previews first; only Accept commits the result', async () => {
  const [editor, prompt, compare] = await Promise.all([read('src/pages/Editor.jsx'), read('src/components/editor/InstructionBar.jsx'), read('src/components/editor/ResultCompare.jsx')]);
  assert.match(prompt, /onClick=\{onApply\}/);
  assert.match(prompt, /aria-label=\{t\('editControls\.preview'\)\}/);
  assert.match(prompt, /editControls\.previewHint/);
  assert.match(compare, /Preview ready — not saved yet/);
  for (const [label, action] of [['Accept','onAccept'], ['Retry','onRetry'], ['Discard','onDiscard']]) {
    assert.match(compare, new RegExp('onClick=\\{' + action + '\\}[^>]*>[\\s\\S]*?' + label));
  }
  assert.match(compare, /aria-pressed=\{mode === 'before'\}/);
  assert.match(compare, /geometry === 'aligned' && canCompareOperationAligned\(candidateOperation\)/);
  assert.match(editor, /<ResultCompare[\s\S]*?onAccept=\{acceptResult\}[\s\S]*?onDiscard=\{discardResult\}/);
});

test('Projects and login use the same design and do not hide key actions behind hover', async () => {
  const [projects, cards, actions, auth, css] = await Promise.all([
    read('src/pages/Projects.jsx'),
    read('src/components/projects/ProjectCard.jsx'),
    read('src/components/projects/ProjectActionsMenu.jsx'),
    read('src/components/AuthLayout.jsx'),
    read('src/index.css'),
  ]);
  assert.match(projects, /navUi\.projects/);
  assert.match(projects, /onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/);
  assert.match(projects, /projectUi\.newProject/);
  assert.match(projects, /projectUi\.stepUpload/);
  assert.match(projects, /projectUi\.stepSave/);
  assert.match(cards, /projectUi\.openEditor/);
  assert.match(cards, /projectUi\.removeFavorite/);
  assert.match(cards, /projectUi\.removeFavorite/);
  assert.doesNotMatch(cards, /opacity-0 group-hover:opacity-100/);
  assert.match(actions, /projectUi\.options/);
  assert.match(auth, /authUi\.brand/);
  assert.match(auth, /<h1[^>]*>\{title\}<\/h1>/);
  assert.match(css, /--primary: 178 66% 27%/);
  assert.match(css, /--ring: 178 66% 27%/);
  assert.match(css, /color-scheme: dark/);
});



test('WorkspaceBar and saved-mask/object controls are localized in RU/EN without changing workspace or mask authority', async () => {
  const [workspaceBar, objectPanel, profiles, enWorkspace, ruIndex, enIndex] = await Promise.all([
    read('src/components/editor/workspace/WorkspaceBar.jsx'),
    read('src/components/editor/ObjectPanel.jsx'),
    read('src/lib/workspace/workspaceProfiles.js'),
    read('src/lib/i18n/locales/en/workspace.js'),
    read('src/lib/i18n/locales/ru/index.js'),
    read('src/lib/i18n/locales/en/index.js'),
  ]);

  assert.match(workspaceBar, /useTranslation/);
  assert.ok(workspaceBar.includes('workspace.profiles.'));
  assert.ok(workspaceBar.includes('workspaceManager.select(projectId, null)'));
  assert.ok(workspaceBar.includes('workspaceManager.select(projectId, w.id)'));
  assert.doesNotMatch(workspaceBar, /Auto-detected|Most used:|Favorite:|Avg edit|>Manual</);

  const profileIds = [...profiles.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);
  assert.equal(profileIds.length, 10, 'the existing adaptive workspace catalog remains the complete ten-profile set');
  for (const id of profileIds) {
    assert.ok(enWorkspace.includes(id + ": { name: '"), 'English workspace profile ' + id);
    assert.ok(ruIndex.includes(id + ": { name: '"), 'Russian workspace profile ' + id);
  }
  for (const key of ['listTitle', 'autoDetect', 'mostUsedWorkspace', 'favoriteWorkspace', 'averageEdit']) {
    assert.ok(enWorkspace.includes(key + ": '"), 'English workspace.' + key);
    assert.ok(ruIndex.includes(key + ": '"), 'Russian workspace.' + key);
  }

  assert.match(objectPanel, /useTranslation/);
  for (const key of ['sectionLabel', 'adjustmentHelp', 'guideHelp', 'showObjectOverlay', 'hideObjectOverlay']) {
    assert.ok(objectPanel.includes('editorUi.objectPanel.' + key), 'ObjectPanel uses ' + key);
  }
  assert.ok(objectPanel.includes('onToggleHidden(obj.id)'));
  assert.ok(objectPanel.includes('onSelect(obj.selected ? null : obj)'));
  const extractObjectPanel = (source) => {
    const start = source.indexOf('"objectPanel": {');
    const end = source.indexOf('\n  }\n},', start);
    assert.ok(start >= 0 && end > start, 'ObjectPanel locale block exists');
    return source.slice(start, end + 4);
  };
  const enObjectPanel = extractObjectPanel(enIndex);
  const ruObjectPanel = extractObjectPanel(ruIndex);
  const objectKeys = ['sectionLabel', 'heading', 'savedMaskCount', 'adjustmentHelp', 'guideHelp', 'objectGroup',
    'collapseObject', 'expandObject', 'deselectObject', 'selectObject', 'mask', 'savedMaskTitle',
    'showObjectOverlay', 'hideObjectOverlay', 'showSelectionFrame', 'hideSelectionFrame'];
  for (const key of objectKeys) {
    assert.ok(enObjectPanel.includes('"' + key + '": "'), 'English editorUi.objectPanel.' + key);
    assert.ok(ruObjectPanel.includes('"' + key + '": "'), 'Russian editorUi.objectPanel.' + key);
  }
  const placeholders = {
    heading: '{count}', savedMaskCount: '{count}', objectGroup: '{label}', collapseObject: '{label}',
    expandObject: '{label}', deselectObject: '{label}', selectObject: '{label}',
  };
  for (const [key, placeholder] of Object.entries(placeholders)) {
    const entry = '"' + key + '": "';
    const enValue = enObjectPanel.slice(enObjectPanel.indexOf(entry) + entry.length).split('"')[0];
    const ruValue = ruObjectPanel.slice(ruObjectPanel.indexOf(entry) + entry.length).split('"')[0];
    assert.ok(enValue.includes(placeholder), 'English placeholder for ' + key);
    assert.ok(ruValue.includes(placeholder), 'Russian placeholder for ' + key);
  }
});

test('object list actions are independent keyboard-reachable buttons, not clickable nonsemantic rows', async () => {
  const panel = await read('src/components/editor/ObjectPanel.jsx');
  assert.match(panel, /role="group"/);
  assert.match(panel, /aria-label=\{t\(obj\.selected \? 'editorUi\.objectPanel\.deselectObject' : 'editorUi\.objectPanel\.selectObject', \{ label: obj\.label \}\)\}/);
  assert.match(panel, /aria-pressed=\{Boolean\(obj\.selected\)\}/);
  assert.match(panel, /aria-label=\{t\(isHidden \? 'editorUi\.objectPanel\.showObjectOverlay' : 'editorUi\.objectPanel\.hideObjectOverlay'\)\}/);
  assert.match(panel, /aria-label=\{t\('editorUi\.objectPanel\.sectionLabel'\)\}/);
  assert.match(panel, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); onToggleHidden\(obj\.id\); \}\}/);
  assert.match(panel, /onClick=\{\(\) => onSelect\(obj\.selected \? null : obj\)\}/);
  assert.doesNotMatch(panel, /className=\{\x60flex items-center gap-2 px-2 py-1\.5 rounded-lg cursor-pointer/);
});


test('Free generation uses explicit consent, server-owned account setup and no billing navigation', async () => {
  const [app, layout, settings, studio, editor, plan, review] = await Promise.all([
    read('src/App.jsx'),
    read('src/components/AppLayout.jsx'),
    read('src/pages/Settings.jsx'),
    read('src/components/editor/ai/AICommandStudio.jsx'),
    read('src/pages/Editor.jsx'),
    read('src/components/editor/PlanPreview.jsx'),
    read('src/components/editor/ResultCompare.jsx'),
  ]);
  assert.ok(app.includes('path="/subscription" element={<Navigate to="/settings" replace />}'));
  assert.ok(app.includes('path="/billing" element={<Navigate to="/settings" replace />}'));
  assert.ok(!layout.includes("path: '/subscription'"));
  assert.ok(!settings.includes('<SubscriptionSettingsCard'));
  assert.ok(!plan.includes('Coins') && !plan.includes(' credits'));
  assert.ok(!review.includes('creditLabel'));
  assert.ok(!editor.includes('<CreditsBar'));
  assert.ok(studio.includes("const wholeImageAdmitted = Boolean(plan.instruction) && plan.kind !== 'FASHION'"));
  assert.ok(studio.includes('await onPrepareFreeAccount?.()'));
  assert.ok(studio.includes('generativeConfirmed'));
  assert.ok(studio.includes('бесплатно в пределах серверного лимита'));
  assert.ok(editor.includes('onPrepareFreeAccount={() => creativeEditApplicationService.prepareAccount()}'));
});
