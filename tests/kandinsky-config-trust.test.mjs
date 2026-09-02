import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  MAX_CONFIG_FILE_BYTES,
  assertPinnedConfigBytes,
  assertPinnedConfigIdentity,
  assertPinnedRevision,
  readBoundedConfigResponse,
  retryBoundedTrustRead,
} from '../scripts/kandinsky-config-trust.mjs';

const bytes = Buffer.from('{"ok":true}\n', 'utf8');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const pinned = Object.freeze({ path: 'config.json', size: bytes.byteLength, sha256 });
const identity = Object.freeze({ state: 'PINNED', maxFileBytes: MAX_CONFIG_FILE_BYTES, files: [pinned] });

test('D1.2 config identity accepts only exact pinned revisions and unique bounded paths', () => {
  assert.doesNotThrow(() => assertPinnedRevision('repo/model', 'a'.repeat(40)));
  assert.throws(() => assertPinnedRevision('repo/model', 'main'), /40-hex commit/i);
  assert.equal(assertPinnedConfigIdentity(identity), identity);
  assert.throws(() => assertPinnedConfigIdentity({ ...identity, files: [pinned, pinned] }), /duplicate paths/i);
  assert.throws(() => assertPinnedConfigIdentity({ ...identity, files: [{ ...pinned, path: '../config.json' }] }), /invalid path/i);
  assert.throws(() => assertPinnedConfigIdentity({ ...identity, files: [{ ...pinned, size: MAX_CONFIG_FILE_BYTES + 1 }] }), /invalid size/i);
  assert.throws(() => assertPinnedConfigIdentity({ ...identity, files: [{ ...pinned, sha256: '0'.repeat(63) }] }), /invalid SHA-256/i);
});

test('D1.2 config byte verifier rejects exact size and SHA drift', () => {
  assert.deepEqual(assertPinnedConfigBytes(pinned, bytes), { size: bytes.byteLength, sha256 });
  assert.throws(() => assertPinnedConfigBytes({ ...pinned, size: pinned.size + 1 }, bytes), /size drift/i);
  assert.throws(() => assertPinnedConfigBytes({ ...pinned, sha256: '0'.repeat(64) }, bytes), /SHA-256 drift/i);
});

test('D1.2 bounded response rejects declared oversize before accessing body', async () => {
  let bodyAccesses = 0;
  const response = {
    headers: new Headers({ 'content-length': String(MAX_CONFIG_FILE_BYTES + 1) }),
    get body() {
      bodyAccesses += 1;
      throw new Error('body must not be accessed for declared oversize');
    },
  };
  await assert.rejects(() => readBoundedConfigResponse(response, 'declared-oversize'), /exceeds bounded size before read/i);
  assert.equal(bodyAccesses, 0);
});

test('D1.2 bounded response aborts streaming oversize and accepts bounded exact bytes', async () => {
  const bounded = new Response(bytes, { headers: { 'content-length': String(bytes.byteLength) } });
  assert.deepEqual(await readBoundedConfigResponse(bounded, 'bounded'), bytes);
  const chunk = new Uint8Array(1024 * 1024);
  let emitted = 0;
  const oversized = new Response(new ReadableStream({
    pull(controller) {
      emitted += chunk.byteLength;
      controller.enqueue(chunk);
      if (emitted > MAX_CONFIG_FILE_BYTES) controller.close();
    },
  }));
  await assert.rejects(() => readBoundedConfigResponse(oversized, 'streaming-oversize'), /byte ceiling/i);
  assert.ok(emitted <= MAX_CONFIG_FILE_BYTES + chunk.byteLength);
});

test('D1.2 hostile stream cancel cannot turn deterministic oversize into retryable transport failure', async () => {
  let attempts = 0;
  const oversizedChunk = new Uint8Array(MAX_CONFIG_FILE_BYTES + 1);
  await assert.rejects(() => retryBoundedTrustRead(async () => {
    attempts += 1;
    let emitted = false;
    const response = new Response(new ReadableStream({
      pull(controller) {
        if (emitted) {
          controller.close();
          return;
        }
        emitted = true;
        controller.enqueue(oversizedChunk);
      },
      cancel() {
        throw new TypeError('fixture hostile cancel failure');
      },
    }));
    return readBoundedConfigResponse(response, 'hostile-cancel-oversize');
  }, {
    label: 'hostile deterministic config bound fixture',
    maxAttempts: 4,
    backoffMs: 0,
    shouldRetry: error => error instanceof TypeError,
  }), /byte ceiling/i);
  assert.equal(attempts, 1);
});

test('D1.2 transport retry encloses bounded body consumption', async () => {
  let attempts = 0;
  const recovered = await retryBoundedTrustRead(async () => {
    attempts += 1;
    if (attempts === 1) {
      let phase = 0;
      const interrupted = new Response(new ReadableStream({
        pull(controller) {
          if (phase === 0) {
            phase = 1;
            controller.enqueue(bytes.subarray(0, 2));
            return;
          }
          controller.error(new TypeError('fixture interrupted stream'));
        },
      }));
      return readBoundedConfigResponse(interrupted, 'mid-stream-interruption');
    }
    return readBoundedConfigResponse(new Response(bytes, { headers: { 'content-length': String(bytes.byteLength) } }), 'recovered-read');
  }, {
    label: 'fixture full trust read',
    maxAttempts: 2,
    backoffMs: 0,
    shouldRetry: error => error instanceof TypeError,
  });
  assert.deepEqual(recovered, bytes);
  assert.equal(attempts, 2);
});

test('D1.2 retry predicate does not repeat deterministic trust-policy failures', async () => {
  let attempts = 0;
  await assert.rejects(() => retryBoundedTrustRead(async () => {
    attempts += 1;
    throw new Error('deterministic SHA drift fixture');
  }, {
    label: 'non-retryable fixture',
    maxAttempts: 4,
    backoffMs: 0,
    shouldRetry: error => error instanceof TypeError,
  }), /deterministic SHA drift fixture/i);
  assert.equal(attempts, 1);
});
