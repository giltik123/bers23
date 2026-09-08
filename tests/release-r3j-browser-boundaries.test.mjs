import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('R3j browser journey uses real production composition and post-response ambiguity injection only', async () => {
  const harness = await read('scripts/test-release-r3j-browser-e2e.mjs');

  for (const required of [
    "NODE_ENV: 'production'",
    'VITE_CORE_API_URL',
    "channel: 'chrome'",
    'browserContext.addInitScript',
    'const originalFetch = window.fetch.bind(window)',
    'const response = await originalFetch(...args)',
    'await response.clone().arrayBuffer()',
    'throw new TypeError(`R3j injected transport ambiguity after real ${fault} response`)',
    "'/api/core/fashion/try-on/prepare'",
    "'/api/core/fashion/try-on/result'",
    "'/api/core/fashion/try-on/preview'",
    "':garment-warp:v1'",
    "':texture-composite:v1'",
  ]) assert.equal(harness.includes(required), true, required);

  for (const forbidden of [
    'page.route(',
    'browserContext.route(',
    'context.route(',
    'route.fulfill(',
    'route.abort(',
    'route.continue(',
    'route.fallback(',
    'setTimeout(() => window.__r3jFault',
  ]) assert.equal(harness.includes(forbidden), false, forbidden);
});

test('R3j manual readiness is visible, explicit and never locally promotes a save to READY', async () => {
  const harness = await read('scripts/test-release-r3j-browser-e2e.mjs');
  const remediation = await read('src/components/editor/outfits/CanonicalTryOnManualRemediationPanel.jsx');
  const policy = await read('src/application/fashion/canonicalTryOnManualRemediationPolicy.js');

  for (const required of [
    "name: 'Draw garment contour'",
    "name: 'Save contour'",
    "name: 'Check readiness again'",
    "name: 'Place body anchors'",
    "name: 'Save body anchors'",
    "firstReadinessBody.status, 'REPRESENTATION_REQUIRED'",
    "bodyReadinessBody.status, 'BODY_ANCHORS_REQUIRED'",
    "readyBody.status, 'READY'",
    '[[0.12, 0.12], [0.88, 0.12], [0.82, 0.88], [0.18, 0.88]]',
    "'left shoulder': [0.2, 0.1]",
    "'right shoulder': [0.8, 0.1]",
    "'left hip': [0.25, 0.8]",
    "'right hip': [0.75, 0.8]",
  ]) assert.equal(harness.includes(required), true, required);

  assert.match(remediation, /canonicalTryOnManualSaveTransition/);
  assert.match(policy, /mode: 'RECHECK_REQUIRED'/);
  assert.doesNotMatch(policy, /save[\s\S]{0,200}status:\s*'READY'/i);
});

test('R3j split-origin display fixes stay narrow to configured Core resources', async () => {
  const [resource, manual, contour, body, handoff, hook] = await Promise.all([
    read('src/api/coreResourceUrl.js'),
    read('src/application/fashion/createCanonicalTryOnManualPrerequisiteApplication.js'),
    read('src/application/fashion/canonicalTryOnManualContourDraft.js'),
    read('src/application/fashion/canonicalTryOnManualBodyAnchorDraft.js'),
    read('src/application/fashion/createTryOnEditorFinalHandoff.js'),
    read('src/components/editor/outfits/useCanonicalTryOnEditor.js'),
  ]);

  assert.match(resource, /export function canonicalCoreResourcePath/);
  assert.match(resource, /resolveCoreResourceUrl\(path, apiRoot\) === value \? path : null/);
  assert.match(resource, /parsed\.username \|\| parsed\.password/);
  assert.match(manual, /canonicalCoreResourcePath\(view\.deliveryUrl, coreApiRoot\)/);
  assert.match(manual, /GARMENT_DELIVERY\.test\(deliveryPath\)/);
  assert.match(contour, /canonicalCoreResourcePath\(value\.imageUrl, coreApiRoot\)/);
  assert.match(body, /canonicalCoreResourcePath\(normalized, coreApiRoot\) !== null/);
  assert.match(hook, /resolveCoreResourceUrl/);
  assert.match(handoff, /resolveRecoveryPreviewUrl/);

  for (const source of [resource, manual, contour, body, handoff]) {
    assert.equal(source.includes('127.0.0.1:4188'), false, 'production URL policy must not hard-code the release test origin');
  }
});

