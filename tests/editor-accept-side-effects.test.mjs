import assert from 'node:assert/strict';
import test from 'node:test';
import { commitAcceptedResult } from '../src/application/editor/commitAcceptedResult.js';

test('canonical Accept failure preserves the pending result and does not start optional side effects', async () => {
  let cleanupCount = 0;
  let sideEffectCount = 0;
  const failure = Object.assign(new Error('stale source'), { code: 'final_source_conflict' });

  await assert.rejects(
    () => commitAcceptedResult({
      commitCanonical: async () => { throw failure; },
      cleanupAcceptedResult: () => { cleanupCount += 1; },
      sideEffects: [{ label: 'notification', run: () => { sideEffectCount += 1; } }],
    }),
    (error) => error === failure,
  );

  assert.equal(cleanupCount, 0);
  assert.equal(sideEffectCount, 0);
});

test('rejected notification cannot turn one successful canonical Accept into a failed or repeatable UI commit', async () => {
  const order = [];
  const reported = [];
  let canonicalAccepts = 0;
  let cleanupCount = 0;

  await commitAcceptedResult({
    commitCanonical: async () => {
      canonicalAccepts += 1;
      order.push('canonical-accept');
    },
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

  assert.equal(canonicalAccepts, 1, 'canonical Project Accept must happen exactly once');
  assert.equal(cleanupCount, 1, 'accepted pending UI must be cleared exactly once');
  assert.deepEqual(order.slice(0, 2), ['canonical-accept', 'cleanup'], 'cleanup must precede every optional side effect');
  assert.deepEqual(order.slice(2), ['notification', 'workspace-history']);
  assert.deepEqual(reported, [{
    label: 'Failed to create accepted-edit notification',
    message: 'compatibility notification endpoint unavailable',
  }]);
});

test('a synchronous optional side-effect failure does not block later accepted-edit side effects', async () => {
  const ran = [];
  const reported = [];

  await commitAcceptedResult({
    commitCanonical: async () => { ran.push('accept'); },
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

  assert.deepEqual(ran, ['accept', 'cleanup', 'scene-memory', 'workspace-history']);
  assert.deepEqual(reported, [{ label: 'Failed to update scene memory', message: 'scene compatibility failure' }]);
});
