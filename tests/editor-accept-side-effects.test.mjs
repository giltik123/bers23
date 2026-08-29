import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { finalizeAcceptedResult } from '../src/application/editor/finalizeAcceptedResult.js';

test('Editor keeps canonical Accept explicit and finalizes browser state only after it succeeds', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const acceptIndex = editor.indexOf('await pushEdit(result.finalArtifactId, used);');
  const finalizeIndex = editor.indexOf('finalizeAcceptedResult({', acceptIndex);
  assert.ok(acceptIndex >= 0, 'canonical Project Accept must remain an explicit awaited boundary');
  assert.ok(finalizeIndex > acceptIndex, 'accepted-result browser finalization must run only after canonical Accept succeeds');
});

test('rejected notification cannot turn a successful canonical Accept into a failed or repeatable UI commit', async () => {
  const order = ['canonical-accept'];
  const reported = [];
  let cleanupCount = 0;

  finalizeAcceptedResult({
    cleanupAcceptedResult: () => {
      cleanupCount += 1;
      order.push('cleanup');
    },
    sideEffects: [
      {
        label: 'Failed to create accepted-edit notification',
        run: () => {
          order.push('notification');
          return Promise.reject(new Error('compatibility notification endpoint unavailable'));
        },
      },
      {
        label: 'Failed to record workspace history',
        run: () => { order.push('workspace-history'); },
      },
    ],
    reportSideEffectError: (label, error) => reported.push({ label, message: error.message }),
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(cleanupCount, 1, 'accepted pending UI must be cleared exactly once');
  assert.deepEqual(order.slice(0, 2), ['canonical-accept', 'cleanup'], 'cleanup must precede every optional side effect');
  assert.deepEqual(order.slice(2), ['notification', 'workspace-history']);
  assert.deepEqual(reported, [{
    label: 'Failed to create accepted-edit notification',
    message: 'compatibility notification endpoint unavailable',
  }]);
});

test('synchronous optional side-effect failures do not block later accepted-edit side effects', () => {
  const ran = [];
  const reported = [];

  finalizeAcceptedResult({
    cleanupAcceptedResult: () => { ran.push('cleanup'); },
    sideEffects: [
      {
        label: 'Failed to update scene memory',
        run: () => {
          ran.push('scene-memory');
          throw new Error('scene compatibility failure');
        },
      },
      {
        label: 'Failed to record workspace history',
        run: () => { ran.push('workspace-history'); },
      },
    ],
    reportSideEffectError: (label, error) => reported.push({ label, message: error.message }),
  });

  assert.deepEqual(ran, ['cleanup', 'scene-memory', 'workspace-history']);
  assert.deepEqual(reported, [{ label: 'Failed to update scene memory', message: 'scene compatibility failure' }]);
});

test('cleanup failure is reported but cannot convert an already-successful canonical Accept into a rejected promise', () => {
  const ran = [];
  const reported = [];

  assert.doesNotThrow(() => finalizeAcceptedResult({
    cleanupAcceptedResult: () => {
      ran.push('cleanup');
      throw new Error('preview cleanup failure');
    },
    sideEffects: [{ label: 'notification', run: () => { ran.push('notification'); } }],
    reportSideEffectError: (label, error) => reported.push({ label, message: error.message }),
  }));

  assert.deepEqual(ran, ['cleanup', 'notification']);
  assert.deepEqual(reported, [{ label: 'Failed to finalize accepted-result UI state', message: 'preview cleanup failure' }]);
});
