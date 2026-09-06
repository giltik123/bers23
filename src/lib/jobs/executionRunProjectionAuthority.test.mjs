import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectionUrl = new URL('./executionRunProjection.js', import.meta.url);
const clientUrl = new URL('../../api/executionRunRecoveryClient.js', import.meta.url);
const rowUrl = new URL('../../components/editor/jobs/CanonicalExecutionRunRow.jsx', import.meta.url);
const centerUrl = new URL('../../components/editor/jobs/JobCenter.jsx', import.meta.url);
const queuePanelUrl = new URL('../../components/editor/jobs/JobQueuePanel.jsx', import.meta.url);

async function source(url) { return readFile(url, 'utf8'); }

test('canonical projection imports only the narrow recovery client and no browser execution authority', async () => {
  const text = await source(projectionUrl);
  assert.match(text, /executionRunRecoveryClient/);
  assert.match(text, /export function createExecutionRunProjection/);
  assert.doesNotMatch(text, /export const executionRunProjection/);
  assert.doesNotMatch(text, /coreClient|jobManager|jobStorage|subscriptionUsage|subscriptionValidator|jobQueue|jobWorker|Billing|billing|provider|stripe|\.cancel\(|\.retry\(|\.issue\(|\.start\(/);
  assert.match(text, /UNKNOWN/);
  assert.match(text, /WORKFLOW_STEP cannot be an ExecutionRun root/);
  assert.match(text, /generation !== this\.generation/);
  assert.match(text, /terminal time shape is invalid/);
});

test('recovery transport is explicitly GET-only and exposes no generic request or mutation API', async () => {
  const text = await source(clientUrl);
  assert.match(text, /method: 'GET'/);
  assert.doesNotMatch(text, /method: 'POST'|method: 'PATCH'|method: 'DELETE'|coreClient|entities|creative|localExecution|Billing|billing|provider/);
  assert.match(text, /return Object\.freeze\(\{\s*listRoots[\s\S]*get\(runId, projectId\)[\s\S]*listChildren/);
});

test('canonical UI row is display-only while session JobRow controls remain wired separately', async () => {
  const [row, center] = await Promise.all([source(rowUrl), source(centerUrl)]);
  assert.doesNotMatch(row, /Button|jobManager|jobStorage|onCancel|onRetry|onDuplicate|onMoveUp/);
  assert.match(row, /data-canonical-execution-run/);
  assert.match(center, /useMemo\(\(\) => createExecutionRunProjection\(\), \[\]\)/);
  assert.match(center, /canonicalScopeMatches = Boolean\(normalizedProjectId\) && canonical\.projectId === normalizedProjectId/);
  assert.match(center, /data-job-center-canonical-executions/);
  assert.match(center, /Canonical recovery state · read only/);
  assert.match(center, /data-job-center-session-jobs/);
  assert.match(center, /onCancel=\{\(id\) => jobManager\.cancel\(id\)\}/);
  assert.match(center, /onRetry=\{\(id\) => jobManager\.retry\(id\)/);
  assert.match(center, /onDuplicate=\{\(id\) => jobManager\.duplicate\(id\)/);
  assert.doesNotMatch(center, /<CanonicalExecutionRunRow[^>]*(onCancel|onRetry|onDuplicate|onMoveUp)=/);
});

test('JobQueuePanel scopes recovery to the current Editor project route without creating mutation authority', async () => {
  const text = await source(queuePanelUrl);
  assert.match(text, /URLSearchParams\(window\.location\.search\)\.get\('id'\)/);
  assert.match(text, /<JobCenter projectId=\{projectId \?\? editorProjectId\(\)\}/);
  assert.doesNotMatch(text, /coreClient|jobStorage|jobManager|cancel|retry|duplicate|POST|PATCH|DELETE/);
});
