import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Editor wires canonical Try-On through the private hook and existing ResultCompare only', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  assert.match(editor, /CanonicalTryOnRunnerPanel/);
  assert.match(editor, /useCanonicalTryOnEditor\(\{/);
  assert.match(editor, /await tryOn\.dispatch\(name, context\)/);
  assert.match(editor, /pending\?\.kind === 'FASHION_TRYON'/);
  assert.match(editor, /void tryOn\.retry\(\)/);
  assert.match(editor, /if \(pending\?\.kind === 'FASHION_TRYON'\) closeTryOn\(\)/);
  assert.match(editor, /const editorBusy = localEditorBusy \|\| tryOnActive/);
  assert.match(editor, /!tryOnActive && !applying/);
  assert.match(editor, /if \(!tryOnActive\) setEditTab\(next\)/);
  assert.match(editor, /!tryOn\.state\.host\.active && <OutfitPanel \/>/);

  const fashionRetry = editor.indexOf("pending?.kind === 'FASHION_TRYON'");
  const backgroundRetry = editor.indexOf("pending?.kind === 'BACKGROUND_ISOLATION'");
  const genericRetry = editor.indexOf('applyEdit(true, { skipDriftCheck: true })');
  assert.ok(fashionRetry >= 0 && fashionRetry < backgroundRetry && backgroundRetry < genericRetry);

  for (const forbidden of [
    'createCanonicalTryOnProductRuntime', 'createCanonicalTryOnProductSession',
    'createCanonicalTryOnEditorController', 'coreClient', 'tryonEngine',
  ]) assert.equal(editor.includes(forbidden), false, forbidden);
});

test('hook publishes synchronous host admission before awaiting readiness and keeps request identity private', async () => {
  const hook = await readFile('src/components/editor/outfits/useCanonicalTryOnEditor.js', 'utf8');
  const invoke = hook.indexOf('const operation = host[name](context);');
  const awaited = hook.indexOf('const result = await ', invoke);
  const helperAdmission = hook.indexOf('publishAdmission(host, selection);', invoke);
  const directAdmission = hook.indexOf('setState((previous) => Object.freeze({ ...previous, selection, host: host.snapshot() }));', invoke);
  const admissionCandidates = [helperAdmission, directAdmission]
    .filter((position) => position > invoke && position < awaited);
  assert.ok(invoke >= 0 && awaited > invoke && admissionCandidates.length === 1, 'exactly one accepted host admission path must be published before await');

  if (helperAdmission === admissionCandidates[0]) {
    const helperStart = hook.indexOf('const publishAdmission = useCallback((host, selection) => {');
    const helperEnd = hook.indexOf('}, []);', helperStart);
    assert.ok(helperStart >= 0 && helperEnd > helperStart, 'publishAdmission helper must remain explicit');
    assert.match(hook.slice(helperStart, helperEnd), /host: host\.snapshot\(\)/);
  } else {
    assert.equal(directAdmission, admissionCandidates[0], 'inline admission must publish the host snapshot directly');
  }

  assert.match(hook, /host\.requestDispose\(\)/);
  assert.match(hook, /revokeFinalCandidate\(result\)/);
  assert.match(hook, /selectionRef\.current = selection/);
  assert.match(hook, /host\.retry\(\)/);
  for (const forbidden of [
    'clientRequestId', 'ticketId', 'representationId', 'anchorSetId', 'storageId',
    'contentSha256', 'destinationMesh', 'localStorage', 'sessionStorage', 'indexedDB',
  ]) assert.equal(hook.includes(forbidden), false, forbidden);
});

test('runner locks to the admitted Outfit, source artifact and beforeUrl and never starts execution from an effect', async () => {
  const runner = await readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8');
  assert.match(runner, /const hostActive = Boolean\(state\?\.host\?\.active\)/);
  assert.match(runner, /const lockedSelection = hostActive \? state\?\.selection : null/);
  assert.match(runner, /lockedSelection\?\.outfit/);
  assert.match(runner, /lockedSelection\?\.entryId/);
  assert.match(runner, /projectId: lockedSelection\.projectId/);
  assert.match(runner, /sourceArtifactId: lockedSelection\.sourceArtifactId/);
  assert.match(runner, /beforeUrl: lockedSelection\.beforeUrl/);
  const lockedBranch = runner.indexOf('if (lockedSelection)');
  const liveProjectSource = runner.indexOf('sourceArtifactId: project.current_image_artifact_id');
  assert.ok(lockedBranch >= 0 && liveProjectSource > lockedBranch, 'live Project source may be used only after the locked-selection branch');
  assert.match(runner, /!hostActive && \(/);
  assert.match(runner, /Selection alone never starts execution/);
  const effectStart = runner.indexOf('useEffect(() => {');
  const effectEnd = runner.indexOf('}, [model]);', effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, 'read-only Outfit load effect must remain explicit');
  const loadEffect = runner.slice(effectStart, effectEnd);
  assert.match(loadEffect, /void load\(\)/);
  assert.doesNotMatch(loadEffect, /onAction|prepareTryOn|continueTryOn|retry/);
  assert.doesNotMatch(runner, /clientRequestId|ticketId|tryonEngine/);
});

test('legacy Try-On engine remains a permanent tombstone while canonical wiring is activated', async () => {
  const legacy = await readFile('src/lib/tryon/tryonEngine.js', 'utf8');
  assert.match(legacy, /TRYON_EXECUTION_NOT_WIRED/);
});
