import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateFinalImageLineageSchema } from './finalImageLineageSchema.ts';
import { DurableArtifactLineageResolver } from './durableArtifactLineageResolver.ts';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const databaseUrl = process.env.DATABASE_URL;

test('durable resolver preserves ORIGINAL -> ORTHOGONAL_TRANSFORM -> RESIZE one-parent lineage across restart', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-deterministic-lineage-resolver' });
  const token = `deterministic-resolver-${process.pid}-${Date.now()}`;
  const scope = Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
  const signed = new SignedArtifactAuthority(`${token}-secret`, [], () => 10_000);
  const images = new PostgresImageArtifactStore(pool);
  const masks = new PostgresMaskArtifactStore(pool);
  const originalStorageId = randomUUID();
  try {
    await migrateFinalImageLineageSchema(pool);
    const roleState = await pool.query("SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_image_artifacts') AND conname='canonical_image_artifacts_role_check' AND position('ORIGINAL' in pg_get_constraintdef(oid)) > 0) AS original_allowed");
    if (!roleState.rows[0]?.original_allowed) {
      await pool.query(await readFile(new URL('../projects/migrations/004_canonical_projects_and_originals.sql', import.meta.url), 'utf8'));
    }

    const originalPng = new Uint8Array(await sharp({ create: { width: 3, height: 2, channels: 4, background: '#223344ff' } }).png().toBuffer());
    await pool.query(`INSERT INTO canonical_image_artifacts
      (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
      VALUES ($1,$2,$3,$4,NULL,NULL,'ORIGINAL','IMMUTABLE',3,2,'PNG_RGBA8_LOSSLESS','image/png',$5)`,
    [originalStorageId, scope.tenantId, scope.userId, scope.projectId, Buffer.from(originalPng)]);
    const originalId = signed.issueStoredOriginal(originalStorageId, scope);

    const orthogonalPixels = new Uint8ClampedArray(2 * 3 * 4).fill(64);
    const orthogonal = await images.persistFinal(scope, `${token}-orthogonal-execution`, 'orthogonal-transform', {
      width: 2, height: 3, data: orthogonalPixels,
    }, {
      sourceImageStorageId: originalStorageId,
      producerOperation: 'ORTHOGONAL_TRANSFORM',
    });
    const orthogonalId = signed.issueStoredFinal(orthogonal.storageId, scope);

    const resizePixels = new Uint8ClampedArray(4 * 5 * 4).fill(96);
    const resized = await images.persistFinal(scope, `${token}-resize-execution`, 'resize', {
      width: 4, height: 5, data: resizePixels,
    }, {
      sourceImageStorageId: orthogonal.storageId,
      producerOperation: 'RESIZE',
    });
    const resizedId = signed.issueStoredFinal(resized.storageId, scope);

    const resolver = new DurableArtifactLineageResolver({ signed, images, masks });
    const root = await resolver.resolve(scope, originalId);
    const step1 = await resolver.resolve(scope, orthogonalId);
    const step2 = await resolver.resolve(scope, resizedId);
    assert.equal(root.storageId, originalStorageId);
    assert.deepEqual(root.parentArtifactIds, []);
    assert.equal(step1.storageId, orthogonal.storageId);
    assert.deepEqual(step1.parentArtifactIds, [originalId]);
    assert.equal(step2.storageId, resized.storageId);
    assert.deepEqual(step2.parentArtifactIds, [orthogonalId]);

    const restarted = new DurableArtifactLineageResolver({
      signed: new SignedArtifactAuthority(`${token}-secret`, [], () => 20_000),
      images: new PostgresImageArtifactStore(pool),
      masks: new PostgresMaskArtifactStore(pool),
    });
    assert.deepEqual(await restarted.resolve(scope, orthogonalId), step1);
    assert.deepEqual(await restarted.resolve(scope, resizedId), step2);
    await assert.rejects(() => restarted.resolve({ ...scope, projectId: `${token}-foreign-project` }, resizedId), /durable canonical IMAGE or MASK/);
  } finally {
    await pool.query('DELETE FROM canonical_image_artifacts WHERE tenant_id=$1 AND user_id=$2', [scope.tenantId, scope.userId]).catch(() => undefined);
    await pool.end();
  }
});
