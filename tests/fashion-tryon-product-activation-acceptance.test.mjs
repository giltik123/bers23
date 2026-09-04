import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const FILES = Object.freeze({
  application: 'src/application/fashion/canonicalTryOnApplication.js',
  browser: 'src/application/fashion/createCanonicalTryOnBrowserApplication.js',
  session: 'src/application/fashion/createCanonicalTryOnProductSession.js',
  host: 'src/application/fashion/createCanonicalTryOnEditorHost.js',
  handoff: 'src/application/fashion/createTryOnEditorFinalHandoff.js',
  remediation: 'src/application/fashion/canonicalTryOnManualRemediationPolicy.js',
  runner: 'src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx',
  controls: 'src/components/editor/outfits/CanonicalTryOnProductControls.jsx',
  manualPanel: 'src/components/editor/outfits/CanonicalTryOnManualRemediationPanel.jsx',
  hook: 'src/components/editor/outfits/useCanonicalTryOnEditor.js',
  editor: 'src/pages/Editor.jsx',
  legacy: 'src/lib/tryon/tryonEngine.js',
  workflow: '.github/workflows/fashion-tryon-product-activation-f4b6d10f.yml',
});

async function source(name) {
  return readFile(FILES[name], 'utf8');
}

test('one explicit Outfit entry is the only product selection admitted per Try-On controller', async () => {
  const [runner, host] = await Promise.all([source('runner'), source('host')]);
  assert.match(runner, /selectedEntryId/);
  assert.match(runner, /entryId: selectedEntry\.entryId/);
  assert.match(runner, /Locked selection:/);
  assert.doesNotMatch(runner, /selectedEntryIds|garmentIds|Promise\.all\([^]*onAction/);
  assert.match(host, /requireExactKeys\(value\.selection, \['entryId', 'outfit', 'projectId', 'sourceArtifactId'\]/);
});

test('READY is required for Run and no render/effect can advance execution', async () => {
  const [controls, runner] = await Promise.all([source('controls'), source('runner')]);
  assert.match(controls, /disabled=\{!ui\.canRun/);
  assert.match(controls, /Check readiness/);
  assert.match(runner, /Selection alone never starts execution/);
  const effectStart = runner.indexOf('useEffect(() => {');
  const effectEnd = runner.indexOf('}, [model]);', effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, 'read-only Outfit load effect must remain explicit');
  const loadEffect = runner.slice(effectStart, effectEnd);
  assert.match(loadEffect, /void load\(\)/);
  assert.doesNotMatch(loadEffect, /onAction|prepareTryOn|continueTryOn|retry/);
});

test('manual prerequisite flow cannot infer evidence or promote Save directly to READY', async () => {
  const [policy, panel] = await Promise.all([source('remediation'), source('manualPanel')]);
  assert.match(policy, /REPRESENTATION_REQUIRED/);
  assert.match(policy, /BODY_ANCHORS_REQUIRED/);
  assert.match(policy, /mode: 'RECHECK_REQUIRED'/);
  assert.match(policy, /readiness: null/);
  assert.match(panel, /Check readiness again/);
  assert.doesNotMatch(panel, /onRun|onResume|onRecover|onRetry/);
});

test('browser execution is ticket-bound to admitted mesh and texture executors only', async () => {
  const browser = await source('browser');
  assert.match(browser, /CorePreparedGarmentMeshWarp/);
  assert.match(browser, /CorePreparedGarmentTextureComposite/);
  assert.match(browser, /loadPreparedGarmentMeshWarpInput: \(payload\) => fashion\.loadTryOnWarpInput\(payload\)/);
  assert.match(browser, /submitPreparedGarmentMeshWarpCandidate: \(payload\) => fashion\.submitTryOnWarpCandidate\(payload\)/);
  assert.match(browser, /loadPreparedGarmentTextureCompositeInput: \(payload\) => fashion\.loadTryOnTextureInput\(payload\)/);
  assert.match(browser, /submitPreparedGarmentTextureCompositeCandidate: \(payload\) => fashion\.submitTryOnTextureCandidate\(payload\)/);
  assert.doesNotMatch(browser, /prepareGarmentMeshWarp|prepareGarmentTextureComposite|FASHN|Billing|credits/);
});

test('explicit Run/Retry identity and Resume/Recover identity remain separated', async () => {
  const session = await source('session');
  assert.match(session, /usedRequestIds = new Set\(\)/);
  assert.match(session, /allocateIntent/);
  assert.match(session, /resume\(\)/);
  assert.match(session, /recover\(\)/);
  assert.match(session, /retry\(\)\s*\{\s*return exclusive\('retry', async \(\) => \{/);
  assert.match(session, /inFlight = null/);
  assert.match(session, /return beginFresh\(\)/);
  assert.doesNotMatch(session, /localStorage|sessionStorage|indexedDB/);
});

test('FINAL preview remains a candidate until explicit existing Editor Accept', async () => {
  const [handoff, editor] = await Promise.all([source('handoff'), source('editor')]);
  assert.match(handoff, /FASHION_TRYON/);
  assert.match(editor, /<ResultCompare/);
  assert.match(editor, /pending\?\.kind === 'FASHION_TRYON'/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.match(editor, /if \(pending\?\.kind === 'FASHION_TRYON'\) closeTryOn\(\)/);
  assert.match(editor, /void tryOn\.retry\(\)/);
});

test('final Core matrix retains real manual body-anchor HTTP and stored-source authority proofs', async () => {
  const workflow = await source('workflow');
  for (const required of [
    'fashion-manual-parametric-http-f4b6c1b',
    'fashion-manual-body-anchor-http-f4b6c2c',
    'fashion-manual-body-anchor-client-errors-f4b6c2c',
    'artifact-authority-stored-image-evidence',
  ]) assert.ok(workflow.includes(required), `10f Core matrix is missing ${required}`);
  assert.match(workflow, /server\/core\/artifacts\/\*\*/);
  assert.match(workflow, /tests\/artifact-authority-stored-image-evidence\.test\.ts/);
});

test('canonical React product boundary owns neither evidence nor provider/cloud authority', async () => {
  const values = await Promise.all(['runner', 'controls', 'manualPanel', 'hook'].map(source));
  const combined = values.join('\n');
  for (const forbidden of [
    'representationId', 'anchorSetId', 'storageId', 'contentSha256', 'destinationMesh',
    'ticketId', 'FASHN', 'Billing', 'credits', 'localStorage', 'sessionStorage', 'indexedDB',
  ]) assert.equal(combined.includes(forbidden), false, forbidden);
});

test('legacy Try-On execution remains permanently tombstoned beside canonical activation', async () => {
  const legacy = await source('legacy');
  assert.match(legacy, /TRYON_EXECUTION_NOT_WIRED/);
  assert.match(legacy, /Compatibility facade only/);
  assert.match(legacy, /provider call or URL-chained multi-garment execution is permitted here\./);
  assert.doesNotMatch(legacy, /prepareTryOn|continueTryOn|getTryOnResult|CorePreparedGarment/);
});
