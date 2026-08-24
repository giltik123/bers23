import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';

const databaseUrl = process.env.DATABASE_URL;

test('canonical local MASK persistence reuses and recovers one row per ticket across Core instances', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-local-mask-integration' });
  const token = `local-mask-${process.pid}-${Date.now()}`;
  const ticketId = `${token}-ticket`;
  const scope = Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
  const firstStore = new PostgresMaskArtifactStore(pool);
  const secondStore = new PostgresMaskArtifactStore(pool);
  try {
    const alpha = new Uint8Array([255, 0, 0, 255]);
    const first = await firstStore.persistLocalExecution(ticketId, scope, 2, 2, alpha);
    const retry = await secondStore.persistLocalExecution(ticketId, scope, 2, 2, alpha);
    assert.equal(retry.storageId, first.storageId, 'retry on another Core instance must reuse the canonical MASK row');
    assert.deepEqual([...retry.png], [...first.png]);

    const byTicket = await secondStore.loadLocalExecution(ticketId, scope);
    assert.equal(byTicket?.storageId, first.storageId, 'committed replay must recover the exact canonical MASK row by ticket');
    assert.equal(await secondStore.loadLocalExecution(ticketId, { ...scope, projectId: `${token}-other-project` }), undefined, 'ticket lookup remains scope-bound');

    await assert.rejects(
      () => secondStore.persistLocalExecution(ticketId, scope, 2, 2, new Uint8Array([0, 255, 255, 0])),
      /already bound to a different canonical MASK/,
    );
    await assert.rejects(
      () => secondStore.persistLocalExecution(ticketId, { ...scope, projectId: `${token}-other-project` }, 2, 2, alpha),
      /already bound to a different canonical MASK/,
    );

    const loaded = await firstStore.load(first.storageId, scope);
    assert.equal(loaded?.storageId, first.storageId);
    assert.equal(loaded?.width, 2);
    assert.equal(loaded?.height, 2);
  } finally {
    await pool.query('DELETE FROM canonical_mask_artifacts WHERE local_execution_ticket_id=$1', [ticketId]).catch(() => undefined);
    await pool.end();
  }
});
