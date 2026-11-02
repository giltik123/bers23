import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(path, 'utf8');

test('Editor and Job Center share one localized accessible region name', async () => {
  const [editor, center] = await Promise.all([
    read('src/pages/Editor.jsx'),
    read('src/components/editor/jobs/JobCenter.jsx'),
  ]);
  assert.ok(editor.includes("t('editorUi.jobCenter')"));
  assert.ok(center.includes("aria-label={t('editorUi.jobCenter')}"));
  assert.ok(center.includes("{t('editorUi.jobCenter')}</p>"));
  assert.ok(center.includes('role="region"'));
});

test('canonical Job Center loading, stale, empty and blocked states are announced accessibly', async () => {
  const center = await read('src/components/editor/jobs/JobCenter.jsx');
  assert.match(center, /Loading canonical execution state…<\/p>/);
  assert.match(center, /role="status" aria-live="polite"[^>]*>Loading canonical execution state/);
  assert.match(center, /role="alert">Server execution recovery is unavailable/);
  assert.match(center, /role="status" aria-live="polite">Server refresh failed/);
  assert.match(center, /role="status">No canonical server executions/);
  assert.match(center, /role="alert">Unsupported session task classification/);
  assert.match(center, /<button type="button" onClick=\{\(\) => state\.paused/);
});

test('Job Center keeps cancel, retry and recovery on their existing canonical authorities', async () => {
  const center = await read('src/components/editor/jobs/JobCenter.jsx');
  assert.match(center, /createExecutionRunProjection/);
  assert.match(center, /new CreativeExecutionControlPolicy\(coreClient\.creative\)/);
  assert.match(center, /new WorkflowExecutionRetryPolicy\(coreClient\.agent\)/);
  assert.match(center, /await creativeControl\.cancel\(run\)/);
  assert.match(center, /await workflowRetryControl\.retry\(run, normalizedProjectId\)/);
  assert.match(center, /await canonicalProjection\.refresh\(\)/);
  assert.doesNotMatch(center, /coreClient\.creative\.execute|coreClient\.agent\.execute|ExecutionRunRegistry/);
});
