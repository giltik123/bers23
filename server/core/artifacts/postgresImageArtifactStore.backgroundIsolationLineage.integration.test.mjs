import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { migrateFinalImageLineageSchema } from './finalImageLineageSchema.ts';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';

const databaseUrl = process.env.DATABASE_URL;

test('Background Isolation FINAL persists exact IMAGE + MASK lineage across independent Core stores', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-background-lineage-integration' });
  const token = `background-lineage-${process.pid}-${Date.now()}`;
  const scope = Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
  const executionId = `${token}-execution`;
  const sourceExecutionId = `${token}-source`;
  const alternateSourceExecutionId = `${token}-alternate-source`;
  const firstImages = new PostgresImageArtifactStore(pool);
  const secondImages = new PostgresImageArtifactStore(pool);
  const masks = new PostgresMaskArtifactStore(pool);
  try {
    await migrateFinalImageLineageSchema(pool);
    const sourcePixels = new Uint8ClampedArray([
      10,20,30,255, 40,50,60,255,
      70,80,90,255, 100,110,120,255,
    ]);
    const alternatePixels = Uint8ClampedArray.from(sourcePixels); alternatePixels[0] ^= 1;
    const outputPixels = Uint8ClampedArray.from(sourcePixels); outputPixels[3] = 0;
    const source = await firstImages.persistFinal(scope, sourceExecutionId, `${token}-source-op`, { width: 2, height: 2, data: sourcePixels });
    const alternateSource = await firstImages.persistFinal(scope, alternateSourceExecutionId, `${token}-alternate-source-op`, { width: 2, height: 2, data: alternatePixels });
    const mask = await masks.persistManual(scope, 2, 2, new Uint8Array([255,0,255,0]), { sourceImageStorageId: source.storageId, producerOperation: 'MANUAL_SELECTION' });
    const alternateMask = await masks.persistManual(scope, 2, 2, new Uint8Array([255,255,0,0]), { sourceImageStorageId: source.storageId, producerOperation: 'MANUAL_SELECTION' });

    const lineage = Object.freeze({ sourceImageStorageId: source.storageId, maskStorageId: mask.storageId, producerOperation: 'BACKGROUND_ISOLATION' });
    const first = await firstImages.persistFinal(scope, executionId, 'background-isolation', { width: 2, height: 2, data: outputPixels }, lineage);
    assert.equal(first.sourceImageStorageId, source.storageId);
    assert.equal(first.maskStorageId, mask.storageId);
    assert.equal(first.producerOperation, 'BACKGROUND_ISOLATION');

    const replay = await secondImages.persistFinal(scope, executionId, 'background-isolation', { width: 2, height: 2, data: outputPixels }, lineage);
    assert.equal(replay.storageId, first.storageId, 'independent Core replay must reuse one canonical FINAL');
    assert.equal(replay.sourceImageStorageId, source.storageId);
    assert.equal(replay.maskStorageId, mask.storageId);
    assert.equal(replay.producerOperation, 'BACKGROUND_ISOLATION');

    const loaded = await secondImages.loadFinalByExecution(executionId, scope);
    assert.equal(loaded?.storageId, first.storageId);
    assert.equal(loaded?.sourceImageStorageId, source.storageId);
    assert.equal(loaded?.maskStorageId, mask.storageId);
    assert.equal(loaded?.producerOperation, 'BACKGROUND_ISOLATION');

    await assert.rejects(
      () => secondImages.persistFinal(scope, executionId, 'background-isolation', { width: 2, height: 2, data: outputPixels }, { ...lineage, sourceImageStorageId: alternateSource.storageId }),
      /different FINAL or parent lineage/,
      'same execution cannot be rebound to another source IMAGE',
    );
    await assert.rejects(
      () => secondImages.persistFinal(scope, executionId, 'background-isolation', { width: 2, height: 2, data: outputPixels }, { ...lineage, maskStorageId: alternateMask.storageId }),
      /different FINAL or parent lineage/,
      'same execution cannot be rebound to another MASK',
    );
    const conflictingPixels = Uint8ClampedArray.from(outputPixels); conflictingPixels[1] ^= 1;
    await assert.rejects(
      () => secondImages.persistFinal(scope, executionId, 'background-isolation', { width: 2, height: 2, data: conflictingPixels }, lineage),
      /different FINAL or parent lineage/,
      'same lineage cannot authorize different FINAL bytes',
    );
  } finally {
    await pool.query('DELETE FROM canonical_image_artifacts WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3', [scope.tenantId, scope.userId, scope.projectId]).catch(() => undefined);
    await pool.query('DELETE FROM canonical_mask_artifacts WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3', [scope.tenantId, scope.userId, scope.projectId]).catch(() => undefined);
    await pool.end();
  }
});
