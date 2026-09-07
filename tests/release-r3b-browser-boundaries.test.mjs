import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('R3 browser harness cumulatively proves baseline plus deterministic Rotate lifecycle', async () => {
  const harness = await readFile('scripts/test-release-r3b-browser-e2e.mjs', 'utf8');

  for (const required of [
    'R3A_BROWSER_RELEASE_E2E_ACCEPTED',
    'R3B_BROWSER_DETERMINISTIC_EDIT_ACCEPTED',
    'Rotate 90° clockwise',
    'canonical_projects',
    'canonical_project_history',
    'source_image_storage_id',
    '/api/core/local-execution/orthogonal-transform/prepare',
    'ACCEPTED_FINAL',
    "name: 'Undo'",
    "name: 'Redo'",
  ]) {
    assert.equal(harness.includes(required), true, `R3 cumulative harness must contain ${required}`);
  }

  assert.match(harness, /assert\.deepEqual\(previewState,\s*initialState/);
  assert.match(harness, /acceptedState\.history\.length,\s*2/);
  assert.match(harness, /undoState\.project\.current_image_storage_id,\s*initialState\.project\.original_image_storage_id/);
  assert.match(harness, /redoState\.project\.current_image_storage_id,\s*acceptedStorageId/);
  assert.match(harness, /loadedImageEvidence\(page,\s*'after',\s*8,\s*12/);
  assert.match(harness, /loadedImageEvidence\(page,\s*'Project',\s*12,\s*8/);
  assert.match(harness, /loadedImageEvidence\(page,\s*'Project',\s*8,\s*12/);
});

test('R3 orthogonal HTTP boundary strips session metadata before canonical local execution', async () => {
  const adapter = await readFile('server/core/http/orthogonalTransformHttpAdapter.ts', 'utf8');

  assert.match(adapter, /const principal = await input\.auth\.verify\(/);
  assert.match(adapter, /const auth = authenticatedScope\(principal\)/);
  assert.match(adapter, /return Object\.freeze\(\{ tenantId: principal\.tenantId, userId: principal\.userId \}\)/);
  assert.match(adapter, /input\.service\.prepare\([\s\S]*?\}, auth\)/);
  assert.match(adapter, /input\.inputDelivery\.deliver\([\s\S]*?, auth\)/);
  assert.match(adapter, /input\.service\.uploadImage\([\s\S]*?, auth\)/);
  assert.match(adapter, /input\.service\.submit\([\s\S]*?, auth\)/);
  assert.doesNotMatch(adapter, /input\.(?:service|inputDelivery)\.[A-Za-z]+\([\s\S]*?, principal\)/);
});

test('R3 deterministic PNG begins browser drain before compression writes', async () => {
  const encoder = await readFile('src/platform/creative/deterministic/DeterministicPng.ts', 'utf8');
  const read = encoder.indexOf('const read = new Response(stream.readable).arrayBuffer()');
  const write = encoder.indexOf('await writer.write(source)');
  const close = encoder.indexOf('await writer.close()');

  assert.notEqual(read, -1, 'deterministic PNG must start draining CompressionStream output');
  assert.notEqual(write, -1, 'deterministic PNG must write canonical scanlines');
  assert.notEqual(close, -1, 'deterministic PNG must close the compressor');
  assert.equal(read < write && write < close, true, 'CompressionStream reader must be active before write/close to avoid browser backpressure stalls');
});

test('R3 deterministic journey fails closed against provider cloud financial and legacy browser authority', async () => {
  const harness = await readFile('scripts/test-release-r3b-browser-e2e.mjs', 'utf8');

  assert.match(harness, /providerCalls,\s*0/);
  assert.match(harness, /diagnostics\.creativeRequests,\s*\[\]/);
  assert.match(harness, /diagnostics\.financialRequests,\s*\[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests,\s*\[\]/);
  assert.match(harness, /diagnostics\.legacyRequests,\s*\[\]/);
  assert.match(harness, /R3_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED/);
  assert.doesNotMatch(harness, /financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3 workflow keeps exact-head real build PostgreSQL and financial-freeze gates', async () => {
  const workflow = await readFile('.github/workflows/release-r3a-browser-e2e.yml', 'utf8');

  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /npm run server:build/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /Preserve financial redesign freeze/);
  assert.match(workflow, /release-r3b-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /R3B_BROWSER_DETERMINISTIC_EDIT_ACCEPTED/);
});
