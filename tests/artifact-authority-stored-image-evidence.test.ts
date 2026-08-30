import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ArtifactAuthority } from '../server/core/artifacts/artifactAuthority.ts';
import { SignedArtifactAuthority } from '../server/core/artifacts/signedArtifactAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-evidence', userId: 'user-evidence', projectId: 'project-evidence' });
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function authority(row: Readonly<Record<string, unknown>> | undefined = Object.freeze({
  storageId: 'storage-original',
  role: 'ORIGINAL',
  lifecycle: 'IMMUTABLE',
  width: 40,
  height: 60,
  encoding: 'PNG_RGBA8_LOSSLESS',
  contentType: 'image/png',
  bytes,
})) {
  const external = new SignedArtifactAuthority('stored-image-evidence-secret', ['example.invalid'], () => 1_000);
  const images = Object.freeze({ loadSource: async () => row });
  const masks = Object.freeze({ load: async () => undefined });
  return Object.freeze({
    external,
    value: new ArtifactAuthority(external, masks as never, images as never),
  });
}

test('ArtifactAuthority resolves exact stored ORIGINAL evidence including SHA over canonical bytes', async () => {
  const { external, value } = authority();
  const artifactId = external.issueStoredOriginal('storage-original', scope);
  const evidence = await value.resolveStoredImageEvidence(scope, artifactId);
  assert.deepEqual(evidence, {
    artifactId,
    storageId: 'storage-original',
    role: 'ORIGINAL',
    lifecycle: 'IMMUTABLE',
    width: 40,
    height: 60,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
});

test('ArtifactAuthority resolves exact stored FINAL evidence but does not accept external URL references', async () => {
  const finalRow = Object.freeze({
    storageId: 'storage-final', role: 'COMPOSITE', lifecycle: 'FINAL', width: 40, height: 60,
    encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes,
  });
  const { external, value } = authority(finalRow);
  const finalId = external.issueStoredFinal('storage-final', scope);
  assert.equal((await value.resolveStoredImageEvidence(scope, finalId)).storageId, 'storage-final');

  const externalId = (() => {
    // The public authority intentionally has no issue helper for a generic URL in
    // this test. A syntactically unrelated signed reference must not be treated as
    // durable Project storage evidence.
    return external.issueStoredMask('storage-mask', scope);
  })();
  await assert.rejects(() => value.resolveStoredImageEvidence(scope, externalId), /not trusted/i);
});

test('ArtifactAuthority fails closed when stored evidence is missing or its role/lifecycle/encoding drifts', async () => {
  const missing = authority(undefined);
  await assert.rejects(() => missing.value.resolveStoredImageEvidence(scope, missing.external.issueStoredOriginal('storage-original', scope)), /unavailable/i);

  for (const [name, row] of [
    ['role', { storageId: 'storage-original', role: 'COMPOSITE', lifecycle: 'IMMUTABLE', width: 40, height: 60, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes }],
    ['lifecycle', { storageId: 'storage-original', role: 'ORIGINAL', lifecycle: 'FINAL', width: 40, height: 60, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes }],
    ['encoding', { storageId: 'storage-original', role: 'ORIGINAL', lifecycle: 'IMMUTABLE', width: 40, height: 60, encoding: 'JPEG', contentType: 'image/jpeg', bytes }],
    ['dimensions', { storageId: 'storage-original', role: 'ORIGINAL', lifecycle: 'IMMUTABLE', width: 0, height: 60, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes }],
  ] as const) {
    const candidate = authority(Object.freeze(row));
    await assert.rejects(
      () => candidate.value.resolveStoredImageEvidence(scope, candidate.external.issueStoredOriginal('storage-original', scope)),
      /outside the admitted contract/i,
      name,
    );
  }
});
