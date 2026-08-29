import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool, type PoolClient } from 'pg';
import sharp from 'sharp';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Project source-lineage acceptance');

const auth = Object.freeze({ tenantId: 'project-source-tenant', userId: 'project-source-user' });
const APPLICATION_NAME = 'bers-project-source-lineage';

async function png(width: number, height: number, rgba: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}

async function waitForBlockedProjectLocks(observer: PoolClient, minimum: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query(`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE datname=current_database()
        AND application_name=$1
        AND pid<>pg_backend_pid()
        AND wait_event_type='Lock'
        AND query LIKE '%canonical_projects%'
        AND query LIKE '%FOR UPDATE%'
    `, [APPLICATION_NAME]);
    if (Number(result.rows[0]?.count ?? 0) >= minimum) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${minimum} blocked canonical Project row-lock waiter(s)`);
}

test('Project Accept serializes against cursor changes and rejects a FINAL produced from a stale durable source', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: APPLICATION_NAME });
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
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL", [projectId])).rows[0].count), 1);

  await projects.acceptFinal(auth, projectId, first.storageId, 'Idempotent replay of already accepted FINAL');
  assert.equal((await projects.get(auth, projectId)).current_image_storage_id, first.storageId, 'accepted FINAL replay must remain a no-op even though its durable source is now behind the cursor');
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL", [projectId])).rows[0].count), 1, 'accepted FINAL replay must not append duplicate history');

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

  // Real PostgreSQL serialization proof: queue navigation first and Accept second
  // behind one manually-held Project row lock. When the blocker commits, navigation
  // must acquire the row first, move the cursor, and the queued Accept must then
  // observe that new cursor under its own FOR UPDATE lock and fail closed.
  const concurrentCreated = await projects.create(auth, 'Concurrent source-bound Project', await png(2, 1, sourcePixels), { maxDimension: 64, maxPixels: 4096 });
  const concurrentProjectId = String(concurrentCreated.project_id);
  const concurrentOriginalStorageId = String(concurrentCreated.original_image_storage_id);
  const concurrentScope = Object.freeze({ ...auth, projectId: concurrentProjectId });
  const concurrentFirst = await images.persistFinal(
    concurrentScope,
    'project-source-concurrent-first-execution',
    'project-source-concurrent-first-operation',
    Object.freeze({ width: 2, height: 1, data: new Uint8ClampedArray([13, 14, 15, 255, 16, 17, 18, 255]) }),
    Object.freeze({ sourceImageStorageId: concurrentOriginalStorageId, producerOperation: 'ORTHOGONAL_TRANSFORM' as const }),
  );
  await projects.acceptFinal(auth, concurrentProjectId, concurrentFirst.storageId, 'Establish concurrent source cursor');
  assert.equal((await projects.get(auth, concurrentProjectId)).current_image_storage_id, concurrentFirst.storageId);

  const queuedCandidate = await images.persistFinal(
    concurrentScope,
    'project-source-concurrent-candidate-execution',
    'project-source-concurrent-candidate-operation',
    Object.freeze({ width: 2, height: 1, data: new Uint8ClampedArray([19, 20, 21, 255, 22, 23, 24, 255]) }),
    Object.freeze({ sourceImageStorageId: concurrentFirst.storageId, producerOperation: 'ORTHOGONAL_TRANSFORM' as const }),
  );

  const blocker = await pool.connect();
  let blockerReleased = false;
  try {
    await blocker.query('BEGIN');
    await blocker.query(`SELECT project_id FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE`, [concurrentProjectId, auth.tenantId, auth.userId]);

    const navigatePromise = projects.navigate(auth, concurrentProjectId, 'original');
    await waitForBlockedProjectLocks(blocker, 1);

    const acceptPromise = projects.acceptFinal(auth, concurrentProjectId, queuedCandidate.storageId, 'Queued stale Accept');
    await waitForBlockedProjectLocks(blocker, 2);

    await blocker.query('COMMIT');
    blocker.release();
    blockerReleased = true;

    await navigatePromise;
    assert.equal((await projects.get(auth, concurrentProjectId)).current_image_storage_id, concurrentOriginalStorageId, 'queued navigation must win the row-lock order established before Accept');
    await assert.rejects(
      acceptPromise,
      (error: any) => error?.status === 409 && error?.code === 'final_source_conflict',
      'queued Accept must re-read the Project after acquiring its row lock and reject the now-stale FINAL',
    );
    assert.equal((await projects.get(auth, concurrentProjectId)).current_image_storage_id, concurrentOriginalStorageId, 'rejected concurrent Accept must not overwrite the navigation result');
    assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2 AND kind='ACCEPTED_FINAL'", [concurrentProjectId, queuedCandidate.storageId])).rows[0].count), 0, 'rejected concurrent Accept must not create history');
  } finally {
    if (!blockerReleased) {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
    }
  }
});
