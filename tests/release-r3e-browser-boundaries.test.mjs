import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HARNESS = 'scripts/test-release-r3e-browser-e2e.mjs';
const WORKFLOW = '.github/workflows/release-r3a-browser-e2e.yml';

test('R3e drives real manual Selection pointer input into Core-issued canonical MASK identity', async () => {
  const [harness, editor, toolbar, canvas, maskPort] = await Promise.all([
    readFile(HARNESS, 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/components/editor/ImageCanvas.jsx', 'utf8'),
    readFile('src/application/selection/CoreMaskArtifactPort.js', 'utf8'),
  ]);

  assert.match(toolbar, /\['BRUSH_ADD', 'Add'\]/);
  assert.match(toolbar, />Done<\/Button>/);
  assert.match(canvas, /onPointerDown=\{pointer\('down'\)\}/);
  assert.match(canvas, /onPointerMove=\{pointer\('move'\)\}/);
  assert.match(canvas, /onPointerUp=\{pointer\('up'\)\}/);

  assert.match(editor, /new CoreMaskArtifactPort\(project\.id\)/);
  assert.match(editor, /new SelectionApplicationService\(segmentation, artifacts\)/);
  assert.match(editor, /const artifact = await selectionServiceRef\.current\.done\(\)/);
  assert.match(editor, /mask_artifact_id: artifact\.id/);
  assert.match(maskPort, /client\.artifacts\.persistMask\(/);
  assert.doesNotMatch(maskPort, /randomUUID|crypto\.randomUUID/);

  for (const text of [
    "getByRole('button', { name: 'Smart Select', exact: true })",
    "getByRole('button', { name: 'Add', exact: true })",
    "getByLabel('Brush Size').fill('96')",
    "projectImage.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } })",
    "getByRole('button', { name: 'Done', exact: true })",
    "'/api/core/artifacts/masks'",
  ]) assert.equal(harness.includes(text), true, `R3e harness must drive ${text}`);

  assert.doesNotMatch(harness, /page\.mouse\./, 'R3e must use actionability-backed locator pointer input rather than a mouse-only event assumption');
  assert.match(harness, /manual selection draft must remain noncanonical before Done/);
  assert.match(harness, /manual selection draft must not mutate Project before Done/);
  assert.match(harness, /manual Add release-floor selection must not invoke Smart Select\/model execution/);
  assert.match(harness, /producerOperation, 'MANUAL_SELECTION'/);
  assert.match(harness, /selectedPixels > 0/);
  assert.match(harness, /selectedPixels < 12 \* 8/);
});

test('R3e consumes the exact selected canonical MASK through production Background Isolation', async () => {
  const [harness, editor, isolation] = await Promise.all([
    readFile(HARNESS, 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/application/createBackgroundIsolation.ts', 'utf8'),
  ]);

  assert.match(editor, /selected\?\.mask_artifact_id/);
  assert.match(editor, /createBackgroundIsolation\(\{ projectId: project\.id \}\)/);
  assert.match(isolation, /prepareBackgroundIsolation/);
  assert.match(isolation, /loadBackgroundIsolationInputs/);
  assert.match(isolation, /uploadBackgroundIsolationImage/);
  assert.match(isolation, /submitBackgroundIsolation/);
  assert.match(isolation, /input\.sourceArtifactId === input\.maskArtifactId/);

  for (const text of [
    "getByRole('button', { name: 'Remove background', exact: true })",
    "getByRole('button', { name: 'Discard', exact: true })",
    "getByRole('button', { name: 'Accept', exact: true })",
    "waitEnabledButton(page, 'Undo')",
    "waitEnabledButton(page, 'Redo')",
  ]) assert.equal(harness.includes(text), true, `R3e harness must drive ${text}`);

  assert.match(harness, /Background Isolation Preview must not mutate Project before explicit Accept/);
  assert.match(harness, /Background Isolation Discard must be non-mutating/);
  assert.match(harness, /repeated Background Isolation must reuse the exact canonical MASK rather than minting another/);
  assert.match(harness, /local_execution_tickets/);
  assert.match(harness, /maskInputs\[0\]\.artifactId, maskArtifactId/);
  assert.match(harness, /acceptedFinal\.mask_storage_id, canonicalMask\.storage_id/);
  assert.match(harness, /acceptedFinal\.source_image_storage_id, sourceStorageId/);
});

test('R3e uses built SPA built production Core and PostgreSQL only as read-only correctness oracle', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /path\.resolve\('dist'\)/);
  assert.match(harness, /path\.resolve\('dist-server\/server\.mjs'\)/);
  assert.match(harness, /NODE_ENV: 'production'/);
  assert.match(harness, /PostgresAuthStore/);
  assert.match(harness, /canonical_projects/);
  assert.match(harness, /canonical_project_history/);
  assert.match(harness, /canonical_image_artifacts/);
  assert.match(harness, /canonical_mask_artifacts/);
  assert.match(harness, /local_execution_tickets/);
  assert.match(harness, /chromium\.launch\(\{ channel: 'chrome', headless: true \}\)/);
  assert.doesNotMatch(harness, /InMemory|FakeProject|MockProject|FakeArtifact|MockArtifact|FakeMask|MockMask/);

  const sqlMutations = [...harness.matchAll(/pool\.query\(\s*`([^`]+)`/g)]
    .map(match => match[1].trim().split(/\s+/)[0].toUpperCase());
  assert.deepEqual([...new Set(sqlMutations)], ['SELECT'], 'browser must be the only Project/MASK mutation actor; PostgreSQL is read-only oracle');
});

test('R3e manual Selection and deterministic MASK consumer cannot silently cross model cloud or financial authority', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /diagnostics\.segmentationRequests, \[\]/);
  assert.match(harness, /providerCalls, 0/);
  assert.match(harness, /diagnostics\.creativeRequests, \[\]/);
  assert.match(harness, /diagnostics\.financialRequests, \[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests, \[\]/);
  assert.match(harness, /\/api\/core\/local-execution\//);
  assert.match(harness, /R3E_BROWSER_SELECTION_MASK_ACCEPTED/);
  assert.doesNotMatch(harness, /financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3 release workflow makes R3e cumulative Selection MASK evidence an exact-head merge gate', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');

  assert.match(workflow, /CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /tests\/release-r3e-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /scripts\/test-release-r3e-browser-e2e\.mjs/);
  assert.match(workflow, /R3e Selection canonical MASK Background Isolation journey/);
  assert.match(workflow, /R3E_BROWSER_SELECTION_MASK_ACCEPTED/);
});
