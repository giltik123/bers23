import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ArtifactAuthority } from '../server/core/artifacts/artifactAuthority.ts';
import { SignedArtifactAuthority } from '../server/core/artifacts/signedArtifactAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-evidence', userId: 'user-evidence', projectId: 'project-evidence' });
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const defaultRow = Object.freeze({
  storageId: 'storage-original',
  projectId: scope.projectId,
  role: 'ORIGINAL',
  lifecycle: 'IMMUTABLE',
  width: 40,
  height: 60,
  encoding: 'PNG_RGBA8_LOSSLESS',
  contentType: 'image/png',
  bytes,
});

type EvidenceRow = Readonly<Record<string, unknown>>;

function authority(row: EvidenceRow | undefined) {
  const external = new SignedArtifactAuthority('stored-image-evidence-secret', ['example.invalid'], () => 1_000);
  const images = Object.freeze({ loadSource: async () => row });
  const masks = Object.freeze({ load: async () => undefined });
  return Object.freeze({
    external,
    value: new ArtifactAuthority(external, masks as never, images as never),
  });
}

test('ArtifactAuthority resolves exact stored ORIGINAL evidence including SHA over canonical bytes', async () => {
  const { external, value } = authority(defaultRow);
  const artifactId = external.issueStoredOriginal('storage-original', scope);
  const evidence = await value.resolveStoredImageEvidence(scope, artifactId);
  assert.deepEqual(evidence, {
    artifactId,
    projectId: scope.projectId,
    storageId: 'storage-original',
    role: 'ORIGINAL',
    lifecycle: 'IMMUTABLE',
    width: 40,
    height: 60,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
});

test('ArtifactAuthority resolves exact stored FINAL evidence but does not accept unrelated signed references', async () => {
  const finalRow = Object.freeze({
    storageId: 'storage-final', projectId: scope.projectId, role: 'COMPOSITE', lifecycle: 'FINAL', width: 40, height: 60,
    encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes,
  });
  const { external, value } = authority(finalRow);
  const finalId = external.issueStoredFinal('storage-final', scope);
  assert.equal((await value.resolveStoredImageEvidence(scope, finalId)).storageId, 'storage-final');
  await assert.rejects(() => value.resolveStoredImageEvidence(scope, external.issueStoredMask('storage-mask', scope)), /not trusted/i);
});

test('ArtifactAuthority fails closed when stored evidence is missing or its scope/role/lifecycle/encoding drifts', async () => {
  const missing = authority(undefined);
  await assert.rejects(() => missing.value.resolveStoredImageEvidence(scope, missing.external.issueStoredOriginal('storage-original', scope)), /unavailable/i);

  for (const [name, row] of [
    ['project', { storageId: 'storage-original', projectId: 'other-project', role: 'ORIGINAL', lifecycle: 'IMMUTABLE', width: 40, height: 60, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes }],
    ['role', { storageId: 'storage-original', projectId: scope.projectId, role: 'COMPOSITE', lifecycle: 'IMMUTABLE', width: 40, height: 60, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes }],
    ['lifecycle', { storageId: 'storage-original', projectId: scope.projectId, role: 'ORIGINAL', lifecycle: 'FINAL', width: 40, height: 60, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes }],
    ['encoding', { storageId: 'storage-original', projectId: scope.projectId, role: 'ORIGINAL', lifecycle: 'IMMUTABLE', width: 40, height: 60, encoding: 'JPEG', contentType: 'image/jpeg', bytes }],
    ['dimensions', { storageId: 'storage-original', projectId: scope.projectId, role: 'ORIGINAL', lifecycle: 'IMMUTABLE', width: 0, height: 60, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes }],
  ] as const) {
    const candidate = authority(Object.freeze(row));
    await assert.rejects(
      () => candidate.value.resolveStoredImageEvidence(scope, candidate.external.issueStoredOriginal('storage-original', scope)),
      /outside the admitted contract/i,
      name,
    );
  }
});
