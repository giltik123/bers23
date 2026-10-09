import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { verifyForegroundMatteEvidence } from '../server/core/fashion/foregroundOcclusionEvidence.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const matte = Uint8Array.from([0, 255, 128, 0]);
const expected = Object.freeze({
  tenantId: 'tenant-a',
  projectId: 'project-a',
  projectImageSha256: 'a'.repeat(64),
  projectWidth: 2,
  projectHeight: 2,
  garmentLayerSha256: 'b'.repeat(64),
});
const base = Object.freeze({
  schemaVersion: 1,
  kind: 'BERS_FASHION_FOREGROUND_MATTE_RND_V1',
  ...expected,
  matteSha256: hash(matte),
  source: 'MANUALLY_REVIEWED',
  reviewerId: 'reviewer-a',
});

test('R&D foreground matte is bound to exact Project bytes, garment, scope and reviewer', () => {
  const verified = verifyForegroundMatteEvidence(base, expected, matte);
  assert.deepEqual(verified, base);
  assert.equal(Object.isFrozen(verified), true);
  assert.deepEqual(verifyForegroundMatteEvidence(base, expected, Uint8ClampedArray.from(matte)), base);
});

test('reject cross-tenant, stale Project, altered garment lineage and nonreviewed source', () => {
  for (const [key, value] of [
    ['tenantId', 'other-tenant'],
    ['projectId', 'other-project'],
    ['projectImageSha256', 'c'.repeat(64)],
    ['projectWidth', 1],
    ['garmentLayerSha256', 'd'.repeat(64)],
  ]) {
    assert.throws(() => verifyForegroundMatteEvidence(base, { ...expected, [key]: value }, matte), /binding/);
  }
  assert.throws(() => verifyForegroundMatteEvidence({ ...base, source: 'UNTRUSTED_MODEL' }, expected, matte), /review source/);
  assert.throws(() => verifyForegroundMatteEvidence({ ...base, reviewerId: '' }, expected, matte), /reviewerId/);
});

test('reject coverage substitution, invalid pixel bounds, and malformed SHA', () => {
  assert.throws(() => verifyForegroundMatteEvidence(base, expected, Uint8Array.from([0, 255, 127, 0])), /SHA-256 mismatch/);
  assert.throws(() => verifyForegroundMatteEvidence(base, expected, Uint8Array.from([0, 255])), /coverage length/);
  assert.throws(() => verifyForegroundMatteEvidence(base, expected, [0, 255, 128, 0]), /byte coverage/);
  assert.throws(() => verifyForegroundMatteEvidence({ ...base, matteSha256: 'z'.repeat(64) }, expected, matte), /lowercase SHA-256/);
  assert.throws(() => verifyForegroundMatteEvidence({ ...base, projectWidth: 5000 }, { ...expected, projectWidth: 5000 }, matte), /geometry/);
});
