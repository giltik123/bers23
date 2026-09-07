import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HARNESS = 'scripts/test-release-r3d-browser-e2e.mjs';
const WORKFLOW = '.github/workflows/release-r3a-browser-e2e.yml';

test('R3d drives production Crop and Resize controls through explicit Preview Accept Discard history', async () => {
  const [harness, editor, cropToolbar, resizeToolbar] = await Promise.all([
    readFile(HARNESS, 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/CropToolbar.jsx', 'utf8'),
    readFile('src/components/editor/ResizeToolbar.jsx', 'utf8'),
  ]);

  assert.match(cropToolbar, /aria-label="Start crop"/);
  assert.match(cropToolbar, /aria-label="Apply crop"/);
  assert.match(resizeToolbar, /aria-label="Start resize"/);
  assert.match(resizeToolbar, /aria-label="Apply resize"/);
  assert.match(editor, /createCrop\(/);
  assert.match(editor, /createResize\(/);
  assert.match(editor, /setPendingResult\(/);
  assert.match(editor, /acceptResult/);
  assert.match(editor, /discardResult/);

  for (const text of [
    "getByRole('button', { name: 'Start crop' })",
    "getByRole('button', { name: 'Apply crop' })",
    "getByRole('button', { name: 'Start resize' })",
    "getByRole('button', { name: 'Apply resize' })",
    "getByRole('button', { name: 'Accept', exact: true })",
    "getByRole('button', { name: 'Discard', exact: true })",
    "waitEnabledButton(page, 'Undo')",
    "waitEnabledButton(page, 'Redo')",
  ]) assert.equal(harness.includes(text), true, `R3d harness must drive ${text}`);

  assert.match(harness, /Crop Preview must not mutate Project before explicit Accept/);
  assert.match(harness, /Crop Discard must be non-mutating/);
  assert.match(harness, /Resize Preview must not mutate Project before explicit Accept/);
  assert.match(harness, /Resize Discard must be non-mutating/);
});

test('R3d uses built SPA built production Core and PostgreSQL only as a correctness oracle', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /path\.resolve\('dist'\)/);
  assert.match(harness, /path\.resolve\('dist-server\/server\.mjs'\)/);
  assert.match(harness, /NODE_ENV: 'production'/);
  assert.match(harness, /PostgresAuthStore/);
  assert.match(harness, /canonical_projects/);
  assert.match(harness, /canonical_project_history/);
  assert.match(harness, /canonical_image_artifacts/);
  assert.match(harness, /chromium\.launch\(\{ channel: 'chrome', headless: true \}\)/);
  assert.doesNotMatch(harness, /InMemory|FakeProject|MockProject|FakeArtifact|MockArtifact/);

  const sqlMutations = [...harness.matchAll(/pool\.query\(\s*`([^`]+)`/g)]
    .map(match => match[1].trim().split(/\s+/)[0].toUpperCase());
  assert.deepEqual([...new Set(sqlMutations)], ['SELECT'], 'browser must be the only Project mutation actor; PostgreSQL is read-only oracle');
});

test('R3d deterministic geometry cannot silently cross provider financial or generic Creative authority', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /providerCalls, 0/);
  assert.match(harness, /diagnostics\.creativeRequests, \[\]/);
  assert.match(harness, /diagnostics\.financialRequests, \[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests, \[\]/);
  assert.match(harness, /\/api\/core\/local-execution\//);
  assert.match(harness, /R3D_BROWSER_DETERMINISTIC_GEOMETRY_ACCEPTED/);
  assert.doesNotMatch(harness, /financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3 release workflow makes R3d cumulative evidence an exact-head merge gate', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');

  assert.match(workflow, /CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /tests\/release-r3d-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /scripts\/test-release-r3d-browser-e2e\.mjs/);
  assert.match(workflow, /R3d Crop Resize Preview Discard Accept Undo Redo journey/);
  assert.match(workflow, /R3D_BROWSER_DETERMINISTIC_GEOMETRY_ACCEPTED/);
});
