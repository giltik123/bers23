import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  invocationMatchesSelection,
  canAcceptAutomationInvocation,
  acceptAutomationInvocation,
} from '../src/components/automation/automationAcceptance.js';

const selected = { id: 'auto-a', revision: 4, name: 'Rotate' };
const view = { invocationId: 'inv-1', projectId: 'project-a', automationId: 'auto-a', definitionRevision: 3, state: 'SUCCESS', terminalArtifactId: 'final-1' };

test('only the selected Project and Automation can expose an invocation for acceptance', () => {
  assert.equal(invocationMatchesSelection(view, selected, 'project-a'), true);
  // Immutable Core invocation revisions may differ from the current definition revision.
  assert.equal(canAcceptAutomationInvocation(view, selected, 'project-a'), true);
  assert.equal(canAcceptAutomationInvocation(view, selected, 'project-b'), false);
  assert.equal(canAcceptAutomationInvocation(view, { id: 'auto-b' }, 'project-a'), false);
  assert.equal(canAcceptAutomationInvocation({ ...view, state: 'FAILED' }, selected, 'project-a'), false);
  assert.equal(canAcceptAutomationInvocation({ ...view, terminalArtifactId: '' }, selected, 'project-a'), false);
  assert.equal(canAcceptAutomationInvocation(null, selected, 'project-a'), false);
});

test('a successful commit clears the pending result before a failed Project refresh', async () => {
  const events = [];
  await acceptAutomationInvocation({
    invocation: view, definitionName: selected.name,
    acceptFinal: async (...args) => { events.push(['commit', ...args]); },
    onCommitted: () => events.push('cleared'),
    refresh: async () => { events.push('refresh'); throw new Error('network'); },
    onRefreshError: error => events.push(['warning', error.message]),
  });
  assert.deepEqual(events, [['commit', 'project-a', 'final-1', 'Automation: Rotate'], 'cleared', 'refresh', ['warning', 'network']]);
});

test('failed Core acceptance keeps the result pending and does not refresh', async () => {
  let cleared = false; let refreshed = false; let warned = false;
  await assert.rejects(acceptAutomationInvocation({
    invocation: view, definitionName: '',
    acceptFinal: async () => { throw new Error('Core rejected'); },
    onCommitted: () => { cleared = true; },
    refresh: async () => { refreshed = true; },
    onRefreshError: () => { warned = true; },
  }), /Core rejected/);
  assert.equal(cleared, false);
  assert.equal(refreshed, false);
  assert.equal(warned, false);
});

test('successful refresh leaves no false warning', async () => {
  let commits = 0; let clears = 0; let refreshes = 0; let warnings = 0;
  await acceptAutomationInvocation({
    invocation: view, definitionName: '',
    acceptFinal: async () => { commits++; },
    onCommitted: () => { clears++; },
    refresh: async () => { refreshes++; },
    onRefreshError: () => { warnings++; },
  });
  assert.deepEqual([commits, clears, refreshes, warnings], [1, 1, 1, 0]);
});

test('Automation Studio fences selection and duplicate Accept while Core operations are pending', async () => {
  const source = await readFile('src/components/automation/CanonicalAutomationStudio.jsx', 'utf8');
  assert.match(source, /const scopedInvocation = invocationMatchesSelection\(invocation, selected, selectedProjectId\)/);
  assert.match(source, /if \(busy \|\| acceptingRef\.current \|\| !canAccept\) return/);
  assert.match(source, /acceptingRef\.current = true/);
  assert.match(source, /acceptingRef\.current = false/);
  assert.match(source, /<InvocationPanel invocation=\{scopedInvocation\}/);
  assert.match(source, /value=\{selectedProjectId\} disabled=\{busy\}/);
  assert.match(source, /<button key=\{item\.id\} disabled=\{busy\}/);
  assert.match(source, /onRefreshError: \(\) => setError\('Result accepted/);
});
