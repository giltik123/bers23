import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateFinalImageLineageSchema } from './finalImageLineageSchema.ts';
import { DurableArtifactLineageResolver } from './durableArtifactLineageResolver.ts';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';
import { migrateProjectSchema } from '../projects/projectSchema.ts';
import { PostgresProjectStore } from '../projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;

test('durable resolver reconstructs ORIGINAL -> LOCAL_SEGMENTATION MASK -> BACKGROUND_ISOLATION FINAL lineage after restart', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-durable-artifact-resolver' });
  const token = `resolver-${process.pid}-${Date.now()}`;
  const auth = Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user` });
  const signed = new SignedArtifactAuthority(`${token}-secret`, [], () => 10_000);
  const images = new PostgresImageArtifactStore(pool);
  const masks = new PostgresMaskArtifactStore(pool);
  try {
    await migrateFinalImageLineageSchema(pool);
    await migrateProjectSchema(pool);
    const projectStore = new PostgresProjectStore(pool);
    const sourcePng = new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 4, background: '#112233ff' } }).png().toBuffer());
    const project = await projectStore.create(auth, 'Resolver project', sourcePng, { maxDimension: 64, maxPixels: 4096 });
    const scope = Object.freeze({ ...auth, projectId: String(project.project_id) });
    const originalStorageId = String(project.original_image_storage_id);
    const originalId = signed.issueStoredOriginal(originalStorageId, scope);

    const maskStored = await masks.persistLocalExecution(`${token}-segment-ticket`, scope, 2, 2, new Uint8Array([255,0,255,0]), originalStorageId);
    const maskId = signed.issueStoredMask(maskStored.storageId, scope);
    const source = await images.loadSource(originalStorageId, scope);
    assert.ok(source);
    const sourcePixels = await sharp(source.bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const finalPixels = new Uint8ClampedArray(sourcePixels.data); finalPixels[3] = 0; finalPixels[11] = 0;
    const finalStored = await images.persistFinal(scope, `${token}-execution`, 'local-continuation-02-background-isolation', { width: 2, height: 2, data: finalPixels }, {
      sourceImageStorageId: originalStorageId,
      maskStorageId: maskStored.storageId,
      producerOperation: 'BACKGROUND_ISOLATION',
    });
    const finalId = signed.issueStoredFinal(finalStored.storageId, scope);

    const first = new DurableArtifactLineageResolver({ signed, images, masks });
    const original = await first.resolve(scope, originalId);
    const mask = await first.resolve(scope, maskId);
    const final = await first.resolve(scope, finalId);
    assert.equal(original.kind, 'image'); assert.equal(original.role, 'ORIGINAL'); assert.deepEqual(original.parentArtifactIds, []);
    assert.equal(mask.kind, 'mask'); assert.equal(mask.role, 'MASK'); assert.deepEqual(mask.parentArtifactIds, [originalId]);
    assert.equal(final.kind, 'image'); assert.equal(final.role, 'COMPOSITE'); assert.deepEqual(final.parentArtifactIds, [originalId, maskId]);
    assert.match(original.sha256, /^[a-f0-9]{64}$/); assert.match(mask.sha256, /^[a-f0-9]{64}$/); assert.match(final.sha256, /^[a-f0-9]{64}$/);

    const restarted = new DurableArtifactLineageResolver({
      signed: new SignedArtifactAuthority(`${token}-secret`, [], () => 20_000),
      images: new PostgresImageArtifactStore(pool),
      masks: new PostgresMaskArtifactStore(pool),
    });
    assert.deepEqual(await restarted.resolve(scope, originalId), original);
    assert.deepEqual(await restarted.resolve(scope, maskId), mask);
    assert.deepEqual(await restarted.resolve(scope, finalId), final);

    await assert.rejects(() => restarted.resolve({ ...scope, userId: `${token}-other` }, finalId), /durable canonical IMAGE or MASK/);
  } finally {
    await pool.query("DELETE FROM canonical_image_artifacts WHERE tenant_id=$1 AND user_id=$2 AND producer_operation='BACKGROUND_ISOLATION'", [auth.tenantId, auth.userId]).catch(() => undefined);
    await pool.query('DELETE FROM canonical_mask_artifacts WHERE tenant_id=$1 AND user_id=$2', [auth.tenantId, auth.userId]).catch(() => undefined);
    await pool.query('DELETE FROM canonical_projects WHERE tenant_id=$1 AND user_id=$2', [auth.tenantId, auth.userId]).catch(() => undefined);
    await pool.query('DELETE FROM canonical_image_artifacts WHERE tenant_id=$1 AND user_id=$2', [auth.tenantId, auth.userId]).catch(() => undefined);
    await pool.end();
  }
});
