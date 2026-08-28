import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';

const databaseUrl = process.env.DATABASE_URL;

test('canonical local MASK persistence reuses and recovers one row per ticket with durable source lineage across Core instances', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-local-mask-integration' });
  const token = `local-mask-${process.pid}-${Date.now()}`;
  const ticketId = `${token}-ticket`;
  const scope = Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
  const images = new PostgresImageArtifactStore(pool);
  const firstStore = new PostgresMaskArtifactStore(pool);
  const secondStore = new PostgresMaskArtifactStore(pool);
  let sourceStorageId;
  let otherSourceStorageId;
  try {
    const rgba = new Uint8ClampedArray([
      1, 2, 3, 255,
      4, 5, 6, 255,
      7, 8, 9, 255,
      10, 11, 12, 255,
    ]);
    const source = await images.persistFinal(scope, `${token}-source-execution`, `${token}-source-operation`, { width: 2, height: 2, data: rgba });
    const otherSource = await images.persistFinal(scope, `${token}-other-source-execution`, `${token}-other-source-operation`, { width: 2, height: 2, data: Uint8ClampedArray.from(rgba) });
    sourceStorageId = source.storageId;
    otherSourceStorageId = otherSource.storageId;

    const alpha = new Uint8Array([255, 0, 0, 255]);
    const first = await firstStore.persistLocalExecution(ticketId, scope, 2, 2, alpha, source.storageId);
    assert.equal(first.sourceImageStorageId, source.storageId);
    assert.equal(first.producerOperation, 'LOCAL_SEGMENTATION');
    assert.equal(first.parentMaskStorageId, undefined);

    const retry = await secondStore.persistLocalExecution(ticketId, scope, 2, 2, alpha, source.storageId);
    assert.equal(retry.storageId, first.storageId, 'retry on another Core instance must reuse the canonical MASK row');
    assert.equal(retry.sourceImageStorageId, source.storageId, 'restart retry must preserve exact canonical source lineage');
    assert.equal(retry.producerOperation, 'LOCAL_SEGMENTATION');
    assert.deepEqual([...retry.png], [...first.png]);

    const byTicket = await secondStore.loadLocalExecution(ticketId, scope);
    assert.equal(byTicket?.storageId, first.storageId, 'committed replay must recover the exact canonical MASK row by ticket');
    assert.equal(byTicket?.sourceImageStorageId, source.storageId, 'durable replay must recover source IMAGE lineage');
    assert.equal(byTicket?.producerOperation, 'LOCAL_SEGMENTATION');
    assert.equal(await secondStore.loadLocalExecution(ticketId, { ...scope, projectId: `${token}-other-project` }), undefined, 'ticket lookup remains scope-bound');

    await assert.rejects(
      () => secondStore.persistLocalExecution(ticketId, scope, 2, 2, new Uint8Array([0, 255, 255, 0]), source.storageId),
      /already bound to a different canonical MASK or source lineage/,
    );
    await assert.rejects(
      () => secondStore.persistLocalExecution(ticketId, scope, 2, 2, alpha, otherSource.storageId),
      /already bound to a different canonical MASK or source lineage/,
      'same MASK bytes cannot be rebound to a different canonical source IMAGE',
    );
    await assert.rejects(
      () => secondStore.persistLocalExecution(ticketId, { ...scope, projectId: `${token}-other-project` }, 2, 2, alpha, source.storageId),
      /already bound to a different canonical MASK or source lineage/,
    );

    const loaded = await firstStore.load(first.storageId, scope);
    assert.equal(loaded?.storageId, first.storageId);
    assert.equal(loaded?.width, 2);
    assert.equal(loaded?.height, 2);
    assert.equal(loaded?.sourceImageStorageId, source.storageId);
    assert.equal(loaded?.producerOperation, 'LOCAL_SEGMENTATION');
  } finally {
    await pool.query('DELETE FROM canonical_mask_artifacts WHERE local_execution_ticket_id=$1', [ticketId]).catch(() => undefined);
    if (sourceStorageId || otherSourceStorageId) await pool.query('DELETE FROM canonical_image_artifacts WHERE storage_id = ANY($1::uuid[])', [[sourceStorageId, otherSourceStorageId].filter(Boolean)]).catch(() => undefined);
    await pool.end();
  }
});
