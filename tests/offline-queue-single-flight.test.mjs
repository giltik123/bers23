import assert from 'node:assert/strict';
import test from 'node:test';

// The queue is browser-only; exercise its real module with a deterministic
// online browser environment and no provider, Core or network calls.
globalThis.window = { addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: true },
});
const { OfflineQueue } = await import('../src/lib/performance/offlineQueue.js');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function freshQueue() {
  const queue = new OfflineQueue();
  await new Promise((resolve) => setImmediate(resolve));
  return queue;
}

test('overlapping reconnect flushes dispatch a queued upload exactly once', async () => {
  const queue = await freshQueue();
  const started = deferred();
  const release = deferred();
  let calls = 0;
  queue.register('project-upload', async () => {
    calls += 1;
    started.resolve();
    await release.promise;
  });
  queue.enqueue({ kind: 'project-upload', file: 'fixture' });
  const first = queue.flush();
  const second = queue.flush();
  await started.promise;
  assert.equal(calls, 1);
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(queue.snapshot(), { queued: 0, running: 0 });
});

test('cancelling an in-flight item does not drop the next queued item', async () => {
  const queue = await freshQueue();
  const started = deferred();
  const release = deferred();
  const seen = [];
  queue.register('project-upload', async (item) => {
    seen.push(item.file);
    if (item.file === 'first') {
      started.resolve();
      await release.promise;
    }
  });
  const first = queue.enqueue({ kind: 'project-upload', file: 'first' });
  queue.enqueue({ kind: 'project-upload', file: 'second' });
  const flushing = queue.flush();
  await started.promise;
  queue.cancel(first);
  release.resolve();
  await flushing;
  assert.deepEqual(seen, ['first', 'second']);
  assert.deepEqual(queue.snapshot(), { queued: 0, running: 0 });
});

test('cancellation during a failing handler never charges retries to the next item', async () => {
  const queue = await freshQueue();
  const started = deferred();
  const release = deferred();
  const seen = [];
  queue.register('project-upload', async (item) => {
    seen.push(item.file);
    if (item.file === 'first') {
      started.resolve();
      await release.promise;
      throw new Error('cancelled in-flight upload');
    }
  });
  const first = queue.enqueue({ kind: 'project-upload', file: 'first' });
  queue.enqueue({ kind: 'project-upload', file: 'second' });
  const flushing = queue.flush();
  await started.promise;
  queue.cancel(first);
  release.resolve();
  await flushing;
  assert.deepEqual(seen, ['first', 'second']);
  assert.deepEqual(queue.snapshot(), { queued: 0, running: 0 });
});

test('uncancelled failures retain the existing three-attempt bound', async () => {
  const queue = await freshQueue();
  let attempts = 0;
  queue.register('project-upload', async () => {
    attempts += 1;
    throw new Error('offline');
  });
  queue.enqueue({ kind: 'project-upload', file: 'fixture' });
  await queue.flush();
  assert.equal(queue.snapshot().queued, 1);
  await queue.flush();
  assert.equal(queue.snapshot().queued, 1);
  await queue.flush();
  assert.equal(attempts, 3);
  assert.deepEqual(queue.snapshot(), { queued: 0, running: 0 });
});
