import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL local quarantine upload is scope-bound, idempotent and immutable per ticket output', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-local-upload-integration' });
  const token = `local-upload-${process.pid}-${Date.now()}`;
  const scope = Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
  let ids = 0;
  const store = new PostgresLocalExecutionUploadStore(pool, () => `${token}-upload-${++ids}`);
  const now = Date.now();
  const expiresAt = now + 60_000;
  const bytes = new Uint8Array([255, 0, 0, 255]);
  try {
    const input = { ticketId: `${token}-ticket`, scope, kind: 'mask', role: 'MASK', mimeType: 'application/octet-stream', width: 2, height: 2, bytes, expiresAt, now };
    const first = await store.persist(input);
    const replay = await store.persist(input);
    assert.equal(replay.uploadId, first.uploadId, 'identical retry must reuse the immutable quarantined output');
    assert.equal(replay.sha256, first.sha256);
    assert.deepEqual([...replay.bytes], [...bytes]);

    await assert.rejects(
      () => store.persist({ ...input, bytes: new Uint8Array([0, 255, 255, 0]) }),
      /retry does not match the existing quarantined output/,
    );
    assert.equal(await store.load(first.uploadId, input.ticketId, { ...scope, projectId: `${token}-other-project` }, now + 1), undefined);
    assert.equal((await store.load(first.uploadId, input.ticketId, scope, now + 1))?.uploadId, first.uploadId);
    assert.equal(await store.consume(first.uploadId, input.ticketId, scope, now + 2), true);
    assert.equal(await store.load(first.uploadId, input.ticketId, scope, now + 3), undefined);
    await assert.rejects(() => store.persist({ ...input, now: now + 4 }), /already been consumed/);
  } finally {
    await pool.query('DELETE FROM local_execution_uploads WHERE ticket_id=$1', [`${token}-ticket`]).catch(() => undefined);
    await pool.end();
  }
});
