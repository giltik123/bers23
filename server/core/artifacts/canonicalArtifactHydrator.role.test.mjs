import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';

import { ArtifactAuthority } from './artifactAuthority.ts';
import { CanonicalArtifactHydrator } from './canonicalArtifactHydrator.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const scope = Object.freeze({ tenantId: 'hydrator-role-tenant', userId: 'hydrator-role-user', projectId: 'hydrator-role-project' });
const originalStorageId = '11111111-1111-4111-8111-111111111111';
const finalStorageId = '22222222-2222-4222-8222-222222222222';
const signingSecret = 'canonical-hydrator-role-regression-secret';

test('stored ORIGINAL and FINAL hydration preserve canonical image roles and exact byte integrity', async () => {
  const png = new Uint8Array(await sharp({
    create: { width: 3, height: 2, channels: 4, background: { r: 17, g: 34, b: 51, alpha: 1 } },
  }).png({ compressionLevel: 9 }).toBuffer());
  const rows = new Map([
    [originalStorageId, Object.freeze({
      storageId: originalStorageId,
      ...scope,
      role: 'ORIGINAL',
      lifecycle: 'IMMUTABLE',
      width: 3,
      height: 2,
      encoding: 'PNG_RGBA8_LOSSLESS',
      contentType: 'image/png',
      bytes: png,
    })],
    [finalStorageId, Object.freeze({
      storageId: finalStorageId,
      ...scope,
      executionId: 'hydrator-role-final-execution',
      operationId: 'orthogonal-transform',
      role: 'COMPOSITE',
      lifecycle: 'FINAL',
      width: 3,
      height: 2,
      encoding: 'PNG_RGBA8_LOSSLESS',
      contentType: 'image/png',
      bytes: png,
      sourceImageStorageId: originalStorageId,
      producerOperation: 'ORTHOGONAL_TRANSFORM',
    })],
  ]);
  const images = Object.freeze({
    async loadSource(storageId, ownerScope) {
      if (ownerScope.tenantId !== scope.tenantId || ownerScope.userId !== scope.userId || ownerScope.projectId !== scope.projectId) return undefined;
      return rows.get(storageId);
    },
  });
  const masks = Object.freeze({ load: async () => undefined });
  const signed = new SignedArtifactAuthority(signingSecret, ['assets.example.test']);
  const authority = new ArtifactAuthority(signed, masks, images);
  let externalFetches = 0;
  const hydrator = new CanonicalArtifactHydrator(authority, async () => {
    externalFetches += 1;
    throw new Error('stored canonical images must not use external fetch');
  });

  const originalId = signed.issueStoredOriginal(originalStorageId, scope);
  const finalId = signed.issueStoredFinal(finalStorageId, scope);
  const [original] = await hydrator.hydrate(scope, originalId, []);
  const [final] = await hydrator.hydrate(scope, finalId, []);

  assert.equal(original.id, originalId);
  assert.equal(original.role, 'ORIGINAL');
  assert.equal(final.id, finalId);
  assert.equal(final.role, 'COMPOSITE');
  assert.equal(original.image.width, 3);
  assert.equal(original.image.height, 2);
  assert.equal(final.image.width, 3);
  assert.equal(final.image.height, 2);
  const sha256 = createHash('sha256').update(png).digest('hex');
  assert.equal(original.metadata.sha256, sha256);
  assert.equal(final.metadata.sha256, sha256);
  assert.equal(externalFetches, 0);
});
