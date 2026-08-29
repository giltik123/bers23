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
type Captured<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>;

async function png(width: number, height: number, rgba: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}

async function capture<T>(promise: Promise<T>): Promise<Captured<T>> {
  try { return Object.freeze({ ok: true, value: await promise }); }
  catch (error) { return Object.freeze({ ok: false, error }); }
}

class ProjectLockIssuanceBarrier {
  private issued = 0;

  mark(query: unknown) {
    if (typeof query === 'string' && query.includes('canonical_projects') && query.includes('FOR UPDATE')) this.issued += 1;
  }

  async waitFor(minimum: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (this.issued >= minimum) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${minimum} canonical Project row-lock query issuance(s); observed ${this.issued}`);
  }
}

function observeProjectRowLockIssuance(pool: Pool, barrier: ProjectLockIssuanceBarrier): Pool {
  return {
    query: (...args: any[]) => (pool.query as any)(...args),
    connect: async () => {
      const client = await pool.connect();
      return {
        query: (...args: any[]) => {
          const query = typeof args[0] === 'string' ? args[0] : args[0]?.text;
          barrier.mark(query);
          return (client.query as any)(...args);
        },
        release: client.release.bind(client),
      } as any;
    },
  } as unknown as Pool;
}

test('Project Accept serializes against cursor changes and rejects a FINAL produced from a stale durable source', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
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

  // Real PostgreSQL serialization proof. A test-only Pool wrapper observes the
  // exact FOR UPDATE statements emitted by PostgresProjectStore; it does not
  // emulate locking. One real transaction holds the Project row lock. We then
  // issue navigation first and Accept second and wait until both service calls
  // have actually emitted their row-lock SELECTs before releasing the blocker.
  // The database still owns serialization and the outcome assertions below are
  // authoritative: navigation must win and the now-stale Accept must fail closed.
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

  const barrier = new ProjectLockIssuanceBarrier();
  const concurrentProjects = new PostgresProjectStore(observeProjectRowLockIssuance(pool, barrier));
  const blocker = await pool.connect();
  let blockerReleased = false;
  let navigateOutcomePromise: Promise<Captured<unknown>> | undefined;
  let acceptOutcomePromise: Promise<Captured<unknown>> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query(`SELECT project_id FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE`, [concurrentProjectId, auth.tenantId, auth.userId]);

    navigateOutcomePromise = capture(concurrentProjects.navigate(auth, concurrentProjectId, 'original'));
    await barrier.waitFor(1);

    acceptOutcomePromise = capture(concurrentProjects.acceptFinal(auth, concurrentProjectId, queuedCandidate.storageId, 'Queued stale Accept'));
    await barrier.waitFor(2);

    await blocker.query('COMMIT');
    blocker.release();
    blockerReleased = true;

    const navigateOutcome = await navigateOutcomePromise;
    assert.equal(navigateOutcome.ok, true, 'navigation queued first must complete successfully');
    assert.equal((await projects.get(auth, concurrentProjectId)).current_image_storage_id, concurrentOriginalStorageId, 'queued navigation must win the row-lock order established before Accept');

    const acceptOutcome = await acceptOutcomePromise;
    assert.equal(acceptOutcome.ok, false, 'queued stale Accept must be rejected');
    if (acceptOutcome.ok) throw new Error('Queued stale Accept unexpectedly succeeded');
    const acceptError = acceptOutcome.error as { status?: number; code?: string };
    assert.equal(acceptError?.status, 409);
    assert.equal(acceptError?.code, 'final_source_conflict');
    assert.equal((await projects.get(auth, concurrentProjectId)).current_image_storage_id, concurrentOriginalStorageId, 'rejected concurrent Accept must not overwrite the navigation result');
    assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2 AND kind='ACCEPTED_FINAL'", [concurrentProjectId, queuedCandidate.storageId])).rows[0].count), 0, 'rejected concurrent Accept must not create history');
  } finally {
    if (!blockerReleased) {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
    }
    await Promise.all([
      navigateOutcomePromise ?? Promise.resolve(Object.freeze({ ok: true, value: undefined })),
      acceptOutcomePromise ?? Promise.resolve(Object.freeze({ ok: true, value: undefined })),
    ]);
  }
});
