import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { executeControlledLocalEdit, createOriginalMask } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' });

test('verified protected pixels survive lossless FINAL COMPOSITE persistence without another provider call', async () => {
  let row; const pool = { async query(sql, values) { if (sql.startsWith('INSERT')) { row = { storage_id: values[0], tenant_id: values[1], user_id: values[2], project_id: values[3], execution_id: values[4], operation_id: values[5], role: 'COMPOSITE', lifecycle: 'FINAL', width: values[6], height: values[7], encoding: 'PNG_RGBA8_LOSSLESS', content_type: 'image/png', image_bytes: values[8] }; return { rows: [{ storage_id: row.storage_id, image_bytes: row.image_bytes }] }; } return { rows: row && values[0] === row.storage_id && values[1] === row.tenant_id && values[2] === row.user_id && values[3] === row.project_id && !row.revoked_at && !row.deleted_at ? [row] : [] }; } };
  const original = { width: 2, height: 2, data: new Uint8ClampedArray([10,20,30,255, 40,50,60,255, 70,80,90,255, 100,110,120,255]) };
  const mask = createOriginalMask({ artifactId: 'mask', width: 2, height: 2, alpha: new Uint8Array([255,0,0,0]), source: 'USER' });
  let providerCalls = 0;
  const edit = await executeControlledLocalEdit({ executionId: 'execution-1', original, mask, maskArtifactId: 'mask', instruction: 'change one pixel', policy: { preserveMode: 'STRICT' }, provider: async ({ roi }) => { providerCalls++; const data = new Uint8ClampedArray(roi.data); data.set([200,201,202,255], 0); return { ...roi, data }; } });
  assert.equal(edit.verification.valid, true); assert.equal(edit.metrics.outsideChangedPixelRatio, 0);
  const store = new PostgresImageArtifactStore(pool, () => '00000000-0000-4000-8000-000000000001');
  const stored = await store.persistFinal(scope, 'execution-1', 'creative-image-edit', edit.composite.image);
  const decoded = await sharp(stored.bytes).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [...edit.composite.image.data]);
  assert.deepEqual([...decoded.subarray(4)], [...original.data.subarray(4)]);
  assert.equal(providerCalls, 1, 'persistence must not re-run AI');
});

test('FINAL references and storage fail closed across scope, tampering, revocation and invalid lifecycle', async () => {
  const authority = new SignedArtifactAuthority('final-secret', [], () => 1_000);
  const reference = authority.issueStoredFinal('00000000-0000-4000-8000-000000000001', scope);
  assert.equal(authority.resolveStoredFinal(reference, scope).role, 'COMPOSITE');
  for (const denied of [{ ...scope, tenantId: 'wrong' }, { ...scope, userId: 'wrong' }, { ...scope, projectId: 'wrong' }]) assert.throws(() => authority.resolveStoredFinal(reference, denied), /not trusted/);
  assert.throws(() => authority.resolveStoredFinal(`${reference.slice(0, -1)}x`, scope), /not trusted/);
  const payload = Buffer.from(JSON.stringify({ v: 1, location: 'STORED_FINAL', storageId: 'x', ...scope, role: 'PATCH', lifecycle: 'AVAILABLE' })).toString('base64url');
  assert.throws(() => authority.resolveStoredFinal(`${payload}.invalid`, scope), /not trusted/);
  const pool = { async query() { return { rows: [] }; } }; const store = new PostgresImageArtifactStore(pool);
  assert.equal(await store.load('missing', scope), undefined, 'missing/revoked/deleted/non-FINAL rows are unavailable');
});