test('R3j UNCERTAIN exposes explicit reconciliation without automatic retry', async () => {
  const [ui, session, harness] = await Promise.all([
    read('src/application/fashion/canonicalTryOnProductUiState.js'),
    read('src/application/fashion/createCanonicalTryOnProductSession.js'),
    read('scripts/test-release-r3j-browser-e2e.mjs'),
  ]);

  assert.match(ui, /safeHost\.phase === 'UNCERTAIN'/);
  assert.match(ui, /Recover or resume explicitly; no automatic retry occurs/);
  assert.match(session, /phase = 'UNCERTAIN'/);
  assert.match(session, /return exclusive\('recover', \(\) => invokeInFlight\('recover'\)\)/);
  assert.match(session, /inFlight = null;\s*phase = 'IDLE';\s*return beginFresh\(\)/s);
  assert.match(harness, /name: 'Abandon'/);
  assert.match(harness, /name: 'Recover'/);
  assert.match(harness, /name: 'Retry'/);
  assert.match(harness, /assert\.notEqual\(clientRequestC, clientRequestA\)/);
  assert.match(harness, /assert\.notEqual\(clientRequestC, clientRequestB\)/);
});

test('R3j PostgreSQL product oracle is SELECT-only and correlates phase IDs through idempotency authority', async () => {
  const harness = await read('scripts/test-release-r3j-browser-e2e.mjs');

  const sql = [...harness.matchAll(/pool\.query\(\s*`([\s\S]*?)`/g)].map((match) => match[1].trim());
  assert(sql.length >= 7, 'R3j must contain explicit PostgreSQL oracle queries');
  for (const statement of sql) {
    assert.match(statement, /^SELECT\b/i, statement.slice(0, 80));
    assert.doesNotMatch(statement, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/i);
  }

  assert.match(harness, /FROM local_execution_tickets/);
  assert.match(harness, /idempotency_key LIKE \$4/);
  assert.match(harness, /FROM canonical_garment_representations/);
  assert.match(harness, /FROM canonical_project_body_anchor_sets/);
  assert.match(harness, /FROM canonical_image_artifacts/);
  assert.match(harness, /execution_id=\$4/);
  assert.match(harness, /bTexture\.request_id/);
  assert.match(harness, /cTexture\.request_id/);
});

test('R3j keeps Project authority closed until existing Editor Accept', async () => {
  const harness = await read('scripts/test-release-r3j-browser-e2e.mjs');
  const editor = await read('src/pages/Editor.jsx');

  assert.match(harness, /projectBeforeAccept[\s\S]*deepEqual\(projectBeforeAccept, initialProject/s);
  assert.match(harness, /\/api\/core\/projects\/\$\{projectId\}\/accept-final/);
  assert.match(harness, /finalArtifactId: resultCBody\.artifactId/);
  assert.match(harness, /cursor\.kind, 'ACCEPTED_FINAL'/);
  assert.match(harness, /current_image_storage_id, cFinal\.storage_id/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.match(editor, /pending\?\.kind === 'FASHION_TRYON'/);
  assert.deepEqual(
    [...harness.matchAll(/diagnostics\.projectMutations,\s*\[([^\]]+)\]/g)].length,
    1,
    'R3j should assert one final Project mutation sequence',
  );
});

test('R3j forbids provider, Billing, generic artifact mutation, MASK and legacy Try-On fallback', async () => {
  const harness = await read('scripts/test-release-r3j-browser-e2e.mjs');

  for (const required of [
    'providerCalls, 0',
    'diagnostics.creativeRequests, []',
    'diagnostics.financialRequests, []',
    'diagnostics.maskRequests, []',
    'diagnostics.genericAssetMutations, []',
    'diagnostics.legacyTryOnRequests, []',
    'diagnostics.externalBrowserRequests, []',
  ]) assert.equal(harness.includes(required), true, required);

  assert.match(harness, /R3J_PROVIDER_BOUNDARY_MUST_NOT_BE_CALLED/);
  assert.match(harness, /CREATIVE_PROVIDER: 'FAL'/);
  assert.match(harness, /FAL_BASE_URL: providerOrigin/);
});

test('cumulative R3 workflow must run R3j after the already accepted R3i journey', async () => {
  const workflow = await read('.github/workflows/release-r3a-browser-e2e.yml');
  const r3i = workflow.indexOf('scripts/test-release-r3i-browser-e2e.mjs');
  const r3j = workflow.indexOf('scripts/test-release-r3j-browser-e2e.mjs');
  assert(r3i >= 0, 'accepted R3i journey must remain in cumulative workflow');
  assert(r3j > r3i, 'R3j must be appended after R3i');
  assert.match(workflow, /tests\/release-r3j-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /R3J_BROWSER_CANONICAL_TRYON_ACCEPTED/);
});
