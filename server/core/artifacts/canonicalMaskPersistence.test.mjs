import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { ArtifactAuthority } from './artifactAuthority.ts';
import { CanonicalArtifactHydrator } from './canonicalArtifactHydrator.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const secret = 'mask-test-signing-secret-that-is-long';
const scope = { tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' };
const signExternal = (url) => { const payload = Buffer.from(JSON.stringify({ id: 'original', url, ...scope, exp: Date.now() + 60_000 })).toString('base64url'); return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`; };

test('canonical grayscale PNG persistence hydrates soft alpha byte-exactly and fails closed', async () => {
  let row;
  const pool = { query: async (sql, values) => {
    if (sql.startsWith('INSERT')) { row = { storage_id: values[0], tenant_id: values[1], user_id: values[2], project_id: values[3], width: values[4], height: values[5], png_bytes: values[6], source_image_storage_id: values[7], parent_mask_storage_id: values[8], producer_operation: values[9] }; return { rows: [], rowCount: 1 }; }
    const matches = row && values[0] === row.storage_id && values[1] === row.tenant_id && values[2] === row.user_id && values[3] === row.project_id;
    return { rows: matches ? [row] : [], rowCount: matches ? 1 : 0 };
  } };
  const store = new PostgresMaskArtifactStore(pool, () => '32d931c0-2ae4-4cd6-aa12-000000000001');
  const signed = new SignedArtifactAuthority(secret, ['assets.example.test']); const authority = new ArtifactAuthority(signed, store);
  const alpha = new Uint8Array([0, 64, 128, 192, 255, 32]);
  const stored = await store.persistManual(scope, 3, 2, alpha, { sourceImageStorageId: '32d931c0-2ae4-4cd6-aa12-0000000000aa', producerOperation: 'MANUAL_SELECTION' });
  assert.equal(stored.sourceImageStorageId, '32d931c0-2ae4-4cd6-aa12-0000000000aa'); assert.equal(stored.producerOperation, 'MANUAL_SELECTION');
  const maskId = signed.issueStoredMask(stored.storageId, scope);
  const originalPng = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#112233ff' } }).png().toBuffer();
  const hydrator = new CanonicalArtifactHydrator(authority, async () => new Response(originalPng));
  const artifacts = await hydrator.hydrate(scope, signExternal('https://assets.example.test/original.png'), [maskId]);
  assert.deepEqual(artifacts[1].value.alpha, alpha); assert.equal(artifacts[1].value.alpha.length, alpha.length);
  assert.equal(createHash('sha256').update(artifacts[1].value.alpha).digest('hex'), createHash('sha256').update(alpha).digest('hex'));
  assert.equal(await authority.owns(scope, [maskId]), true);
  assert.equal(await authority.owns({ ...scope, userId: 'other' }, [maskId]), false);
  assert.equal(await authority.owns({ ...scope, tenantId: 'other' }, [maskId]), false);
  assert.equal(await authority.owns({ ...scope, projectId: 'other' }, [maskId]), false);
  assert.equal(await authority.owns(scope, [`${maskId.slice(0, -1)}x`]), false);
  row = undefined; assert.equal(await authority.owns(scope, [maskId]), false);
});
