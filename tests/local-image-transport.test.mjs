import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedLocalImageResponse, MAX_LOCAL_DOWNLOAD_BYTES } from '../src/lib/local-editor/localImageTransport.js';

function response(chunks, advertised = null) {
  let index = 0, cancelled = 0, released = 0, opens = 0;
  return {
    stats() { return { index, cancelled, released, opens }; },
    headers: { get(name) { return name === 'content-length' ? advertised : null; } },
    body: { getReader() {
      opens++;
      return {
        async read() {
          if (index === chunks.length) return { done: true };
          const next = chunks[index++];
          if (next instanceof Error) throw next;
          return { done: false, value: next };
        },
        async cancel() { cancelled++; },
        releaseLock() { released++; },
      };
    } },
  };
}

test('streams small Core PNGs with correct binary and MIME while enforcing a supplied budget', async () => {
  const source = response([new Uint8Array([137, 80, 78]), new Uint8Array([71, 0, 1])], '6');
  const result = await readBoundedLocalImageResponse(source, 'image/png', 6);
  assert.equal(result.type, 'image/png');
  assert.equal(result.size, 6);
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [137, 80, 78, 71, 0, 1]);
  assert.deepEqual(source.stats(), { index: 2, cancelled: 0, released: 1, opens: 1 });
});

test('missing Content-Length still stops oversized Core streams BEFORE making a Blob', async () => {
  const source = response([new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7])]);
  await assert.rejects(() => readBoundedLocalImageResponse(source, 'image/jpeg', 5), /exceeds the local 32 MB input limit/);
  assert.deepEqual(source.stats(), { index: 2, cancelled: 1, released: 1, opens: 1 });
});

test('untrustworthy smaller Content-Length never bypasses the decoded stream size cap', async () => {
  const source = response([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])], '1');
  await assert.rejects(() => readBoundedLocalImageResponse(source, 'image/webp', 5), /exceeds/);
  assert.equal(source.stats().cancelled, 1);
});

test('known too-large Content-Length is rejected before reading or allocating any chunks', async () => {
  const source = response([new Uint8Array([1])], '9999999');
  await assert.rejects(() => readBoundedLocalImageResponse(source, 'image/png', 5), /exceeds/);
  assert.equal(source.stats().opens, 0);
  assert.equal(source.stats().index, 0);
});

test('an oversized Content-Length cancels the unread network response body', async () => {
  let cancelled = 0;
  const source = {
    headers: { get() { return '5000'; } },
    body: {
      async cancel() { cancelled++; },
      getReader() { throw new Error('reader must not open'); },
    },
  };
  await assert.rejects(() => readBoundedLocalImageResponse(source, 'image/png', 100), /exceeds/);
  assert.equal(cancelled, 1);
});

test('empty, corrupt and failed streams are rejected, cancelled and locks released', async () => {
  for (const chunks of [[], [new ArrayBuffer(4)], [new Error('connection reset')]]) {
    const source = response(chunks);
    await assert.rejects(() => readBoundedLocalImageResponse(source, 'image/png', 8), /empty|invalid binary|connection reset/);
    assert.equal(source.stats().cancelled, 1);
    assert.equal(source.stats().released, 1);
  }
});

test('stream reader and MIME validation fail closed instead of allocating an unbounded response.blob', async () => {
  const source = response([new Uint8Array([1, 2, 3])]);
  await assert.rejects(() => readBoundedLocalImageResponse(source, 'text/html', 5), /Unsupported/);
  await assert.rejects(() => readBoundedLocalImageResponse(source, '', 5), /Unsupported/);
  await assert.rejects(() => readBoundedLocalImageResponse({ headers: {} }, 'image/png', 5), /Streaming image download is unavailable/);
  await assert.rejects(() => readBoundedLocalImageResponse({ body: { getReader: null } }, 'image/png', 5), /Streaming image download is unavailable/);
  assert.equal(source.stats().opens, 0);
});

test('configuration cannot lift 32 MB maximum or pass invalid/nonfinite limits', async () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, MAX_LOCAL_DOWNLOAD_BYTES + 1]) {
    await assert.rejects(() => readBoundedLocalImageResponse(response([]), 'image/png', limit), /Invalid local photo download limit/);
  }
  assert.equal(MAX_LOCAL_DOWNLOAD_BYTES, 32 * 1024 * 1024);
});

test('ignores dishonest nonnumeric header but continues byte-bound stream enforcement', async () => {
  const source = response([new Uint8Array([1, 2, 3])], 'unknown');
  const result = await readBoundedLocalImageResponse(source, 'image/png', 3);
  assert.equal(result.size, 3);
});
