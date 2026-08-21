import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { executeControlledLocalEdit, createOriginalMask } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' });

test('verified protected pixels survive lossless FINAL COMPOSITE persistence without another provider call', async () => {
  let row; const pool = { async query(sql, values) { if (sql.startsWith('INSERT')) { row = { storage_id: values[0], tenant_id: values[1], user_id: values[2], project_id: values[3], execution_id: values[4], operation_id: values[5], role: 'COMPOSITE', lifecycle: 'FINAL', width: values[6], height: values[7], encoding: 'PNG_RGBA8_LOSSLESS', content_type: 'image/png', image_bytes: values[8] }; return { rows: [row] }; } return { rows: row && values[0] === row.storage_id && values[1] === row.tenant_id && values[2] === row.user_id && values[3] === row.project_id && !row.revoked_at && !row.deleted_at ? [row] : [] }; } };
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

test('FINAL identity is not a delivery capability and delivery expires and fails closed', async () => {
  let now = 1_000; const authority = new SignedArtifactAuthority('final-secret', [], () => now);
  const reference = authority.issueStoredFinal('00000000-0000-4000-8000-000000000001', scope);
  assert.equal(authority.resolveStoredFinalId(reference, scope).role, 'COMPOSITE');
  assert.throws(() => authority.resolveStoredFinalDelivery(reference), /not trusted/, 'stable identity cannot authorize delivery');
  for (const denied of [{ ...scope, tenantId: 'wrong' }, { ...scope, userId: 'wrong' }, { ...scope, projectId: 'wrong' }]) assert.throws(() => authority.resolveStoredFinalId(reference, denied), /not trusted/);
  assert.throws(() => authority.resolveStoredFinalId(`${reference.slice(0, -1)}x`, scope), /not trusted/);
  const delivery = authority.issueStoredFinalDelivery('00000000-0000-4000-8000-000000000001', scope, 2_000);
  assert.equal(authority.resolveStoredFinalDelivery(delivery).storageId, '00000000-0000-4000-8000-000000000001');
  now = 2_000; assert.throws(() => authority.resolveStoredFinalDelivery(delivery), /not trusted/);
  const payload = Buffer.from(JSON.stringify({ v: 1, location: 'STORED_FINAL', storageId: 'x', ...scope, role: 'PATCH', lifecycle: 'AVAILABLE' })).toString('base64url');
  assert.throws(() => authority.resolveStoredFinalDelivery(`${payload}.invalid`), /not trusted/);
  const pool = { async query() { return { rows: [] }; } }; const store = new PostgresImageArtifactStore(pool);
  assert.equal(await store.load('missing', scope), undefined, 'missing/revoked/deleted/non-FINAL rows are unavailable');
});

test('idempotent FINAL replay returns complete canonical row metadata with its bytes', async () => {
  const canonicalBytes = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#010203' } }).png().toBuffer();
  const pool = { async query() { return { rows: [{ storage_id: 'existing', ...scope, tenant_id: scope.tenantId, user_id: scope.userId, project_id: scope.projectId, execution_id: 'execution-1', operation_id: 'original-operation', role: 'COMPOSITE', lifecycle: 'FINAL', width: 1, height: 1, encoding: 'PNG_RGBA8_LOSSLESS', content_type: 'image/png', image_bytes: canonicalBytes }] }; } };
  const store = new PostgresImageArtifactStore(pool, () => 'unused');
  const replay = await store.persistFinal(scope, 'execution-1', 'different-operation', { width: 2, height: 1, data: new Uint8ClampedArray(8) });
  assert.equal(replay.operationId, 'original-operation'); assert.deepEqual([replay.width, replay.height], [1, 1]); assert.deepEqual(replay.bytes, new Uint8Array(canonicalBytes));
});
