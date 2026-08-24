import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for mixed-dimension Project history acceptance');
const owner = Object.freeze({ tenantId: 'dimension-history-tenant', userId: 'dimension-history-user' });

async function png(width: number, height: number, seed: number): Promise<Uint8Array> {
  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = (seed + pixel * 7) & 255;
    data[offset + 1] = (seed + pixel * 11) & 255;
    data[offset + 2] = (seed + pixel * 13) & 255;
    data[offset + 3] = 255;
  }
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer());
}

test('Project current dimensions follow the canonical history cursor across x4 accept, undo, redo and version restore', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'project-dimension-history-c3' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE').catch(() => undefined);
    await pool.end();
  });

  const store = new PostgresProjectStore(pool);
  const originalWidth = 3, originalHeight = 2;
  const finalWidth = originalWidth * 4, finalHeight = originalHeight * 4;
  const created = await store.create(owner, 'Variable Canvas Project', await png(originalWidth, originalHeight, 3), { maxDimension: 64, maxPixels: 4096 });
  const projectId = String(created.project_id);
  const originalStorageId = String(created.original_image_storage_id);
  assert.deepEqual([Number(created.width), Number(created.height)], [originalWidth, originalHeight]);

  const finalStorageId = randomUUID();
  await pool.query(
    `INSERT INTO canonical_image_artifacts (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)`,
    [finalStorageId, owner.tenantId, owner.userId, projectId, 'dimension-execution', 'super-resolution', finalWidth, finalHeight, await png(finalWidth, finalHeight, 19)],
  );

  let state = await store.acceptFinal(owner, projectId, finalStorageId, 'Accept x4 local super-resolution');
  assert.equal(state.current_image_storage_id, finalStorageId);
  assert.deepEqual([Number(state.width), Number(state.height)], [finalWidth, finalHeight]);

  state = await store.createVersion(owner, projectId, 'x4 accepted');
  const version = state.versions.find((entry: any) => entry.name === 'x4 accepted');
  assert.ok(version);

  state = await store.navigate(owner, projectId, 'undo');
  assert.equal(state.current_image_storage_id, originalStorageId);
  assert.deepEqual([Number(state.width), Number(state.height)], [originalWidth, originalHeight]);

  state = await store.navigate(owner, projectId, 'redo');
  assert.equal(state.current_image_storage_id, finalStorageId);
  assert.deepEqual([Number(state.width), Number(state.height)], [finalWidth, finalHeight]);

  state = await store.navigate(owner, projectId, 'original');
  assert.equal(state.current_image_storage_id, originalStorageId);
  assert.deepEqual([Number(state.width), Number(state.height)], [originalWidth, originalHeight]);

  state = await store.restoreVersion(owner, projectId, String(version.version_id));
  assert.equal(state.current_image_storage_id, finalStorageId);
  assert.deepEqual([Number(state.width), Number(state.height)], [finalWidth, finalHeight]);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0, 'dimension-aware Project history must not create paid reservations');
});
