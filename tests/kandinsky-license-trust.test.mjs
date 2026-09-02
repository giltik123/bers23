import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_LICENSE_EVIDENCE_BYTES,
  assertPinnedLicenseBytes,
  assertPinnedLicenseEvidence,
  readBoundedLicenseResponse,
} from '../scripts/kandinsky-license-trust.mjs';

const evidence = Object.freeze({
  state: 'PINNED_REVISION_METADATA',
  path: 'README.md',
  maxFileBytes: MAX_LICENSE_EVIDENCE_BYTES,
  expectedIdentifier: 'apache-2.0',
});
const readme = Buffer.from('---\nlicense: apache-2.0\ntags:\n- kandinsky\n---\n# Model\n', 'utf8');

test('D1 license evidence is a closed revision-metadata contract', () => {
  assert.equal(assertPinnedLicenseEvidence(evidence), evidence);
  for (const invalid of [
    { ...evidence, state: 'DISCOVERED' },
    { ...evidence, path: '../README.md' },
    { ...evidence, maxFileBytes: MAX_LICENSE_EVIDENCE_BYTES + 1 },
    { ...evidence, expectedIdentifier: 'Apache-2.0' },
    { ...evidence, expectedIdentifier: 'apache 2' },
  ]) assert.throws(() => assertPinnedLicenseEvidence(invalid), /incomplete or invalid/i);
});

test('D1 license evidence accepts exactly one matching top-level model-card license field', () => {
  assert.deepEqual(assertPinnedLicenseBytes(evidence, readme, 'fixture'), { identifier: 'apache-2.0', path: 'README.md' });
  for (const quoted of [
    '---\nlicense: "apache-2.0"\n---\n',
    "---\nlicense: 'apache-2.0'\n---\n",
  ]) {
    assert.deepEqual(
      assertPinnedLicenseBytes(evidence, Buffer.from(quoted, 'utf8'), 'fixture'),
      { identifier: 'apache-2.0', path: 'README.md' },
    );
  }
  assert.throws(
    () => assertPinnedLicenseBytes(evidence, Buffer.from('---\nlicense: mit\n---\n', 'utf8'), 'fixture'),
    /license drift/i,
  );
  assert.throws(
    () => assertPinnedLicenseBytes(evidence, Buffer.from('---\nlicense: apache-2.0\nlicense: apache-2.0\n---\n', 'utf8'), 'fixture'),
    /exactly one top-level license/i,
  );
  assert.throws(
    () => assertPinnedLicenseBytes(evidence, Buffer.from('license: apache-2.0\n', 'utf8'), 'fixture'),
    /missing model-card frontmatter/i,
  );
  assert.throws(
    () => assertPinnedLicenseBytes(evidence, Uint8Array.of(0xff, 0xfe, 0xfd), 'fixture'),
    /valid UTF-8/i,
  );
});

test('D1 license evidence rejects mismatched, unbalanced and embedded quote scalars', () => {
  for (const malformed of [
    "---\nlicense: 'apache-2.0\"\n---\n",
    "---\nlicense: \"apache-2.0'\n---\n",
    "---\nlicense: 'apache-2.0\n---\n",
    '---\nlicense: apache-2.0"\n---\n',
    "---\nlicense: 'apache'2.0'\n---\n",
  ]) {
    assert.throws(
      () => assertPinnedLicenseBytes(evidence, Buffer.from(malformed, 'utf8'), 'fixture'),
      /malformed license metadata/i,
    );
  }
});

test('D1 license evidence rejects declared and streaming oversize before semantic parsing', async () => {
  const declared = {
    headers: new Headers({ 'content-length': String(MAX_LICENSE_EVIDENCE_BYTES + 1) }),
    get body() { throw new Error('oversize body must not be consumed'); },
  };
  await assert.rejects(() => readBoundedLicenseResponse(declared, 'declared'), /exceeds bounded size before read/i);

  const chunk = new Uint8Array(64 * 1024);
  let emitted = 0;
  const streaming = new Response(new ReadableStream({
    pull(controller) {
      emitted += chunk.byteLength;
      controller.enqueue(chunk);
      if (emitted > MAX_LICENSE_EVIDENCE_BYTES) controller.close();
    },
  }));
  await assert.rejects(() => readBoundedLicenseResponse(streaming, 'streaming'), /byte ceiling/i);
  assert.ok(emitted <= MAX_LICENSE_EVIDENCE_BYTES + chunk.byteLength);
});