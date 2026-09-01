import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  MAX_CONFIG_FILE_BYTES,
  assertPinnedConfigBytes,
  assertPinnedConfigIdentity,
  assertPinnedRevision,
  readBoundedConfigResponse,
} from '../scripts/kandinsky-config-trust.mjs';

const bytes = Buffer.from('{"ok":true}\n', 'utf8');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const pinned = Object.freeze({ path: 'config.json', size: bytes.byteLength, sha256 });
const identity = Object.freeze({ state: 'PINNED', maxFileBytes: MAX_CONFIG_FILE_BYTES, files: [pinned] });

test('D1.2 config identity accepts only exact pinned revisions and unique bounded paths', () => {
  assert.doesNotThrow(() => assertPinnedRevision('repo/model', 'a'.repeat(40)));
  assert.throws(() => assertPinnedRevision('repo/model', 'main'), /40-hex commit/i);
  assert.equal(assertPinnedConfigIdentity(identity), identity);
  assert.throws(
    () => assertPinnedConfigIdentity({ ...identity, files: [pinned, pinned] }),
    /duplicate paths/i,
  );
  assert.throws(
    () => assertPinnedConfigIdentity({ ...identity, files: [{ ...pinned, path: '../config.json' }] }),
    /invalid path/i,
  );
  assert.throws(
    () => assertPinnedConfigIdentity({ ...identity, files: [{ ...pinned, size: MAX_CONFIG_FILE_BYTES + 1 }] }),
    /invalid size/i,
  );
  assert.throws(
    () => assertPinnedConfigIdentity({ ...identity, files: [{ ...pinned, sha256: '0'.repeat(63) }] }),
    /invalid SHA-256/i,
  );
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
  assert.equal(bodyAccesses, 0, 'declared oversize must fail before touching response.body');
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
  assert.ok(emitted <= MAX_CONFIG_FILE_BYTES + chunk.byteLength, 'reader must stop on first chunk crossing the ceiling');
});
