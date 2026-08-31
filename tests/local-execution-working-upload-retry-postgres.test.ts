import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { migrateLocalExecutionUploadSchema } from '../server/core/artifacts/localExecutionUploadSchema.ts';
import { PostgresLocalExecutionUploadStore } from '../server/core/localExecution/PostgresLocalExecutionUploadStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL WORKING upload retry proof');
const scope = Object.freeze({ tenantId: 'working-retry-tenant', userId: 'working-retry-user', projectId: 'working-retry-project' });

test('PostgreSQL quarantine permits only an unconsumed image/WORKING candidate to be replaced before Core acceptance', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-working-upload-retry' });
  try {
    await migrateLocalExecutionUploadSchema(pool);
    await pool.query('TRUNCATE local_execution_uploads');
    const ids = ['wrong-upload', 'correct-upload', 'after-consume-upload', 'mask-first', 'mask-second'];
    const store = new PostgresLocalExecutionUploadStore(pool, () => ids.shift()!);
    const now = 10_000;
    const expiresAt = 70_000;
    const common = Object.freeze({
      ticketId: 'warp-ticket-retry', scope, kind: 'image', role: 'WORKING', mimeType: 'image/png', width: 2, height: 2, expiresAt, now,
    });

    const wrong = await store.persist({ ...common, bytes: new Uint8Array([1, 2, 3, 4]) });
    assert.equal(wrong.uploadId, 'wrong-upload');
    const corrected = await store.persist({ ...common, bytes: new Uint8Array([9, 8, 7, 6, 5]) });
    assert.equal(corrected.uploadId, 'correct-upload');
    assert.notEqual(corrected.sha256, wrong.sha256);
    assert.equal(await store.load(wrong.uploadId, common.ticketId, scope, now), undefined, 'superseded candidate id must lose quarantine authority');
    assert.deepEqual([...(await store.load(corrected.uploadId, common.ticketId, scope, now))!.bytes], [9, 8, 7, 6, 5]);

    assert.equal(await store.consume(corrected.uploadId, common.ticketId, scope, now), true);
    await assert.rejects(
      () => store.persist({ ...common, bytes: new Uint8Array([4, 4, 4, 4]) }),
      /already been consumed|cannot be replaced/i,
      'accepted/consumed output must never be replaceable',
    );

    const maskCommon = Object.freeze({
      ticketId: 'mask-ticket-strict', scope, kind: 'mask', role: 'MASK', mimeType: 'application/octet-stream', width: 2, height: 2, expiresAt, now,
    });
    const maskFirst = await store.persist({ ...maskCommon, bytes: new Uint8Array([1, 1, 1, 1]) });
    assert.equal(maskFirst.uploadId, 'mask-first');
    await assert.rejects(
      () => store.persist({ ...maskCommon, bytes: new Uint8Array([0, 0, 0, 0]) }),
      /does not match the existing quarantined output/i,
      'non-WORKING quarantine retains exact idempotent retry semantics',
    );
  } finally {
    await pool.query('TRUNCATE local_execution_uploads').catch(() => undefined);
    await pool.end();
  }
});
