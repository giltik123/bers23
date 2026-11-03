import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('session Job Center rows use shared translations for statuses, priorities and controls', async () => {
  const source = await read('src/components/editor/jobs/JobRow.jsx');
  assert.match(source, /useTranslation/);
  for (const key of ['queued', 'preparing', 'running', 'waiting', 'completed', 'cancelled', 'failed', 'retrying']) {
    assert.ok(source.includes(`jobs.${key}`), `missing localized job status ${key}`);
  }
  for (const key of ['priority.high', 'priority.normal', 'priority.low', 'priority.unknown', 'stages.preparing', 'stages.running', 'moveUp', 'runAgain', 'cancel', 'duplicate', 'estimatedSeconds']) {
    assert.ok(source.includes(`jobs.${key}`), `missing localized job label ${key}`);
  }
  assert.doesNotMatch(source, />Run again<|>Duplicate<|>Cancel</);
});

test('canonical ExecutionRun rows localize server lifecycle and recovery details without changing authority callbacks', async () => {
  const source = await read('src/components/editor/jobs/CanonicalExecutionRunRow.jsx');
  assert.match(source, /useTranslation/);
  for (const key of [
    'queued', 'running', 'succeeded', 'failed', 'cancelled', 'unknown',
    'capabilities.creativeExecution', 'capabilities.localExecution',
    'capabilities.workflowContinuation', 'capabilities.workflowStep',
    'localAuthority.active', 'localAuthority.expired', 'localAuthority.finalizedSuccess',
    'localAuthority.finalizedFailed', 'localAuthority.finalizedUnknown',
    'server', 'revision', 'reasonCode', 'ticketAuthorityUnavailable', 'expiresAt',
    'cancellationUnsupported', 'final', 'openResult', 'cancel', 'cancelling',
    'cancellationUnavailable', 'retryWorkflow', 'retryingThroughWorkflow',
  ]) {
    assert.ok(source.includes(`jobs.${key}`), `missing localized canonical execution label ${key}`);
  }
  assert.match(source, /onCancel\(run\)/);
  assert.match(source, /onRetry\(run\)/);
  assert.doesNotMatch(source, /Cancellation unsupported\.|Open result|Retry workflow|Cancelling through Creative authority/);
});

test('English and Russian Job Center catalogs contain the same detailed row vocabulary', async () => {
  const [english, russian] = await Promise.all([
    read('src/lib/i18n/locales/en/jobs.js'),
    read('src/lib/i18n/locales/ru/index.js'),
  ]);
  const russianJobs = russian.match(/  jobs: \{([\s\S]*?)\n  creative:/)?.[1];
  assert.ok(russianJobs, 'Russian jobs catalog must remain in the shared locale module');

  const required = [
    'preparing:', 'succeeded:', 'unknown:', 'unavailable:', 'runAgain:', 'duplicate:',
    'moveUp:', 'estimatedSeconds:', 'stage:', 'stages:', 'priority:', 'server:', 'revision:',
    'reasonCode:', 'capabilities:', 'localAuthority:', 'ticketAuthorityUnavailable:',
    'expiresAt:', 'cancellationUnsupported:', 'final:', 'openResult:', 'cancelling:',
    'cancellationUnavailable:', 'retryWorkflow:', 'retryingThroughWorkflow:',
  ];
  for (const key of required) {
    assert.ok(english.includes(key), `English jobs catalog is missing ${key}`);
    assert.ok(russianJobs.includes(key), `Russian jobs catalog is missing ${key}`);
  }
});
