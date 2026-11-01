import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canMutateAutomationCatalog, reconcileCatalogSelection } from '../src/components/automation/catalogFreshnessPolicy.js';

test('catalog mutations are disabled until a complete, successful refresh', () => {
  assert.equal(canMutateAutomationCatalog(false, false), false, 'failed/initial refresh');
  assert.equal(canMutateAutomationCatalog(false, true), false, 'refresh in flight');
  assert.equal(canMutateAutomationCatalog(true, true), false, 'another action in flight');
  assert.equal(canMutateAutomationCatalog(true, false), true, 'fresh and idle');
  assert.equal(canMutateAutomationCatalog(undefined, false), false, 'unknown freshness fails closed');
});

test('successful refresh reconciles deleted or revoked selections', () => {
  const items = [{ id: 'first' }, { id: 'second' }];
  assert.equal(reconcileCatalogSelection('second', items), 'second');
  assert.equal(reconcileCatalogSelection('removed', items), 'first');
  assert.equal(reconcileCatalogSelection('', items), 'first');
  assert.equal(reconcileCatalogSelection('removed', []), '');
});

test('Automation Studio refuses partial or malformed catalog recovery', async () => {
  const studio = await readFile('src/components/automation/CanonicalAutomationStudio.jsx', 'utf8');
  assert.match(studio, /const \[catalogFresh, setCatalogFresh\] = useState\(false\)/);
  assert.match(studio, /setBusy\(true\); setCatalogFresh\(false\); setError\(''\)/);
  assert.match(studio, /Promise\.all\(\[automationClient\.definitions\.list\(\), coreClient\.projects\.list\(\)\]\)/);
  assert.match(studio, /if \(!Array\.isArray\(nextDefinitions\) \|\| !Array\.isArray\(nextProjects\)\)/);
  assert.match(studio, /setSelectedAutomationId\(current => reconcileCatalogSelection\(current, nextDefinitions\)\)/);
  assert.match(studio, /setSelectedProjectId\(current => reconcileCatalogSelection\(current, nextProjects\)\)/);
  assert.match(studio, /setCatalogFresh\(true\)/);
  assert.match(studio, /!catalogFresh && !busy && <p role="status"/);
});

test('unverified catalog blocks new mutations but preserves cancellation of existing work', async () => {
  const studio = await readFile('src/components/automation/CanonicalAutomationStudio.jsx', 'utf8');
  assert.match(studio, /const canChangeCatalog = canMutateAutomationCatalog\(catalogFresh, busy\)/);
  assert.match(studio, /const canRun = Boolean\(canChangeCatalog && selected\?\.status === 'ACTIVE'/);
  assert.match(studio, /function newDefinition\(\) \{\s*if \(!canChangeCatalog\) return;/);
  assert.match(studio, /async function save\(\) \{\s*if \(!canChangeCatalog\) return;/);
  assert.match(studio, /async function toggleArchive\(\) \{\s*if \(!selected \|\| !canChangeCatalog\) return;/);
  assert.match(studio, /async function run\(\) \{\s*if \(!canRun\) return;/);
  assert.match(studio, /async function resumeLatest\(\) \{\s*if \(!selected \|\| !selectedProjectId \|\| !resumePointer \|\| !canChangeCatalog\) return;/);
  assert.match(studio, /async function retry\(\) \{\s*if \(!invocation \|\| !selectedProjectId \|\| !canChangeCatalog\) return;/);
  assert.match(studio, /async function accept\(\) \{\s*if \(!canChangeCatalog \|\| invocation\?\.state !== 'SUCCESS'/);
  assert.match(studio, /disabled=\{busy \|\| !catalogFresh\}>Accept result into Project/);
  assert.match(studio, /async function cancel\(\) \{\s*if \(!invocation \|\| !selectedProjectId\) return;/);
  assert.doesNotMatch(studio, /async function cancel\(\) \{\s*if \([^)]*canChangeCatalog/);
});
