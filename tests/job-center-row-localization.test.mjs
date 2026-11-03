import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import enJobs from '../src/lib/i18n/locales/en/jobs.js';
import { modules as ruModules } from '../src/lib/i18n/locales/ru/index.js';

test('session JobRow localizes status, priority, known progress stages and actions', async () => {
  const source = await readFile(new URL('../src/components/editor/jobs/JobRow.jsx', import.meta.url), 'utf8');
  assert.match(source, /useTranslation/);
  for (const key of [
    'queued', 'preparing', 'running', 'waiting', 'completed', 'cancelled', 'failed', 'retrying',
    'priority.high', 'priority.normal', 'priority.low', 'priority.unknown',
    'stages.preparing', 'stages.running', 'stage', 'moveUp', 'runAgain', 'cancel', 'duplicate', 'estimatedSeconds',
  ]) {
    assert.ok(source.includes(`jobs.${key}`), `missing localized session label jobs.${key}`);
  }
  assert.match(source, /aria-label=\{t\('jobs\.moveUp'\)\}/);
  assert.match(source, /aria-label=\{t\('jobs\.cancel'\)\}/);
  assert.doesNotMatch(source, /priorityLabel|>Run again<|>Duplicate</);
});

test('English and Russian session Job Center catalogs have matching priority and stage keys', () => {
  const ruJobs = ruModules.jobs;
  const required = [
    'title', 'queued', 'preparing', 'running', 'waiting', 'completed', 'succeeded',
    'failed', 'cancelled', 'retrying', 'unknown', 'unavailable', 'runAgain', 'duplicate',
    'moveUp', 'estimatedSeconds', 'stage', 'stages', 'priority',
  ];
  for (const key of required) {
    assert.ok(Object.hasOwn(enJobs, key), `English jobs catalog missing ${key}`);
    assert.ok(Object.hasOwn(ruJobs, key), `Russian jobs catalog missing ${key}`);
  }
  assert.deepEqual(Object.keys(ruJobs.priority).sort(), Object.keys(enJobs.priority).sort());
  assert.deepEqual(Object.keys(ruJobs.stages).sort(), Object.keys(enJobs.stages).sort());
  assert.ok(enJobs.estimatedSeconds.includes('{seconds}'));
  assert.ok(ruJobs.estimatedSeconds.includes('{seconds}'));
});
