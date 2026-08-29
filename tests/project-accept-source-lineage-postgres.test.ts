import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Project source-lineage acceptance');

const auth = Object.freeze({ tenantId: 'project-source-tenant', userId: 'project-source-user' });

async function png(width: number, height: number, rgba: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}

test('Project Accept serializes against cursor changes and rejects a FINAL produced from a stale durable source', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-project-source-lineage' });
  await migrateFinalImageLineageSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts RESTART IDENTITY CASCADE').catch(() => undefined);
    await pool.end();
  });

  const projects = new PostgresProjectStore(pool);
  const images = new PostgresImageArtifactStore(pool);
  const sourcePixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const created = await projects.create(auth, 'Source-bound Project', await png(2, 1, sourcePixels), { maxDimension: 64, maxPixels: 4096 });
  const projectId = String(created.project_id);
  const originalStorageId = String(created.original_image_storage_id);
  const scope = Object.freeze({ ...auth, projectId });

  const first = await images.persistFinal(
    scope,
    'project-source-first-execution',
    'project-source-first-operation',
    Object.freeze({ width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) }),
    Object.freeze({ sourceImageStorageId: originalStorageId, producerOperation: 'ORTHOGONAL_TRANSFORM' as const }),
  );
  const staleCandidate = await images.persistFinal(
    scope,
    'project-source-stale-execution',
    'project-source-stale-operation',
    Object.freeze({ width: 2, height: 1, data: new Uint8ClampedArray([7, 8, 9, 255, 10, 11, 12, 255]) }),
    Object.freeze({ sourceImageStorageId: originalStorageId, producerOperation: 'ORTHOGONAL_TRANSFORM' as const }),
  );

  await projects.acceptFinal(auth, projectId, first.storageId, 'Accept first source-bound FINAL');
  assert.equal((await projects.get(auth, projectId)).current_image_storage_id, first.storageId);

  await assert.rejects(
    () => projects.acceptFinal(auth, projectId, staleCandidate.storageId, 'Must reject stale FINAL'),
    (error: any) => error?.status === 409 && error?.code === 'final_source_conflict',
  );
  assert.equal((await projects.get(auth, projectId)).current_image_storage_id, first.storageId, 'rejected stale Accept must not move the Project cursor');
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL", [projectId])).rows[0].count), 1, 'rejected stale Accept must not append history');

  await projects.navigate(auth, projectId, 'original');
  assert.equal((await projects.get(auth, projectId)).current_image_storage_id, originalStorageId);
  await projects.acceptFinal(auth, projectId, staleCandidate.storageId, 'Accept after explicitly returning to its durable source');
  assert.equal((await projects.get(auth, projectId)).current_image_storage_id, staleCandidate.storageId, 'the same FINAL is valid again only when the canonical cursor exactly matches its durable source');
});
