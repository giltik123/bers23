import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('R3c browser harness extends accepted R3 with Discard Version Restore and stale FINAL recovery', async () => {
  const harness = await readFile('scripts/test-release-r3c-browser-e2e.mjs', 'utf8');

  for (const required of [
    'R3A_BROWSER_RELEASE_E2E_ACCEPTED',
    'R3B_BROWSER_DETERMINISTIC_EDIT_ACCEPTED',
    'R3C_BROWSER_PROJECT_LIFECYCLE_ACCEPTED',
    'Save current as version',
    'Version name',
    'canonical_project_versions',
    'RESTORE_VERSION',
    'final_source_conflict',
    'The prepared result was not accepted because the Project changed. Run the edit again from the current image.',
    "name: 'Discard'",
    "name: 'Versions'",
    "name: 'Undo'",
    "name: 'Redo'",
  ]) {
    assert.equal(harness.includes(required), true, `R3c cumulative harness must contain ${required}`);
  }

  assert.match(harness, /assert\.deepEqual\(discardAfter,\s*discardBefore/);
  assert.match(harness, /version\.image_storage_id,\s*baselineStorageId/);
  assert.match(harness, /version\.history_id,\s*baselineHistoryId/);
  assert.match(harness, /restoredState\.history\[3\]\.kind,\s*'RESTORE_VERSION'/);
  assert.match(harness, /restoredState\.history\[3\]\.source_image_storage_id,\s*advancedStorageId/);
  assert.match(harness, /page\.context\(\)\.newPage\(\)/);
  assert.match(harness, /conflictResponse\.status\(\),\s*409/);
  assert.match(harness, /conflictBody\?\.code \?\? conflictBody\?\.error,\s*'final_source_conflict'/);
  assert.match(harness, /assert\.deepEqual\(recoveredState,\s*historyBeforeRejectedAccept/);
  assert.match(harness, /diagnostics\.localExecutionRequests\.length,\s*localCallsBeforeRejectedAccept/);
});

test('R3c uses browser UI as the only Project mutation actor and PostgreSQL only as a correctness oracle', async () => {
  const harness = await readFile('scripts/test-release-r3c-browser-e2e.mjs', 'utf8');

  assert.match(harness, /getByRole\('menuitem'\)\.filter\(\{ hasText: 'Save current as version' \}\)/);
  assert.match(harness, /dialog\.type\(\),\s*'prompt'/);
  assert.match(harness, /getByRole\('menuitem'\)\.filter\(\{ hasText: versionName \}\)/);
  assert.match(harness, /tabB\.getByRole\('button', \{ name: 'Undo'/);
  assert.doesNotMatch(harness, /\b(?:INSERT|UPDATE|DELETE)\s+(?:FROM\s+)?canonical_(?:projects|project_history|project_versions)\b/i);
  assert.doesNotMatch(harness, /fetch\(`\$\{coreOrigin\}\/api\/core\/projects/i);
});

test('R3c stale recovery remains fail closed with no Retry rerun provider cloud or financial fallback', async () => {
  const harness = await readFile('scripts/test-release-r3c-browser-e2e.mjs', 'utf8');
  const recovery = await readFile('src/application/editor/recoverFinalSourceConflict.js', 'utf8');

  assert.match(harness, /providerCalls,\s*0/);
  assert.match(harness, /diagnostics\.creativeRequests,\s*\[\]/);
  assert.match(harness, /diagnostics\.financialRequests,\s*\[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests,\s*\[\]/);
  assert.match(harness, /diagnostics\.legacyRequests,\s*\[\]/);
  assert.match(harness, /getByRole\('button', \{ name: 'Retry'/);
  assert.match(harness, /R3_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED/);
  assert.match(recovery, /disarmRetry\(\);/);
  assert.match(recovery, /await reloadCanonicalProject\(\)/);
  assert.match(recovery, /clearPendingResult\(\)/);
  assert.match(recovery, /disposePendingPreview\(\)/);
  assert.doesNotMatch(recovery, /\b(?:execute|rerun|provider)\s*\(/i, 'recovery implementation must not call an execution authority');
  assert.doesNotMatch(harness, /financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3c workflow preserves R3b baseline and runs exact-head built SPA Core PostgreSQL Chrome evidence', async () => {
  const workflow = await readFile('.github/workflows/release-r3a-browser-e2e.yml', 'utf8');

  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /test-release-r3b-browser-e2e\.mjs/);
  assert.match(workflow, /test-release-r3c-browser-e2e\.mjs/);
  assert.match(workflow, /release-r3c-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /R3B_BROWSER_DETERMINISTIC_EDIT_ACCEPTED/);
  assert.match(workflow, /R3C_BROWSER_PROJECT_LIFECYCLE_ACCEPTED/);
  assert.match(workflow, /editor-final-source-conflict-recovery\.test\.mjs/);
  assert.match(workflow, /Preserve financial redesign freeze/);
});
