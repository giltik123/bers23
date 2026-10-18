import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { checkVirtualTryOnSchema, migrateVirtualTryOnSchema } from '../server/core/fashion/virtualTryOnSchema.ts';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for Virtual Try-On PostgreSQL acceptance');
test('Virtual Try-On FINAL reopens, retains source, accepts, undoes/redoes and rejects stale/foreign sources', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrateVirtualTryOnSchema(pool); await checkVirtualTryOnSchema(pool);
    const projects = new PostgresProjectStore(pool);
    const images = new PostgresImageArtifactStore(pool);
    const owner = { tenantId: `vton-${Date.now()}`, userId: 'owner' };
    const png = await sharp({ create: { width: 4, height: 6, channels: 4, background: '#778899' } }).png().toBuffer();
    const project = await projects.create(owner, 'try-on', png, { maxDimension: 100, maxPixels: 10000 });
    const scope = { ...owner, projectId: String(project.project_id) };
    const pixels = { width: 4, height: 6, data: new Uint8ClampedArray(96).fill(120) };
    const lineage = { producerOperation: 'VIRTUAL_TRY_ON' as const, sourceImageStorageId: String(project.current_image_storage_id) };
    const first = await images.persistFinal(scope, 'vton-first', 'virtual-try-on', pixels, lineage);
    const stale = await images.persistFinal(scope, 'vton-stale', 'virtual-try-on', pixels, lineage);
    const freshStore = new PostgresImageArtifactStore(pool);
    assert.equal((await freshStore.loadFinalByExecution('vton-first', scope))?.sourceImageStorageId, lineage.sourceImageStorageId);
    await assert.rejects(pool.query('UPDATE canonical_image_artifacts SET source_image_storage_id=$1 WHERE storage_id=$1', [first.storageId]));
    await projects.acceptFinal(owner, scope.projectId, first.storageId, 'try-on');
    await assert.rejects(projects.acceptFinal(owner, scope.projectId, stale.storageId, 'stale'), (e: any) => e.status === 409);
    // Exact replay remains available after Accept changes the cursor.
    assert.equal((await freshStore.persistFinal(scope, 'vton-first', 'virtual-try-on', pixels, lineage)).storageId, first.storageId);
    await assert.rejects(images.persistFinal(scope, 'vton-new-stale', 'virtual-try-on', pixels, lineage));
    await assert.rejects(images.persistFinal({ ...scope, userId: 'foreign' }, 'vton-foreign', 'virtual-try-on', pixels, lineage));
    assert.equal((await projects.navigate(owner, scope.projectId, 'undo'))?.current_image_storage_id, lineage.sourceImageStorageId);
    assert.equal((await projects.navigate(owner, scope.projectId, 'redo'))?.current_image_storage_id, first.storageId);
    assert.equal((await new PostgresProjectStore(pool).get(owner, scope.projectId))?.current_image_storage_id, first.storageId);
  } finally { await pool.end(); }
});
