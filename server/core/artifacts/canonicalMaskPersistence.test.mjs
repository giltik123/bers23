import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { ArtifactAuthority } from './artifactAuthority.ts';
import { CanonicalArtifactHydrator } from './canonicalArtifactHydrator.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const secret = 'mask-test-signing-secret-that-is-long';
const scope = { tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' };

test('canonical grayscale PNG persistence hydrates soft alpha byte-exactly and enforces source lineage', async () => {
  let row;
  const pool = { query: async (sql, values) => {
    if (sql.startsWith('INSERT')) { row = { storage_id: values[0], tenant_id: values[1], user_id: values[2], project_id: values[3], width: values[4], height: values[5], png_bytes: values[6], source_image_storage_id: values[7], parent_mask_storage_id: values[8], producer_operation: values[9] }; return { rows: [], rowCount: 1 }; }
    const matches = row && values[0] === row.storage_id && values[1] === row.tenant_id && values[2] === row.user_id && values[3] === row.project_id;
    return { rows: matches ? [row] : [], rowCount: matches ? 1 : 0 };
  } };
  const sourceStorageId = '32d931c0-2ae4-4cd6-aa12-0000000000aa';
  const otherSourceStorageId = '32d931c0-2ae4-4cd6-aa12-0000000000bb';
  const originalPng = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#112233ff' } }).png().toBuffer();
  const images = {
    async loadSource(storageId, ownerScope) {
      if (ownerScope.tenantId !== scope.tenantId || ownerScope.userId !== scope.userId || ownerScope.projectId !== scope.projectId) return undefined;
      if (storageId !== sourceStorageId && storageId !== otherSourceStorageId) return undefined;
      return { storageId, ...scope, role: 'ORIGINAL', lifecycle: 'IMMUTABLE', width: 3, height: 2, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes: new Uint8Array(originalPng) };
    },
  };
  const store = new PostgresMaskArtifactStore(pool, () => '32d931c0-2ae4-4cd6-aa12-000000000001');
  const signed = new SignedArtifactAuthority(secret, ['assets.example.test']); const authority = new ArtifactAuthority(signed, store, images);
  const alpha = new Uint8Array([0, 64, 128, 192, 255, 32]);
  const stored = await store.persistManual(scope, 3, 2, alpha, { sourceImageStorageId: sourceStorageId, producerOperation: 'MANUAL_SELECTION' });
  assert.equal(stored.sourceImageStorageId, sourceStorageId); assert.equal(stored.producerOperation, 'MANUAL_SELECTION');
  const maskId = signed.issueStoredMask(stored.storageId, scope);
  const sourceId = signed.issueStoredOriginal(sourceStorageId, scope);
  const otherSourceId = signed.issueStoredOriginal(otherSourceStorageId, scope);
  const hydrator = new CanonicalArtifactHydrator(authority);
  const artifacts = await hydrator.hydrate(scope, sourceId, [maskId]);
  assert.deepEqual(artifacts[1].value.alpha, alpha); assert.equal(artifacts[1].value.alpha.length, alpha.length);
  assert.equal(artifacts[1].metadata.sourceImageStorageId, sourceStorageId);
  assert.equal(createHash('sha256').update(artifacts[1].value.alpha).digest('hex'), createHash('sha256').update(alpha).digest('hex'));
  await assert.rejects(() => hydrator.hydrate(scope, otherSourceId, [maskId]), /source lineage/);
  assert.equal(await authority.owns(scope, [maskId]), true);
  assert.equal(await authority.owns({ ...scope, userId: 'other' }, [maskId]), false);
  assert.equal(await authority.owns({ ...scope, tenantId: 'other' }, [maskId]), false);
  assert.equal(await authority.owns({ ...scope, projectId: 'other' }, [maskId]), false);
  assert.equal(await authority.owns(scope, [`${maskId.slice(0, -1)}x`]), false);
  row = undefined; assert.equal(await authority.owns(scope, [maskId]), false);
});
