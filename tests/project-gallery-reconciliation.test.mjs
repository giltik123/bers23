import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/pages/Projects.jsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/projects/ProjectCard.jsx', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../src/components/projects/ProjectActionsMenu.jsx', import.meta.url), 'utf8');
const english = readFileSync(new URL('../src/lib/i18n/locales/en/index.js', import.meta.url), 'utf8');
const russian = readFileSync(new URL('../src/lib/i18n/locales/ru/index.js', import.meta.url), 'utf8');

test('Project gallery rejects older list responses after a mutation or newer reload', () => {
  assert.match(page, /const listRequestRef = useRef\(0\)/);
  assert.match(page, /const request = \+\+listRequestRef\.current/);
  assert.match(page, /if \(request === listRequestRef\.current\) setProjects\(next\)/);
  assert.match(page, /if \(request !== listRequestRef\.current\) return/);
  assert.match(page, /listRequestRef\.current \+= 1;\s*try \{\s*await operation\(\)/);
  assert.match(page, /return \(\) => \{ listRequestRef\.current \+= 1; \}/);
});

test('Project actions serialize and reconcile server truth after both success and uncertain failure', () => {
  assert.match(page, /const actionInFlightRef = useRef\(false\)/);
  assert.match(page, /if \(actionInFlightRef\.current\) return/);
  assert.match(page, /actionInFlightRef\.current = true/);
  assert.match(page, /finally \{\s*await reload\(\);\s*actionInFlightRef\.current = false/);
  assert.doesNotMatch(page, /setProjects\(\(current\) => current\.filter/,
    'a lost delete response must not cause an optimistic local removal');
  assert.match(page, /actionsDisabled: actionBusy/);
  assert.match(card, /disabled=\{actionsDisabled\}/);
  assert.match(card, /disabled=\{actionsDisabled\}\s*\/>/);
  assert.match(menu, /disabled=\{disabled\}/);
});

test('Project deletion requires explicit localized confirmation before dispatch', () => {
  assert.match(page, /window\.confirm\(t\('projectUi\.deleteConfirm', \{ name: project\.name \}\)\)/);
  assert.match(page, /mutateAndReconcile\(\(\) => projectService\.remove\(project\.id\)/);
  assert.match(english, /"deleteConfirm": "Delete project/);
  assert.match(russian, /"deleteConfirm": "Удалить проект/);
  assert.doesNotMatch(menu, /window\.confirm/,
    'confirmation belongs to the page action boundary, not the visual menu');
});
