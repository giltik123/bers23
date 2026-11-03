import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import enJobs from '../src/lib/i18n/locales/en/jobs.js';
import { modules as ruModules } from '../src/lib/i18n/locales/ru/index.js';
import { executionRunLabel, EXECUTION_RUN_LABEL_KEYS } from '../src/lib/jobs/executionRunPresentation.js';

const identity = (key) => key;

test('canonical Job Center labels have matching RU/EN keys and non-empty copy', () => {
  for (const group of Object.keys(EXECUTION_RUN_LABEL_KEYS)) {
    const expected = [...new Set([...Object.values(EXECUTION_RUN_LABEL_KEYS[group]), 'unknown'])].sort();
    assert.deepEqual(Object.keys(ruModules.jobs.canonical[group]).sort(), expected, `Russian canonical ${group} keys`);
    assert.deepEqual(Object.keys(ruModules.jobs.canonical[group]).sort(), Object.keys(enJobs.canonical[group]).sort(), `RU/EN canonical ${group} parity`);
    for (const key of Object.keys(enJobs.canonical[group])) {
      assert.equal(typeof enJobs.canonical[group][key], 'string');
      assert.ok(ruModules.jobs.canonical[group][key].trim());
    }
  }

  for (const key of ['server', 'localAuthorityUnavailable', 'expires', 'cancellationUnsupported', 'final', 'openResult', 'cancel', 'cancelling', 'cancellationUnavailable', 'retryWorkflow', 'retrying']) {
    assert.equal(typeof enJobs.canonical[key], 'string', `English jobs.canonical.${key}`);
    assert.equal(typeof ruModules.jobs.canonical[key], 'string', `Russian jobs.canonical.${key}`);
  }
  assert.equal(enJobs.canonical.final, 'FINAL');
  assert.equal(ruModules.jobs.canonical.final, 'FINAL');
  assert.ok(enJobs.canonical.expires.includes('{date}'));
  assert.ok(ruModules.jobs.canonical.expires.includes('{date}'));
});

test('execution run labels map known authority states and fail back to localized unknown copy', () => {
  assert.equal(executionRunLabel(identity, 'statuses', 'SUCCEEDED'), 'jobs.canonical.statuses.succeeded');
  assert.equal(executionRunLabel(identity, 'capabilities', 'LOCAL_EXECUTION'), 'jobs.canonical.capabilities.local');
  assert.equal(executionRunLabel(identity, 'localStates', 'FINALIZED_FAILED'), 'jobs.canonical.localStates.finalizedFailed');
  assert.equal(executionRunLabel(identity, 'capabilities', 'UNRECOGNIZED'), 'jobs.canonical.capabilities.unknown');
});

test('CanonicalExecutionRunRow localizes copy without changing owner controls or result links', async () => {
  const source = await readFile(new URL('../src/components/editor/jobs/CanonicalExecutionRunRow.jsx', import.meta.url), 'utf8');
  assert.match(source, /useTranslation/);
  assert.match(source, /aria-hidden=\"true\"/);
  assert.match(source, /executionRunLabel\(t, 'capabilities', run\.capability\)/);
  assert.match(source, /executionRunLabel\(t, 'statuses', run\.status\)/);
  assert.match(source, /executionRunLabel\(t, 'localStates', localAuthority\.state\)/);
  assert.match(source, /onClick=\{\(\) => onCancel\(run\)\}/);
  assert.match(source, /onClick=\{\(\) => onRetry\(run\)\}/);
  assert.match(source, /href=\{run\.result\.imageUrl\}/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.doesNotMatch(source, /executionRunStatusLabel|executionRunCapabilityLabel|localExecutionAuthorityStateLabel/);
});
