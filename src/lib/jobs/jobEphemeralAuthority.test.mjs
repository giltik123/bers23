import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const managerPath = path.join(root, 'src/lib/jobs/jobManager.js');
const storagePath = path.join(root, 'src/lib/jobs/jobStorage.js');
const centerPath = path.join(root, 'src/components/editor/jobs/JobCenter.jsx');

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

test('JobManager is an ephemeral-only scheduler with no persistence authority', async () => {
  const source = await readFile(managerPath, 'utf8');
  const submitLine = source.split('\n').find((line) => line.includes('async submit('));
  assert.ok(submitLine, 'JobManager.submit declaration must remain inspectable');
  assert.doesNotMatch(submitLine, /executionClass/);
  assert.match(source, /JOB_EXECUTION_CLASSES\.EPHEMERAL_CLIENT_TASK/);
  assert.match(source, /executionClass:\s*JOB_EXECUTION_CLASSES\.EPHEMERAL_CLIENT_TASK/);
  assert.doesNotMatch(source, /jobStorage|JobRecord|coreClient\.entities|_persist\s*\(/);
  assert.match(source, /retry\(jobId\)\s*\{\s*return this\.duplicate\(jobId\);\s*\}/);
  assert.match(source, /jobQueue\.reorder\(jobId, index\)/);
  assert.match(source, /jobQueue\.remove\(jobId\)/);
  assert.match(source, /jobScheduler\.cancel\(jobId\)/);
  assert.match(source, /jobWorkerPool\.cancelCurrent\(jobId\)/);
  assert.match(source, /pause\(\)\s*\{\s*this\.paused = true; this\._notify\(\);\s*\}/);
  assert.match(source, /resume\(\)\s*\{\s*this\.paused = false; this\._notify\(\); this\._kick\(\);\s*\}/);
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

test('Job Center exposes canonical and ephemeral truths separately and withholds unsupported controls', async () => {
  const source = await readFile(centerPath, 'utf8');
  assert.match(source, /Canonical recovery state · read only/);
  assert.match(source, /Ephemeral browser-only tasks · reload interrupts them/);
  assert.match(source, /job\.executionClass === JOB_EXECUTION_CLASSES\.EPHEMERAL_CLIENT_TASK/);
  assert.match(source, /Unsupported session task classification\. Controls are withheld\./);
  assert.match(source, /data-job-center-canonical-executions/);
  assert.match(source, /data-job-center-session-jobs/);
});