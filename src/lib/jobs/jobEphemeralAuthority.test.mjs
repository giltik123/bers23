import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const managerPath = path.join(root, 'src/lib/jobs/jobManager.js');
const storagePath = path.join(root, 'src/lib/jobs/jobStorage.js');
const retryManagerPath = path.join(root, 'src/lib/jobs/jobRetryManager.js');
const schedulerPath = path.join(root, 'src/lib/jobs/jobScheduler.js');
const centerPath = path.join(root, 'src/components/editor/jobs/JobCenter.jsx');
const rowPath = path.join(root, 'src/components/editor/jobs/JobRow.jsx');
const canonicalRowPath = path.join(root, 'src/components/editor/jobs/CanonicalExecutionRunRow.jsx');

async function productionSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const current = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await productionSourceFiles(current));
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(current);
  }
  return files;
}

test('JobManager is ephemeral-only and owns no generic automatic retry authority', async () => {
  const source = await readFile(managerPath, 'utf8');
  const submitLine = source.split('\n').find((line) => line.includes('async submit('));
  assert.ok(submitLine, 'JobManager.submit declaration must remain inspectable');
  assert.doesNotMatch(submitLine, /executionClass/);
  assert.match(source, /JOB_EXECUTION_CLASSES\.EPHEMERAL_CLIENT_TASK/);
  assert.match(source, /executionClass:\s*JOB_EXECUTION_CLASSES\.EPHEMERAL_CLIENT_TASK/);
  assert.doesNotMatch(source, /jobStorage|JobRecord|coreClient\.entities|_persist\s*\(/);
  assert.doesNotMatch(source, /jobRetryManager|jobScheduler|JOB_EVENTS\.RETRIED|setJobStatus\([^\n]*'retrying'/);
  assert.match(source, /onJobFailure:\s*\(\) => false/);
  assert.match(source, /buildNewOperationRepeatMetadata\(job\)/);
  assert.match(source, /runAgain\(jobId\)/);
  assert.doesNotMatch(source, /\bretry\(jobId\)/);
  assert.match(source, /jobQueue\.reorder\(jobId, index\)/);
  assert.match(source, /jobQueue\.remove\(jobId\)/);
  assert.match(source, /jobWorkerPool\.cancelCurrent\(jobId\)/);
  assert.match(source, /pause\(\)\s*\{\s*this\.paused = true; this\._notify\(\);\s*\}/);
  assert.match(source, /resume\(\)\s*\{\s*this\.paused = false; this\._notify\(\); this\._kick\(\);\s*\}/);
});

test('legacy retry helpers are fail-closed tombstones rather than redispatch infrastructure', async () => {
  const [retryManager, scheduler] = await Promise.all([
    readFile(retryManagerPath, 'utf8'),
    readFile(schedulerPath, 'utf8'),
  ]);
  assert.match(retryManager, /canRetry\(\) \{ return false; \}/);
  assert.match(retryManager, /job_retry_disabled/);
  assert.doesNotMatch(retryManager, /setTimeout|enqueue|schedule\(/);
  assert.match(scheduler, /job_retry_scheduling_disabled/);
  assert.match(scheduler, /cancel\(\) \{ return false; \}/);
  assert.doesNotMatch(scheduler, /setTimeout|clearTimeout|timers|callback\(job\)/);
});

test('legacy storage module is a fail-closed tombstone, not generic entity persistence', async () => {
  const source = await readFile(storagePath, 'utf8');
  assert.match(source, /persistenceDisabled/);
  assert.match(source, /throw new Error/);
  assert.doesNotMatch(source, /coreClient|JobRecord|entities\.|\.create\(|\.update\(|\.filter\(/);
});

test('production source has no client persistence or direct queue-entry bypass', async () => {
  const files = await productionSourceFiles(path.join(root, 'src'));
  for (const file of files) {
    if (file === storagePath) continue;
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bJobRecord\b/, `${path.relative(root, file)} must not use JobRecord`);
    assert.doesNotMatch(source, /['"]@\/lib\/jobs\/jobStorage['"]/, `${path.relative(root, file)} must not import jobStorage`);
    if (file !== managerPath) assert.doesNotMatch(source, /jobQueue\.enqueue\(/, `${path.relative(root, file)} must not bypass JobManager queue entry`);
  }
});

test('Job Center separates canonical reconciliation from explicit new-operation session repeats', async () => {
  const [center, row, canonicalRow] = await Promise.all([
    readFile(centerPath, 'utf8'),
    readFile(rowPath, 'utf8'),
    readFile(canonicalRowPath, 'utf8'),
  ]);
  assert.match(center, /Canonical recovery state · owning Creative controls only/);
  assert.match(center, /Run again starts a new operation/);
  assert.match(center, /job\.executionClass === JOB_EXECUTION_CLASSES\.EPHEMERAL_CLIENT_TASK/);
  assert.match(center, /Unsupported session task classification\. Controls are withheld\./);
  assert.match(center, /data-job-center-canonical-executions/);
  assert.match(center, /data-job-center-session-jobs/);
  assert.match(center, /onRunAgain=\{\(id\) => jobManager\.runAgain\(id\)/);
  assert.match(center, /onDuplicate=\{\(id\) => jobManager\.duplicate\(id\)/);
  assert.doesNotMatch(center, /jobManager\.retry|onRetry=/);
  assert.match(row, /onRunAgain/);
  assert.match(row, />Run again</);
  assert.doesNotMatch(row, /onRetry|>Retry<|\bRetry\b/);
  assert.doesNotMatch(center, /<CanonicalExecutionRunRow[^>]*(onRunAgain|onRetry|onDuplicate|onMoveUp)=/);
  assert.doesNotMatch(canonicalRow, /onRunAgain|onRetry|onDuplicate|onMoveUp|jobManager|jobStorage/);
});
