import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HARNESS = 'scripts/test-release-r3f-browser-e2e.mjs';
const WORKFLOW = '.github/workflows/release-r3a-browser-e2e.yml';

test('R3f induces a genuine browser-local Crop capability failure without intercepting Core', async () => {
  const [harness, pngEncoder, cropRunner] = await Promise.all([
    readFile(HARNESS, 'utf8'),
    readFile('src/platform/creative/deterministic/DeterministicPng.ts', 'utf8'),
    readFile('src/application/local-execution/CoreAuthorizedCrop.ts', 'utf8'),
  ]);

  assert.match(harness, /browserContext\.addInitScript/);
  assert.match(harness, /Object\.defineProperty\(globalThis, 'CompressionStream'/);
  assert.match(harness, /typeof globalThis\.CompressionStream/);
  assert.match(harness, /Deterministic PNG encoding requires CompressionStream\(deflate\)/);
  assert.doesNotMatch(harness, /page\.route|browserContext\.route|context\.route|route\.abort|route\.fulfill|route\.continue/);

  assert.match(pngEncoder, /typeof CompressionStream !== 'function'/);
  assert.match(pngEncoder, /Deterministic PNG encoding requires CompressionStream\(deflate\)/);

  const encodeIndex = cropRunner.indexOf('encodeDeterministicRgbaPng(preview)');
  const uploadIndex = cropRunner.indexOf('this.core.uploadCropImage');
  const submitIndex = cropRunner.indexOf('this.core.submitCrop');
  assert(encodeIndex >= 0 && uploadIndex > encodeIndex && submitIndex > uploadIndex,
    'production Crop must encode locally before upload/result so missing CompressionStream is a real pre-upload local failure');
});

test('R3f production Editor surfaces Crop failure without generic Creative or paid fallback', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const start = editor.indexOf('const applyCrop = async');
  const end = editor.indexOf('const startResize =', start);
  assert(start >= 0 && end > start, 'production applyCrop block must remain identifiable');
  const cropBlock = editor.slice(start, end);

  assert.match(cropBlock, /createCrop\(\{ projectId: project\.id \}\)/);
  assert.match(cropBlock, /await local\.run/);
  assert.match(cropBlock, /setAiError\(e\.message \|\| 'Crop failed'\)/);
  assert.match(cropBlock, /workspaceHistory\.recordEdit\(workspaceManager\.activeId\(\), \{ success: false/);
  assert.doesNotMatch(cropBlock, /creativeEditApplicationService|coreClient\.creative|financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3f proves failed LOCAL_ONLY Crop stops after prepare input and leaves Core authorities unchanged', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  for (const text of [
    "'POST /api/core/local-execution/crop/prepare'",
    '`GET /api/core/local-execution/crop/${ticketRow.ticket_id}/inputs`',
    "ticket.policy, 'LOCAL_ONLY'",
    'ticket.cost?.providerCalls, 0',
    'ticket.cost?.paidCloudCredits, 0',
    'ticketRow.consumed_at, null',
    'ticketRow.finalized_status, null',
    'countCropArtifacts(projectId), 0',
    'browser-local Crop failure must not mutate canonical Project image/history',
    "getByRole('button', { name: 'Retry', exact: true })",
  ]) assert.equal(harness.includes(text), true, `R3f harness must prove ${text}`);

  assert.match(harness, /providerCalls, 0/);
  assert.match(harness, /diagnostics\.creativeRequests, \[\]/);
  assert.match(harness, /diagnostics\.financialRequests, \[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests, \[\]/);
  assert.match(harness, /diagnostics\.projectMutations, \[\]/);
  assert.match(harness, /R3F_BROWSER_LOCAL_ONLY_FAILURE_ACCEPTED/);
  assert.doesNotMatch(harness, /financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3f uses built SPA built production Core and PostgreSQL only as read-only oracle', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /path\.resolve\('dist'\)/);
  assert.match(harness, /path\.resolve\('dist-server\/server\.mjs'\)/);
  assert.match(harness, /NODE_ENV: 'production'/);
  assert.match(harness, /PostgresAuthStore/);
  assert.match(harness, /canonical_projects/);
  assert.match(harness, /canonical_project_history/);
  assert.match(harness, /canonical_image_artifacts/);
  assert.match(harness, /local_execution_tickets/);
  assert.match(harness, /chromium\.launch\(\{ channel: 'chrome', headless: true \}\)/);
  assert.doesNotMatch(harness, /InMemory|FakeProject|MockProject|FakeArtifact|MockArtifact|FakeTicket|MockTicket/);

  const sqlMutations = [...harness.matchAll(/pool\.query\(\s*`([^`]+)`/g)]
    .map(match => match[1].trim().split(/\s+/)[0].toUpperCase());
  assert.deepEqual([...new Set(sqlMutations)], ['SELECT'], 'browser/Core must be the only mutation actors; PostgreSQL is read-only oracle');
});

test('R3 release workflow makes R3f LOCAL_ONLY failure evidence an exact-head merge gate', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');

  assert.match(workflow, /CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /tests\/release-r3f-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /scripts\/test-release-r3f-browser-e2e\.mjs/);
  assert.match(workflow, /R3f LOCAL_ONLY local capability failure cannot cross Provider or Billing/);
  assert.match(workflow, /R3F_BROWSER_LOCAL_ONLY_FAILURE_ACCEPTED/);
});
