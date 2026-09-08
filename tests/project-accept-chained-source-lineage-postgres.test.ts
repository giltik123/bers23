import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for chained Project source-lineage acceptance');

const auth = Object.freeze({ tenantId: 'project-chain-tenant', userId: 'project-chain-user' });

async function png(width: number, height: number, rgba: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}

test('Project Accept admits an uncommitted multi-step FINAL chain rooted at the exact current cursor', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  await migrateFinalImageLineageSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts RESTART IDENTITY CASCADE').catch(() => undefined);
    await pool.end();
  });

  const projects = new PostgresProjectStore(pool);
  const images = new PostgresImageArtifactStore(pool);
  const created = await projects.create(
    auth,
    'Uncommitted chained FINAL Project',
    await png(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])),
    { maxDimension: 64, maxPixels: 4096 },
  );
  const projectId = String(created.project_id);
  const originalStorageId = String(created.original_image_storage_id);
  const scope = Object.freeze({ ...auth, projectId });

  const intermediate = await images.persistFinal(
    scope,
    'project-chain-orthogonal-execution',
    'project-chain-orthogonal',
    Object.freeze({ width: 1, height: 2, data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) }),
    Object.freeze({ sourceImageStorageId: originalStorageId, producerOperation: 'ORTHOGONAL_TRANSFORM' as const }),
  );
  const terminal = await images.persistFinal(
    scope,
    'project-chain-resize-execution',
    'project-chain-resize',
    Object.freeze({ width: 2, height: 1, data: new Uint8ClampedArray([7, 8, 9, 255, 10, 11, 12, 255]) }),
    Object.freeze({ sourceImageStorageId: intermediate.storageId, producerOperation: 'RESIZE' as const }),
  );

  const intermediateHistoryBefore = await pool.query(
    'SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2',
    [projectId, intermediate.storageId],
  );
  assert.equal(Number(intermediateHistoryBefore.rows[0].count), 0, 'intermediate FINAL must never have been a Project cursor');

  await projects.acceptFinal(auth, projectId, terminal.storageId, 'Accept chained terminal FINAL');
  const project = await projects.get(auth, projectId);
  assert.equal(project.current_image_storage_id, terminal.storageId);

  const accepted = await pool.query(
    `SELECT source_image_storage_id,image_storage_id FROM canonical_project_history
     WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL`,
    [projectId],
  );
  assert.equal(accepted.rowCount, 1);
  assert.equal(accepted.rows[0].source_image_storage_id, originalStorageId, 'Project history records the cursor replaced by the atomic multi-step result');
  assert.equal(accepted.rows[0].image_storage_id, terminal.storageId);

  const intermediateHistoryAfter = await pool.query(
    'SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2',
    [projectId, intermediate.storageId],
  );
  assert.equal(Number(intermediateHistoryAfter.rows[0].count), 0, 'intermediate FINAL must remain outside Project history after terminal Accept');
});
