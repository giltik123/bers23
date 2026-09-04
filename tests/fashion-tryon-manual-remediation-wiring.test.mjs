import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalTryOnManualSaveTransition } from '../src/application/fashion/canonicalTryOnManualRemediationPolicy.js';

const HOOK = 'src/components/editor/outfits/useCanonicalTryOnEditor.js';
const RUNNER = 'src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx';
const PANEL = 'src/components/editor/outfits/CanonicalTryOnManualRemediationPanel.jsx';
const EDITOR = 'src/pages/Editor.jsx';

test('manual and product operations share one Editor serialization guard', async () => {
  const hook = await readFile(HOOK, 'utf8');
  assert.match(hook, /const operationRef = useRef\(null\)/);
  assert.match(hook, /if \(operationRef\.current\)/);
  assert.match(hook, /operationRef\.current = name/);
  assert.match(hook, /operationRef\.current = null/);

  for (const operation of [
    "beginOperation(name)",
    "beginOperation('retry')",
    "beginOperation('manual-source-load')",
    "beginOperation('manual-contour-save')",
    "beginOperation('manual-body-anchor-save')",
  ]) assert.ok(hook.includes(operation), operation);

  assert.match(hook, /abandon cannot run while \$\{operationRef\.current\} is in progress/);
  assert.match(hook, /close cannot run while \$\{operationRef\.current\} is in progress/);
});

test('Editor unmount defers host disposal until the serialized product or manual operation settles', async () => {
  const hook = await readFile(HOOK, 'utf8');
  assert.match(hook, /const disposeAfterOperationRef = useRef\(false\)/);
  assert.match(hook, /if \(!mountedRef\.current\) \{\s*if \(disposeAfterOperationRef\.current\) \{\s*disposeAfterOperationRef\.current = false;\s*host\.requestDispose\(\);\s*\}\s*return;\s*\}/s);
  assert.match(hook, /mountedRef\.current = true;\s*disposeAfterOperationRef\.current = false;/s);
  assert.match(hook, /mountedRef\.current = false;\s*if \(operationRef\.current\) \{\s*disposeAfterOperationRef\.current = true;\s*return;\s*\}\s*host\.requestDispose\(\);/s);

  const finish = hook.indexOf('const finishOperation = useCallback');
  const manualSave = hook.indexOf("beginOperation('manual-contour-save')");
  const cleanup = hook.indexOf('mountedRef.current = false;', manualSave);
  assert.ok(finish >= 0 && manualSave > finish && cleanup > manualSave, 'teardown deferral must cover manual operations before effect cleanup');
});

test('successful manual evidence invalidates stale readiness without synthesizing READY', async () => {
  const hook = await readFile(HOOK, 'utf8');
  assert.match(hook, /invalidateReadiness = true/);
  assert.match(hook, /TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING/);
  assert.match(hook, /finishOperation\(host, \{ clearResult: invalidateReadiness \}\)/);

  const transition = canonicalTryOnManualSaveTransition({
    mode: 'CONTOUR',
    canOpen: true,
  });
  assert.equal(transition.mode, 'RECHECK_REQUIRED');
  assert.equal(transition.canOpen, false);
  assert.equal(transition.readiness, null);
  assert.equal(JSON.stringify(transition).includes('READY'), false);
});

test('runner reuses only the admitted frozen context after host admission', async () => {
  const runner = await readFile(RUNNER, 'utf8');
  const lockedBranch = runner.indexOf('if (lockedSelection)');
  const liveProjectBranch = runner.indexOf("if (!selectedOutfit || !selectedEntry || !project?.id", lockedBranch);
  assert.ok(lockedBranch >= 0 && liveProjectBranch > lockedBranch);

  const frozen = runner.slice(lockedBranch, liveProjectBranch);
  assert.match(frozen, /projectId: lockedSelection\.projectId/);
  assert.match(frozen, /sourceArtifactId: lockedSelection\.sourceArtifactId/);
  assert.match(frozen, /beforeUrl: lockedSelection\.beforeUrl/);
  assert.doesNotMatch(frozen, /current_image_artifact_id|current_image_url/);

  assert.match(runner, /onLoadManualGarmentSource\(value, garmentId\)/);
  assert.match(runner, /onSaveManualContour\(current, value\)/);
  assert.match(runner, /onSaveManualBodyAnchors\(current, value\)/);
});

test('product context failures stay local while manual failures remain rejectable', async () => {
  const runner = await readFile(RUNNER, 'utf8');
  const actionStart = runner.indexOf('const action = (name) =>');
  const manualStart = runner.indexOf('const withManualContext =', actionStart);
  const action = runner.slice(actionStart, manualStart);
  assert.match(action, /setError\(cause\?\.message \|\| 'Try-On selection is invalid\.'\)/);
  assert.match(action, /return undefined/);
  assert.doesNotMatch(action, /Promise\.reject/);

  const manual = runner.slice(manualStart, runner.indexOf('const close =', manualStart));
  assert.match(manual, /Promise\.reject/);
});

test('manual editors are explicit and post-save state permits only a fresh readiness check', async () => {
  const panel = await readFile(PANEL, 'utf8');
  assert.match(panel, /setOpenedPolicy\(livePolicy\)/);
  assert.match(panel, /canonicalTryOnManualSaveTransition\(sourcePolicy\)/);
  assert.match(panel, /remediation\?\.mode === 'RECHECK_REQUIRED'/);
  assert.match(panel, /Check readiness again/);
  assert.match(panel, /onRecheck\(\)/);
  assert.doesNotMatch(panel, /onRun|onResume|onRecover|onRetry/);
  const effectStart = panel.indexOf('useEffect(() => {');
  const effectEnd = panel.indexOf('}, [result]);', effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, 'manual panel readiness-reset effect must remain explicit');
  const readinessResetEffect = panel.slice(effectStart, effectEnd);
  assert.doesNotMatch(readinessResetEffect, /onLoadContourSource|onSaveContour|onSaveBodyAnchors|onRecheck/);
});

test('Editor receives only explicit manual callbacks and no manual/Core authority', async () => {
  const editor = await readFile(EDITOR, 'utf8');
  assert.match(editor, /onLoadManualGarmentSource=\{tryOn\.loadManualGarmentSource\}/);
  assert.match(editor, /onSaveManualContour=\{tryOn\.saveManualContour\}/);
  assert.match(editor, /onSaveManualBodyAnchors=\{tryOn\.saveManualBodyAnchors\}/);
  assert.doesNotMatch(editor, /\.manual\b|createCanonicalTryOnManualPrerequisiteApplication|coreClient\.fashion/);
});

test('10e2 Try-On React boundary retains no execution or canonical evidence identity', async () => {
  const [hook, runner, panel, editor] = await Promise.all([HOOK, RUNNER, PANEL, EDITOR].map((path) => readFile(path, 'utf8')));
  const tryOnBoundary = [hook, runner, panel].join('\n');
  for (const forbidden of [
    'clientRequestId', 'ticketId', 'representationId', 'anchorSetId',
    'storageId', 'contentSha256', 'destinationMesh', 'localStorage',
    'sessionStorage', 'indexedDB',
  ]) assert.equal(tryOnBoundary.includes(forbidden), false, forbidden);
  assert.doesNotMatch(editor, /createCanonicalTryOnProductRuntime|createCanonicalTryOnProductSession|createCanonicalTryOnEditorController|tryonEngine|\.manual\b/);
});
