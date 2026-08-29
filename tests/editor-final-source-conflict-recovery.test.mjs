import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FINAL_SOURCE_CONFLICT_MESSAGE,
  isFinalSourceConflict,
  recoverFinalSourceConflict,
} from '../src/application/editor/recoverFinalSourceConflict.js';

test('only the canonical final_source_conflict code selects stale FINAL recovery', () => {
  assert.equal(isFinalSourceConflict({ code: 'final_source_conflict' }), true);
  assert.equal(isFinalSourceConflict({ status: 409, code: 'other_conflict' }), false);
  assert.equal(isFinalSourceConflict({ status: 409, message: 'final_source_conflict' }), false);
  assert.equal(isFinalSourceConflict({ code: 'FINAL_SOURCE_CONFLICT' }), false);
  assert.equal(isFinalSourceConflict(null), false);
});

test('recovery disarms stale Retry immediately and does not expose a cleared Editor until canonical reload finishes', async () => {
  const events = [];
  let releaseReload;
  const reloadBarrier = new Promise((resolve) => { releaseReload = resolve; });

  const recovery = recoverFinalSourceConflict({
    reloadCanonicalProject: async () => {
      events.push('reload-start');
      await reloadBarrier;
      events.push('reload-finish');
    },
    disarmRetry: () => events.push('disarm-retry'),
    clearPendingResult: () => events.push('clear-pending'),
    disposePendingPreview: () => events.push('dispose-preview'),
    showMessage: (message) => events.push(`message:${message}`),
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['disarm-retry', 'reload-start']);

  releaseReload();
  await recovery;

  assert.deepEqual(events, [
    'disarm-retry',
    'reload-start',
    'reload-finish',
    'clear-pending',
    'dispose-preview',
    `message:${FINAL_SOURCE_CONFLICT_MESSAGE}`,
  ]);
});

test('reload failure still clears the stale pending result and preview, without any automatic rerun callback', async () => {
  const events = [];
  const failure = new Error('canonical reload unavailable');

  await assert.rejects(
    () => recoverFinalSourceConflict({
      reloadCanonicalProject: async () => {
        events.push('reload');
        throw failure;
      },
      disarmRetry: () => events.push('disarm-retry'),
      clearPendingResult: () => events.push('clear-pending'),
      disposePendingPreview: () => events.push('dispose-preview'),
      showMessage: () => events.push('message'),
    }),
    (error) => error === failure,
  );

  assert.deepEqual(events, ['disarm-retry', 'reload', 'clear-pending', 'dispose-preview', 'message']);
});

test('Editor wires stale recovery to the captured pending preview and clears ErrorBanner retry authority', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const acceptStart = editor.indexOf('const acceptResult = async () => {');
  const acceptEnd = editor.indexOf('\n  const retryResult = () => {', acceptStart);
  assert.ok(acceptStart >= 0 && acceptEnd > acceptStart, 'Editor acceptResult boundary must exist');
  const accept = editor.slice(acceptStart, acceptEnd);

  assert.match(accept, /await pushEdit\(result\.finalArtifactId, used\);/);
  assert.match(accept, /if \(!isFinalSourceConflict\(e\)\) throw e;/);
  assert.match(accept, /reloadCanonicalProject: reload/);
  assert.match(accept, /disarmRetry: \(\) => setLastAction\(null\)/);
  assert.match(accept, /clearPendingResult: \(\) => setPendingResult\(null\)/);
  assert.match(accept, /disposePendingPreview: \(\) => disposePendingPreview\(pending\)/);
  assert.doesNotMatch(accept, /retryResult\(|applyEdit\(|isolateBackground\(|applyCrop\(|applyResize\(|upscaleImage\(/);
});
